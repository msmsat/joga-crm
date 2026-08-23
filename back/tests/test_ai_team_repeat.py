"""Возвращаемость клиентов к тренеру: определение, границы, N+1.

Метрику придумывать не пришлось — она уже есть в продукте, на вкладке
Отчёты > Команда (`TrainerRow.return_rate_pct`, routers/analytics/team.py):

    клиенты с 2+ ПОСЕЩЁННЫМИ занятиями у ЭТОГО тренера
    ------------------------------------------------- , оба визита внутри периода
    клиенты хотя бы с одним посещённым занятием у него

Ассистенту она была недоступна, и на вопрос «у кого клиенты возвращаются чаще»
он подставлял посещаемость — метрику про другое. Здесь закреплено ровно то, что
делает метрику метрикой: числитель, знаменатель, что НЕ считается и почему
считать надо занятия, а не брони.

Фикстура с заранее известным ответом:

    Сара    1 клиент,  1 вернулся  -> 100.0%   ловушка размера выборки
    Ева     4 клиента, 3 вернулись ->  75.0%   настоящий лидер
    Ирина   6 клиентов, 3 вернулись -> 50.0%
    Марина  8 клиентов, 1 вернулся ->  12.5%

Реальная БД, ручная чистка. Запуск из back/:  pytest tests/test_ai_team_repeat.py
"""
import asyncio
import warnings
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, event, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import (
    Client, Lesson, Reservation, Studio, StudioBillingPlan, StudioMember, User,
)
from routers.analytics._filters import ReportFilters
from routers.analytics.team import repeat_counts_by_trainer
from services.ai_tools import PeriodArgs, get_team_report

_PREFIX = "ai-repeat-"
TODAY = date.today()
WINDOW = ReportFilters(date_from=TODAY - timedelta(days=20), date_to=TODAY,
                       branch_id=None, hall_id=None, trainer_id=None, service_id=None)

# ожидаемое: тренер -> (уникальных, вернувшихся, ставка)
EXPECTED = {
    "Ирина": (6, 3, 50.0),
    "Ева": (4, 3, 75.0),
    "Марина": (8, 1, 12.5),
    "Сара": (1, 1, 100.0),
}


@contextmanager
def counting():
    calls = []

    def hook(conn, cursor, statement, params, context, many):
        calls.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", hook)
    try:
        yield calls
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", hook)


class _Fixture:
    """Занятия и брони строятся списком (тренер, сдвиг дней, [(клиент, статус)])."""

    def __init__(self, db, sid):
        self.db, self.sid = db, sid
        self.trainers: dict[str, int] = {}
        self.clients: dict[str, int] = {}

    async def trainer(self, name: str) -> int:
        user = User(email=f"{_PREFIX}{name.lower()}@test.local", hashed_password="x", name=name)
        self.db.add(user)
        await self.db.flush()
        self.db.add(StudioMember(studio_id=self.sid, user_id=user.id, role="trainer",
                                 status="active", name=name))
        self.trainers[name] = user.id
        return user.id

    async def client(self, code: str) -> int:
        if code in self.clients:
            return self.clients[code]
        c = Client(studio_id=self.sid, name=code,
                   phone=f"+42077{abs(hash(code)) % 100000000:08d}")
        self.db.add(c)
        await self.db.flush()
        self.clients[code] = c.id
        return c.id

    async def lesson(self, trainer: str, days_ago: int, guests, *,
                     lesson_status: str = "confirmed") -> None:
        when = datetime.combine(TODAY - timedelta(days=days_ago), time(18, 0))
        lesson = Lesson(studio_id=self.sid, name="Йога", teacher_name=trainer,
                        teacher_id=self.trainers[trainer], start_time=when, price=800,
                        level="", equipment="", total_spots=20, status=lesson_status)
        self.db.add(lesson)
        await self.db.flush()
        for spot, (code, status) in enumerate(guests, start=1):
            self.db.add(Reservation(client_id=await self.client(code), lesson_id=lesson.id,
                                    spot_number=spot, status=status))


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-REPEAT", timezone="UTC+0", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add(StudioBillingPlan(studio_id=sid, plan_name="pro"))
        owner = User(email=f"{_PREFIX}owner@test.local", hashed_password="x", name="Ольга")
        db.add(owner)
        await db.flush()
        db.add(StudioMember(studio_id=sid, user_id=owner.id, role="owner",
                            status="active", name="Ольга"))

        fx = _Fixture(db, sid)
        for name in ("Ирина", "Ева", "Марина", "Сара"):
            await fx.trainer(name)

        A = "attended"
        # ── Ирина: I1 три раза, I2 и I3 по два -> вернулись трое.
        #    I4 один раз; I5 один раз (он же ходит к Еве — метрика по ТРЕНЕРУ,
        #    а не по студии); D один раз, но ДВУМЯ бронями на одном занятии.
        await fx.lesson("Ирина", 15, [("I1", A), ("I2", A), ("I3", A), ("I4", A)])
        await fx.lesson("Ирина", 10, [("I1", A), ("I2", A), ("I3", A), ("I5", A),
                                      ("D", A), ("D", A)])          # двойная бронь
        await fx.lesson("Ирина", 5, [("I1", A),
                                     ("CANCELLED", "cancelled"),    # отменённая бронь
                                     ("NOSHOW", "active")])         # не пришёл
        # Отменённое ЗАНЯТИЕ с посещениями в счёт не идёт.
        await fx.lesson("Ирина", 4, [("GHOST", A), ("GHOST", A)], lesson_status="cancelled")

        # ── Ева: трое по два раза, плюс общий с Ириной I5 один раз.
        await fx.lesson("Ева", 20, [("E1", A), ("E2", A), ("E3", A)])   # ровно граница периода
        await fx.lesson("Ева", 12, [("E1", A), ("E2", A), ("E3", A), ("I5", A)])
        # Будущее занятие: места держатся, визитов ещё не было.
        await fx.lesson("Ева", -7, [("E1", "active"), ("E2", "active"), ("FUT", "active")])

        # ── Марина: восемь разовых, вернулся один.
        await fx.lesson("Марина", 14, [(f"M{i}", A) for i in range(1, 9)])
        await fx.lesson("Марина", 6, [("M1", A)])
        # За границей периода M2 ходил ещё раз — вернувшимся его это не делает.
        await fx.lesson("Марина", 21, [("M2", A)])

        # ── Сара: один клиент, два визита. 100% на выборке из одного человека.
        await fx.lesson("Сара", 9, [("S1", A)])
        await fx.lesson("Сара", 3, [("S1", A)])

        await db.commit()
        return {"sid": sid, "owner_id": owner.id, "trainers": dict(fx.trainers)}


async def _seed_wide(trainers: int) -> dict:
    """Много тренеров и клиентов — для инварианта по числу запросов."""
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-REPEAT", timezone="UTC+0", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add(StudioBillingPlan(studio_id=sid, plan_name="pro"))
        owner = User(email=f"{_PREFIX}owner@test.local", hashed_password="x", name="Ольга")
        db.add(owner)
        await db.flush()
        db.add(StudioMember(studio_id=sid, user_id=owner.id, role="owner",
                            status="active", name="Ольга"))
        fx = _Fixture(db, sid)
        for t in range(trainers):
            await fx.trainer(f"Т{t}")
            for day in (12, 6):
                await fx.lesson(f"Т{t}", day, [(f"K{t}_{i}", "attended") for i in range(6)])
        await db.commit()
        return {"sid": sid, "owner_id": owner.id, "trainers": dict(fx.trainers)}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        lessons = (await db.execute(
            select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lessons:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lessons)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.email.like(f"{_PREFIX}%")))
        await db.commit()


async def _counts():
    ids = await _seed()
    try:
        async with async_session_maker() as db:
            raw = await repeat_counts_by_trainer(WINDOW, ids["sid"], db)
        return {name: raw.get(tid, {"unique_clients": 0, "repeat_clients": 0})
                for name, tid in ids["trainers"].items()}
    finally:
        await _cleanup(ids["sid"])


# ── определение метрики ───────────────────────────────────────────────────────

def test_numerator_and_denominator_match_the_fixture():
    got = asyncio.run(_counts())
    for name, (uniq, repeat, _rate) in EXPECTED.items():
        assert got[name]["unique_clients"] == uniq, (name, "знаменатель", got[name])
        assert got[name]["repeat_clients"] == repeat, (name, "числитель", got[name])


def test_ranking_by_rate_and_the_sample_size_trap():
    got = asyncio.run(_counts())
    rate = {n: round(c["repeat_clients"] / c["unique_clients"] * 100, 1) for n, c in got.items()}
    assert rate == {n: r for n, (_u, _r, r) in EXPECTED.items()}
    ranked = sorted(rate, key=lambda n: -rate[n])
    # По голой ставке первой идёт Сара — с одним-единственным клиентом. Именно
    # поэтому знаменатель уезжает модели вместе со ставкой.
    assert ranked[0] == "Сара" and got["Сара"]["unique_clients"] == 1
    assert ranked[1] == "Ева", ranked


def test_double_booking_on_one_lesson_is_not_a_return():
    """Две брони на ОДНОМ занятии — это один визит, а не возвращение."""
    got = asyncio.run(_counts())
    # D сидит в знаменателе Ирины (6 клиентов), но не в числителе (3).
    assert got["Ирина"] == {"unique_clients": 6, "repeat_clients": 3}


def test_same_client_counts_separately_for_each_trainer():
    """I5 был у Ирины и у Евы по разу — вернувшимся не стал ни у кого."""
    got = asyncio.run(_counts())
    assert got["Ирина"]["repeat_clients"] == 3 and got["Ева"]["repeat_clients"] == 3
    # Метрика про КОНКРЕТНОГО тренера: «вернулся в студию» — другая метрика.
    assert got["Ева"]["unique_clients"] == 4


def test_cancelled_noshow_future_and_out_of_window_are_excluded():
    got = asyncio.run(_counts())
    # Отменённая бронь, неявка, отменённое занятие — мимо знаменателя Ирины.
    assert got["Ирина"]["unique_clients"] == 6
    # Будущее занятие Евы (брони active) в счёт не идёт.
    assert got["Ева"]["unique_clients"] == 4
    # Визит M2 за границей периода вернувшимся его не делает.
    assert got["Марина"]["repeat_clients"] == 1
    # Занятие ровно в date_from засчитано: E1..E3 без него были бы разовыми.
    assert got["Ева"]["repeat_clients"] == 3


# ── инструмент ассистента ─────────────────────────────────────────────────────

async def _tool(seed):
    ids = await seed
    try:
        async with async_session_maker() as db:
            owner = (await db.execute(
                select(User).where(User.id == ids["owner_id"]))).scalar_one()
            ctx = StudioContext(user=owner, studio_id=ids["sid"], role="owner")
            with counting() as calls:
                res = await get_team_report(ctx, db, PeriodArgs(period="year"))
        return res, len(calls)
    finally:
        await _cleanup(ids["sid"])


def test_tool_exposes_numerator_denominator_and_rate():
    res, _ = asyncio.run(_tool(_seed()))
    rows = {r["name"]: r for r in res["trainers"]}
    eva = rows["Ева"]
    assert (eva["unique_clients"], eva["repeat_clients"], eva["return_rate_pct"]) == (4, 3, 75.0)
    # Занятия — проведённые, а не посещения: у Евы два прошедших занятия
    # (третье в будущем), посещений на них 7.
    assert eva["lessons"] == 2 and eva["attendance"] == 7
    assert "insights" not in res


def test_tool_query_count_does_not_grow_with_team_size():
    _, n_small = asyncio.run(_tool(_seed_wide(3)))
    _, n_big = asyncio.run(_tool(_seed_wide(15)))
    assert n_small == n_big, f"{n_small} запросов на 3 тренеров, {n_big} на 15"


if __name__ == "__main__":
    print(asyncio.run(_counts()))

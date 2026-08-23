"""Множественные операции вместо обхода сущностей по одной.

Принцип: если сервер отвечает на вопрос о МНОЖЕСТВЕ одним запросом, модель не
должна воспроизводить этот запрос вызовами по одной сущности. Обход стоил
ассистенту потолка итераций: «покажи, кто не ходит, и с каким тренером они
были» — это get_client_events на каждого из тридцати, и до ответа не доходили
ни Flash, ни Sonnet (36 вызовов подряд).

Проверяем две вещи, и вторая важнее первой:
  1. числа верные и совпадают с карточкой (get_staff_profile);
  2. число ЗАПРОСОВ К БАЗЕ не растёт с числом клиентов и тренеров — иначе обход
     просто переехал бы из модели на сервер.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_bulk
"""
import asyncio
import warnings
from contextlib import contextmanager
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, event, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import (
    Client, Lesson, Reservation, Studio, StudioBillingPlan, StudioMember, User,
)
from routers.staff.profiles import get_staff_profile
from services.ai_tools import (
    FindStaffArgs, InactiveClientsArgs, get_inactive_clients, get_staff,
)

_PREFIX = "ai-bulk-"


@contextmanager
def counting():
    """Сколько операторов ушло в базу за блок."""
    calls = []

    def hook(conn, cursor, statement, params, context, many):
        calls.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", hook)
    try:
        yield calls
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", hook)


async def _seed(trainers: int, clients_per_trainer: int) -> dict:
    """Тренеры с прошедшими занятиями; клиенты не ходили 45 дней."""
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-BULK", timezone="UTC+0", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add(StudioBillingPlan(studio_id=sid, plan_name="pro"))
        owner = User(email=f"{_PREFIX}owner@test.local", hashed_password="x", name="Ольга")
        db.add(owner)
        await db.flush()
        db.add(StudioMember(studio_id=sid, user_id=owner.id, role="owner",
                            status="active", name="Ольга"))

        ids = {"sid": sid, "owner_id": owner.id, "trainers": []}
        for t in range(trainers):
            user = User(email=f"{_PREFIX}t{t}@test.local", hashed_password="x", name=f"Т{t}")
            db.add(user)
            await db.flush()
            db.add(StudioMember(studio_id=sid, user_id=user.id, role="trainer",
                                status="active", name=f"Тренер{t}"))
            ids["trainers"].append(user.id)

            clients = [
                Client(studio_id=sid, name=f"К{t}_{i}", phone=f"+4207772{t:02d}{i:03d}",
                       last_visit_date=date.today() - timedelta(days=45 + i))
                for i in range(clients_per_trainer)
            ]
            db.add_all(clients)
            await db.flush()

            # Прошедшее занятие: по нему и определяется «последний тренер».
            lesson = Lesson(studio_id=sid, name="Йога", teacher_name=f"Тренер{t}",
                            teacher_id=user.id, start_time=datetime.now() - timedelta(days=45),
                            price=800, level="", equipment="", total_spots=8,
                            status="confirmed")
            db.add(lesson)
            await db.flush()
            for spot, client in enumerate(clients, start=1):
                db.add(Reservation(client_id=client.id, lesson_id=lesson.id,
                                   spot_number=spot, status="attended"))
        await db.commit()
        return ids


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


async def _ctx(ids: dict, db) -> StudioContext:
    owner = (await db.execute(select(User).where(User.id == ids["owner_id"]))).scalar_one()
    return StudioContext(user=owner, studio_id=ids["sid"], role="owner")


# ── клиенты ───────────────────────────────────────────────────────────────────

async def _inactive(trainers: int = 2, per_trainer: int = 3):
    ids = await _seed(trainers, per_trainer)
    try:
        async with async_session_maker() as db:
            ctx = await _ctx(ids, db)
            with counting() as calls:
                res = await get_inactive_clients(ctx, db, InactiveClientsArgs(days=30))
        return res, len(calls)
    finally:
        await _cleanup(ids["sid"])


def test_inactive_clients_names_the_last_trainer():
    res, _ = asyncio.run(_inactive())
    assert res["count"] == 6, res["count"]
    got = {r["name"]: r["last_trainer"] for r in res["items"]}
    assert got["К0_0"] == "Тренер0" and got["К1_0"] == "Тренер1", got
    assert all(r["days_since_visit"] >= 30 for r in res["items"])
    # Порядок — от недавно пропавших к давним: этих вернуть проще.
    days = [r["days_since_visit"] for r in res["items"]]
    assert days == sorted(days), days


def test_inactive_clients_query_count_does_not_grow():
    """Тридцать клиентов стоят столько же запросов, сколько шесть."""
    small, n_small = asyncio.run(_inactive(2, 3))
    big, n_big = asyncio.run(_inactive(2, 15))
    assert small["count"] == 6 and big["count"] == 30
    assert n_small == n_big, f"{n_small} запросов на 6 клиентов, {n_big} на 30"


async def _inactive_as_trainer():
    """Тренер спрашивает то же самое: чужие клиенты попасть в выдачу не должны."""
    ids = await _seed(2, 3)
    try:
        async with async_session_maker() as db:
            trainer = (await db.execute(
                select(User).where(User.id == ids["trainers"][0]))).scalar_one()
            ctx = StudioContext(user=trainer, studio_id=ids["sid"], role="trainer")
            return await get_inactive_clients(ctx, db, InactiveClientsArgs(days=30))
    finally:
        await _cleanup(ids["sid"])


def test_inactive_clients_respects_trainer_scope():
    res = asyncio.run(_inactive_as_trainer())
    assert res["count"] == 3, res["count"]
    assert {r["last_trainer"] for r in res["items"]} == {"Тренер0"}


# ── тренеры ───────────────────────────────────────────────────────────────────

async def _staff(trainers: int, stats: bool = True):
    ids = await _seed(trainers, 3)
    try:
        async with async_session_maker() as db:
            ctx = await _ctx(ids, db)
            with counting() as calls:
                res = await get_staff(ctx, db, FindStaffArgs(include_stats=stats))
            profile = await get_staff_profile(ids["trainers"][0], ctx=ctx, db=db)
        return ids, res, len(calls), profile
    finally:
        await _cleanup(ids["sid"])


def test_staff_stats_match_the_profile_card():
    """Новых чисел нет: ровно то, что отдаёт карточка, — за один вызов."""
    ids, res, _, profile = asyncio.run(_staff(2))
    row = next(r for r in res["items"] if r["id"] == ids["trainers"][0])
    for key in ("total_bookings", "total_attended", "total_revenue", "load_percent"):
        assert row[key] == profile["stats"][key], (key, row[key], profile["stats"][key])
    assert row["total_attended"] == 3 and row["total_revenue"] == 2400


def test_staff_query_count_does_not_grow_with_team_size():
    _, two, n_two, _ = asyncio.run(_staff(2))
    _, six, n_six, _ = asyncio.run(_staff(6))
    assert len(two["items"]) == 3 and len(six["items"]) == 7      # + владелец
    assert n_two == n_six, f"{n_two} запросов на двоих, {n_six} на шестерых"


def test_staff_without_stats_costs_nothing_extra():
    """Обычный поиск сотрудника по имени показателей не считает."""
    _, _, n_plain, _ = asyncio.run(_staff(2, stats=False))
    _, _, n_stats, _ = asyncio.run(_staff(2, stats=True))
    assert n_plain < n_stats, (n_plain, n_stats)


if __name__ == "__main__":
    for fn in (test_inactive_clients_names_the_last_trainer,
               test_inactive_clients_query_count_does_not_grow,
               test_inactive_clients_respects_trainer_scope,
               test_staff_stats_match_the_profile_card,
               test_staff_query_count_does_not_grow_with_team_size,
               test_staff_without_stats_costs_nothing_extra):
        fn()
        print("ok", fn.__name__)

"""Кто отвечает за календарь: период считает сервер, накладки ловит план целиком.

Две проверки, обе детерминированные и без модели.

1. Названный период («следующая неделя») превращается в даты СЕРВЕРОМ, по
   календарю студии. До этого даты считала модель, и она была последней
   инстанцией сразу по четырём вопросам, данных для которых у неё нет:
   где граница недели, какое сегодня в часовом поясе студии, не уехал ли день
   из-за перевода часов, не оказался ли край в прошлом.

2. Шаги плана проверяются ДРУГ ПРОТИВ ДРУГА. Каждый по отдельности законен:
   схема пройдена, precheck сверил его с базой — а соседнего шага в базе ещё
   нет. Так «поставь в 10:00 и в 10:30» давало два законных шага и два занятия
   внахлёст.
"""
import asyncio
import warnings as _warnings
from datetime import date, datetime, timedelta

_warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioBillingPlan, StudioMember, User
from services.ai_plan import plan_conflicts
from services.ai_tools import FillScheduleArgs, _resolve_period

_OWNER = "ai-sched-owner@test.local"


# ── 1. Период считает сервер ──────────────────────────────────────────────────

async def _seed(tz: str = "UTC+0") -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-SCHED", timezone=tz, currency="EUR")
        db.add(studio)
        await db.flush()
        owner = User(email=_OWNER, hashed_password="x", name="Ольга")
        db.add(owner)
        await db.flush()
        db.add_all([
            StudioBillingPlan(studio_id=studio.id, plan_name="pro"),
            StudioMember(studio_id=studio.id, user_id=owner.id, role="owner",
                         status="active", name="Ольга"),
        ])
        await db.commit()
        return {"sid": studio.id, "owner_id": owner.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(User).where(User.email == _OWNER))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


def _args(**kw) -> FillScheduleArgs:
    base = {"teacher_id": 1, "service_id": 1,
            # Заведомо неверные даты «от модели»: если период их не перебил,
            # тест это увидит.
            "date_from": date(2000, 1, 1), "date_to": date(2000, 1, 2)}
    return FillScheduleArgs.model_validate({**base, **kw})


async def _resolve(ids: dict, **kw) -> FillScheduleArgs:
    async with async_session_maker() as db:
        user = (await db.execute(
            select(User).where(User.id == ids["owner_id"]))).scalar_one()
        ctx = StudioContext(user=user, studio_id=ids["sid"], role="owner")
        return await _resolve_period(_args(**kw), ctx, db)


async def _run_period() -> None:
    ids = await _seed()
    try:
        from services import studio_time
        async with async_session_maker() as db:
            studio = (await db.execute(
                select(Studio).where(Studio.id == ids["sid"]))).scalar_one()
            today = studio_time.today(studio)

        nxt = await _resolve(ids, period="next_week")
        monday = today - timedelta(days=today.weekday()) + timedelta(days=7)
        assert nxt.date_from == monday, (nxt.date_from, monday)
        assert nxt.date_to == monday + timedelta(days=6)
        assert nxt.date_from.weekday() == 0 and nxt.date_to.weekday() == 6
        # Даты, посчитанные моделью, перебиты полностью.
        assert nxt.date_from.year != 2000

        cur = await _resolve(ids, period="this_week")
        # Начало не в прошлом: ставить занятия задним числом нельзя, и «на этой
        # неделе» в пятницу не должно означать понедельник.
        assert cur.date_from >= today, (cur.date_from, today)
        assert cur.date_to == today - timedelta(days=today.weekday()) + timedelta(days=6)

        month = await _resolve(ids, period="this_month")
        assert month.date_from >= today
        assert month.date_to.month == today.month
        # Последний день месяца — именно последний, а не «30-е всегда».
        assert (month.date_to + timedelta(days=1)).day == 1

        nxt_month = await _resolve(ids, period="next_month")
        assert nxt_month.date_from.day == 1
        assert nxt_month.date_from > month.date_to
        assert (nxt_month.date_to + timedelta(days=1)).day == 1

        # Период не назван — явные даты человека остаются нетронутыми.
        plain = await _resolve(ids)
        assert plain.date_from == date(2000, 1, 1) and plain.date_to == date(2000, 1, 2)
    finally:
        await _cleanup(ids["sid"])


def test_named_period_becomes_dates_on_the_server():
    asyncio.run(_run_period())


async def _run_period_follows_the_studio_clock() -> None:
    """Границы недели считаются по календарю СТУДИИ, а не машины, где крутится
    сервер: в студии на UTC+12 «сегодня» бывает уже завтрашним."""
    east = await _seed("UTC+12")
    try:
        from services import studio_time
        async with async_session_maker() as db:
            studio = (await db.execute(
                select(Studio).where(Studio.id == east["sid"]))).scalar_one()
            local_today = studio_time.today(studio)
        got = await _resolve(east, period="next_week")
        assert got.date_from == local_today - timedelta(days=local_today.weekday()) + timedelta(days=7)
    finally:
        await _cleanup(east["sid"])


def test_period_boundaries_follow_the_studio_clock():
    asyncio.run(_run_period_follows_the_studio_clock())


# ── 2. Накладки внутри плана ──────────────────────────────────────────────────

def _step(n: int, start: str, minutes: int = 60, teacher: int = 7, hall=None) -> dict:
    args = {"start_time": start, "duration_min": minutes, "teacher_id": teacher}
    if hall is not None:
        args["hall_id"] = hall
    return {"n": n, "tool": "create_lesson", "args": args}


def test_overlapping_steps_of_one_plan_are_reported():
    got = plan_conflicts([
        _step(1, "2026-09-01T10:00:00"),
        _step(2, "2026-09-01T10:30:00"),
    ])
    assert len(got) == 1, got
    assert got[0]["kind"] == "plan_conflict"
    assert got[0]["step"] == 2
    assert "тренера" in got[0]["text"]


def test_steps_that_only_touch_are_not_a_conflict():
    """10:00–11:00 и 11:00–12:00 идут встык — это нормальное расписание."""
    assert plan_conflicts([
        _step(1, "2026-09-01T10:00:00"),
        _step(2, "2026-09-01T11:00:00"),
    ]) == []


def test_different_teachers_do_not_conflict():
    assert plan_conflicts([
        _step(1, "2026-09-01T10:00:00", teacher=7),
        _step(2, "2026-09-01T10:30:00", teacher=8),
    ]) == []


def test_same_hall_conflicts_even_with_different_teachers():
    got = plan_conflicts([
        _step(1, "2026-09-01T10:00:00", teacher=7, hall=3),
        _step(2, "2026-09-01T10:30:00", teacher=8, hall=3),
    ])
    assert len(got) == 1 and "зала" in got[0]["text"], got


def test_one_pair_is_reported_once_even_if_both_teacher_and_hall_clash():
    """Тренер и зал совпали оба — накладка всё равно одна, а не две строки об
    одном и том же."""
    got = plan_conflicts([
        _step(1, "2026-09-01T10:00:00", teacher=7, hall=3),
        _step(2, "2026-09-01T10:30:00", teacher=7, hall=3),
    ])
    assert len(got) == 1, got


def test_three_overlapping_steps_report_every_pair():
    got = plan_conflicts([
        _step(1, "2026-09-01T10:00:00"),
        _step(2, "2026-09-01T10:20:00"),
        _step(3, "2026-09-01T10:40:00"),
    ])
    assert len(got) == 3, [g["text"] for g in got]


def test_duration_is_taken_from_the_step():
    """Занятие на 30 минут в 10:00 не мешает занятию в 10:30, а полуторачасовое
    мешает."""
    assert plan_conflicts([
        _step(1, "2026-09-01T10:00:00", minutes=30),
        _step(2, "2026-09-01T10:30:00"),
    ]) == []
    assert plan_conflicts([
        _step(1, "2026-09-01T10:00:00", minutes=90),
        _step(2, "2026-09-01T10:30:00"),
    ])


def test_steps_without_time_are_ignored():
    """Незаполненный шаг — это вопрос формы, а не накладка: ругаться на него
    значит показать человеку ошибку раньше, чем он успел ответить."""
    assert plan_conflicts([
        {"n": 1, "tool": "create_lesson", "args": {"teacher_id": 7}},
        _step(2, "2026-09-01T10:00:00"),
    ]) == []
    assert plan_conflicts([
        {"n": 1, "tool": "create_client", "args": {"name": "Аня"}},
        {"n": 2, "tool": "create_client", "args": {"name": "Оля"}},
    ]) == []


def test_broken_time_does_not_crash_the_plan():
    assert plan_conflicts([
        {"n": 1, "tool": "create_lesson",
         "args": {"start_time": "завтра в десять", "teacher_id": 7}},
        _step(2, "2026-09-01T10:00:00"),
    ]) == []

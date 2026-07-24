"""Ежедневный фоновый цикл уведомлений (эпик N-4, задачи 6-7): дни рождения,
отчёт за день, еженедельный отчёт, напоминание об истечении тарифа, а также
напоминания о занятии (c2/t3/t4).

Каркас — копия паттерна `scenario_runner`: create_task + sleep, без
APScheduler. Тик — раз в 30 минут.

Дневные события (дни рождения/отчёты/тариф) сверяются с локальным временем
студии (Studio.timezone) и с state, чтобы не сработать дважды в один студийный
день. State — не новая таблица, а `StudioIntegration(integration_type=
"notify_state")`.config: {"bday": "YYYY-MM-DD", "report": "...", "weekly":
"...", "billing": "..."} — дата последнего срабатывания каждого блока.
Порядок — сначала слать, потом commit(state): при падении между send и commit
возможна повторная отправка на следующем тике — осознанный компромисс для MVP
(лучше повтор, чем молчание при рестарте).

Напоминания о занятии сверяются с `start_time` напрямую (как и весь остальной
код `routers/schedule/*` — без привязки к таймзоне студии): окно (last_tick;
this_tick] на `start_time - offset` по каждому из 4 офсетов, без пересечений.

ponytail: один воркер uvicorn = один таск, как в scenario_runner — тот же
компромисс, тот же апгрейд-путь (PG advisory lock), если появится второй воркер.
"""
import asyncio
import logging
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from zoneinfo import ZoneInfo

from models import (
    Client, Lesson, NotificationEventToggle, Operation, Reservation, Studio, StudioBillingPlan, StudioIntegration,
    User,
)
from services.notifier import notify

logger = logging.getLogger(__name__)

_SLEEP_SECONDS = 30 * 60
_STATE_TYPE = "notify_state"
_REPORT_HOUR = 20

# (offset, event_id, hours-контекст) — окно (last_tick; this_tick] на start_time - offset.
_REMINDER_OFFSETS = (
    (timedelta(hours=24), "c2", 24),
    (timedelta(hours=2), "c2", 2),
    (timedelta(hours=1), "t3", None),
    (timedelta(minutes=30), "t4", None),
)

# ponytail: рестарт бэка теряет одно окно напоминаний (last_tick только в памяти);
# персистентный маркер — если станет больно.
_last_tick: datetime | None = None


def _is_birthday(birth_date: date, today: date) -> bool:
    """29 февраля в невисокосный год отмечается 28.02 (в невисокосный год
    date(today.year, 2, 29) невалиден — сравнение идёт по (month, day), но
    29.02 у клиента при today=28.02 невисокосного года считается тоже."""
    if birth_date.month == 2 and birth_date.day == 29 and not _is_leap(today.year):
        return today.month == 2 and today.day == 28
    return birth_date.month == today.month and birth_date.day == today.day


def _is_leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def _report_due(state: dict, now_local: datetime) -> bool:
    today_str = now_local.date().isoformat()
    if state.get("report") == today_str:
        return False
    return now_local.hour >= _REPORT_HOUR


async def _get_state(db: AsyncSession, studio_id: int) -> tuple[StudioIntegration, dict]:
    row = (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id,
            StudioIntegration.integration_type == _STATE_TYPE,
        )
    )).scalar_one_or_none()
    if row is None:
        row = StudioIntegration(studio_id=studio_id, integration_type=_STATE_TYPE, is_connected=True, config={})
        db.add(row)
        await db.flush()
    return row, dict(row.config or {})


async def _revenue_for(db: AsyncSession, studio_id: int, day: date) -> int:
    total = (await db.execute(
        select(Operation.amount).where(
            Operation.studio_id == studio_id,
            Operation.type == "in",
            Operation.op_date == day,
        )
    )).scalars().all()
    return sum(total)


async def _run_birthdays(db: AsyncSession, studio_id: int, today: date) -> None:
    clients = (await db.execute(
        select(Client).where(Client.studio_id == studio_id, Client.birth_date.is_not(None))
    )).scalars().all()
    birthday_clients = [c for c in clients if _is_birthday(c.birth_date, today)]
    for c in birthday_clients:
        await notify(db, studio_id, "client", "c7", {
            "client_id": c.id,
            "client_name": f"{c.name} {c.last_name or ''}".strip(),
        })
    if birthday_clients:
        names = ", ".join(f"{c.name} {c.last_name or ''}".strip() for c in birthday_clients)
        await notify(db, studio_id, "trainer", "t8", {"names": names})


async def _lessons_count(db: AsyncSession, studio_id: int, day: date) -> int:
    start = datetime.combine(day, datetime.min.time())
    rows = (await db.execute(
        select(Lesson.id).where(Lesson.studio_id == studio_id, Lesson.start_time >= start,
                                 Lesson.start_time < start + timedelta(days=1))
    )).scalars().all()
    return len(rows)


async def _new_clients_count(db: AsyncSession, studio_id: int, day: date) -> int:
    start = datetime.combine(day, datetime.min.time())
    rows = (await db.execute(
        select(Client.id).where(Client.studio_id == studio_id,
                                 Client.registration_date >= start,
                                 Client.registration_date < start + timedelta(days=1))
    )).scalars().all()
    return len(rows)


async def _run_daily_report(db: AsyncSession, studio_id: int, today: date) -> None:
    revenue = await _revenue_for(db, studio_id, today)
    lessons = await _lessons_count(db, studio_id, today)
    new_clients = await _new_clients_count(db, studio_id, today)
    ctx = {"revenue": revenue, "lessons": lessons, "new_clients": new_clients}
    await notify(db, studio_id, "admin", "a8", ctx)
    await notify(db, studio_id, "owner", "o1", ctx)

    past_days = [today - timedelta(days=i) for i in range(1, 8)]
    past_revenues = [await _revenue_for(db, studio_id, d) for d in past_days]
    avg7 = sum(past_revenues) / len(past_revenues) if past_revenues else 0
    if avg7 > 0 and revenue < 0.5 * avg7:
        # ponytail: наивная эвристика аномалии (порог 50% от среднего за 7 дней); статистика — после MVP
        await notify(db, studio_id, "owner", "o4", {"revenue": revenue, "avg7": avg7})


async def _run_weekly_report(db: AsyncSession, studio_id: int, today: date) -> None:
    week_start = today - timedelta(days=7)
    revenue = 0
    lessons_count = 0
    new_clients_count = 0
    for i in range(7):
        d = week_start + timedelta(days=i)
        revenue += await _revenue_for(db, studio_id, d)
        lessons_count += await _lessons_count(db, studio_id, d)
        new_clients_count += await _new_clients_count(db, studio_id, d)
    await notify(db, studio_id, "owner", "o2", {
        "revenue": revenue, "lessons": lessons_count, "new_clients": new_clients_count,
    })


async def _run_billing_check(db: AsyncSession, studio_id: int, today: date) -> None:
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    if plan is None or plan.expires_at is None:
        return
    days_left = (plan.expires_at.date() - today).days
    if 0 <= days_left <= plan.notify_before_days:
        await notify(db, studio_id, "owner", "o6", {"days_left": days_left})


async def _process_studio(db: AsyncSession, studio: Studio) -> None:
    try:
        tz = ZoneInfo(studio.timezone or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")
    now_local = datetime.now(tz).replace(tzinfo=None)
    today = now_local.date()

    state_row, state = await _get_state(db, studio.id)
    changed = False

    if state.get("bday") != today.isoformat():
        await _run_birthdays(db, studio.id, today)
        state["bday"] = today.isoformat()
        changed = True

    if _report_due(state, now_local):
        await _run_daily_report(db, studio.id, today)
        state["report"] = today.isoformat()
        changed = True

    if now_local.weekday() == 0 and state.get("weekly") != today.isoformat():
        await _run_weekly_report(db, studio.id, today)
        state["weekly"] = today.isoformat()
        changed = True

    if state.get("billing") != today.isoformat():
        await _run_billing_check(db, studio.id, today)
        state["billing"] = today.isoformat()
        changed = True

    if changed:
        state_row.config = state
        await db.commit()


async def _run_reminders(db: AsyncSession, window_start: datetime, window_end: datetime) -> None:
    """Один блок на все студии сразу — уведомления про занятия не завязаны на
    студийный день, только на start_time. Окна (last_tick; this_tick] по
    каждому офсету не пересекаются — дублей при штатной работе цикла нет."""
    for offset, event_id, hours in _REMINDER_OFFSETS:
        lo = window_start + offset
        hi = window_end + offset
        lessons = (await db.execute(
            select(Lesson).where(Lesson.start_time > lo, Lesson.start_time <= hi,
                                  Lesson.status != "cancelled")
        )).scalars().all()
        for lesson in lessons:
            reservations = (await db.execute(
                select(Reservation).where(Reservation.lesson_id == lesson.id, Reservation.status == "active")
            )).scalars().all()
            if not reservations:
                continue
            ctx_base = {"lesson_name": lesson.name, "start_time": lesson.start_time.strftime("%d.%m %H:%M")}

            if event_id == "c2":
                for r in reservations:
                    await notify(db, lesson.studio_id, "client", "c2",
                                 {**ctx_base, "client_id": r.client_id, "hours": hours})
            elif event_id == "t3":
                if lesson.teacher_id is None:
                    continue
                teacher = await db.get(User, lesson.teacher_id)
                if teacher is None:
                    continue
                await notify(db, lesson.studio_id, "trainer", "t3", {**ctx_base, "to_email": teacher.email})
            elif event_id == "t4":
                if lesson.teacher_id is None:
                    continue
                teacher = await db.get(User, lesson.teacher_id)
                if teacher is None:
                    continue
                client_ids = [r.client_id for r in reservations]
                clients = (await db.execute(
                    select(Client).where(Client.id.in_(client_ids))
                )).scalars().all()
                names = ", ".join(f"{c.name} {c.last_name or ''}".strip() for c in clients)
                await notify(db, lesson.studio_id, "trainer", "t4",
                             {**ctx_base, "to_email": teacher.email, "names": names})


async def run_daily_notify(session_maker: async_sessionmaker) -> None:
    """Прогнать все студии с хотя бы одним включённым событием в матрице.
    Своя сессия/try-except на студию — падение одной не глушит остальные
    (образец — run_due_scenarios). Напоминания о занятии (c2/t3/t4) — отдельным
    блоком по всем студиям сразу, окно от последнего тика до текущего."""
    global _last_tick
    this_tick = datetime.now()
    if _last_tick is not None:
        async with session_maker() as db:
            try:
                await _run_reminders(db, _last_tick, this_tick)
            except Exception:
                await db.rollback()
                logger.exception("daily_notify: reminders run failed")
    _last_tick = this_tick

    async with session_maker() as db:
        studio_ids = (await db.execute(
            select(Studio.id)
            .join(NotificationEventToggle, NotificationEventToggle.studio_id == Studio.id)
            .where(NotificationEventToggle.is_enabled.is_(True))
            .distinct()
        )).scalars().all()

    for studio_id in studio_ids:
        async with session_maker() as db:
            studio = await db.get(Studio, studio_id)
            if studio is None:
                continue
            try:
                await _process_studio(db, studio)
            except Exception:
                await db.rollback()
                logger.exception("daily_notify: studio %s run failed", studio_id)


async def _loop(session_maker: async_sessionmaker) -> None:
    while True:
        try:
            await run_daily_notify(session_maker)
        except Exception:
            logger.exception("daily_notify loop iteration failed")
        await asyncio.sleep(_SLEEP_SECONDS)


def start_daily_notify_loop(session_maker: async_sessionmaker) -> asyncio.Task:
    """Запустить фоновый таск. Возвращает Task, чтобы lifespan мог его отменить."""
    return asyncio.create_task(_loop(session_maker))

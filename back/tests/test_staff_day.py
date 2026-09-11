"""Мастера на календарный день: кто РАБОТАЕТ, отдельно от того, у кого есть время.

`availability` на этот вопрос ответить не может: он вычитает занятость и склеивает
мастеров в общую сетку, поэтому полностью занятый мастер неотличим от выходного —
ноль слотов и там, и там. Клиенту нужно разное: занятого показываем серым с
подписью «нет свободного времени», выходного не показываем вовсе.

Реальная БД, ручная чистка (как в test_resource_hours). Запуск из back/:
    python -m pytest tests/test_staff_day.py -q
"""
import asyncio
import warnings
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, insert, select

import test_resource_hours as hours
from database import async_session_maker, get_db
from models import (Lesson, Service, StaffBranchAssignment, StaffWorkingHours, Studio,
                    StudioBookingSettings, StudioMember, User)
from models.base import user_services
from ratelimit import limiter
from routers.booking import miniapp_router
from routers.booking.miniapp import Viewer, get_viewer
from schemas.schedule import hybrid
from services import resource_availability

warnings.filterwarnings("ignore")

DAY = hours.DAY  # среда, 2027-06-16
NOW = datetime.combine(DAY - timedelta(days=1), datetime.min.time(), timezone.utc)


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    monkeypatch.setattr(hybrid, "AVAILABLE_BOOKING_MODES", frozenset({"event", "resource", "hybrid"}))


async def _seed() -> dict:
    """Студия с двумя мастерами на филиале A и одной индивидуальной услугой.

    Клиентские правила убраны из уравнения намеренно — часы виджета 00:00–00:00,
    нулевой advance и широкий горизонт: здесь проверяется разделение «работает /
    свободен», а не они. Горизонт особенно: DAY намеренно далеко в будущем
    (как в test_resource_hours), и умолчание в 7 дней вырезало бы весь день
    целиком, подменив проверяемый ответ.
    """
    ids = await hours._seed()
    await hours._assign(ids)
    await hours._staff_hours(ids, DAY.weekday(), "09:00", "18:00")
    async with async_session_maker() as db:
        studio = await db.get(Studio, ids["studio"])
        studio.booking_mode = "resource"
        studio.strict_schedule_enabled = True
        studio.journal_time_step = 15

        mate = User(email=f"sd-mate-{ids['studio']}@test.local", hashed_password="x", name="M")
        db.add(mate)
        await db.flush()
        db.add(StudioMember(user_id=mate.id, studio_id=studio.id, role="trainer",
                            status="active", name="Mate", last_name="Second"))
        db.add(StaffBranchAssignment(studio_id=studio.id, user_id=mate.id, branch_id=ids["branch_a"]))
        db.add(StaffWorkingHours(user_id=mate.id, studio_id=studio.id, day_of_week=DAY.weekday(),
                                 is_open=True, open_time="09:00", close_time="18:00"))

        service = Service(studio_id=studio.id, name="Haircut", price=0, duration_min=45,
                          buffer_after_min=15, service_type="individual", booking_mode="resource")
        db.add(service)
        db.add(StudioBookingSettings(studio_id=studio.id, prefill_on_booking=False,
                                     min_booking_advance_min=0, booking_window_days=400,
                                     widget_work_start="00:00", widget_work_end="00:00"))
        await db.flush()
        for user_id in (ids["teacher"], mate.id):
            await db.execute(insert(user_services).values(user_id=user_id, service_id=service.id))
        ids.update(service=service.id, mate=mate.id)
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(user_services).where(user_services.c.service_id == ids["service"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))
        await db.execute(delete(StaffWorkingHours).where(StaffWorkingHours.user_id == ids["mate"]))
        await db.execute(delete(StaffBranchAssignment).where(
            StaffBranchAssignment.user_id == ids["mate"]))
        await db.execute(delete(StudioMember).where(StudioMember.user_id == ids["mate"]))
        await db.commit()
    await hours._cleanup(ids)
    async with async_session_maker() as db:
        await db.execute(delete(User).where(User.id == ids["mate"]))
        await db.commit()


async def _occupy(ids: dict, user_id: int, start_hour: int, minutes: int) -> None:
    """Занятие мастера в его собственном рабочем окне — стенное время студии."""
    async with async_session_maker() as db:
        db.add(Lesson(studio_id=ids["studio"], name="Taken", teacher_name="T", teacher_id=user_id,
                      branch_id=ids["branch_a"], service_id=ids["service"],
                      start_time=datetime.combine(DAY, datetime.min.time())
                      .replace(hour=start_hour), tz_iana="Europe/Prague", duration_min=minutes,
                      price=0, level="any", equipment="none", total_spots=1,
                      booking_mode="resource", status="confirmed"))
        await db.commit()


async def _report(ids: dict, branch_key: str = "branch_a"):
    async with async_session_maker() as db:
        return await resource_availability.staff_day(
            db, studio_id=ids["studio"], service_id=ids["service"],
            branch_id=ids[branch_key], day=DAY, now=NOW)


def _row(report, user_id):
    return next(r for r in report.staff if r.teacher_id == user_id)


# ─── Занят целиком — но работает ──────────────────────────────────────────────

async def _busy_master_is_still_working(ids):
    """Смена занята полностью: свободного времени нет, но день рабочий.

    Ровно тот случай, ради которого заведён отдельный ответ: у `availability`
    этот мастер и мастер в выходной дают одинаковый пустой список.
    """
    await _occupy(ids, ids["teacher"], 9, 9 * 60)  # 09:00–18:00, вся смена
    report = await _report(ids)

    busy = _row(report, ids["teacher"])
    assert busy.works is True, "мастер на смене обязан остаться в списке работающих"
    assert busy.free == [], "занятая смена не даёт свободного времени"

    free = _row(report, ids["mate"])
    assert free.works is True and free.free, "второй мастер свободен и должен отдать слоты"


# ─── Выходной и чужой филиал ──────────────────────────────────────────────────

async def _day_off_master_does_not_work(ids):
    """Закрытый день недели — мастер не на смене. Отличается от занятой смены
    только этим полем: свободного времени нет и там, и там."""
    async with async_session_maker() as db:
        row = (await db.execute(select(StaffWorkingHours).where(
            StaffWorkingHours.user_id == ids["mate"],
            StaffWorkingHours.day_of_week == DAY.weekday()))).scalar_one()
        row.is_open = False
        await db.commit()

    entry = _row(await _report(ids), ids["mate"])
    assert entry.works is False and entry.free == []


async def _other_branch_has_no_staff(ids):
    """Оба мастера назначены на филиал A. Филиал B не наследует их: назначение —
    единственный источник принадлежности к филиалу."""
    report = await _report(ids, "branch_b")
    assert report.staff == [] and report.reason == "no_eligible_staff"


# ─── Свободное время совпадает со сменой ──────────────────────────────────────

async def _free_time_follows_the_shift(ids):
    """Свободное время обязано лежать внутри смены мастера и обходить занятое.

    Смена 09:00–18:00, услуга 45 мин + 15 буфера, занято 12:00–13:00. Первое
    начало — 09:00 (не 00:00 и не час студии), последнее — 17:00 (иначе хвост
    услуги вылезет за смену), и ни одно не попадает в занятый час.
    """
    await _occupy(ids, ids["teacher"], 12, 60)
    entry = _row(await _report(ids), ids["teacher"])

    assert entry.works is True and entry.free
    assert entry.free[0].strftime("%H:%M") == "09:00"
    assert entry.free[-1].strftime("%H:%M") == "17:00"
    taken = datetime.combine(DAY, datetime.min.time()).replace(hour=12)
    assert not [t for t in entry.free if taken - timedelta(minutes=60) < t < taken + timedelta(hours=1)]


def test_staff_day_against_the_database():
    async def run():
        ids = await _seed()
        try:
            # Порядок значим: каждая проверка оставляет данные следующей.
            # Занятость копится, выходной ставится последним.
            await _free_time_follows_the_shift(ids)
            await _other_branch_has_no_staff(ids)
            await _busy_master_is_still_working(ids)
            await _day_off_master_does_not_work(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


def test_extreme_date_is_refused_not_a_crash():
    """Дата у края календаря обязана дать 422, а не 500.

    Снимок занятости берётся с запасом в несколько суток вокруг запрошенных дней
    (`load`), и на `9999-12-31` это сложение вылетает за пределы `date`.
    Эндпоинт гостевой и лимитирован лишь 60 запросами в минуту, так что
    необработанный OverflowError — это трассировка в логах по чужому запросу.
    Проверяются обе двери: новая и соседняя `/availability`, откуда он и растёт.
    """
    async def run():
        ids = await _seed()
        try:
            app = FastAPI()
            app.state.limiter = limiter
            app.include_router(miniapp_router, prefix="/global")

            async def database():
                async with async_session_maker() as session:
                    yield session

            app.dependency_overrides[get_db] = database
            app.dependency_overrides[get_viewer] = lambda: Viewer(None, ids["studio"])
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
                for day in ("9999-12-31", "0001-01-01"):
                    response = await http.get("/global/staff-day", params={
                        "service_id": ids["service"], "branch_id": ids["branch_a"], "date": day})
                    assert response.status_code == 422, f"{day}: {response.status_code}"

                    response = await http.get("/global/availability", params={
                        "service_id": ids["service"], "branch_id": ids["branch_a"],
                        "date_from": day, "date_to": day})
                    assert response.status_code == 422, f"{day} availability: {response.status_code}"

                # Обычный день по-прежнему отвечает.
                ok = await http.get("/global/staff-day", params={
                    "service_id": ids["service"], "branch_id": ids["branch_a"], "date": str(DAY)})
                assert ok.status_code == 200, ok.text
        finally:
            await _cleanup(ids)

    asyncio.run(run())


def test_staff_day_http_contract():
    """Форма ответа закреплена: мини-приложение режет `first_free` строкой.

    `local_start` у слотов уже так читается (ResourceBookingSheet, AC-21), и до
    сих пор ни один тест этого не держал. Если сериализация однажды начнёт
    добавлять смещение, срез `[11:16]` молча покажет чужой час — ловим здесь.
    """
    async def run():
        ids = await _seed()
        try:
            await _occupy(ids, ids["teacher"], 9, 9 * 60)  # первый занят целиком
            app = FastAPI()
            app.state.limiter = limiter
            app.include_router(miniapp_router, prefix="/global")

            async def database():
                async with async_session_maker() as session:
                    yield session

            app.dependency_overrides[get_db] = database
            app.dependency_overrides[get_viewer] = lambda: Viewer(None, ids["studio"])
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as http:
                response = await http.get("/global/staff-day", params={
                    "service_id": ids["service"], "branch_id": ids["branch_a"], "date": str(DAY)})
                assert response.status_code == 200, response.text
                body = response.json()
                assert set(body) == {"staff", "reason"}

                by_id = {row["teacher_id"]: row for row in body["staff"]}
                assert set(by_id) == {ids["teacher"], ids["mate"]}
                assert set(by_id[ids["mate"]]) == {
                    "teacher_id", "name", "last_name", "photo_url",
                    "works", "reason", "free_count", "first_free"}

                busy = by_id[ids["teacher"]]
                assert busy["works"] is True and busy["free_count"] == 0
                assert busy["first_free"] is None

                free = by_id[ids["mate"]]
                assert free["works"] is True and free["free_count"] > 0
                assert free["name"] == "Mate" and free["last_name"] == "Second"
                # Наивное стенное время студии, без смещения и без «Z».
                assert free["first_free"][:16] == f"{DAY}T09:00"
                assert len(free["first_free"]) in (16, 19), free["first_free"]
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_staff_day_against_the_database()
    test_staff_day_http_contract()

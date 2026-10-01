"""Механика новой услуги берётся у студии, когда её не назвали.

Форма Каталога больше не спрашивает «Тип» и «Механику записи» (кроме смешанной
студии): барбершоп получает «выбор времени», йога-студия — «запись на занятие»,
а смешанная решает по формату. Ассистент (`create_service`) механику не
передаёт вовсе — тот же путь. Реальная БД, ручная чистка.
Запуск из back/:  python -m pytest tests/test_service_mode_from_studio.py -q
"""
import asyncio

from fastapi import HTTPException
from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import Service, Studio
from routers.studio.services import create_service
from schemas.studio.studio import ServiceCreate


async def _seed(mode: str) -> int:
    async with async_session_maker() as db:
        studio = Studio(name=f"TEST-SERVICE-MODE-{mode}", currency="CZK", tz_iana="Europe/Prague",
                        booking_mode=mode, strict_schedule_enabled=mode != "event")
        db.add(studio)
        await db.commit()
        return studio.id


async def _cleanup(studio_ids: list[int]) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Service).where(Service.studio_id.in_(studio_ids)))
        await db.execute(delete(Studio).where(Studio.id.in_(studio_ids)))
        await db.commit()


async def _create(studio_id: int, **fields):
    owner = StudioContext(user=None, studio_id=studio_id, role="owner")
    async with async_session_maker() as db:
        return await create_service(data=ServiceCreate(name="X", price=100, **fields), ctx=owner, db=db)


def test_new_service_takes_booking_mode_from_studio():
    async def run():
        ids = {mode: await _seed(mode) for mode in ("event", "resource", "hybrid")}
        try:
            yoga = await _create(ids["event"], max_clients=12, service_type="group")
            assert (yoga.booking_mode, yoga.max_clients) == ("event", 12)

            # Барбершоп: формат не прислали — услуга всё равно индивидуальная,
            # место одно (§4.4).
            cut = await _create(ids["resource"], duration_min=45)
            assert (cut.booking_mode, cut.service_type, cut.max_clients) == ("resource", "individual", 1)

            # Групповая услуга в студии «только на время» продана быть не может.
            try:
                await _create(ids["resource"], service_type="group")
                raise AssertionError("group в resource-студии должна быть отклонена")
            except HTTPException as exc:
                assert exc.status_code == 422

            personal = await _create(ids["hybrid"], service_type="individual")
            group = await _create(ids["hybrid"], service_type="group", max_clients=10)
            assert (personal.booking_mode, group.booking_mode) == ("resource", "event")

            # Явно названная механика сильнее студийной.
            explicit = await _create(ids["hybrid"], service_type="individual", booking_mode="event")
            assert explicit.booking_mode == "event"
        finally:
            await _cleanup(list(ids.values()))

    asyncio.run(run())


if __name__ == "__main__":
    test_new_service_takes_booking_mode_from_studio()
    print("ALL PASS")

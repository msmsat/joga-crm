"""Место как ось расписания: тумблер владельца и филиал занятия без зала.

Проверяет две вещи, которые появились вместе с отраслевыми пресетами:

  * `space_is_axis` в `booking_capabilities` — это отрасль ПЛЮС тумблер
    владельца, посчитанные сервером; его смена двигает
    `booking_config_version`, иначе мини-апп покажет условия из кэша;
  * `_resolve_branch` — филиал занятия. Зал остаётся старшим источником, а без
    зала филиал берётся из тела запроса: у студий, где места не участвуют в
    расписании, вывести его больше неоткуда, а терять нельзя.

Прямой вызов роутер-функций без HTTP-слоя — конвенция test_hybrid_config.py.
Реальная БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_space_axis.py -q
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import delete

from database import async_session_maker
from dependencies import StudioContext
from models import Hall, Studio, StudioBranch
from routers.schedule.lessons import _resolve_branch
from routers.settings.general import get_general_settings, update_general_settings
from schemas.settings.general import GeneralUpdate


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-SPACE-AXIS-STUDIO", currency="CZK", tz_iana="Europe/Prague",
                        terminology_profile="beauty")
        db.add(studio)
        await db.flush()
        first = StudioBranch(studio_id=studio.id, name="TEST-SPACE-AXIS-B1")
        second = StudioBranch(studio_id=studio.id, name="TEST-SPACE-AXIS-B2")
        db.add_all([first, second])
        await db.flush()
        chair = Hall(studio_id=studio.id, branch_id=first.id, name="Кресло 1", capacity=1)
        db.add(chair)
        await db.flush()
        ids = {"studio": studio.id, "branch": first.id, "other_branch": second.id, "hall": chair.id}
        await db.commit()
        return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio"]))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.commit()


# ─── Тумблер владельца поверх отрасли ─────────────────────────────────────────

async def _axis_follows_industry_until_the_owner_says_otherwise(studio_id: int) -> None:
    owner = StudioContext(user=None, studio_id=studio_id, role="owner")

    async with async_session_maker() as db:
        before = await get_general_settings(ctx=owner, db=db)
    # Профиль beauty: клиент записывается к мастеру, а не к креслу.
    assert before.booking_capabilities.terminology_profile == "beauty"
    assert before.booking_capabilities.space_is_axis is False
    version = before.booking_capabilities.booking_config_version

    async with async_session_maker() as db:
        after = await update_general_settings(
            body=GeneralUpdate(space_is_axis=True), background=BackgroundTasks(), ctx=owner, db=db)
    assert after.booking_capabilities.space_is_axis is True
    # Условия записи изменились — версия обязана вырасти, иначе клиент
    # продолжит рисовать интерфейс по устаревшему ответу.
    assert after.booking_capabilities.booking_config_version == version + 1

    # Возврат к отрасли — это null, а не false: студия должна снова поехать за
    # пресетом, если тот поменяется.
    async with async_session_maker() as db:
        back = await update_general_settings(
            body=GeneralUpdate(space_is_axis=None), background=BackgroundTasks(), ctx=owner, db=db)
    assert back.booking_capabilities.space_is_axis is False

    async with async_session_maker() as db:
        studio = await db.get(Studio, studio_id)
        assert studio.space_is_axis is None


async def _profile_change_moves_the_axis_with_it(studio_id: int) -> None:
    owner = StudioContext(user=None, studio_id=studio_id, role="owner")
    async with async_session_maker() as db:
        studio_profile = await update_general_settings(
            body=GeneralUpdate(terminology_profile="studio"), background=BackgroundTasks(),
            ctx=owner, db=db)
    assert studio_profile.booking_capabilities.space_is_axis is True

    async with async_session_maker() as db:
        beauty = await update_general_settings(
            body=GeneralUpdate(terminology_profile="beauty"), background=BackgroundTasks(),
            ctx=owner, db=db)
    assert beauty.booking_capabilities.space_is_axis is False


async def _terminology_block_carries_the_space_word(studio_id: int) -> None:
    owner = StudioContext(user=None, studio_id=studio_id, role="owner")
    async with async_session_maker() as db:
        data = await get_general_settings(ctx=owner, db=db, locale="ru")
    profiles = data.terminology["profiles"]
    assert profiles["beauty"]["space"]["singular"] == "кресло"
    assert profiles["studio"]["space"]["singular"] == "зал"
    # Признак отрасли в блоке профилей — НЕ переопределённый: по нему карточка
    # настроек пишет «по умолчанию для вашей отрасли».
    assert profiles["beauty"]["space_is_axis"] is False


# ─── Филиал занятия ───────────────────────────────────────────────────────────

async def _branch_comes_from_the_hall(ids: dict) -> None:
    async with async_session_maker() as db:
        assert await _resolve_branch(ids["hall"], None, ids["studio"], db) == ids["branch"]
        # Тот же филиал прислали явно — не спор, а подтверждение.
        assert await _resolve_branch(ids["hall"], ids["branch"], ids["studio"], db) == ids["branch"]


async def _hall_and_branch_may_not_disagree(ids: dict) -> None:
    async with async_session_maker() as db:
        try:
            await _resolve_branch(ids["hall"], ids["other_branch"], ids["studio"], db)
        except HTTPException as error:
            assert error.status_code == 409
            assert error.detail["code"] == "BRANCH_CONFLICTS_WITH_HALL"
        else:
            raise AssertionError("расхождение зала и филиала обязано быть 409, а не тихим выбором")


async def _branch_without_hall_is_kept(ids: dict) -> None:
    """Барбершоп: кресла нет в расписании, но филиал у события остаться должен."""
    async with async_session_maker() as db:
        assert await _resolve_branch(None, ids["other_branch"], ids["studio"], db) == ids["other_branch"]
        # Ни зала, ни филиала — как было: догадкой не заполняем.
        assert await _resolve_branch(None, None, ids["studio"], db) is None


async def _foreign_branch_is_rejected(ids: dict) -> None:
    async with async_session_maker() as db:
        try:
            await _resolve_branch(None, 10_000_000, ids["studio"], db)
        except HTTPException as error:
            assert error.status_code == 404
        else:
            raise AssertionError("чужой филиал обязан дать 404")


def test_space_axis_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _axis_follows_industry_until_the_owner_says_otherwise(ids["studio"])
            await _profile_change_moves_the_axis_with_it(ids["studio"])
            await _terminology_block_carries_the_space_word(ids["studio"])
            await _branch_comes_from_the_hall(ids)
            await _hall_and_branch_may_not_disagree(ids)
            await _branch_without_hall_is_kept(ids)
            await _foreign_branch_is_rejected(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_space_axis_against_the_database()

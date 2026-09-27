"""Свой цвет у каждого сотрудника студии (StudioMember.color).

Журнал красит колонку и занятия мастера его цветом. Раньше цвет считался как
`id % 5`, и мастера то и дело совпадали: по сетке «по залам» нельзя было
понять, чьё занятие. Теперь цвет выдаёт сервер — первый свободный в студии, —
и владелец может его сменить. Проверяется:

1. новый сотрудник получает цвет, которого в студии ещё нет;
2. палитра кончилась — повтор уходит на самый редкий цвет, а не на первый;
3. правка карточки без `color` (старые клиенты, ассистент) цвет не стирает;
4. явная правка и ассистент цвет меняют, мусор вместо цвета не принимается.

Реальная БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_staff_colors.py -q
"""
import asyncio
import warnings

import pytest
from pydantic import ValidationError
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioMember, User
from routers.staff import profiles
from schemas.settings.team import StaffCreate, StaffUpdate
from services import ai_tools
from services.members import STAFF_PALETTE, pick_member_color

warnings.filterwarnings("ignore")

_OWNER = "staff-color-owner@velora-test.com"
_TRAINER = "staff-color-trainer@velora-test.com"
_NEW = "staff-color-new@velora-test.com"
_EMAILS = [_OWNER, _TRAINER, _NEW]


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-STAFF-COLOR", tz_iana="Europe/Prague", currency="EUR")
        db.add(studio)
        await db.flush()
        owner = User(email=_OWNER, hashed_password="x", name="Olga")
        trainer = User(email=_TRAINER, hashed_password="x", name="Irina")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(user_id=owner.id, studio_id=studio.id, role="owner",
                         status="active", name="Olga", color=STAFF_PALETTE[0]),
            StudioMember(user_id=trainer.id, studio_id=studio.id, role="trainer",
                         status="active", name="Irina", color=STAFF_PALETTE[1]),
        ])
        await db.commit()
        return {"sid": studio.id, "owner": owner.id, "trainer": trainer.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.email.in_(_EMAILS)))
        await db.commit()


async def _ctx(ids: dict, db) -> StudioContext:
    owner = (await db.execute(select(User).where(User.id == ids["owner"]))).scalar_one()
    return StudioContext(user=owner, studio_id=ids["sid"], role="owner")


async def _color(ids: dict, user_id: int) -> str | None:
    async with async_session_maker() as db:
        return (await db.execute(select(StudioMember.color).where(
            StudioMember.studio_id == ids["sid"], StudioMember.user_id == user_id,
        ))).scalar_one()


def _body(**over) -> StaffUpdate:
    """Тело правки — как его собирает форма: имя и email целиком."""
    return StaffUpdate(**{"name": "Irina", "email": _TRAINER, "role": "trainer", **over})


def _run(scenario):
    ids = asyncio.run(_seed())
    try:
        asyncio.run(scenario(ids))
    finally:
        asyncio.run(_cleanup(ids["sid"]))


def test_new_staff_gets_a_colour_nobody_in_the_studio_has(monkeypatch):
    # Биллинг, уведомления и почта — вне зоны этого теста.
    monkeypatch.setattr(profiles, "check_plan_limit", lambda *a, **k: asyncio.sleep(0))
    monkeypatch.setattr(profiles, "notify", lambda *a, **k: asyncio.sleep(0))

    async def _no_mail(*a, **k):
        return "https://example.test/join?token=stub"
    monkeypatch.setattr(profiles, "send_invite", _no_mail)

    async def scenario(ids):
        async with async_session_maker() as db:
            result = await profiles.create_staff(
                StaffCreate(name="Nina", email=_NEW, password="Velora7pq", role="trainer"),
                ctx=await _ctx(ids, db), db=db,
            )
        # Первые два цвета заняты владельцем и Ириной — новой достаётся третий.
        assert result["staff"]["color"] == STAFF_PALETTE[2], result["staff"]["color"]
    _run(scenario)


def test_when_the_palette_runs_out_the_rarest_colour_repeats():
    async def scenario(ids):
        async with async_session_maker() as db:
            # Весь остаток палитры разобран, а первый цвет — даже дважды.
            for i, color in enumerate(STAFF_PALETTE[2:] + (STAFF_PALETTE[0],)):
                user = User(email=f"staff-color-fill-{i}@velora-test.com", hashed_password="x", name="F")
                db.add(user)
                await db.flush()
                db.add(StudioMember(user_id=user.id, studio_id=ids["sid"], role="trainer",
                                    status="active", name="F",
                                    color=color.lower() if i == 0 else color))
            await db.flush()
            # Повтор — самый редкий и ранний в палитре: второй цвет (один раз), а
            # не первый (уже дважды). Регистр в базе не влияет на подсчёт.
            assert await pick_member_color(db, ids["sid"]) == STAFF_PALETTE[1]
            await db.rollback()
    _run(scenario)


def test_edit_without_colour_keeps_it_and_explicit_colour_changes_it():
    async def scenario(ids):
        async with async_session_maker() as db:
            await profiles.update_staff(ids["trainer"], _body(), ctx=await _ctx(ids, db), db=db)
        assert await _color(ids, ids["trainer"]) == STAFF_PALETTE[1]

        async with async_session_maker() as db:
            result = await profiles.update_staff(
                ids["trainer"], _body(color="#5E7389"), ctx=await _ctx(ids, db), db=db)
        assert result["staff"]["color"] == "#5E7389"
        assert await _color(ids, ids["trainer"]) == "#5E7389"
    _run(scenario)


def test_assistant_changes_colour_and_leaves_it_alone_otherwise():
    async def scenario(ids):
        async with async_session_maker() as db:
            await ai_tools.update_staff(
                await _ctx(ids, db), db,
                ai_tools.UpdateStaffArgs(staff_id=ids["trainer"], rate=250, rate_type="hourly"),
            )
        assert await _color(ids, ids["trainer"]) == STAFF_PALETTE[1]

        async with async_session_maker() as db:
            await ai_tools.update_staff(
                await _ctx(ids, db), db,
                ai_tools.UpdateStaffArgs(staff_id=ids["trainer"], color="#8FA53A"),
            )
        assert await _color(ids, ids["trainer"]) == "#8FA53A"
    _run(scenario)


@pytest.mark.parametrize("bad", ["red", "8FA53A", "#8FA53", "#8FA53AZ", ""])
def test_malformed_colour_is_rejected(bad):
    with pytest.raises(ValidationError):
        _body(color=bad)
    with pytest.raises(ValidationError):
        ai_tools.UpdateStaffArgs(staff_id=1, color=bad)

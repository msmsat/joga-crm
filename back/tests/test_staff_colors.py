"""Свой цвет у каждого сотрудника студии (StudioMember.color).

Журнал красит колонку и занятия мастера его цветом. Раньше цвет считался как
`id % 5`, и мастера то и дело совпадали: по сетке «по залам» нельзя было
понять, чьё занятие. Теперь цвет выдаёт сервер — первый свободный в студии, —
и владелец может его сменить. Проверяется:

1. новый сотрудник получает цвет, которого в студии ещё нет;
2. палитра кончилась — повтор уходит на самый редкий цвет, а не на первый;
3. правка карточки без `color` (старые клиенты, ассистент) цвет не стирает;
4. явная правка и ассистент цвет меняют, мусор вместо цвета не принимается;
5. цвета блоков журнала (перерыв, выходной, время студии) мастеру не
   выдаются, не принимаются, а у кого есть — меняются при запуске.

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
from services.members import STAFF_PALETTE, pick_member_color, repair_member_colors
from services.staff_colors import BLOCK_COLORS, RETIRED_COLORS, reserved_color

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


def test_reading_the_team_gives_colourless_members_distinct_colours():
    """Строки без цвета (старые, сиды) чинятся первым же GET /staff/ — без
    миграции. Несколько «бесцветных» разом получают РАЗНЫЕ цвета, не совпадая
    и с уже выданными; тренер, который видит в списке только себя, тоже
    получает цвет с учётом всей команды."""
    async def scenario(ids):
        async with async_session_maker() as db:
            fresh = []
            for i in range(3):
                user = User(email=f"staff-color-bare-{i}@velora-test.com", hashed_password="x", name="B")
                db.add(user)
                await db.flush()
                db.add(StudioMember(user_id=user.id, studio_id=ids["sid"], role="trainer",
                                    status="active", name=f"B{i}"))
                fresh.append(user.id)
            await db.commit()
        try:
            # Первым команду читает тренер — видит только себя, но цвета
            # раздаются по всей студии.
            async with async_session_maker() as db:
                me = (await db.execute(select(User).where(User.id == fresh[0]))).scalar_one()
                result = await profiles.list_staff(
                    ctx=StudioContext(user=me, studio_id=ids["sid"], role="trainer"),
                    db=db, offset=0, limit=40)
            assert [s["id"] for s in result["staff"]["items"]] == [fresh[0]]

            colors = [await _color(ids, uid) for uid in [ids["owner"], ids["trainer"], *fresh]]
            assert None not in colors, colors
            assert len(set(colors)) == len(colors), colors
            assert colors[2:] == list(STAFF_PALETTE[2:5]), colors

            # Второе чтение ничего не переписывает.
            async with async_session_maker() as db:
                await profiles.list_staff(ctx=await _ctx(ids, db), db=db, offset=0, limit=40)
            assert [await _color(ids, uid) for uid in [ids["owner"], ids["trainer"], *fresh]] == colors
        finally:
            async with async_session_maker() as db:
                await db.execute(delete(StudioMember).where(StudioMember.user_id.in_(fresh)))
                await db.execute(delete(User).where(User.id.in_(fresh)))
                await db.commit()
    _run(scenario)


@pytest.mark.parametrize("bad", ["red", "8FA53A", "#8FA53", "#8FA53AZ", ""])
def test_malformed_colour_is_rejected(bad):
    with pytest.raises(ValidationError):
        _body(color=bad)
    with pytest.raises(ValidationError):
        ai_tools.UpdateStaffArgs(staff_id=1, color=bad)


# ── Цвета блоков журнала мастеру не выдаются ─────────────────────────────────
# Перерыв, выходной и «время студии» стоят в той же сетке, что занятия. Мастер
# в их цвете делает своё занятие похожим на блок без занятия, поэтому:
# палитра их не содержит, правка их не принимает, а у кого такой уже есть —
# тому цвет меняет запуск сервера и первое чтение команды.

def test_palette_never_contains_a_journal_block_colour():
    assert len(set(STAFF_PALETTE)) == len(STAFF_PALETTE)
    assert [c for c in STAFF_PALETTE if reserved_color(c)] == []
    for accents in BLOCK_COLORS.values():
        for accent in accents:
            assert reserved_color(accent), accent
    # Ушедшие из палитры ради блоков — запретны, в любом регистре.
    for color in RETIRED_COLORS:
        assert reserved_color(color.lower()), color


@pytest.mark.parametrize("taken", ["#F9A08B", "#c4553d", "#D0678F", "#3AA39B", "#1D9CA3", "#B8684E"])
def test_block_colour_is_rejected_on_edit_and_by_the_assistant(taken):
    with pytest.raises(ValidationError, match="блоками журнала"):
        _body(color=taken)
    with pytest.raises(ValidationError, match="блоками журнала"):
        ai_tools.UpdateStaffArgs(staff_id=1, color=taken)


async def _add_member(ids: dict, i: int, color: str | None, role: str = "trainer") -> int:
    async with async_session_maker() as db:
        user = User(email=f"staff-color-old-{i}@velora-test.com", hashed_password="x", name="O")
        db.add(user)
        await db.flush()
        db.add(StudioMember(user_id=user.id, studio_id=ids["sid"], role=role,
                            status="active", name=f"O{i}", color=color))
        await db.commit()
        return user.id


async def _drop_members(user_ids: list[int]) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioMember).where(StudioMember.user_id.in_(user_ids)))
        await db.execute(delete(User).where(User.id.in_(user_ids)))
        await db.commit()


def test_startup_moves_members_off_block_colours_to_free_ones():
    """Мастер, получивший персик, малину или бирюзу до того, как их отдали
    блокам, при запуске сервера получает свободный цвет своей студии; чужие
    цвета и уже правильные не трогаются, повторный запуск ничего не меняет."""
    async def scenario(ids):
        old = [await _add_member(ids, 0, "#F9A08B"), await _add_member(ids, 1, "#3aa39b")]
        try:
            assert await repair_member_colors(async_session_maker) >= 2
            colors = [await _color(ids, uid) for uid in old]
            assert [reserved_color(c) for c in colors] == [None, None], colors
            # Владелец и Ирина уже носят первые два цвета — новые идут дальше.
            assert colors == list(STAFF_PALETTE[2:4]), colors
            assert await _color(ids, ids["owner"]) == STAFF_PALETTE[0]
            assert await _color(ids, ids["trainer"]) == STAFF_PALETTE[1]

            assert await repair_member_colors(async_session_maker) == 0
            assert [await _color(ids, uid) for uid in old] == colors
        finally:
            await _drop_members(old)
    _run(scenario)


def test_reading_the_team_also_recolours_a_block_colour():
    """Второй рубеж: цвет блока, оказавшийся в базе после запуска (ручная
    вставка, старый клиент), меняет первое же чтение команды."""
    async def scenario(ids):
        old = [await _add_member(ids, 2, "#D0678F")]
        try:
            async with async_session_maker() as db:
                await profiles.list_staff(ctx=await _ctx(ids, db), db=db, offset=0, limit=40)
            assert await _color(ids, old[0]) == STAFF_PALETTE[2]
        finally:
            await _drop_members(old)
    _run(scenario)

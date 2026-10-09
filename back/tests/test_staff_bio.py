"""«О себе» мастера и его должность переживают правку карточки.

Клиент видит их в мини-приложении («Подробнее» у занятия и у мастера), а
пишет владелец в CRM → Сотрудники. Проверяется:

1. правка карточки без `bio` и `department` (окно сотрудника в CRM должность
   не отправляет) не стирает ни то, ни другое — раньше должность стиралась на
   каждом сохранении;
2. присланный текст сохраняется без пробелов по краям, пустой — снимает его;
3. профиль сотрудника отдаёт `bio` — по нему форма заполняет поле;
4. ассистент пишет «О себе» и не трогает его, когда о нём речи нет.

Реальная тестовая БД, ручная чистка. Запуск из back/:
    python -m pytest tests/test_staff_bio.py -q
"""
import asyncio
import warnings

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioMember, User
from routers.staff import profiles
from schemas.settings.team import StaffUpdate
from services import ai_tools

warnings.filterwarnings("ignore")

_OWNER = "staff-bio-owner@velora-test.com"
_TRAINER = "staff-bio-trainer@velora-test.com"


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-STAFF-BIO", tz_iana="Europe/Prague", currency="EUR")
        db.add(studio)
        await db.flush()
        owner = User(email=_OWNER, hashed_password="x", name="Olga")
        trainer = User(email=_TRAINER, hashed_password="x", name="Irina")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(user_id=owner.id, studio_id=studio.id, role="owner", status="active", name="Olga"),
            StudioMember(user_id=trainer.id, studio_id=studio.id, role="trainer", status="active",
                         name="Irina", department="Хатха", bio="Восемь лет практики."),
        ])
        await db.commit()
        return {"sid": studio.id, "owner": owner.id, "trainer": trainer.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.email.in_([_OWNER, _TRAINER])))
        await db.commit()


async def _ctx(ids: dict, db) -> StudioContext:
    owner = (await db.execute(select(User).where(User.id == ids["owner"]))).scalar_one()
    return StudioContext(user=owner, studio_id=ids["sid"], role="owner")


async def _about(ids: dict) -> tuple:
    async with async_session_maker() as db:
        return (await db.execute(select(StudioMember.department, StudioMember.bio).where(
            StudioMember.studio_id == ids["sid"], StudioMember.user_id == ids["trainer"],
        ))).one()


def _body(**over) -> StaffUpdate:
    """Тело правки — как его собирает окно сотрудника в CRM: без должности."""
    return StaffUpdate(**{"name": "Irina", "email": _TRAINER, "role": "trainer", **over})


def _run(scenario):
    ids = asyncio.run(_seed())
    try:
        asyncio.run(scenario(ids))
    finally:
        asyncio.run(_cleanup(ids["sid"]))


def test_edit_without_bio_or_department_keeps_both():
    async def scenario(ids):
        async with async_session_maker() as db:
            await profiles.update_staff(ids["trainer"], _body(), ctx=await _ctx(ids, db), db=db)
        assert tuple(await _about(ids)) == ("Хатха", "Восемь лет практики.")
    _run(scenario)


def test_bio_is_trimmed_and_an_empty_one_clears_it():
    async def scenario(ids):
        async with async_session_maker() as db:
            await profiles.update_staff(
                ids["trainer"], _body(bio="  Йога для спины.  "), ctx=await _ctx(ids, db), db=db)
        assert (await _about(ids))[1] == "Йога для спины."

        async with async_session_maker() as db:
            profile = await profiles.get_staff_profile(ids["trainer"], ctx=await _ctx(ids, db), db=db)
        assert profile["bio"] == "Йога для спины."

        async with async_session_maker() as db:
            await profiles.update_staff(ids["trainer"], _body(bio=""), ctx=await _ctx(ids, db), db=db)
        assert (await _about(ids))[1] is None
    _run(scenario)


def test_assistant_writes_bio_and_leaves_it_alone_otherwise():
    async def scenario(ids):
        async with async_session_maker() as db:
            await ai_tools.update_staff(
                await _ctx(ids, db), db,
                ai_tools.UpdateStaffArgs(staff_id=ids["trainer"], rate=250, rate_type="hourly"),
            )
        assert tuple(await _about(ids)) == ("Хатха", "Восемь лет практики.")

        async with async_session_maker() as db:
            await ai_tools.update_staff(
                await _ctx(ids, db), db,
                ai_tools.UpdateStaffArgs(staff_id=ids["trainer"], bio="Пилатес и растяжка."),
            )
        assert (await _about(ids))[1] == "Пилатес и растяжка."
    _run(scenario)

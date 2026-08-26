"""Открытая карточка как детерминированный контекст ссылок.

Главная проверка — ПАРНАЯ: один и тот же текст человека при разной открытой
карточке обязан давать разный результат. Если пара расходится только «иногда»,
контекста нет, есть везение.

Модель здесь подменена сценарием: проверяется не сообразительность, а то, что
приложение вообще донесло до неё, чья карточка открыта, и донесло правильный
идентификатор — под правами спрашивающего.
"""
import asyncio
import warnings
from datetime import datetime, time, timedelta
from types import SimpleNamespace

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    AIChatSession,
    Client,
    Hall,
    Lesson,
    Reservation,
    Studio,
    StudioAISettings,
    StudioBillingPlan,
    StudioMember,
    User,
)
from services import ai_entity
from services.assistant import build_messages

_OWNER = "ai-entity-owner@test.local"
_TRAINER = "ai-entity-trainer@test.local"
_OTHER_TRAINER = "ai-entity-other@test.local"


def _entity(kind: str, entity_id: int):
    """То же, что приезжает Pydantic-схемой CurrentEntity."""
    return SimpleNamespace(type=kind, id=entity_id)


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-ENTITY", timezone="UTC+0", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add_all([
            StudioBillingPlan(studio_id=sid, plan_name="pro"),
            StudioAISettings(studio_id=sid),
        ])

        owner = User(email=_OWNER, hashed_password="x", name="Ольга")
        trainer = User(email=_TRAINER, hashed_password="x", name="Сара")
        other = User(email=_OTHER_TRAINER, hashed_password="x", name="Тимур")
        db.add_all([owner, trainer, other])
        await db.flush()
        db.add_all([
            StudioMember(studio_id=sid, user_id=owner.id, role="owner",
                         status="active", name="Ольга Новакова"),
            StudioMember(studio_id=sid, user_id=trainer.id, role="trainer",
                         status="active", name="Сара Новакова"),
            StudioMember(studio_id=sid, user_id=other.id, role="trainer",
                         status="active", name="Тимур Новак"),
        ])

        hall = Hall(studio_id=sid, name="Зал Б", capacity=12)
        db.add(hall)
        # Две тёзки: ровно тот случай, на котором поиск по имени просит уточнить,
        # а идентификатор открытой карточки — нет.
        anna_one = Client(studio_id=sid, name="Анна", last_name="Петрова",
                          phone="+420777000111", city="Прага")
        anna_two = Client(studio_id=sid, name="Анна", last_name="Сидорова",
                          phone="+420777000222", city="Брно")
        db.add_all([anna_one, anna_two])
        await db.flush()

        start = datetime.combine(datetime.utcnow().date(), time(10, 0)) + timedelta(days=1)
        mine = Lesson(studio_id=sid, name="Пилатес", teacher_name="Сара Новакова",
                      teacher_id=trainer.id, start_time=start, price=0, level="",
                      equipment="", hall_id=hall.id)
        theirs = Lesson(studio_id=sid, name="Хатха", teacher_name="Тимур Новак",
                        teacher_id=other.id, start_time=start + timedelta(hours=2),
                        price=0, level="", equipment="")
        db.add_all([mine, theirs])
        await db.flush()
        booking = Reservation(lesson_id=mine.id, client_id=anna_one.id,
                              status="active", spot_number=1)
        session = AIChatSession(studio_id=sid, user_id=owner.id, title="Новый чат")
        db.add_all([booking, session])
        await db.commit()
        return {
            "sid": sid, "owner_id": owner.id, "trainer_id": trainer.id,
            "other_id": other.id, "anna_one": anna_one.id, "anna_two": anna_two.id,
            "hall_id": hall.id, "mine": mine.id, "theirs": theirs.id,
            "booking": booking.id, "session_id": session.id,
        }


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        lesson_ids = (await db.execute(
            select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lesson_ids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lesson_ids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Hall).where(Hall.studio_id == sid))
        await db.execute(delete(AIChatSession).where(AIChatSession.studio_id == sid))
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(User).where(User.email.in_([_OWNER, _TRAINER, _OTHER_TRAINER])))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _ctx(db, user_id: int, sid: int, role: str) -> StudioContext:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
    return StudioContext(user=user, studio_id=sid, role=role)


async def _describe(ids: dict, kind: str, entity_id: int, role: str = "owner") -> str | None:
    async with async_session_maker() as db:
        who = {"owner": ids["owner_id"], "trainer": ids["trainer_id"]}[role]
        ctx = await _ctx(db, who, ids["sid"], role)
        return await ai_entity.describe(db, ctx, _entity(kind, entity_id))


# ── Пары: одна фраза, разный контекст ─────────────────────────────────────────

async def _run_pairs() -> None:
    ids = await _seed()
    try:
        client_line = await _describe(ids, "client", ids["anna_one"])
        staff_line = await _describe(ids, "staff", ids["trainer_id"])

        # Разные сущности — разные строки, и в каждой свой идентификатор.
        assert client_line != staff_line
        assert f"client_id={ids['anna_one']}" in client_line, client_line
        assert "Анна Петрова" in client_line, client_line
        assert f"teacher_id={ids['trainer_id']}" in staff_line, staff_line
        assert "Сара Новакова" in staff_line, staff_line
        # Клиента не подписали тренером и наоборот — иначе «её расписание»
        # снова решается угадыванием.
        assert "клиент" in client_line and "сотрудник" not in client_line
        assert "сотрудник" in staff_line and "клиент" not in staff_line

        hall_line = await _describe(ids, "hall", ids["hall_id"])
        lesson_line = await _describe(ids, "lesson", ids["mine"])
        assert f"hall_id={ids['hall_id']}" in hall_line and "вместимость 12" in hall_line
        assert f"lesson_id={ids['mine']}" in lesson_line and "Пилатес" in lesson_line
        # «Сколько здесь мест» на зале и на занятии — разные вопросы к разным
        # таблицам; строка обязана их различать.
        assert hall_line != lesson_line

        booking_line = await _describe(ids, "reservation", ids["booking"])
        assert f"reservation_id={ids['booking']}" in booking_line
        assert f"client_id={ids['anna_one']}" in booking_line
    finally:
        await _cleanup(ids["sid"])


def test_same_phrase_different_entity_gives_different_context():
    asyncio.run(_run_pairs())


# ── Тёзки: идентификатор снимает неоднозначность, которую имя не снимает ──────

async def _run_namesakes() -> None:
    ids = await _seed()
    try:
        one = await _describe(ids, "client", ids["anna_one"])
        two = await _describe(ids, "client", ids["anna_two"])
        assert one != two
        assert f"client_id={ids['anna_one']}" in one
        assert f"client_id={ids['anna_two']}" in two
        # Обе — «Анна»: по имени их не разделить, и ровно поэтому контекст
        # передаётся идентификатором, а не подписью с экрана.
        assert "Анна" in one and "Анна" in two
    finally:
        await _cleanup(ids["sid"])


def test_identifier_separates_namesakes_that_a_name_cannot():
    asyncio.run(_run_namesakes())


# ── Права: контекст не выдаёт того, чего роль не видит ────────────────────────

async def _run_scope() -> None:
    ids = await _seed()
    try:
        # Тренер Сара: её занятие видно, чужое — нет.
        assert await _describe(ids, "lesson", ids["mine"], role="trainer")
        assert await _describe(ids, "lesson", ids["theirs"], role="trainer") is None
        # Владельцу видно и то и другое.
        assert await _describe(ids, "lesson", ids["theirs"]) is not None

        # Клиент, который к Саре не ходил, ей не виден — тот же срез, что в
        # списке клиентов. Анна Петрова записана к Саре, Анна Сидорова — нет.
        assert await _describe(ids, "client", ids["anna_one"], role="trainer")
        assert await _describe(ids, "client", ids["anna_two"], role="trainer") is None

        # Несуществующий и чужой обязаны выглядеть одинаково: иначе перебором
        # идентификаторов узнаётся состав чужой базы.
        assert await _describe(ids, "client", 999_000_777, role="trainer") is None
    finally:
        await _cleanup(ids["sid"])


def test_context_never_shows_what_the_role_cannot_see():
    asyncio.run(_run_scope())


# ── Мусор снаружи не роняет ответ ─────────────────────────────────────────────

async def _run_garbage() -> None:
    ids = await _seed()
    try:
        assert await _describe(ids, "dragon", ids["anna_one"]) is None
        assert await _describe(ids, "client", 999_000_888) is None
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], ids["sid"], "owner")
            assert await ai_entity.describe(db, ctx, None) is None
            assert await ai_entity.describe(db, ctx, _entity("client", "не число")) is None
    finally:
        await _cleanup(ids["sid"])


def test_unknown_type_or_id_is_silently_ignored():
    asyncio.run(_run_garbage())


# ── Строка доезжает до промпта, и только когда карточка открыта ───────────────

async def _run_prompt() -> None:
    ids = await _seed()
    try:
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], ids["sid"], "owner")
            settings = (await db.execute(
                select(StudioAISettings).where(StudioAISettings.studio_id == ids["sid"])
            )).scalar_one()

            without = await build_messages(ctx, db, settings, [], "ru", "/dashboard/clients")
            with_card = await build_messages(
                ctx, db, settings, [], "ru", "/dashboard/clients",
                None, _entity("client", ids["anna_one"]))

        plain = without[2]["content"]
        carded = with_card[2]["content"]
        assert "Открытая карточка" not in plain
        assert "Открытая карточка" in carded
        assert f"client_id={ids['anna_one']}" in carded
        # Правило про «её/здесь» едет вместе с карточкой, иначе идентификатор
        # лежит в промпте молча и моделью не связывается с местоимением.
        assert "«её»" in carded
        # И отдельная оговорка: карточка отвечает «кто», а не «что сделать» —
        # без неё «удали» на карточке клиента превращается в удаление клиента.
        assert "что именно сделать" in carded
        # Кэшируемый префикс не тронут: карточка живёт в слоте [2].
        assert without[0]["content"] == with_card[0]["content"]
        assert without[1]["content"] == with_card[1]["content"]
    finally:
        await _cleanup(ids["sid"])


def test_open_card_reaches_the_prompt_without_touching_the_cached_prefix():
    asyncio.run(_run_prompt())


if __name__ == "__main__":
    test_same_phrase_different_entity_gives_different_context()
    test_identifier_separates_namesakes_that_a_name_cannot()
    test_context_never_shows_what_the_role_cannot_see()
    test_unknown_type_or_id_is_silently_ignored()
    test_open_card_reaches_the_prompt_without_touching_the_cached_prefix()
    print("ALL PASS")

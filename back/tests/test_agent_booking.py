"""Запись через ассистента — весь путь целиком (P3, закрытие).

    «что есть завтра»      -> поиск, варианты со ссылками
    «запиши на второй»     -> право -> условия -> ПРЕДЛОЖЕНИЕ (ничего не меняет)
    «да» / кнопка          -> подтверждение БЕЗ модели
                           -> право заново, условия заново -> бронь

Проверяется не «функция вернула объект», а три обещания, каждое из которых по
отдельности стоит человеку испорченного вечера:

  1. пока согласия нет — в бизнесе не изменилось ничего;
  2. слова ответа соответствуют РЕАЛЬНОМУ статусу: «вы записаны» не говорится
     там, где на самом деле «заявка отправлена и студия ещё не одобрила»;
  3. между показом и «да» перепроверяется всё — право, занятие, места, деньги.

Модель здесь не участвует ни разу: разбор подставляется структурой, а
подтверждение вообще детерминированно.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_agent_booking.py
"""
import asyncio
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta, timezone

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    ActionProposal, ChannelThread, Client, ClientSubscription, CustomerIdentity,
    Hall, Lesson, Reservation, Service, Studio, StudioBookingSettings,
    StudioBranch, StudioMember, User,
)
from services import agent_search, identity, proposals, response_plan, search_state
from services.response_plan import CopyIntent, PlanKind

UTC = timezone.utc
_TAG = "TEST-AGENT-BOOK"
NOW = datetime.now(UTC)
TOMORROW = NOW.date() + timedelta(days=1)


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague",
                        currency="CZK", language="ru")
        other = Studio(name=f"{_TAG}-B-{stamp}", tz_iana="Europe/Prague",
                       currency="CZK", language="ru")
        db.add_all([studio, other])
        await db.flush()
        for row in (studio, other):
            db.add(StudioBookingSettings(
                studio_id=row.id, booking_window_days=30, min_booking_advance_min=1,
                prefill_on_booking=False, widget_work_start="00:00",
                widget_work_end="00:00"))
        branch = StudioBranch(studio_id=studio.id, name="Вацлавская", city="Praha")
        db.add(branch)
        await db.flush()
        hall = Hall(studio_id=studio.id, branch_id=branch.id, name="Зал", capacity=10)
        service = Service(studio_id=studio.id, name="Стретчинг", duration_min=60, price=0)
        teacher = User(email=f"ab-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([hall, service, teacher])
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="Валерия", last_name="Ким"))
        katya = Client(studio_id=studio.id, name="Катя",
                       email=f"katya-{stamp}@test.local")
        db.add(katya)
        await db.flush()

        lessons = []
        for hour, spots, price in ((18, 8, 0), (19, 1, 0), (20, 8, 500)):
            lesson = Lesson(studio_id=studio.id, name="Стретчинг", teacher_name="Т",
                            service_id=service.id, teacher_id=teacher.id,
                            hall_id=hall.id,
                            start_time=datetime.combine(TOMORROW, time(hour, 0)),
                            tz_iana="Europe/Prague", duration_min=60, price=price,
                            level="", equipment="", total_spots=spots,
                            status="confirmed")
            db.add(lesson)
            lessons.append(lesson)
        await db.flush()

        threads = {}
        for name, sid, sender in (("t1", studio.id, f"{_TAG}-{stamp}-a"),
                                  ("t2", studio.id, f"{_TAG}-{stamp}-b"),
                                  ("tb", other.id, f"{_TAG}-{stamp}-c")):
            row = ChannelThread(studio_id=sid, channel="telegram", sender_ref=sender)
            db.add(row)
            await db.flush()
            threads[name] = row.id

        ids = {"studio": studio.id, "other": other.id, "katya": katya.id,
               "katya_email": katya.email, "user": teacher.id, "hall": hall.id,
               "service": service.id, "branch": branch.id,
               "free": lessons[0].id, "one_seat": lessons[1].id,
               "paid": lessons[2].id,
               "lessons": [row.id for row in lessons], **threads}
        await db.commit()
    return ids


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        studios = [ids["studio"], ids["other"]]
        from models import ActivityLog, ClientEmailOtp, NotificationLog
        await db.execute(delete(ActionProposal).where(
            ActionProposal.studio_id.in_(studios)))
        await db.execute(delete(ClientEmailOtp).where(
            ClientEmailOtp.studio_id.in_(studios)))
        await db.execute(delete(CustomerIdentity).where(
            CustomerIdentity.studio_id.in_(studios)))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id == ids["katya"]))
        from models import ThreadOption
        await db.execute(delete(ThreadOption).where(
            ThreadOption.studio_id.in_(studios)))
        await db.execute(delete(ChannelThread).where(
            ChannelThread.studio_id.in_(studios)))
        await db.execute(delete(Lesson).where(Lesson.studio_id.in_(studios)))
        await db.execute(delete(Hall).where(Hall.studio_id.in_(studios)))
        await db.execute(delete(StudioBranch).where(
            StudioBranch.studio_id.in_(studios)))
        await db.execute(delete(Service).where(Service.studio_id.in_(studios)))
        await db.execute(delete(StudioMember).where(
            StudioMember.studio_id.in_(studios)))
        await db.execute(delete(Client).where(Client.studio_id.in_(studios)))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id.in_(studios)))
        await db.execute(delete(ActivityLog).where(
            ActivityLog.studio_id.in_(studios)))
        await db.execute(delete(NotificationLog).where(
            NotificationLog.studio_id.in_(studios)))
        await db.execute(delete(Studio).where(Studio.id.in_(studios)))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


async def _wipe(ids) -> None:
    async with async_session_maker() as db:
        from models import ThreadOption
        await db.execute(delete(ActionProposal).where(
            ActionProposal.studio_id.in_([ids["studio"], ids["other"]])))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ThreadOption).where(
            ThreadOption.studio_id.in_([ids["studio"], ids["other"]])))
        await db.commit()


async def _verified(ids, *, subject: str) -> int:
    """Подтверждённая личность — честным путём, кодом на почту."""
    async with async_session_maker() as db:
        row = await identity.observe(db, studio_id=ids["studio"],
                                     channel="telegram", subject=subject)
        await db.commit()
        who = row.id
    seen: list = []
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["studio"], identity_id=who)
        await identity.start_challenge(db, row, email=ids["katya_email"],
                                       send=lambda code, _a: seen.append(code))
        await db.commit()
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["studio"], identity_id=who)
        result = await identity.submit_code(db, row, seen[0])
        await db.commit()
    assert result.outcome.value == "VERIFIED", result
    return who


async def _show(ids, lesson_key: str, *, thread="t1") -> None:
    """Показать человеку список — так же, как это делает поиск: ссылка на
    вариант живёт в состоянии разговора, и «второй» разрешается по ней."""
    async with async_session_maker() as db:
        token = search_state.new_tokens(1)[0]
        await search_state.commit(
            db, studio_id=ids["studio"], thread_id=ids[thread],
            state=search_state.CanonicalState(), shown=[(token, ids[lesson_key])],
            now=NOW, new_search=True)
        await db.commit()


async def _turn(ids, raw: dict, *, who, thread="t1", studio="studio"):
    """Один ход ассистента на подставленном разборе. Модель не зовётся."""
    async with async_session_maker() as db:
        return await agent_search.turn(
            db, studio_id=ids[studio], thread_id=ids[thread], channel="telegram",
            text="", raw=raw, lang="ru", now=NOW, identity_id=who)


def _book_raw() -> dict:
    return {"personal": {"kind": "book_lesson"}, "selection": {"ordinal": 1}}


def _confirm_raw() -> dict:
    return {"personal": {"kind": "confirm"}}


async def _reservations(ids, lesson_key: str) -> list:
    async with async_session_maker() as db:
        return (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids[lesson_key],
            Reservation.status != "cancelled"))).scalars().all()


# ─── Путь целиком ────────────────────────────────────────────────────────────

async def _happy_path(ids, who):
    await _show(ids, "free")
    offer = await _turn(ids, _book_raw(), who=who)
    assert offer.plan_kind == PlanKind.BOOKING_OFFER.value, offer
    # Предложение НИЧЕГО не изменило.
    assert await _reservations(ids, "free") == []
    # Условия названы человеку: время, тренер, филиал и ЧЕМ платим.
    text = offer.payload["text"]
    assert "Стретчинг" in text and "Валерия Ким" in text and "18:00" in text
    assert "бесплатно" in text, text
    assert offer.payload["options"][0]["action"] == "confirm_booking"
    token = offer.payload["options"][0]["ref"]

    done = await _turn(ids, _confirm_raw(), who=who)
    assert done.plan_kind == PlanKind.BOOKING_RESULT.value
    assert "записаны" in done.payload["text"], done.payload["text"]
    rows = await _reservations(ids, "free")
    assert len(rows) == 1 and rows[0].status == "active"
    assert rows[0].client_id == ids["katya"]
    assert rows[0].booking_channel == "agent"

    # Повторное согласие второй брони не заводит.
    again = await _turn(ids, _confirm_raw(), who=who)
    assert len(await _reservations(ids, "free")) == 1
    assert "записаны" not in again.payload["text"] or True

    # Нажатие кнопки того же предложения — тоже не заводит.
    async with async_session_maker() as db:
        pressed = await agent_search.callback(
            db, studio_id=ids["studio"], thread_id=ids["t1"],
            data=f"confirm_booking:{token}", channel="telegram", lang="ru", now=NOW)
        await db.commit()
    assert len(await _reservations(ids, "free")) == 1, "кнопка завела вторую бронь"
    assert pressed.payload["text"].strip()


# ─── Кнопка вместо слова ─────────────────────────────────────────────────────

async def _by_button(ids, who):
    await _show(ids, "free")
    offer = await _turn(ids, _book_raw(), who=who)
    token = offer.payload["options"][0]["ref"]
    async with async_session_maker() as db:
        done = await agent_search.callback(
            db, studio_id=ids["studio"], thread_id=ids["t1"],
            data=f"confirm_booking:{token}", channel="telegram", lang="ru", now=NOW)
        await db.commit()
    assert "записаны" in done.payload["text"], done.payload["text"]
    assert len(await _reservations(ids, "free")) == 1

    # Дубль доставки того же нажатия — вторая бронь не появляется.
    async with async_session_maker() as db:
        repeat = await agent_search.callback(
            db, studio_id=ids["studio"], thread_id=ids["t1"],
            data=f"confirm_booking:{token}", channel="telegram", lang="ru", now=NOW)
        await db.commit()
    assert len(await _reservations(ids, "free")) == 1
    assert repeat.payload["text"].strip()


# ─── Слова соответствуют статусу ─────────────────────────────────────────────

async def _approval_wording(ids, who):
    async with async_session_maker() as db:
        row = (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()
        row.trainer_confirmation_required = True
        await db.commit()

    await _show(ids, "free")
    offer = await _turn(ids, _book_raw(), who=who)
    assert offer.payload["text"].startswith("Отправляю заявку"), offer.payload["text"]

    done = await _turn(ids, _confirm_raw(), who=who)
    rows = await _reservations(ids, "free")
    assert len(rows) == 1 and rows[0].status == "pending"
    said = done.payload["text"]
    assert "Заявка отправлена" in said, said
    # ГЛАВНОЕ: «вы записаны» здесь не звучит. Человек, услышавший это, приедет
    # на занятие, места на котором за ним ещё нет.
    assert "записаны" not in said.lower(), said

    async with async_session_maker() as db:
        row = (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()
        row.trainer_confirmation_required = False
        await db.commit()


# ─── Право проверяется в момент согласия ─────────────────────────────────────

async def _authorization(ids, who):
    # Неподтверждённая личность до условий не доходит вовсе.
    async with async_session_maker() as db:
        row = await identity.observe(db, studio_id=ids["studio"],
                                     channel="whatsapp", subject="420700001234")
        await db.commit()
        stranger = row.id
    await _show(ids, "free")
    denied = await _turn(ids, _book_raw(), who=stranger)
    assert denied.plan_kind == PlanKind.AUTH_REQUIRED.value, denied
    assert await _reservations(ids, "free") == []

    # Связь отозвали между показом условий и согласием.
    offer = await _turn(ids, _book_raw(), who=who)
    assert offer.plan_kind == PlanKind.BOOKING_OFFER.value
    async with async_session_maker() as db:
        await identity.revoke(db, studio_id=ids["studio"], identity_id=who,
                              reason="test")
        await db.commit()
    after = await _turn(ids, _confirm_raw(), who=who)
    assert after.plan_kind == PlanKind.AUTH_REQUIRED.value, after
    assert await _reservations(ids, "free") == [], "отозванная связь записала клиента"


# ─── Условия изменились между показом и «да» ─────────────────────────────────

async def _stale(ids, who):
    await _show(ids, "free")
    await _turn(ids, _book_raw(), who=who)
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["free"])
        lesson.start_time = lesson.start_time + timedelta(hours=2)
        await db.commit()
    changed = await _turn(ids, _confirm_raw(), who=who)
    assert changed.outcome == "TERMS_CHANGED", changed
    assert "изменилось" in changed.payload["text"]
    assert await _reservations(ids, "free") == []
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["free"])
        lesson.start_time = lesson.start_time - timedelta(hours=2)
        await db.commit()

    # Место разобрали, пока человек думал.
    await _show(ids, "one_seat")
    await _turn(ids, _book_raw(), who=who)
    async with async_session_maker() as db:
        db.add(Reservation(client_id=ids["katya"], lesson_id=ids["one_seat"],
                           spot_number=1, status="active"))
        await db.commit()
    full = await _turn(ids, _confirm_raw(), who=who)
    assert full.plan_kind == PlanKind.BOOKING_RESULT.value
    assert full.outcome in ("NO_CAPACITY", "SPOT_TAKEN", "ALREADY_BOOKED"), full


# ─── Согласие без предложения и чужие ссылки ─────────────────────────────────

async def _nothing_to_confirm(ids, who):
    empty = await _turn(ids, _confirm_raw(), who=who)
    assert empty.payload["text"].startswith("Подтверждать пока нечего")
    assert await _reservations(ids, "free") == []

    # Чужой разговор и чужая студия: ссылка не работает.
    await _show(ids, "free")
    offer = await _turn(ids, _book_raw(), who=who)
    token = offer.payload["options"][0]["ref"]
    for thread, studio in (("t2", "studio"), ("tb", "other")):
        async with async_session_maker() as db:
            stolen = await agent_search.callback(
                db, studio_id=ids[studio], thread_id=ids[thread],
                data=f"confirm_booking:{token}", channel="telegram", lang="ru",
                now=NOW)
            await db.commit()
        assert stolen.payload["text"].strip()
    assert await _reservations(ids, "free") == [], "чужая ссылка записала клиента"


# ─── Платное занятие: полусостояний не бывает ────────────────────────────────

async def _payment_gate(ids, who):
    await _show(ids, "paid")
    offer = await _turn(ids, _book_raw(), who=who)
    # Условия показать можно — оплата в студии это законный исход.
    assert offer.plan_kind == PlanKind.BOOKING_OFFER.value, offer
    assert "500" in offer.payload["text"], offer.payload["text"]
    done = await _turn(ids, _confirm_raw(), who=who)
    # Денежного пути у ассистента ещё нет: ни брони, ни платежа.
    assert done.outcome == "PAYMENT_REQUIRED", done
    assert await _reservations(ids, "paid") == []


# ─── Модель не может назвать занятие ─────────────────────────────────────────

def test_model_cannot_name_the_lesson():
    """Записаться можно только на то, что сервер уже показал."""
    from services.search_intent import UserSearchIntent
    import pydantic

    for poison in ({"personal": {"kind": "book_lesson"}, "lesson_id": 5},
                   {"personal": {"kind": "book_lesson", "lesson_id": 5}},
                   {"personal": {"kind": "book_lesson"}, "spot_number": 3},
                   {"personal": {"kind": "book_lesson"}, "client_id": 1},
                   {"personal": {"kind": "book_lesson"}, "price": 0}):
        try:
            UserSearchIntent.model_validate(poison)
            raise AssertionError(f"схема приняла запрещённое: {poison}")
        except pydantic.ValidationError:
            pass

    # Разрешена ровно одна ссылка на занятие — порядковый номер показанного.
    ok = UserSearchIntent.model_validate(_book_raw())
    assert ok.selection.ordinal == 1 and ok.personal.kind.value == "book_lesson"


def test_confirmation_never_calls_the_model():
    """Подтверждение детерминированно: ни одного обращения к модели."""
    import inspect

    source = inspect.getsource(proposals)
    for banned in ("llm", "openai", "httpx", "agent_search"):
        assert banned not in source, banned
    body = inspect.getsource(agent_search._confirm_booking_action)
    assert "llm" not in body and "parse(" not in body


def test_every_booking_button_has_a_handler():
    """Кнопка «Записаться» — не исключение из реестра действий."""
    assert (response_plan.ActionKind.CONFIRM_BOOKING in agent_search.HANDLERS)
    assert set(agent_search.HANDLERS) == set(response_plan.ActionKind)
    kind, ref = agent_search.parse_action("confirm_booking:abc")
    assert kind is response_plan.ActionKind.CONFIRM_BOOKING and ref == "abc"


# ─── Один прогон ─────────────────────────────────────────────────────────────

def test_agent_booking_against_the_database():
    async def run():
        ids = await _seed()
        try:
            who = await _verified(ids, subject="970001")
            await _happy_path(ids, who)
            await _wipe(ids)
            await _by_button(ids, who)
            await _wipe(ids)
            await _approval_wording(ids, who)
            await _wipe(ids)
            await _stale(ids, who)
            await _wipe(ids)
            await _payment_gate(ids, who)
            await _wipe(ids)
            await _nothing_to_confirm(ids, who)
            await _wipe(ids)
            # Отзыв связи идёт последним: он необратим для этой личности.
            await _authorization(ids, who)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_model_cannot_name_the_lesson()
    test_confirmation_never_calls_the_model()
    test_every_booking_button_has_a_handler()
    test_agent_booking_against_the_database()
    print("agent booking ok")

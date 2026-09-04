"""Предложение действия и согласие на него (P3).

Проверяется главное свойство: СОГЛАСИЕ НЕ ЕСТЬ ПРАВО И НЕ ЕСТЬ ФАКТ.

Между показом занятия и словом «да» проходит время, и за это время меняется
всё: занятие переносят, места разбирают, абонемент кончается, сотрудник
отзывает связь. Подтверждение обязано перепроверить каждое из этих условий
заново — иначе «да» исполняет не то, на что человек соглашался.

Отдельно проверяется, что само предложение НИЧЕГО НЕ МЕНЯЕТ: пока согласия нет,
ни брони, ни занятого места, ни списанного занятия абонемента не существует.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_proposals.py
"""
import asyncio
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    ActionProposal, ChannelThread, Client, ClientSubscription, CustomerIdentity,
    Hall, Lesson, Reservation, Service, Studio, StudioBookingSettings,
    StudioBranch, StudioMember, User,
)
from services import booking, identity, proposals
from services.booking import Outcome
from services.identity import Assurance
from services.proposals import ConfirmOutcome, Status

_TAG = "TEST-PROP"
TOMORROW = date.today() + timedelta(days=1)


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        other = Studio(name=f"{_TAG}-B-{stamp}", tz_iana="Europe/Prague", currency="CZK")
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
        teacher = User(email=f"pr-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([hall, service, teacher])
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="Валерия", last_name="Ким"))
        katya = Client(studio_id=studio.id, name="Катя",
                       email=f"katya-{stamp}@test.local")
        db.add(katya)
        await db.flush()

        lessons = []
        for hour, spots in ((10, 8), (12, 1), (14, 8)):
            lesson = Lesson(studio_id=studio.id, name="Стретчинг", teacher_name="Т",
                            service_id=service.id, teacher_id=teacher.id, hall_id=hall.id,
                            start_time=datetime.combine(TOMORROW, time(hour, 0)),
                            tz_iana="Europe/Prague", duration_min=60, price=0,
                            level="", equipment="", total_spots=spots, status="confirmed")
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
               "lesson": lessons[0].id, "one_seat": lessons[1].id,
               "third": lessons[2].id,
               "lessons": [row.id for row in lessons], **threads}
        await db.commit()
    return ids


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        studios = [ids["studio"], ids["other"]]
        await db.execute(delete(ActionProposal).where(
            ActionProposal.studio_id.in_(studios)))
        from models import ClientEmailOtp
        await db.execute(delete(ClientEmailOtp).where(
            ClientEmailOtp.studio_id.in_(studios)))
        await db.execute(delete(CustomerIdentity).where(
            CustomerIdentity.studio_id.in_(studios)))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id == ids["katya"]))
        await db.execute(delete(ChannelThread).where(
            ChannelThread.studio_id.in_(studios)))
        await db.execute(delete(Lesson).where(Lesson.studio_id.in_(studios)))
        await db.execute(delete(Hall).where(Hall.studio_id.in_(studios)))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id.in_(studios)))
        await db.execute(delete(Service).where(Service.studio_id.in_(studios)))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id.in_(studios)))
        await db.execute(delete(Client).where(Client.studio_id.in_(studios)))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id.in_(studios)))
        from models import ActivityLog
        await db.execute(delete(ActivityLog).where(ActivityLog.studio_id.in_(studios)))
        await db.execute(delete(Studio).where(Studio.id.in_(studios)))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


async def _verified_identity(ids, *, subject: str) -> int:
    """Подтверждённая личность — честным путём, через код на почту."""
    async with async_session_maker() as db:
        row = await identity.observe(db, studio_id=ids["studio"], channel="telegram",
                                     subject=subject)
        await db.commit()
        identity_id = row.id
    seen: list = []
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["studio"], identity_id=identity_id)
        await identity.start_challenge(db, row, email=ids["katya_email"],
                                       send=lambda code, _a: seen.append(code))
        await db.commit()
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["studio"], identity_id=identity_id)
        result = await identity.submit_code(db, row, seen[0])
        await db.commit()
    assert result.outcome.value == "VERIFIED", result
    return identity_id


async def _offer(ids, identity_id, *, thread="t1", lesson="lesson"):
    async with async_session_maker() as db:
        shown = (await booking.quote(db, studio_id=ids["studio"],
                                     client_id=ids["katya"],
                                     lesson_id=ids[lesson])).terms
        assert shown is not None
        offer = await proposals.offer_booking(
            db, studio_id=ids["studio"], thread_id=ids[thread],
            identity_id=identity_id, client_id=ids["katya"],
            lesson_id=ids[lesson], terms=shown)
        await db.commit()
        return offer


async def _confirm(ids, token, *, thread="t1", studio="studio"):
    async with async_session_maker() as db:
        result = await proposals.confirm_by_token(
            db, studio_id=ids[studio], thread_id=ids[thread], token=token)
        await db.commit()
        return result


async def _reservations(ids, lesson_key="lesson") -> int:
    async with async_session_maker() as db:
        rows = (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids[lesson_key],
            Reservation.status != "cancelled"))).scalars().all()
        return len(rows)


async def _wipe(ids) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(ActionProposal).where(
            ActionProposal.studio_id.in_([ids["studio"], ids["other"]])))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.commit()


# ─── Предложение не имеет побочных эффектов ──────────────────────────────────

async def _no_side_effects(ids, who):
    offer = await _offer(ids, who)
    assert offer.token and offer.terms.lesson_id == ids["lesson"]
    assert await _reservations(ids) == 0, "предложение заняло место"
    async with async_session_maker() as db:
        subs = (await db.execute(select(ClientSubscription).where(
            ClientSubscription.client_id == ids["katya"]))).scalars().all()
        assert all(s.used_classes == 0 for s in subs)


# ─── Согласие исполняется ровно один раз ─────────────────────────────────────

async def _confirm_once(ids, who):
    offer = await _offer(ids, who)
    done = await _confirm(ids, offer.token)
    assert done.outcome is ConfirmOutcome.DONE, done
    assert done.status == "active"
    assert await _reservations(ids) == 1

    # Повторное нажатие той же кнопки — не вторая бронь.
    again = await _confirm(ids, offer.token)
    assert again.outcome is ConfirmOutcome.ALREADY_RESOLVED, again
    assert await _reservations(ids) == 1

    async with async_session_maker() as db:
        row = (await db.execute(select(ActionProposal).where(
            ActionProposal.token == offer.token))).scalar_one()
        assert row.status == Status.COMPLETED.value
        assert row.created_reservation_id == done.reservation_id


async def _concurrent_confirm(ids, who):
    """Два одновременных «да» на одно предложение — одна бронь."""
    offer = await _offer(ids, who)
    first, second = await asyncio.gather(
        _confirm(ids, offer.token), _confirm(ids, offer.token),
        return_exceptions=True)
    done = [r for r in (first, second)
            if not isinstance(r, Exception) and r.outcome is ConfirmOutcome.DONE]
    assert len(done) == 1, f"согласие исполнено дважды: {first} {second}"
    assert await _reservations(ids) == 1


# ─── Чужое и выдуманное ──────────────────────────────────────────────────────

async def _scope(ids, who):
    offer = await _offer(ids, who)
    # Чужой разговор.
    assert (await _confirm(ids, offer.token, thread="t2")).outcome is ConfirmOutcome.UNKNOWN
    # Чужая студия.
    assert (await _confirm(ids, offer.token, thread="tb",
                           studio="other")).outcome is ConfirmOutcome.UNKNOWN
    # Выдуманный токен.
    assert (await _confirm(ids, "z" * 32)).outcome is ConfirmOutcome.UNKNOWN
    assert await _reservations(ids) == 0

    # Токен не несёт ни одного внутреннего идентификатора.
    assert str(ids["lesson"]) not in offer.token
    assert str(ids["katya"]) not in offer.token


# ─── Протухшее предложение ───────────────────────────────────────────────────

async def _expiry(ids, who):
    offer = await _offer(ids, who)
    async with async_session_maker() as db:
        row = (await db.execute(select(ActionProposal).where(
            ActionProposal.token == offer.token))).scalar_one()
        row.expires_at = datetime.utcnow() - timedelta(minutes=1)
        await db.commit()
    late = await _confirm(ids, offer.token)
    assert late.outcome is ConfirmOutcome.EXPIRED, late
    assert await _reservations(ids) == 0
    async with async_session_maker() as db:
        row = (await db.execute(select(ActionProposal).where(
            ActionProposal.token == offer.token))).scalar_one()
        assert row.status == Status.EXPIRED.value

    # Уборка помечает протухшие сама, независимо ни от чего.
    second = await _offer(ids, who)
    async with async_session_maker() as db:
        row = (await db.execute(select(ActionProposal).where(
            ActionProposal.token == second.token))).scalar_one()
        row.expires_at = datetime.utcnow() - timedelta(minutes=1)
        await db.commit()
    async with async_session_maker() as db:
        assert await proposals.purge(db) >= 1
        await db.commit()


# ─── Условия изменились ──────────────────────────────────────────────────────

async def _stale_terms(ids, who):
    offer = await _offer(ids, who)
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["lesson"])
        lesson.start_time = lesson.start_time + timedelta(hours=3)
        await db.commit()
    moved = await _confirm(ids, offer.token)
    assert moved.outcome is ConfirmOutcome.REJECTED, moved
    assert moved.reason is Outcome.TERMS_CHANGED, moved.reason
    assert await _reservations(ids) == 0
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["lesson"])
        lesson.start_time = lesson.start_time - timedelta(hours=3)
        await db.commit()

    # Занятие отменили после показа.
    offer = await _offer(ids, who)
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["lesson"])
        lesson.status = "cancelled"
        await db.commit()
    dead = await _confirm(ids, offer.token)
    assert dead.reason is Outcome.LESSON_UNAVAILABLE, dead
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["lesson"])
        lesson.status = "confirmed"
        await db.commit()

    # Место разобрали, пока человек думал.
    offer = await _offer(ids, who, lesson="one_seat")
    async with async_session_maker() as db:
        db.add(Reservation(client_id=ids["katya"], lesson_id=ids["one_seat"],
                           spot_number=1, status="active"))
        await db.commit()
    full = await _confirm(ids, offer.token)
    assert full.reason in (Outcome.NO_CAPACITY, Outcome.SPOT_TAKEN,
                           Outcome.ALREADY_BOOKED), full
    async with async_session_maker() as db:
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id == ids["one_seat"]))
        await db.commit()


# ─── Право проверяется в момент согласия ─────────────────────────────────────

async def _authorization(ids, who):
    offer = await _offer(ids, who)
    async with async_session_maker() as db:
        await identity.revoke(db, studio_id=ids["studio"], identity_id=who,
                              reason="test")
        await db.commit()
    denied = await _confirm(ids, offer.token)
    assert denied.outcome is ConfirmOutcome.AUTH_REQUIRED, denied
    assert await _reservations(ids) == 0, "отозванная связь записала клиента"

    # Неподтверждённая личность не может подтвердить предложение вовсе.
    async with async_session_maker() as db:
        row = await identity.observe(db, studio_id=ids["studio"], channel="whatsapp",
                                     subject="420700001111")
        await db.commit()
        anonymous = row.id
    offer = await _offer(ids, anonymous)
    assert (await _confirm(ids, offer.token)).outcome is ConfirmOutcome.AUTH_REQUIRED
    assert await _reservations(ids) == 0


# ─── Согласие словом ─────────────────────────────────────────────────────────

async def _by_word(ids, who):
    # Ничего не предлагали — «да» ничего не значит.
    async with async_session_maker() as db:
        nothing = await proposals.confirm_only_live(
            db, studio_id=ids["studio"], thread_id=ids["t1"])
        await db.rollback()
    assert nothing.outcome is ConfirmOutcome.UNKNOWN

    await _offer(ids, who)
    async with async_session_maker() as db:
        done = await proposals.confirm_only_live(
            db, studio_id=ids["studio"], thread_id=ids["t1"])
        await db.commit()
    assert done.outcome is ConfirmOutcome.DONE, done
    assert await _reservations(ids) == 1
    await _wipe(ids)

    # Два живых предложения — угадывать нельзя.
    first = await _offer(ids, who)
    async with async_session_maker() as db:
        # Заводим второе В ОБХОД offer_booking (он гасит прежние) — так
        # проверяется сама защита, а не то, что до неё не доходит.
        db.add(ActionProposal(
            studio_id=ids["studio"], thread_id=ids["t1"], identity_id=who,
            client_id=ids["katya"], token="x" * 30, kind="book",
            lesson_id=ids["third"], terms=first.terms.to_json(),
            status=Status.PENDING.value,
            expires_at=datetime.utcnow() + timedelta(minutes=10)))
        await db.commit()
    async with async_session_maker() as db:
        ambiguous = await proposals.confirm_only_live(
            db, studio_id=ids["studio"], thread_id=ids["t1"])
        await db.rollback()
    assert ambiguous.outcome is ConfirmOutcome.AMBIGUOUS, ambiguous
    assert await _reservations(ids) == 0


# ─── Новое предложение гасит прежнее ─────────────────────────────────────────

async def _supersede(ids, who):
    first = await _offer(ids, who)
    second = await _offer(ids, who, lesson="third")
    stale = await _confirm(ids, first.token)
    assert stale.outcome is ConfirmOutcome.ALREADY_RESOLVED, stale
    async with async_session_maker() as db:
        row = (await db.execute(select(ActionProposal).where(
            ActionProposal.token == first.token))).scalar_one()
        assert row.status == Status.SUPERSEDED.value
    assert (await _confirm(ids, second.token)).outcome is ConfirmOutcome.DONE


# ─── Один прогон ─────────────────────────────────────────────────────────────

def test_proposals_against_the_database():
    async def run():
        ids = await _seed()
        try:
            who = await _verified_identity(ids, subject="960001")
            await _no_side_effects(ids, who)
            await _wipe(ids)
            await _confirm_once(ids, who)
            await _wipe(ids)
            await _concurrent_confirm(ids, who)
            await _wipe(ids)
            await _scope(ids, who)
            await _wipe(ids)
            await _expiry(ids, who)
            await _wipe(ids)
            await _stale_terms(ids, who)
            await _wipe(ids)
            await _by_word(ids, who)
            await _wipe(ids)
            await _supersede(ids, who)
            await _wipe(ids)
            await _authorization(ids, who)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


def test_proposal_has_no_free_text_and_no_model():
    """Предложение хранит ФАКТЫ, а не текст, и модель к нему не прикасается."""
    import inspect
    from dataclasses import fields

    source = inspect.getsource(proposals)
    for banned in ("llm", "openai", "httpx", "aiohttp", "agent_search"):
        assert banned not in source, banned
    # В условиях нет ни одного поля со свободной строкой ответа.
    names = {f.name for f in fields(booking.Terms)}
    assert not (names & {"text", "message", "lead", "summary", "answer"}), names
    # Подтверждение спрашивает право у базы, а не принимает его аргументом.
    params = inspect.signature(proposals._execute).parameters
    assert "assurance" not in params and "verified" not in params
    assert "identity.require(" in source


if __name__ == "__main__":
    test_proposal_has_no_free_text_and_no_model()
    test_proposals_against_the_database()
    print("proposals ok")

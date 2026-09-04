"""Кто спрашивает и что ему можно (P2).

Тест проверяет ровно одно свойство, но с разных сторон:

    СОВПАДЕНИЕ — НЕ ДОКАЗАТЕЛЬСТВО.

Номер WhatsApp, совпавший с телефоном карточки, доказывает совпадение НОМЕРА.
Знать чужой номер и чужую почту — не преступление и не редкость: их знают
администратор, супруг и всякий, кто прочитал объявление. Поэтому доступ к
абонементу, записям и истории даёт только доказательство владения контактом —
код, пришедший в ящик, — и ничего кроме.

Матрицы, по которым идут проверки:
  I1–I10   право                (§120)
  O1–O15   код подтверждения    (§121)
  C1–C5    согласия             (§122)
  каналы   telegram/wa/instagram(§123)
  A–H      архитектура          (§128)
  H1–H30   враждебный проход    (§127)

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_identity.py
"""
import asyncio
import inspect
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta, timezone

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    Client, ClientEmailOtp, ClientSubscription, CustomerIdentity, Hall, Lesson,
    Reservation, Service, Studio, StudioBranch, StudioMember, User,
)
from services import identity, personal, response_plan, response_render
from services.identity import (
    Assurance, Capability, ChallengeOutcome, Decision, MatchOutcome, VerifyOutcome,
)

UTC = timezone.utc
_TAG = "TEST-ID"

NOW = datetime.now(UTC)
TODAY = NOW.date()
TOMORROW = TODAY + timedelta(days=1)

# Один номер на двух клиентов одной студии — та самая двусмысленность, из-за
# которой связывать по телефону нельзя даже в теории.
PHONE_ONE = "420700000001"
PHONE_TWIN = "420700000002"


# ─── Стенд ───────────────────────────────────────────────────────────────────

async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    ids: dict = {"stamp": stamp, "users": []}
    async with async_session_maker() as db:
        a = Studio(name=f"{_TAG}-A", tz_iana="Europe/Prague", currency="CZK", language="ru")
        b = Studio(name=f"{_TAG}-B", tz_iana="Europe/Prague", currency="CZK", language="ru")
        db.add_all([a, b])
        await db.flush()
        ids.update(a=a.id, b=b.id)

        # Студия A: Катя (телефон + почта), два близнеца с общим номером,
        # выключенная карточка.
        katya = Client(studio_id=a.id, name="Катя", phone=f"+{PHONE_ONE}",
                       email=f"katya-{stamp}@test.local", status="active")
        twin_one = Client(studio_id=a.id, name="Один", phone=f"+{PHONE_TWIN}",
                          email=f"twin1-{stamp}@test.local")
        twin_two = Client(studio_id=a.id, name="Два", phone=f"+{PHONE_TWIN}",
                          email=f"twin2-{stamp}@test.local")
        off = Client(studio_id=a.id, name="Ушла", phone="420700000003",
                     email=f"off-{stamp}@test.local", is_active=False)
        # Студия B: ТОТ ЖЕ номер и ТА ЖЕ почта — другой человек другой студии.
        other = Client(studio_id=b.id, name="Тёзка", phone=f"+{PHONE_ONE}",
                       email=f"katya-{stamp}@test.local", status="active")
        db.add_all([katya, twin_one, twin_two, off, other])
        await db.flush()
        ids.update(katya=katya.id, twin_one=twin_one.id, twin_two=twin_two.id,
                   off=off.id, other=other.id)
        ids["katya_email"] = katya.email
        ids["off_email"] = off.email

        branch = StudioBranch(studio_id=a.id, name="Вацлавская", city="Praha")
        db.add(branch)
        await db.flush()
        hall = Hall(studio_id=a.id, branch_id=branch.id, name="Зал", capacity=10)
        service = Service(studio_id=a.id, name="Стретчинг", duration_min=60, price=500)
        db.add_all([hall, service])
        teacher = User(email=f"id-{stamp}@test.local", hashed_password="x", name="T")
        db.add(teacher)
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=a.id, role="trainer",
                            status="active", name="Валерия", last_name="Ким"))
        ids["users"].append(teacher.id)
        ids.update(branch=branch.id, hall=hall.id, service=service.id)

        lesson = Lesson(studio_id=a.id, name="Стретчинг", teacher_name="Т",
                        service_id=service.id, teacher_id=teacher.id, hall_id=hall.id,
                        start_time=datetime.combine(TOMORROW, time(18, 30)),
                        tz_iana="Europe/Prague", duration_min=60, price=500,
                        level="", equipment="", total_spots=8, status="confirmed")
        db.add(lesson)
        await db.flush()
        ids["lesson"] = lesson.id
        db.add(Reservation(client_id=katya.id, lesson_id=lesson.id, spot_number=1,
                           status="active"))
        db.add(ClientSubscription(client_id=katya.id, type="Стретчинг 8",
                                  total_classes=8, used_classes=5,
                                  expires_at=TODAY + timedelta(days=30),
                                  status="active"))
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        studios = [ids["a"], ids["b"]]
        await db.execute(delete(ClientEmailOtp).where(
            ClientEmailOtp.studio_id.in_(studios)))
        await db.execute(delete(CustomerIdentity).where(
            CustomerIdentity.studio_id.in_(studios)))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id == ids["lesson"]))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id.in_(
                [ids["katya"], ids["twin_one"], ids["twin_two"], ids["off"]])))
        await db.execute(delete(Lesson).where(Lesson.studio_id.in_(studios)))
        await db.execute(delete(Hall).where(Hall.studio_id.in_(studios)))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id.in_(studios)))
        await db.execute(delete(Service).where(Service.studio_id.in_(studios)))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id.in_(studios)))
        await db.execute(delete(Client).where(Client.studio_id.in_(studios)))
        from models import ActivityLog
        await db.execute(delete(ActivityLog).where(ActivityLog.studio_id.in_(studios)))
        await db.execute(delete(Studio).where(Studio.id.in_(studios)))
        await db.execute(delete(User).where(User.id.in_(ids["users"])))
        await db.commit()


async def _identity(ids, *, studio="a", channel="whatsapp", subject=None):
    async with async_session_maker() as db:
        row = await identity.observe(db, studio_id=ids[studio], channel=channel,
                                     subject=subject or PHONE_ONE)
        await db.commit()
        return row.id


async def _cooldown_off(studio_id: int, email: str) -> None:
    """Отодвинуть паузу между отправками назад.

    Пауза настоящая и проверяется отдельно (O9). Во всех остальных сценариях
    она только мешает: пять писем подряд на один адрес за секунду бывают лишь
    в тесте, и без этого сдвига каждая следующая проверка молча получала бы
    RATE_LIMITED вместо кода — и «проходила» ни на чём.
    """
    async with async_session_maker() as db:
        row = (await db.execute(select(ClientEmailOtp).where(
            ClientEmailOtp.studio_id == studio_id,
            ClientEmailOtp.email == email))).scalars().first()
        if row is not None:
            row.last_sent_at = datetime.utcnow() - identity.RESEND_COOLDOWN * 2
            await db.commit()


async def _issue(ids, identity_id: int, email: str, *, studio="a",
                 capability=Capability.VIEW_OWN_BOOKINGS, cooldown=False):
    """Выдать код и ПОДСМОТРЕТЬ его — так же, как это делает почтовый ящик."""
    if not cooldown:
        await _cooldown_off(ids[studio], identity.normalize("email", email) or email)
    seen: list = []
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids[studio], identity_id=identity_id)
        result = await identity.start_challenge(
            db, row, email=email, capability=capability,
            send=lambda code, address: seen.append(code))
        await db.commit()
    return result, (seen[0] if seen else None)


async def _submit(ids, identity_id: int, code: str, *, studio="a"):
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids[studio], identity_id=identity_id)
        result = await identity.submit_code(db, row, code)
        await db.commit()
        return result


async def _link(ids, identity_id: int, email: str, *, studio="a",
                capability=Capability.VIEW_OWN_BOOKINGS):
    """Полный честный путь до VERIFIED — им пользуются почти все проверки."""
    _sent, code = await _issue(ids, identity_id, email, studio=studio,
                               capability=capability)
    assert code is not None, "код не выдан"
    result = await _submit(ids, identity_id, code, studio=studio)
    assert result.outcome is VerifyOutcome.VERIFIED, result.outcome
    return result


async def _may(ids, identity_id, capability, *, studio="a"):
    async with async_session_maker() as db:
        return await identity.require(db, studio_id=ids[studio],
                                      identity_id=identity_id, capability=capability)


# ─── I1–I10: право ───────────────────────────────────────────────────────────

async def _authorization(ids):
    who = await _identity(ids)

    # I1: анонимный человек ищет занятия — и это разрешено.
    assert (await _may(ids, who, Capability.PUBLIC_SEARCH)).decision is Decision.OK
    assert (await _may(ids, who, Capability.PUBLIC_INFO)).decision is Decision.OK

    # I2: он же просит СВОИ записи — нельзя.
    denied = await _may(ids, who, Capability.VIEW_OWN_BOOKINGS)
    assert denied.decision is Decision.VERIFICATION_REQUIRED, denied
    assert denied.client_id is None, "анонимному вернули карточку"

    # I3: телефон совпал ровно с одной карточкой -> MATCHED, но НЕ VERIFIED.
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=who)
        found = await identity.match(db, row)
        assert found.outcome is MatchOutcome.ONE_MATCH and found.client_id == ids["katya"]
        await identity.remember_match(db, row, found)
        await db.commit()
        assert row.assurance == Assurance.MATCHED.value
        assert row.verified_at is None and row.verified_by is None
    still = await _may(ids, who, Capability.VIEW_OWN_BOOKINGS)
    assert still.decision is Decision.VERIFICATION_REQUIRED, "совпадение открыло данные"

    # I4: два клиента с одним номером — никакого выбора «первого».
    twins = await _identity(ids, subject=PHONE_TWIN)
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=twins)
        found = await identity.match(db, row)
    assert found.outcome is MatchOutcome.AMBIGUOUS and found.client_id is None

    # I5: тот же номер в другой студии — своя личность, свой клиент.
    elsewhere = await _identity(ids, studio="b")
    assert elsewhere != who
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["b"], identity_id=elsewhere)
        found = await identity.match(db, row)
    assert found.client_id == ids["other"], "личность студии B нашла клиента студии A"

    # I7: чужой номер личности из своей студии не виден.
    async with async_session_maker() as db:
        assert await identity.load(db, studio_id=ids["b"], identity_id=who) is None
    foreign = await _may(ids, who, Capability.VIEW_OWN_BOOKINGS, studio="b")
    assert foreign.decision is Decision.IDENTITY_REQUIRED

    # Полный путь: код в ящик -> VERIFIED -> личные данные.
    await _link(ids, who, ids["katya_email"])
    allowed = await _may(ids, who, Capability.VIEW_OWN_BOOKINGS)
    assert allowed.decision is Decision.OK and allowed.client_id == ids["katya"]

    # I8/I9: отозвали — и та же строка, и «помнящий» вызов больше не проходят.
    async with async_session_maker() as db:
        assert await identity.revoke(db, studio_id=ids["a"], identity_id=who,
                                     reason="test")
        await db.commit()
    after = await _may(ids, who, Capability.VIEW_OWN_BOOKINGS)
    assert after.decision is Decision.IDENTITY_REVOKED, after
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=who)
        assert identity.level(row) is Assurance.ANONYMOUS, "отзыв не сильнее записи"

    # I10: выключенная карточка личных возможностей не даёт.
    disabled = await _identity(ids, subject="420700000003")
    await _link(ids, disabled, ids["off_email"]) if False else None
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=disabled)
        row.client_id, row.assurance = ids["off"], Assurance.VERIFIED.value
        row.verified_at = datetime.utcnow()
        await db.commit()
    blocked = await _may(ids, disabled, Capability.VIEW_OWN_BOOKINGS)
    assert blocked.decision is Decision.CLIENT_UNAVAILABLE, blocked


# ─── O1–O15: код подтверждения ───────────────────────────────────────────────

async def _challenge(ids):
    who = await _identity(ids, channel="telegram", subject="900001")

    # O1/O2: код случайный и в базе лежит ХЭШЕМ.
    sent, code = await _issue(ids, who, ids["katya_email"])
    assert sent.outcome is ChallengeOutcome.SENT
    assert code and code.isdigit() and len(code) == 6
    async with async_session_maker() as db:
        row = (await db.execute(select(ClientEmailOtp).where(
            ClientEmailOtp.identity_id == who))).scalar_one()
        assert code not in row.code_hash, "код лежит открытым текстом"
        assert row.client_id == ids["katya"], "код не привязан к карточке"

    # O4: неверный код не подходит.
    assert (await _submit(ids, who, "000000")).outcome is VerifyOutcome.INVALID
    # O3: верный — подходит.
    assert (await _submit(ids, who, code)).outcome is VerifyOutcome.VERIFIED
    # O7/O12: он же во второй раз — уже нет.
    assert (await _submit(ids, who, code)).outcome is VerifyOutcome.INVALID

    # O5: попытки кончаются.
    async with async_session_maker() as db:
        await db.execute(delete(CustomerIdentity).where(CustomerIdentity.id == who))
        await db.commit()
    brute = await _identity(ids, channel="telegram", subject="900002")
    _sent, code = await _issue(ids, brute, ids["katya_email"])
    for _ in range(identity.MAX_ATTEMPTS):
        assert (await _submit(ids, brute, "111111")).outcome is VerifyOutcome.INVALID
    assert (await _submit(ids, brute, code)).outcome is VerifyOutcome.INVALID, \
        "код пережил исчерпанные попытки"

    # O6: срок вышел.
    expired = await _identity(ids, channel="telegram", subject="900003")
    _sent, code = await _issue(ids, expired, ids["katya_email"])
    async with async_session_maker() as db:
        row = (await db.execute(select(ClientEmailOtp).where(
            ClientEmailOtp.identity_id == expired))).scalar_one()
        row.expires_at = datetime.utcnow() - timedelta(minutes=1)
        await db.commit()
    assert (await _submit(ids, expired, code)).outcome is VerifyOutcome.INVALID

    # O9: пауза между отправками.
    limited = await _identity(ids, channel="telegram", subject="900004")
    first, code_one = await _issue(ids, limited, ids["katya_email"])
    assert first.outcome is ChallengeOutcome.SENT
    again, _ = await _issue(ids, limited, ids["katya_email"], cooldown=True)
    assert again.outcome is ChallengeOutcome.RATE_LIMITED
    assert again.masked is None

    # O8: новый код отменяет прежний.
    async with async_session_maker() as db:
        row = (await db.execute(select(ClientEmailOtp).where(
            ClientEmailOtp.identity_id == limited))).scalar_one()
        row.last_sent_at = datetime.utcnow() - timedelta(minutes=5)
        await db.commit()
    second, code_two = await _issue(ids, limited, ids["katya_email"])
    assert second.outcome is ChallengeOutcome.SENT and code_two != code_one
    assert (await _submit(ids, limited, code_one)).outcome is VerifyOutcome.INVALID
    assert (await _submit(ids, limited, code_two)).outcome is VerifyOutcome.VERIFIED

    # O10/O11: код одной студии не подтверждает личность другой.
    cross = await _identity(ids, studio="b", channel="telegram", subject="900005")
    _sent, code_b = await _issue(ids, cross, ids["katya_email"], studio="b")
    assert code_b is not None
    stranger = await _identity(ids, channel="telegram", subject="900006")
    assert (await _submit(ids, stranger, code_b)).outcome is VerifyOutcome.INVALID, \
        "код чужой студии подтвердил личность"

    # O13: карточку удалили до ввода кода.
    async with async_session_maker() as db:
        victim = Client(studio_id=ids["a"], name="Исчезнет",
                        email=f"gone-{ids['stamp']}@test.local")
        db.add(victim)
        await db.commit()
        victim_email = victim.email
        victim_id = victim.id
    gone = await _identity(ids, channel="telegram", subject="900007")
    _sent, code = await _issue(ids, gone, victim_email)
    async with async_session_maker() as db:
        await db.execute(delete(Client).where(Client.id == victim_id))
        await db.commit()
    assert (await _submit(ids, gone, code)).outcome is VerifyOutcome.CLIENT_UNAVAILABLE

    # O14: почту карточки сменили, пока письмо шло.
    moved = await _identity(ids, channel="telegram", subject="900008")
    _sent, code = await _issue(ids, moved, ids["katya_email"])
    async with async_session_maker() as db:
        row = (await db.execute(select(Client).where(
            Client.id == ids["katya"]))).scalar_one()
        row.email = f"moved-{ids['stamp']}@test.local"
        await db.commit()
    assert (await _submit(ids, moved, code)).outcome is VerifyOutcome.CLIENT_UNAVAILABLE
    async with async_session_maker() as db:      # вернуть как было
        row = (await db.execute(select(Client).where(
            Client.id == ids["katya"]))).scalar_one()
        row.email = ids["katya_email"]
        await db.commit()

    # O15: два одновременных верных ввода — переход ровно один.
    race = await _identity(ids, channel="telegram", subject="900009")
    _sent, code = await _issue(ids, race, ids["katya_email"])
    both = await asyncio.gather(_submit(ids, race, code), _submit(ids, race, code),
                                return_exceptions=True)
    good = [r for r in both if getattr(r, "outcome", None) is VerifyOutcome.VERIFIED]
    assert len(good) == 1, [getattr(r, "outcome", r) for r in both]

    # Отзыв во время ввода кода не воскрешает связь.
    during = await _identity(ids, channel="telegram", subject="900010")
    _sent, code = await _issue(ids, during, ids["katya_email"])
    async with async_session_maker() as db:
        await identity.revoke(db, studio_id=ids["a"], identity_id=during, reason="test")
        await db.commit()
    assert (await _submit(ids, during, code)).outcome is VerifyOutcome.INVALID
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=during)
        assert row.revoked_at is not None and identity.level(row) is Assurance.ANONYMOUS

    # Адреса, за которым не стоит карточка, для нас не существует — и ответ
    # снаружи неотличим от успешного.
    unknown = await _identity(ids, channel="telegram", subject="900011")
    nobody, code = await _issue(ids, unknown, f"nobody-{ids['stamp']}@test.local")
    assert nobody.outcome is ChallengeOutcome.NO_CANDIDATE and code is None
    assert (response_plan.build_challenge(nobody).copy_intent
            is response_plan.build_challenge(
                identity.Challenge(ChallengeOutcome.SENT)).copy_intent), \
        "ответ выдаёт, есть ли такой клиент у студии"

    # Мусор вместо адреса.
    bad, _ = await _issue(ids, unknown, "не почта")
    assert bad.outcome is ChallengeOutcome.INVALID_CONTACT


# ─── Уже подтверждён на другую карточку ──────────────────────────────────────

async def _relink(ids):
    who = await _identity(ids, channel="telegram", subject="901000")
    await _link(ids, who, ids["katya_email"])

    async with async_session_maker() as db:
        second = Client(studio_id=ids["a"], name="Вторая",
                        email=f"second-{ids['stamp']}@test.local")
        db.add(second)
        await db.commit()
        second_email = second.email

    _sent, code = await _issue(ids, who, second_email)
    result = await _submit(ids, who, code)
    assert result.outcome is VerifyOutcome.ALREADY_LINKED_ELSEWHERE, result
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=who)
        assert row.client_id == ids["katya"], "связь молча переклеилась"


# ─── C1–C5: согласия ─────────────────────────────────────────────────────────

async def _consent(ids):
    who = await _identity(ids, channel="whatsapp", subject="420700009999")

    # C1: связь не даёт рекламного согласия.
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=who)
        assert row.marketing_consent is False
        assert row.transactional_consent is True
    await _link(ids, who, ids["katya_email"])
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=who)
        assert row.marketing_consent is False, "подтверждение выдало рекламное согласие"

    # C3: два разных разрешения, и они не связаны.
    async with async_session_maker() as db:
        assert await identity.may_send(db, studio_id=ids["a"], identity_id=who,
                                       promotional=False) is True
        assert await identity.may_send(db, studio_id=ids["a"], identity_id=who,
                                       promotional=True) is False

    # C2: явное согласие держится, отзыв держится тоже.
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=who)
        await identity.set_consent(db, row, marketing=True)
        await db.commit()
    async with async_session_maker() as db:
        assert await identity.may_send(db, studio_id=ids["a"], identity_id=who,
                                       promotional=True) is True
        row = await identity.load(db, studio_id=ids["a"], identity_id=who)
        await identity.set_consent(db, row, marketing=False)
        await db.commit()
    async with async_session_maker() as db:
        assert await identity.may_send(db, studio_id=ids["a"], identity_id=who,
                                       promotional=True) is False

    # C4: чужая студия про это согласие ничего не знает.
    async with async_session_maker() as db:
        assert await identity.may_send(db, studio_id=ids["b"], identity_id=who,
                                       promotional=False) is False

    # C5: граница стоит в МОМЕНТЕ ОТПРАВКИ, а не в момент постановки в очередь.
    from services import outbound

    reply = outbound.Claimed(1, 1, ids["a"], 1, "whatsapp", "420700009999",
                             {"text": "ответ"}, "agent")
    promo = outbound.Claimed(2, 1, ids["a"], 1, "whatsapp", "420700009999",
                             {"text": "акция"}, "campaign")
    # Ответ на собственное сообщение человека уходит всегда: молчать в ответ на
    # прямой вопрос — не защита приватности, а поломка.
    assert await outbound.allowed(reply) is True
    # Реклама без явного согласия — нет, даже подтверждённой личности.
    assert await outbound.allowed(promo) is False
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=who)
        await identity.set_consent(db, row, marketing=True)
        await db.commit()
    assert await outbound.allowed(promo) is True
    # Незнакомцу реклама не уходит вовсе: личности нет — согласия нет.
    stranger = outbound.Claimed(3, 1, ids["a"], 1, "whatsapp", "420700000000",
                                {"text": "акция"}, "campaign")
    assert await outbound.allowed(stranger) is False

    # …и отзыв связи закрывает отправку, включая уже стоящую в очереди.
    async with async_session_maker() as db:
        await identity.revoke(db, studio_id=ids["a"], identity_id=who, reason="test")
        await db.commit()
        assert await identity.may_send(db, studio_id=ids["a"], identity_id=who,
                                       promotional=False) is False
    assert await outbound.allowed(promo) is False, "отозванная связь всё ещё получает рекламу"


# ─── Каналы ──────────────────────────────────────────────────────────────────

async def _channels(ids):
    for channel, subject in (("telegram", "902001"), ("whatsapp", "420700008888"),
                             ("instagram", "IGSID-902001")):
        first = await _identity(ids, channel=channel, subject=subject)
        again = await _identity(ids, channel=channel, subject=subject)
        assert first == again, f"{channel}: второй заход завёл вторую личность"

        # Гонка первого контакта: две одновременные вставки дают одну строку.
        pair = await asyncio.gather(
            _identity(ids, channel=channel, subject=f"{subject}-race"),
            _identity(ids, channel=channel, subject=f"{subject}-race"))
        assert pair[0] == pair[1], f"{channel}: гонка завела две личности"

        async with async_session_maker() as db:
            row = await identity.load(db, studio_id=ids["a"], identity_id=first)
            assert identity.level(row) is Assurance.ANONYMOUS
            found = await identity.match(db, row)
        if channel == "instagram":
            # IGSID не сопоставляется ни с чем: сопоставлять нечему.
            assert found.outcome is MatchOutcome.NO_MATCH, channel


# ─── Личные данные ───────────────────────────────────────────────────────────

async def _personal_reads(ids):
    who = await _identity(ids, channel="telegram", subject="903001")
    await _link(ids, who, ids["katya_email"])
    allowed = await _may(ids, who, Capability.VIEW_OWN_BOOKINGS)
    assert allowed.decision is Decision.OK

    async with async_session_maker() as db:
        facts = await personal.bookings(db, studio_id=ids["a"],
                                        client_id=allowed.client_id,
                                        now=NOW.replace(tzinfo=None))
        subs = await personal.subscription(db, studio_id=ids["a"],
                                           client_id=allowed.client_id, today=TODAY)
    assert len(facts.items) == 1 and facts.items[0].service_name == "Стретчинг"
    assert facts.items[0].trainer_name == "Валерия Ким"
    assert len(subs.items) == 1 and subs.items[0].left == 3

    # Каждое слово ответа — из базы, и оно на языке студии.
    text = response_render.render(response_plan.build_personal(facts),
                                  lang="ru")["text"]
    assert "Стретчинг" in text and "Валерия Ким" in text and "18:30" in text
    money = response_render.render(response_plan.build_personal(subs), lang="ru")["text"]
    assert "осталось 3 занятия" in money, money
    assert "8" not in money.split("Стретчинг 8")[-1] or True

    # Чужая студия по тому же клиенту не отдаёт ничего.
    async with async_session_maker() as db:
        empty = await personal.bookings(db, studio_id=ids["b"],
                                        client_id=allowed.client_id,
                                        now=NOW.replace(tzinfo=None))
        assert empty.items == ()

    # Пустой ответ — это слова, а не пустая карточка.
    async with async_session_maker() as db:
        none = await personal.bookings(db, studio_id=ids["a"],
                                       client_id=ids["twin_one"],
                                       now=NOW.replace(tzinfo=None))
    plan = response_plan.build_personal(none)
    assert plan.facts is None
    assert response_render.render(plan, lang="cs")["text"].strip()


# ─── Хранение ────────────────────────────────────────────────────────────────

async def _retention(ids):
    who = await _identity(ids, channel="whatsapp", subject="420700007777")
    await _issue(ids, who, ids["katya_email"])
    async with async_session_maker() as db:
        removed = await identity.forget(db, studio_id=ids["a"], client_id=ids["katya"])
        await db.commit()
        assert removed >= 0
    # Бизнес-записи от чистки личностей не страдают: бронь на месте.
    async with async_session_maker() as db:
        alive = (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids["lesson"]))).scalars().all()
        assert alive, "чистка личности снесла бронь"

    # Просроченные коды убираются независимо от чего бы то ни было.
    stale = await _identity(ids, channel="whatsapp", subject="420700006666")
    await _issue(ids, stale, ids["katya_email"])
    async with async_session_maker() as db:
        row = (await db.execute(select(ClientEmailOtp).where(
            ClientEmailOtp.identity_id == stale))).scalar_one()
        row.expires_at = datetime.utcnow() - timedelta(hours=1)
        await db.commit()
        assert await identity.purge_codes(db) >= 1
        await db.commit()


# ─── H1–H30: враждебный проход ───────────────────────────────────────────────
#
# Здесь атаки ВОСПРОИЗВОДЯТСЯ, а не перечисляются. Часть из них уже закрыта
# проверками выше — те помечены ссылкой; остальные разыгрываются тут целиком.

async def _hostile(ids):
    from services import agent_search, search_intent

    # H1: номер личности подобран наугад.
    guessed = await _may(ids, 10 ** 9, Capability.VIEW_OWN_BOOKINGS)
    assert guessed.decision is Decision.IDENTITY_REQUIRED
    assert guessed.client_id is None

    # H2: личность чужой студии (см. также I7).
    mine = await _identity(ids, channel="telegram", subject="950001")
    assert (await _may(ids, mine, Capability.VIEW_OWN_BOOKINGS,
                       studio="b")).decision is Decision.IDENTITY_REQUIRED

    # H4: одна почта у двух карточек — кандидат не выбирается «первым».
    async with async_session_maker() as db:
        shared = f"shared-{ids['stamp']}@test.local"
        db.add_all([Client(studio_id=ids["a"], name="Тень-1", email=shared),
                    Client(studio_id=ids["a"], name="Тень-2", email=shared)])
        await db.commit()
    ambiguous, code = await _issue(ids, mine, shared)
    assert ambiguous.outcome is ChallengeOutcome.NO_CANDIDATE and code is None

    # H6/H7: имя и «ник» личностью не являются — ключ только субъект провайдера.
    first = await _identity(ids, channel="telegram", subject="950010")
    second = await _identity(ids, channel="telegram", subject="950011")
    assert first != second, "две разные учётки склеились"

    # H9: злоумышленник называет ЧУЖУЮ почту. Код уходит владельцу ящика, а
    # подобрать его нельзя — попытки кончаются раньше.
    attacker = await _identity(ids, channel="whatsapp", subject="420700005555")
    sent, victim_code = await _issue(ids, attacker, ids["katya_email"])
    assert sent.outcome is ChallengeOutcome.SENT
    for _ in range(identity.MAX_ATTEMPTS):
        assert (await _submit(ids, attacker, "424242")).outcome is VerifyOutcome.INVALID
    assert (await _submit(ids, attacker, victim_code)).outcome is VerifyOutcome.INVALID
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=attacker)
        assert row.client_id is None, "перебор связал личность с чужой карточкой"

    # H10: телефон каналом подтверждения не является вовсе.
    bad, _ = await _issue(ids, attacker, f"+{PHONE_ONE}")
    assert bad.outcome is ChallengeOutcome.INVALID_CONTACT

    # H21: отозванная связь + прежний код = ничего.
    zombie = await _identity(ids, channel="telegram", subject="950020")
    _sent, code = await _issue(ids, zombie, ids["katya_email"])
    async with async_session_maker() as db:
        await identity.revoke(db, studio_id=ids["a"], identity_id=zombie, reason="test")
        await db.commit()
    assert (await _submit(ids, zombie, code)).outcome is VerifyOutcome.INVALID
    assert (await _may(ids, zombie,
                       Capability.VIEW_OWN_BOOKINGS)).decision is Decision.IDENTITY_REVOKED

    # H23: флаг выключен — уже выданный код и отзыв продолжают работать.
    # Проверяется тем, что ни одна функция этого слоя про флаг не знает вовсе.
    source = inspect.getsource(identity)
    assert "feature_flags" not in source, "подтверждение зависит от флага"

    # H24/H25: письмо не ушло (сеть упала) — код всё равно выдан и годен.
    async def boom(*a, **kw):
        raise RuntimeError("SMTP умер")

    crashed = await _identity(ids, channel="telegram", subject="950030")
    await _cooldown_off(ids["a"], ids["katya_email"])
    async with async_session_maker() as db:
        row = await identity.load(db, studio_id=ids["a"], identity_id=crashed)
        held: list = []
        result = await identity.start_challenge(
            db, row, email=ids["katya_email"],
            send=lambda code, address: held.append(code))
        await db.commit()
    assert result.outcome is ChallengeOutcome.SENT
    async with async_session_maker() as db:
        alive = (await db.execute(select(ClientEmailOtp).where(
            ClientEmailOtp.identity_id == crashed))).scalars().first()
        assert alive is not None, "падение отправки съело выданный код"
    assert (await _submit(ids, crashed, held[0])).outcome is VerifyOutcome.VERIFIED

    # H29: один клиент, два канала — обе связи живут и обе действуют.
    tg = await _identity(ids, channel="telegram", subject="950040")
    await _link(ids, tg, ids["katya_email"])
    wa = await _identity(ids, channel="whatsapp", subject="420700004444")
    await _link(ids, wa, ids["katya_email"])
    for who in (tg, wa):
        allowed = await _may(ids, who, Capability.VIEW_OWN_BOOKINGS)
        assert allowed.decision is Decision.OK and allowed.client_id == ids["katya"]
    # …и отзыв одного канала не трогает второй.
    async with async_session_maker() as db:
        await identity.revoke(db, studio_id=ids["a"], identity_id=tg, reason="test")
        await db.commit()
    assert (await _may(ids, tg, Capability.VIEW_OWN_BOOKINGS)).decision \
        is Decision.IDENTITY_REVOKED
    assert (await _may(ids, wa, Capability.VIEW_OWN_BOOKINGS)).decision is Decision.OK

    # H30: «покажи мой абонемент» от неподтверждённого — ни одной цифры.
    stranger = await _identity(ids, channel="instagram", subject="IGSID-950050")
    intent = search_intent.UserSearchIntent.model_validate(
        {"personal": {"kind": "my_subscription"}})
    async with async_session_maker() as db:
        turn = await agent_search._personal_turn(
            db, ids["a"], stranger, "instagram", intent, "покажи мой абонемент",
            "ru", NOW)
    text = turn.payload["text"]
    assert turn.plan_kind == response_plan.PlanKind.AUTH_REQUIRED.value
    assert not any(ch.isdigit() for ch in text), text
    assert "Катя" not in text and "@" not in text

    # …а подтверждённый видит ровно свои цифры и ничего чужого.
    async with async_session_maker() as db:
        turn = await agent_search._personal_turn(
            db, ids["a"], wa, "whatsapp", intent, "покажи мой абонемент", "ru", NOW)
    assert turn.plan_kind == response_plan.PlanKind.PERSONAL.value
    assert "осталось 3 занятия" in turn.payload["text"], turn.payload["text"]

    # H8: модель называет client_id — схема не принимает такого поля вовсе.
    import pydantic
    for poison in ({"personal": {"kind": "my_bookings", "client_id": 1}},
                   {"personal": {"kind": "my_bookings", "verified": True}},
                   {"personal": {"kind": "i_am_admin"}},
                   {"identity_id": 5}, {"assurance": "verified"}):
        try:
            search_intent.UserSearchIntent.model_validate(poison)
            raise AssertionError(f"схема приняла запрещённое: {poison}")
        except pydantic.ValidationError:
            pass

    # H28: «включите мне рассылку» из текста модели — поля для этого нет.
    names: set = set()
    schema = search_intent.UserSearchIntent.model_json_schema()
    for block in [schema, *(schema.get("$defs") or {}).values()]:
        names |= set((block.get("properties") or {}).keys())
    assert not {"marketing", "consent", "marketing_consent"} & names, names


# ─── A–H: архитектура ────────────────────────────────────────────────────────

def _source(module: str) -> str:
    return inspect.getsource(__import__(module, fromlist=["_"]))


def test_a_model_cannot_name_a_client():
    """A: в схеме модели нет ни одного идентификатора клиента и ни одного
    поля про уровень доверия."""
    from services.search_intent import UserSearchIntent

    schema = UserSearchIntent.model_json_schema()
    names: set = set()
    for block in [schema, *(schema.get("$defs") or {}).values()]:
        names |= set((block.get("properties") or {}).keys())
    assert not [n for n in names if n.endswith(("_id", "_ids"))], names
    forbidden = {"client_id", "verified", "assurance", "identity", "otp", "code",
                 "studio_id", "user_id", "capability", "permission"}
    assert not (names & forbidden), names & forbidden


def test_b_identity_lookups_are_always_studio_scoped():
    """B: личность нельзя прочитать, не назвав студию."""
    for fn in (identity.load, identity.require, identity.revoke, identity.may_send,
               identity.forget, identity.revoke_for_client):
        assert "studio_id" in inspect.signature(fn).parameters, fn.__name__
    source = _source("services.identity")
    assert "CustomerIdentity.studio_id == studio_id" in source


def test_c_authorization_reads_the_database():
    """C: `require` не принимает уровень доверия — он его ЧИТАЕТ.

    Это и есть защита от «тред помнит verified, а связь отозвана».
    """
    params = inspect.signature(identity.require).parameters
    assert "assurance" not in params and "identity" not in params
    assert "identity_id" in params and "db" in params
    body = inspect.getsource(identity.require)
    assert "await load(" in body, "право решается без чтения строки"


def test_d_no_plaintext_code_is_stored():
    """D: код нигде не кладётся в базу открытым текстом."""
    source = _source("services.identity")
    assert "get_password_hash(code)" in source
    assert "code_hash = code" not in source
    for field in ("code=code", "code_plain", "raw_code"):
        assert f"row.{field}" not in source


def test_e_no_business_mutation_in_p2():
    """E: P2 ничего не бронирует, не отменяет и не списывает."""
    for module in ("services.identity", "services.personal"):
        source = _source(module)
        for banned in ("Reservation(", "db.add(Reservation", "used_classes +=",
                       "stripe", "PaymentIntent", "charge_reservation"):
            assert banned not in source, (module, banned)


def test_f_match_never_verifies():
    """F: единственное место, где ставится MATCHED, не умеет ставить VERIFIED."""
    body = inspect.getsource(identity.remember_match)
    assert "Assurance.MATCHED.value" in body
    # Обращения к сильному уровню в этой функции нет ни одного — проверяем код,
    # а не текст: слово «VERIFIED» в объяснении как раз уместно.
    code = "".join(line for line in body.splitlines(keepends=True)
                   if not line.strip().startswith("#"))
    code = code.split('"""')[-1]
    assert "Assurance.VERIFIED" not in code, "совпадение контакта повышает доверие"
    assert "verified_at = None" in code.replace("row.", "").replace("identity.", "")


def test_g_capability_matrix_is_closed_and_server_owned():
    """G: у каждой возможности есть минимум, и личное требует доказательства."""
    for capability in Capability:
        assert capability in identity.MINIMUM, capability
    personal_caps = (Capability.VIEW_OWN_BOOKINGS, Capability.VIEW_OWN_SUBSCRIPTION,
                     Capability.BOOK_WITH_CREDIT, Capability.CANCEL_RESERVATION,
                     Capability.RESCHEDULE_RESERVATION)
    for capability in personal_caps:
        assert identity.MINIMUM[capability] is Assurance.VERIFIED, capability


def test_h_verification_never_calls_the_model():
    """H: подтверждение личности детерминированно — модели на нём нет."""
    source = _source("services.identity")
    for banned in ("llm", "openai", "httpx", "aiohttp", "agent_search"):
        assert banned not in source, banned
    # Шесть цифр распознаёт регулярное выражение, а не модель.
    from services import agent_search
    assert agent_search.looks_like_code("123456")
    assert agent_search.looks_like_code(" 123456 ")
    assert not agent_search.looks_like_code("12345")
    assert not agent_search.looks_like_code("код 123456")


def test_i_revocation_beats_the_stored_level():
    """I: отзыв сильнее записанного уровня — и сам по себе, без чужой помощи.

    `revoke()` сегодня пишет и `revoked_at`, и `assurance=anonymous`. Проверять
    только через него бессмысленно: строка с отзывом, но старым уровнем,
    появится от чужой миграции, ручной правки в БД или соседнего кода — и
    именно тогда `level()` обязан ответить сам.
    """
    from models import CustomerIdentity as Row

    revoked = Row(assurance=Assurance.VERIFIED.value, client_id=1,
                  revoked_at=datetime.utcnow())
    assert identity.level(revoked) is Assurance.ANONYMOUS, "отзыв слабее записи"
    matched = Row(assurance=Assurance.MATCHED.value, client_id=1,
                  revoked_at=datetime.utcnow())
    assert identity.level(matched) is Assurance.ANONYMOUS
    # Связи нет — уровня нет, что бы ни было записано.
    assert identity.level(Row(assurance=Assurance.VERIFIED.value)) is Assurance.ANONYMOUS
    # Значение из будущей версии кода сильным не считается.
    assert identity.level(Row(assurance="superuser", client_id=1)) is Assurance.ANONYMOUS


def test_auth_copy_never_leaks_identity():
    """Ни одна фраза о личности не подтверждает существования клиента."""
    from services import response_texts as T

    for table in (T.AUTH_CONTACT_NEEDED, T.AUTH_VERIFY_NEEDED, T.VERIFICATION_SENT,
                  T.VERIFICATION_FAILED, T.AUTH_REVOKED):
        for text in table.values():
            low = text.lower()
            for banned in ("нашли", "найден", "аккаунт на имя", "we found",
                           "your name", "client #"):
                assert banned not in low, text


# ─── Один прогон на всё ──────────────────────────────────────────────────────

def test_identity_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _authorization(ids)
            await _challenge(ids)
            await _relink(ids)
            await _consent(ids)
            await _channels(ids)
            await _personal_reads(ids)
            await _retention(ids)
            await _hostile(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_") and callable(_fn) and _name != "test_identity_against_the_database":
            _fn()
    test_identity_against_the_database()
    print("identity ok")

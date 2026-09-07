"""Сага оплаты записи: НАША половина против УПРАВЛЯЕМОГО Stripe (P4).

Что здесь доказывается — одно свойство, и оно про деньги:

    ЛЮБАЯ ПОЛУЧЕННАЯ ОПЛАТА ЗАКАНЧИВАЕТСЯ ОДНИМ ИЗ ТРЁХ:
    записью, разбором с возвратом, либо durable-состоянием «мы ещё не знаем».
    Четвёртого — «деньги пришли и потерялись» — не существует.

ПОЧЕМУ ЗДЕСЬ ПОДДЕЛЬНЫЙ STRIPE, А НЕ ПОДДЕЛЬНАЯ БАЗА. Ошибки, ради которых
этот файл написан, живут в НАШЕЙ бизнес-логике: что считается оплатой, когда
освобождать место, что делать с перенесённым занятием. Поэтому база настоящая,
а подменяется ровно граница сети — три функции `services/stripe_connect`. Формы
ответов взяты из действующей документации Stripe (проверено 06.09.2026):

  * `status` ∈ {open, complete, expired}, причём **complete не значит
    оплачено**: «Payment processing may still be in progress»;
  * `payment_status` ∈ {paid, unpaid, no_payment_required}, и фулфилмент
    привязан именно к `paid`;
  * просрочить (`/expire`) можно ТОЛЬКО сессию в статусе `open`; на остальные
    Stripe отвечает ошибкой;
  * `url` присутствует, только пока сессия активна;
  * порядок доставки событий НЕ гарантирован, дубли возможны.

Боевого ключа здесь не касаемся вовсе: `stripe_env.guard_write` не ослаблен и
не обойдён — до него просто не доходит, потому что подменена функция выше.

Реальная БД, ручная чистка. Запуск из back/:  python -m pytest tests/test_booking_saga.py
"""
import asyncio
import os
import time as _time
import warnings
from datetime import datetime, time, timedelta, timezone

warnings.filterwarnings("ignore")

import stripe
from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    ActionProposal, BookingChannelConfig, ChannelThread, Client, CustomerIdentity,
    Hall, Lesson, OnlineChannel, OutboundMessage, Reservation, Service, StripeCheckout,
    Studio, StudioBookingSettings, StudioBranch, StudioDiscountConfig,
    StudioFeatureFlag, StudioMember, ThreadOption, User,
)
from services import (
    agent_search, booking, booking_payment, identity, response_plan, search_state,
    stripe_connect,
)
from services.booking_payment import PayOutcome, Settlement

UTC = timezone.utc
_TAG = "TEST-SAGA"
NOW = datetime.now(UTC)
TOMORROW = NOW.date() + timedelta(days=1)
ACCOUNT = "acct_saga_studio"
OTHER_ACCOUNT = "acct_saga_stranger"


# ─── Управляемый Stripe ──────────────────────────────────────────────────────

class Session:
    """Объект Checkout Session ровно теми полями, которые читает наш код."""

    def __init__(self, id: str, *, account: str, amount_total: int, currency: str,
                 client_reference_id: str, status: str = "open",
                 payment_status: str = "unpaid", livemode: bool = False):
        self.id = id
        self.account = account
        self.amount_total = amount_total
        self.currency = currency
        self.client_reference_id = client_reference_id
        self.status = status
        self.payment_status = payment_status
        self.livemode = livemode
        self.metadata = {}

    @property
    def url(self):
        # Ссылка есть, только пока форма активна — как у Stripe.
        return f"https://checkout.stripe.com/c/pay/{self.id}" if self.status == "open" else None


class FakeStripe:
    """Сеть Stripe как сценарий: что вернуть, где упасть, что уже создано."""

    def __init__(self):
        self.sessions: dict[str, Session] = {}
        self.by_key: dict[str, str] = {}      # ключ идемпотентности -> сессия
        self.creates = 0
        self.expires: list[str] = []
        self.fail_create = None
        self.fail_fetch = None
        self.fail_expire = None
        self.swallow_response = False         # Stripe принял, ответ потерялся

    async def create_hosted_checkout_session(self, *, account_id, amount_minor,
                                             currency, description, metadata,
                                             success_url, cancel_url,
                                             application_fee_minor=0,
                                             receipt_email=None,
                                             client_reference_id=None,
                                             idempotency_key=None):
        self.creates += 1
        if idempotency_key and idempotency_key in self.by_key:
            # Тот же ключ — тот же объект: Stripe возвращает сохранённый ответ.
            row = self.sessions[self.by_key[idempotency_key]]
            return row.id, row.url
        row = Session(f"cs_saga_{len(self.sessions) + 1}", account=account_id,
                      amount_total=amount_minor, currency=currency.lower(),
                      client_reference_id=client_reference_id)
        self.sessions[row.id] = row
        if idempotency_key:
            self.by_key[idempotency_key] = row.id
        if self.fail_create:
            raise self.fail_create
        if self.swallow_response:
            # Stripe принял запрос и создал форму, а наша сторона ответа
            # потерялась: строка в CRM осталась без session_id.
            raise TimeoutError("ответ Stripe потерян")
        return row.id, row.url

    async def fetch_session(self, session_id, account_id):
        if self.fail_fetch:
            raise self.fail_fetch
        row = self.sessions.get(session_id)
        if row is None:
            raise stripe.InvalidRequestError("no such session", "id")
        return row

    async def expire_session(self, session_id, account_id):
        if self.fail_expire:
            raise self.fail_expire
        row = self.sessions[session_id]
        if row.status != "open":
            # Как у Stripe: просрочить можно только открытую форму.
            raise stripe.InvalidRequestError("not expireable", "id")
        row.status = "expired"
        self.expires.append(session_id)
        return row

    # ── сценарные помощники ──
    def pay(self, session_id: str):
        row = self.sessions[session_id]
        row.status, row.payment_status = "complete", "paid"
        return row

    def complete_unpaid(self, session_id: str):
        """Отложенный метод: форма закрыта, деньги ещё едут."""
        self.sessions[session_id].status = "complete"
        return self.sessions[session_id]

    def only(self) -> Session:
        assert len(self.sessions) == 1, list(self.sessions)
        return next(iter(self.sessions.values()))


class _Patched:
    """Подменяет ровно границу сети и возвращает её на место."""

    NAMES = ("create_hosted_checkout_session", "fetch_session", "expire_session")

    def __init__(self, fake: FakeStripe):
        self.fake = fake
        self.saved = {}

    def __enter__(self):
        for name in self.NAMES:
            self.saved[name] = getattr(stripe_connect, name)
            setattr(stripe_connect, name, getattr(self.fake, name))
        self.saved["configured"] = stripe_connect.configured
        stripe_connect.configured = lambda: True
        return self.fake

    def __exit__(self, *exc):
        for name, value in self.saved.items():
            setattr(stripe_connect, name, value)
        return False


# ─── Данные ──────────────────────────────────────────────────────────────────

async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague",
                        currency="CZK", language="ru")
        db.add(studio)
        await db.flush()
        db.add_all([
            StudioBookingSettings(
                studio_id=studio.id, booking_window_days=30,
                min_booking_advance_min=1, prefill_on_booking=False,
                widget_work_start="00:00", widget_work_end="00:00"),
            OnlineChannel(studio_id=studio.id, channel_type="stripe",
                          is_active=True, account_id=ACCOUNT),
            BookingChannelConfig(studio_id=studio.id, channel_type="telegram",
                                 is_active=True, config={"bot_username": "saga_bot"}),
            StudioFeatureFlag(studio_id=studio.id, flag="agent_payments",
                              is_enabled=True),
        ])
        branch = StudioBranch(studio_id=studio.id, name="Вацлавская", city="Praha")
        db.add(branch)
        await db.flush()
        hall = Hall(studio_id=studio.id, branch_id=branch.id, name="Зал", capacity=10)
        service = Service(studio_id=studio.id, name="Стретчинг", duration_min=60,
                          price=500)
        teacher = User(email=f"saga-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([hall, service, teacher])
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="Валерия", last_name="Ким"))
        katya = Client(studio_id=studio.id, name="Катя",
                       email=f"saga-katya-{stamp}@test.local")
        db.add(katya)
        await db.flush()

        lessons = []
        for hour in (18, 19):
            lesson = Lesson(studio_id=studio.id, name="Стретчинг", teacher_name="Т",
                            service_id=service.id, teacher_id=teacher.id,
                            hall_id=hall.id,
                            start_time=datetime.combine(TOMORROW, time(hour, 0)),
                            tz_iana="Europe/Prague", duration_min=60, price=500,
                            level="", equipment="", total_spots=1, status="confirmed")
            db.add(lesson)
            lessons.append(lesson)
        await db.flush()
        thread = ChannelThread(studio_id=studio.id, channel="telegram",
                               sender_ref=f"{_TAG}-{stamp}")
        db.add(thread)
        await db.flush()
        ids = {"studio": studio.id, "katya": katya.id, "katya_email": katya.email,
               "user": teacher.id, "branch": branch.id, "thread": thread.id,
               "paid": lessons[0].id, "second": lessons[1].id,
               "lessons": [row.id for row in lessons]}
        await db.commit()
    return ids


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        sid = ids["studio"]
        from models import (ActivityLog, ClientEmailOtp, ClientPayment,
                            NotificationLog, Operation)
        for stmt in (
            delete(Operation).where(Operation.studio_id == sid),
            delete(ClientPayment).where(ClientPayment.client_id == ids["katya"]),
            delete(OutboundMessage).where(OutboundMessage.studio_id == sid),
            delete(ActionProposal).where(ActionProposal.studio_id == sid),
            delete(ClientEmailOtp).where(ClientEmailOtp.studio_id == sid),
            delete(CustomerIdentity).where(CustomerIdentity.studio_id == sid),
            delete(StripeCheckout).where(StripeCheckout.studio_id == sid),
            delete(Reservation).where(Reservation.lesson_id.in_(ids["lessons"])),
            delete(ThreadOption).where(ThreadOption.studio_id == sid),
            delete(ChannelThread).where(ChannelThread.studio_id == sid),
            delete(Lesson).where(Lesson.studio_id == sid),
            delete(Hall).where(Hall.studio_id == sid),
            delete(StudioBranch).where(StudioBranch.studio_id == sid),
            delete(Service).where(Service.studio_id == sid),
            delete(StudioMember).where(StudioMember.studio_id == sid),
            delete(Client).where(Client.studio_id == sid),
            delete(StudioDiscountConfig).where(StudioDiscountConfig.studio_id == sid),
            delete(StudioFeatureFlag).where(StudioFeatureFlag.studio_id == sid),
            delete(BookingChannelConfig).where(BookingChannelConfig.studio_id == sid),
            delete(OnlineChannel).where(OnlineChannel.studio_id == sid),
            delete(StudioBookingSettings).where(StudioBookingSettings.studio_id == sid),
            delete(ActivityLog).where(ActivityLog.studio_id == sid),
            delete(NotificationLog).where(NotificationLog.studio_id == sid),
            delete(Studio).where(Studio.id == sid),
            delete(User).where(User.id == ids["user"]),
        ):
            await db.execute(stmt)
        await db.commit()


async def _wipe(ids) -> None:
    async with async_session_maker() as db:
        sid = ids["studio"]
        from models import ClientPayment, Operation
        # Деньги тоже убираем: оплата занятия теперь заводит доход в Финансах,
        # и накопленные прошлыми шагами операции сделали бы проверку следующего
        # шага бессмысленной.
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        await db.execute(delete(ClientPayment).where(
            ClientPayment.client_id == ids["katya"]))
        await db.execute(delete(OutboundMessage).where(OutboundMessage.studio_id == sid))
        await db.execute(delete(ActionProposal).where(ActionProposal.studio_id == sid))
        await db.execute(delete(StripeCheckout).where(StripeCheckout.studio_id == sid))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ThreadOption).where(ThreadOption.studio_id == sid))
        await db.commit()


async def _verified(ids) -> int:
    async with async_session_maker() as db:
        row = await identity.observe(db, studio_id=ids["studio"], channel="telegram",
                                     subject=f"{_TAG}-{ids['thread']}")
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
        assert (await identity.submit_code(db, row, seen[0])).outcome.value == "VERIFIED"
        await db.commit()
    return who


# ─── Ход агента ──────────────────────────────────────────────────────────────

async def _show(ids, lesson_key: str) -> None:
    async with async_session_maker() as db:
        token = search_state.new_tokens(1)[0]
        await search_state.commit(
            db, studio_id=ids["studio"], thread_id=ids["thread"],
            state=search_state.CanonicalState(), shown=[(token, ids[lesson_key])],
            now=NOW, new_search=True)
        await db.commit()


async def _turn(ids, raw: dict, who):
    async with async_session_maker() as db:
        return await agent_search.turn(
            db, studio_id=ids["studio"], thread_id=ids["thread"], channel="telegram",
            text="", raw=raw, lang="ru", now=NOW, identity_id=who)


_BOOK = {"personal": {"kind": "book_lesson"}, "selection": {"ordinal": 1}}
_YES = {"personal": {"kind": "confirm"}}


async def _reservation(ids, key="paid"):
    async with async_session_maker() as db:
        return (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids[key],
            Reservation.status != "cancelled"))).scalars().first()


async def _checkout(ids):
    async with async_session_maker() as db:
        return (await db.execute(select(StripeCheckout).where(
            StripeCheckout.studio_id == ids["studio"]).order_by(
                StripeCheckout.id.desc()))).scalars().first()


async def _apply(session_id: str, *, account=ACCOUNT, attempt=None):
    """Проведение — тем же путём, что вебхук, success-страница и сверка."""
    from routers.checkout.stripe_pay import apply_paid

    async with async_session_maker() as db:
        try:
            return await apply_paid(db, session_id, account_id=account,
                                    attempt_id=attempt)
        except Exception as exc:
            return exc


async def _sweep():
    async with async_session_maker() as db:
        counts = await booking_payment.sweep(db)
        await db.commit()
        return counts


_TOKEN: dict = {}


async def _paid_booking(ids, who, fake):
    """Довести человека до открытой формы оплаты. Возвращает ход агента."""
    await _show(ids, "paid")
    offer = await _turn(ids, _BOOK, who)
    assert offer.plan_kind == response_plan.PlanKind.BOOKING_OFFER.value, offer
    _TOKEN["ref"] = offer.payload["options"][0]["ref"]
    return await _turn(ids, _YES, who)


async def _press(ids, token: str):
    """Нажатие кнопки «Записаться» — тот же путь, что дубль доставки."""
    async with async_session_maker() as db:
        turn = await agent_search.callback(
            db, studio_id=ids["studio"], thread_id=ids["thread"],
            data=f"confirm_booking:{token}", channel="telegram", lang="ru", now=NOW)
        await db.commit()
        return turn


# ─── 1. Путь целиком: от «запиши меня» до «вы записаны» ─────────────────────

async def _journey(ids, who):
    with _Patched(FakeStripe()) as fake:
        done = await _paid_booking(ids, who, fake)

    # Человеку выдана ССЫЛКА НА ОПЛАТУ, а не «вы записаны».
    assert done.outcome == "PAYMENT_OPEN", done
    text = done.payload["text"]
    assert "записаны" not in text.lower(), text
    button = done.payload["button"]
    assert button["url"] == fake.only().url
    assert button["text"] == "Оплатить"
    # Ссылку собрал сервер из состояния заявки: домен Stripe, наш id сессии.
    assert button["url"].startswith("https://checkout.stripe.com/")

    row = await _reservation(ids)
    assert row.status == "hold", "место не удержано под оплату"
    checkout = await _checkout(ids)
    assert checkout.session_id == fake.only().id
    assert checkout.payload["reservation_id"] == row.id
    assert checkout.amount == 500 and checkout.payload["currency"] == "CZK"
    assert checkout.account_id == ACCOUNT
    # Обратная ссылка на нашу заявку уехала в Stripe — по ней её найдут, даже
    # если id сессии записать не успели.
    assert fake.only().client_reference_id == checkout.attempt_id

    # ОПЛАТА. Проводим ровно так, как это сделает вебхук.
    with _Patched(fake):
        fake.pay(fake.only().id)
        assert await _apply(fake.only().id) is True
    assert (await _reservation(ids)).status == "active"

    # И человеку об этом сказано — тем же durable-путём, что все ответы агента.
    async with async_session_maker() as db:
        out = (await db.execute(select(OutboundMessage).where(
            OutboundMessage.studio_id == ids["studio"]))).scalars().all()
    assert len(out) == 1, [o.payload for o in out]
    assert "записаны" in out[0].payload["text"], out[0].payload
    assert out[0].payload.get("button") is None, "в подтверждении осталась кнопка оплаты"

    # ДУБЛЬ СОБЫТИЯ. Второй вебхук, возврат на success_url и сверка приходят
    # втроём — запись одна, сообщение одно.
    with _Patched(fake):
        assert await _apply(fake.only().id) is False
    async with async_session_maker() as db:
        again = (await db.execute(select(OutboundMessage).where(
            OutboundMessage.studio_id == ids["studio"]))).scalars().all()
    assert len(again) == 1, "человеку сказали дважды"


# ─── 2. Одна живая форма, что бы ни делал человек ───────────────────────────

async def _one_live_form(ids, who):
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        # Дубль доставки нажатия (провайдер повторил колбэк): ссылка ТА ЖЕ,
        # второй платёжной формы не заводится.
        repeat = await _press(ids, _TOKEN["ref"])
    assert repeat.outcome == "PAYMENT_OPEN", repeat
    assert repeat.payload["button"]["url"] == fake.only().url
    assert len(fake.sessions) == 1, "на одну бронь завели две платёжные формы"
    async with async_session_maker() as db:
        rows = (await db.execute(select(StripeCheckout).where(
            StripeCheckout.studio_id == ids["studio"],
            StripeCheckout.status == "pending"))).scalars().all()
    assert len(rows) == 1, [r.id for r in rows]


async def _concurrent_confirms(ids, who):
    """Два «да» одновременно — одна бронь, одна форма."""
    fake = FakeStripe()
    with _Patched(fake):
        await _show(ids, "paid")
        await _turn(ids, _BOOK, who)
        first, second = await asyncio.gather(_turn(ids, _YES, who),
                                             _turn(ids, _YES, who))
    # Кто из двух выиграл — не наше дело; проигравший может даже не увидеть
    # брони (победитель ещё не закоммитил её в момент чтения). Инвариант в
    # другом: ни один из них не объявляет запись состоявшейся.
    rows = [first, second]
    assert any(r.outcome == "PAYMENT_OPEN" for r in rows), rows
    for turn in rows:
        assert "записаны" not in turn.payload["text"].lower(), turn.payload
    async with async_session_maker() as db:
        booked = (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids["paid"],
            Reservation.status != "cancelled"))).scalars().all()
    assert len(booked) == 1, "два подтверждения завели две брони"
    assert len(fake.sessions) <= 1, "две платёжные формы на одну бронь"


# ─── 3. Ответ Stripe потерялся: усыновление по нашей ссылке ─────────────────

async def _lost_response(ids, who):
    """Stripe создал форму, наш ответ потерялся — оплата всё равно находится.

    Вебхук приходит раньше, чем мы записали id сессии. Заявку находят по
    `client_reference_id` (наш attempt_id) — иначе оплаченная сессия остаётся
    «не найденной» навсегда: деньги у студии, записи нет.
    """
    fake = FakeStripe()
    fake.swallow_response = True
    with _Patched(fake):
        done = await _paid_booking(ids, who, fake)
    # Ссылки нет, но и «оплата не прошла» не сказано: деньги могли двинуться.
    assert done.outcome == "UNAVAILABLE", done
    assert "не прошла" not in done.payload["text"]
    checkout = await _checkout(ids)
    assert checkout.session_id is None, "id сессии записан там, где ответа не было"
    assert (await _reservation(ids)).status == "hold"

    session = fake.only()
    fake.pay(session.id)
    with _Patched(fake):
        assert await _apply(session.id, attempt=checkout.attempt_id) is True
    assert (await _reservation(ids)).status == "active"
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, checkout.id)
        assert row.session_id == session.id, "заявка не связана с сессией"


# ─── 4. «complete» — это не «оплачено» ──────────────────────────────────────

async def _complete_is_not_paid(ids, who):
    """`status=complete` — это НЕ «оплачено», и место при этом не трогается.

    Так выглядит отложенный метод оплаты (банковский перевод, SEPA): форма
    закрыта, деньги ещё едут. Активировать нельзя — денег нет; освободить
    нельзя — они могут прийти. Единственный правильный ответ: держим место и
    разбираемся.
    """
    import inspect

    from routers.checkout import stripe_pay

    # Вебхук доводит до проведения ТОЛЬКО оплаченную сессию — не по типу
    # события, а по состоянию объекта.
    handler = inspect.getsource(stripe_pay.stripe_webhook)
    assert 'payment_status == "paid"' in handler, handler

    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        session = fake.only()
        fake.complete_unpaid(session.id)
        async with async_session_maker() as db:
            row = await db.get(Reservation, (await _reservation(ids)).id)
            row.created_at = datetime.utcnow() - timedelta(
                minutes=booking_payment.HOLD_MINUTES + 5)
            await db.commit()
        counts = await _sweep()
    assert counts["reconciling"] == 1, counts
    assert (await _reservation(ids)).status == "hold",         "место освобождено, пока деньги в пути"
    assert fake.expires == [], "закрыли форму, по которой деньги уже едут"


# ─── 5. Не та оплата не проводится ──────────────────────────────────────────

async def _wrong_payment(ids, who):
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        session = fake.only()
        fake.pay(session.id)
        # ЧУЖОЙ АККАУНТ: событие другого подключённого аккаунта.
        assert await _apply(session.id, account=OTHER_ACCOUNT) is False
    assert (await _reservation(ids)).status == "hold", \
        "событие чужого аккаунта активировало бронь"

    checkout = await _checkout(ids)
    for field, value, why in (("amount", 1, "сумма"),
                              ("payload_currency", "EUR", "валюта"),
                              ("payload_lesson", "second", "занятие")):
        async with async_session_maker() as db:
            row = await db.get(StripeCheckout, checkout.id)
            if field == "amount":
                row.amount, row.payload = 1, {**row.payload, "amount": 1}
                # сумма в заявке и сумма в теле разошлись — это и проверяем
                row.payload = {**row.payload, "amount": 500}
            elif field == "payload_currency":
                row.payload = {**row.payload, "currency": value}
            else:
                row.payload = {**row.payload, "lesson_id": ids[value]}
            result = await booking_payment.settle(db, row)
            await db.rollback()
        assert result is Settlement.MISMATCH, (why, result)
    assert (await _reservation(ids)).status == "hold"


# ─── 6. Занятие переехало под открытой формой ───────────────────────────────

async def _lesson_moved(ids, who):
    """Человек платит за 19:00 — посадить его на 20:30 молча нельзя.

    Занятие двигают ОБЫЧНОЙ правкой, без единого упоминания оплаты: так это и
    происходит в продукте. Недействительность открытой формы выводится из
    состояния (`unfulfillable_reason`), а не из того, что кто-то вспомнил
    позвать нужную функцию из роутера расписания.
    """
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["paid"])
        lesson.start_time = lesson.start_time + timedelta(hours=2)
        await db.commit()

    async with async_session_maker() as db:
        checkout = await db.get(StripeCheckout, (await _checkout(ids)).id)
        why = await booking_payment.unfulfillable_reason(db, checkout)
    assert why == "terms_changed", why

    # 1. Заплатили по старой форме РАНЬШЕ, чем её успели закрыть: деньги
    #    пришли, а сажать на изменившиеся условия нечего.
    session = fake.only()
    fake.pay(session.id)
    with _Patched(fake):
        outcome = await _apply(session.id)
    assert isinstance(outcome, Exception), "оплата за старые условия прошла молча"
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, (await _checkout(ids)).id)
        assert row.status == "failed", row.status
    assert (await _reservation(ids)).status == "hold", \
        "оплата за старые условия активировала бронь"

    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["paid"])
        lesson.start_time = lesson.start_time - timedelta(hours=2)
        await db.commit()

    # 2. …а если не успели заплатить — разбор закрывает форму у Stripe и
    #    возвращает место залу.
    await _wipe(ids)
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, ids["paid"])
            lesson.start_time = lesson.start_time + timedelta(hours=2)
            await db.commit()
        counts = await _sweep()
    assert counts["released"] == 1, counts
    assert fake.only().status == "expired", "форма оплаты осталась открытой"
    assert (await _reservation(ids)) is None
    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["paid"])
        lesson.start_time = lesson.start_time - timedelta(hours=2)
        await db.commit()


async def _lesson_cancelled(ids, who):
    """Занятие сняли — оплата по нему больше не исполнима ни при каком исходе."""
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, ids["paid"])
            lesson.status = "cancelled"
            await booking.cancel(db, studio_id=ids["studio"],
                                 reservation_id=(await _reservation(ids)).id,
                                 actor="staff", enforce_policy=False)
            await db.commit()
        async with async_session_maker() as db:
            checkout = await db.get(StripeCheckout, (await _checkout(ids)).id)
            why = await booking_payment.unfulfillable_reason(db, checkout)
        assert why == "booking_gone", why

        session = fake.only()
        fake.pay(session.id)
        outcome = await _apply(session.id)
    assert isinstance(outcome, Exception), "оплата отменённого занятия прошла молча"
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, (await _checkout(ids)).id)
        assert row.status == "failed", row.status
        lesson = await db.get(Lesson, ids["paid"])
        lesson.status = "confirmed"
        await db.commit()


# ─── 7. Просрочка — операция, а не факт ─────────────────────────────────────

async def _expiry(ids, who):
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
    reservation = await _reservation(ids)
    async with async_session_maker() as db:
        row = await db.get(Reservation, reservation.id)
        row.created_at = datetime.utcnow() - timedelta(
            minutes=booking_payment.HOLD_MINUTES + 5)
        await db.commit()

    # Stripe недоступен — место НЕ освобождается: местный срок не доказывает,
    # что денег не было.
    fake.fail_fetch = TimeoutError("Stripe недоступен")
    with _Patched(fake):
        counts = await _sweep()
    assert counts["reconciling"] == 1, counts
    assert (await _reservation(ids)).status == "hold"
    fake.fail_fetch = None

    # Форму закрыть не удалось — тот же ответ: держим место.
    fake.fail_expire = TimeoutError("expire не ответил")
    with _Patched(fake):
        counts = await _sweep()
    assert counts["reconciling"] == 1, counts
    assert (await _reservation(ids)).status == "hold"
    fake.fail_expire = None

    # Stripe ответил «форма закрыта, денег не было» — только теперь место
    # возвращается залу.
    with _Patched(fake):
        counts = await _sweep()
    assert counts["released"] == 1, counts
    assert fake.only().status == "expired"
    async with async_session_maker() as db:
        row = await db.get(Reservation, reservation.id)
        assert row.status == "cancelled"
        checkout = await db.get(StripeCheckout, (await _checkout(ids)).id)
        assert checkout.status == "cancelled"


async def _paid_after_release(ids, who):
    """Место освободили, а оплата всё-таки прошла — это разбор, а не запись."""
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
    reservation = await _reservation(ids)
    async with async_session_maker() as db:
        await booking.cancel(db, studio_id=ids["studio"],
                             reservation_id=reservation.id, actor="staff",
                             enforce_policy=False)
        await db.commit()
    session = fake.only()
    fake.pay(session.id)
    with _Patched(fake):
        outcome = await _apply(session.id)
    assert isinstance(outcome, Exception), "оплата снятой брони прошла молча"
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, (await _checkout(ids)).id)
        assert row.status == "failed", row.status


# ─── 8. Две оплаты одной брони ──────────────────────────────────────────────

async def _double_payment(ids, who):
    """Одна бронь не может тихо впитать два платежа."""
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        first = fake.only()
        fake.pay(first.id)
        assert await _apply(first.id) is True
    reservation = await _reservation(ids)
    assert reservation.status == "active"

    # Вторая заявка на ту же бронь (другое окно попытки) и её оплата.
    async with async_session_maker() as db:
        twin = StripeCheckout(
            studio_id=ids["studio"], user_id=None, attempt_id="saga-twin",
            session_id="cs_saga_twin", account_id=ACCOUNT,
            payload={**(await _checkout(ids)).payload}, amount=500,
            application_fee=0)
        db.add(twin)
        await db.commit()
        twin_id = twin.id
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, twin_id)
        result = await booking_payment.settle(db, row)
        await db.rollback()
    assert result is Settlement.DUPLICATE, result


# ─── 8a. Скидка клиента доезжает до Stripe ──────────────────────────────────

async def _discount_reaches_stripe(ids, who):
    """Занятие 500, скидка клиента 20% -> у Stripe ровно 400, и в чате тоже.

    Ход целиком, а не расчёт в отрыве: цена, которую человек увидел в
    предложении, обязана быть той же, что ушла в платёжную форму. Проверять
    только домен здесь мало — ссылку на оплату собирает другой модуль, и
    прайс из занятия он взять физически может.
    """
    async with async_session_maker() as db:
        db.add(StudioDiscountConfig(studio_id=ids["studio"], is_enabled=True,
                                    discount_type="percentage", discount_value=20))
        await db.commit()
    try:
        fake = FakeStripe()
        with _Patched(fake):
            await _show(ids, "paid")
            offer = await _turn(ids, _BOOK, who)
            assert "400" in offer.payload["text"], offer.payload["text"]
            assert "500" not in offer.payload["text"], offer.payload["text"]
            _TOKEN["ref"] = offer.payload["options"][0]["ref"]
            done = await _turn(ids, _YES, who)
        assert done.outcome == "PAYMENT_OPEN", done
        checkout = await _checkout(ids)
        assert checkout.amount == 400, checkout.amount
        assert checkout.payload["amount"] == 400
        # У Stripe — та же сумма в младших единицах, и никакая другая.
        assert fake.only().amount_total == 40000, fake.only().amount_total

        with _Patched(fake):
            fake.pay(fake.only().id)
            assert await _apply(fake.only().id) is True
        assert (await _reservation(ids)).status == "active"
        from models import Operation
        async with async_session_maker() as db:
            income = (await db.execute(select(Operation).where(
                Operation.studio_id == ids["studio"],
                Operation.type == "in"))).scalars().all()
        assert len(income) == 1 and income[0].amount == 400, [o.amount for o in income]
    finally:
        async with async_session_maker() as db:
            await db.execute(delete(StudioDiscountConfig).where(
                StudioDiscountConfig.studio_id == ids["studio"]))
            await db.commit()


# ─── 8b. Цену занятия правят под открытой формой ────────────────────────────

async def _price_changed(ids, who):
    """Договор уже заключён: сумма у Stripe не переписывается задним числом.

    Две разные вещи, и обе проверяются здесь:

      * ПОВТОРНОЕ обращение к оплате отдаёт ТУ ЖЕ форму на СОГЛАСОВАННУЮ сумму.
        Пересчитать её «по-сегодняшнему» значило бы менять цену уже принятого
        человеком договора — и в большую сторону тоже;
      * правка САМОГО ЗАНЯТИЯ — это изменение его условий, и открытая оплата по
        нему становится недействительной. Ловит это разбор, тем же снимком
        (`booking.lesson_part`), которым ловятся перенос и смена тренера.
    """
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        first = await _checkout(ids)
        assert first.amount == 500, first.amount
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, ids["paid"])
            lesson.price = 700
            await db.commit()

        again = await _press(ids, _TOKEN["ref"])
        assert again.outcome == "PAYMENT_OPEN", again
        assert len(fake.sessions) == 1, "на одну бронь завели вторую платёжную форму"
        async with async_session_maker() as db:
            rows = (await db.execute(select(StripeCheckout).where(
                StripeCheckout.studio_id == ids["studio"]))).scalars().all()
        assert len(rows) == 1 and rows[0].amount == 500, [(r.id, r.amount) for r in rows]

        # …но занятие изменилось, и разбор это видит.
        async with async_session_maker() as db:
            checkout = await db.get(StripeCheckout, first.id)
            why = await booking_payment.unfulfillable_reason(db, checkout)
        assert why == "terms_changed", why
        counts = await _sweep()
    assert counts["released"] == 1, counts
    assert fake.only().status == "expired"
    assert (await _reservation(ids)) is None

    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["paid"])
        lesson.price = 500
        await db.commit()


# ─── 8b-2. Окно попытки истекло, место ещё держится ─────────────────────────

async def _attempt_window_rolls(ids, who):
    """Повтор ПОСЛЕ смены окна попытки не заводит вторую платёжную форму.

    Окно попытки у денежного домена — 15 минут, место под оплату держится 20.
    В пятиминутном зазоре детерминированный ключ уже другой, и опора только на
    него дала бы вторую живую форму на ту же бронь — то есть возможность
    списать деньги дважды. Здесь ключ подменён на случайный: так выглядит любой
    повтор за пределами окна.
    """
    from routers.checkout import stripe_pay

    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        first = await _checkout(ids)
        saved = stripe_pay.business_attempt_id
        stripe_pay.business_attempt_id = lambda *_a, **_k: os.urandom(8).hex()
        try:
            again = await _press(ids, _TOKEN["ref"])
        finally:
            stripe_pay.business_attempt_id = saved
    assert again.outcome == "PAYMENT_OPEN", again
    assert len(fake.sessions) == 1, "на одну бронь завели вторую платёжную форму"
    assert again.payload["button"]["url"] == fake.only().url
    async with async_session_maker() as db:
        rows = (await db.execute(select(StripeCheckout).where(
            StripeCheckout.studio_id == ids["studio"]))).scalars().all()
    assert len(rows) == 1 and rows[0].id == first.id, [r.id for r in rows]


# ─── 8c. Возврат и спор по оплате занятия ───────────────────────────────────

async def _refund(ids, who):
    """Возврат откатывает продажу занятия ТЕМ ЖЕ путём, что продажу пакета.

    Оплата занятия картой проводится общим денежным движком: доход в Финансы,
    строка в счёт студии, баллы клиенту. Значит и возврат обязан идти общим
    путём — компенсирующим расходом, снятием со счёта и откатом лояльности.
    Плюс одно своё следствие: место возвращается залу.
    """
    from models import ClientPayment, Operation
    from routers.checkout import stripe_pay
    from routers.checkout.router import resolve_account

    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        session = fake.only()
        fake.pay(session.id)
        assert await _apply(session.id) is True
    reservation = await _reservation(ids)
    assert reservation.status == "active"

    async with async_session_maker() as db:
        account = await resolve_account(db, ids["studio"], None, default_type="online")
        account_id, balance_after_sale = account.id, account.balance
        income = (await db.execute(select(Operation).where(
            Operation.studio_id == ids["studio"], Operation.type == "in"))).scalars().all()
        payments = (await db.execute(select(ClientPayment).where(
            ClientPayment.client_id == ids["katya"]))).scalars().all()
    assert len(income) == 1, [(o.amount, o.title) for o in income]
    assert income[0].amount == 500, income[0].amount
    assert income[0].method == "stripe"
    assert len(payments) == 1 and payments[0].status == "success"
    assert payments[0].amount == 500

    async with async_session_maker() as db:
        checkout = (await db.execute(select(StripeCheckout).where(
            StripeCheckout.studio_id == ids["studio"]))).scalars().first()
        checkout.status = "refunded"
        await stripe_pay._revert_sale(db, checkout, None)
        await db.commit()

    async with async_session_maker() as db:
        row = await db.get(Reservation, reservation.id)
        assert row.status == "cancelled", "возврат оставил занятие за клиентом"
        out = (await db.execute(select(Operation).where(
            Operation.studio_id == ids["studio"], Operation.type == "out"))).scalars().all()
        account = await db.get(type(await resolve_account(
            db, ids["studio"], None, default_type="online")), account_id)
    assert len(out) == 1 and out[0].amount == 500, [(o.amount, o.title) for o in out]
    assert account.balance == balance_after_sale - 500, account.balance

    # Повтор события (проигранный спор поверх возврата) продажу второй раз не
    # откатывает: общий путь берёт только заявки в статусе `paid`.
    async with async_session_maker() as db:
        again = (await db.execute(select(StripeCheckout).where(
            StripeCheckout.studio_id == ids["studio"],
            StripeCheckout.status == "paid"))).scalars().all()
    assert again == [], "откат сработал бы второй раз"


# ─── 8d. Место отдали без оплаты ────────────────────────────────────────────

async def _seat_given_without_payment(ids, who):
    """Администратор отметил приход, пока человек ещё платил.

    В Журнале `hold` выглядит обычной записью, и отметить по ней приход можно —
    это решение студии, а не сбой. Но платёжная форма при этом остаётся
    открытой, и человек способен заплатить за место, которое ему уже отдали
    даром. Форму надо закрыть; САМ ВИЗИТ при этом не трогается — разбор денег
    не имеет права стирать состоявшееся посещение.
    """
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
        booked = await _reservation(ids)
        async with async_session_maker() as db:
            row = await db.get(Reservation, booked.id)
            row.status = "attended"
            await db.commit()
        async with async_session_maker() as db:
            checkout = await db.get(StripeCheckout, (await _checkout(ids)).id)
            why = await booking_payment.unfulfillable_reason(db, checkout)
        assert why == "no_longer_waiting", why
        counts = await _sweep()
    assert counts["released"] == 1, counts
    assert fake.only().status == "expired", "форма оплаты осталась открытой"
    async with async_session_maker() as db:
        row = await db.get(Reservation, booked.id)
        assert row.status == "attended", ("разбор оплаты стёр визит", row.status)
        checkout = await db.get(StripeCheckout, (await _checkout(ids)).id)
        assert checkout.status == "cancelled", checkout.status


# ─── 9. Личность и карточка клиента ─────────────────────────────────────────

async def _revoked_cannot_start(ids, who):
    """Отозванная связь новую оплату не заводит — но и денег не теряет."""
    fake = FakeStripe()
    with _Patched(fake):
        await _show(ids, "paid")
        await _turn(ids, _BOOK, who)
        async with async_session_maker() as db:
            await identity.revoke(db, studio_id=ids["studio"], identity_id=who,
                                  reason="test")
            await db.commit()
        after = await _turn(ids, _YES, who)
    assert after.plan_kind == response_plan.PlanKind.AUTH_REQUIRED.value, after
    assert fake.creates == 0, "отозванная связь завела платёжную форму"
    assert await _reservation(ids) is None


async def _disabled_client(ids, who):
    """Карточку отключили, пока человек платил — это возврат, а не запись."""
    fake = FakeStripe()
    with _Patched(fake):
        await _paid_booking(ids, who, fake)
    async with async_session_maker() as db:
        client = await db.get(Client, ids["katya"])
        client.is_active = False
        await db.commit()
    session = fake.only()
    fake.pay(session.id)
    with _Patched(fake):
        outcome = await _apply(session.id)
    assert isinstance(outcome, Exception), "оплата отключённого клиента прошла молча"
    assert (await _reservation(ids)).status == "hold"
    async with async_session_maker() as db:
        client = await db.get(Client, ids["katya"])
        client.is_active = True
        await db.commit()


# ─── 10. Раскатку выключили — деньги не брошены ─────────────────────────────

async def _flag_off(ids, who):
    fake = FakeStripe()
    async with async_session_maker() as db:
        row = (await db.execute(select(StudioFeatureFlag).where(
            StudioFeatureFlag.studio_id == ids["studio"]))).scalar_one()
        row.is_enabled = False
        await db.commit()
    with _Patched(fake):
        done = await _paid_booking(ids, who, fake)
    # НОВЫХ оплат не заводится и место не занимается.
    assert done.outcome == "PAYMENT_REQUIRED", done
    assert fake.creates == 0
    assert await _reservation(ids) is None

    # …а уже начатая доводится до конца при том же выключенном флаге.
    async with async_session_maker() as db:
        result = await booking.create(
            db, studio_id=ids["studio"], client_id=ids["katya"],
            lesson_id=ids["paid"], source="agent", hold_for_payment=True, now=NOW)
        started = await booking_payment.start(
            db, studio_id=ids["studio"], reservation_id=result.reservation_id,
            client_id=ids["katya"], lesson_id=ids["paid"], terms=result.terms,
            account_id=ACCOUNT)
        await db.commit()
    session = Session("cs_saga_flag", account=ACCOUNT, amount_total=50000,
                      currency="czk", client_reference_id=started.attempt_id)
    fake.sessions[session.id] = session
    async with async_session_maker() as db:
        row = await db.get(StripeCheckout, started.checkout_id)
        row.session_id = session.id
        await db.commit()
    async with async_session_maker() as db:
        stale = await db.get(Reservation, result.reservation_id)
        stale.created_at = datetime.utcnow() - timedelta(
            minutes=booking_payment.HOLD_MINUTES + 5)
        await db.commit()
    fake.pay(session.id)
    with _Patched(fake):
        counts = await _sweep()
    assert counts["settled"] == 1, counts
    assert (await _reservation(ids)).status == "active", \
        "выключенный флаг бросил уже начатую оплату"

    async with async_session_maker() as db:
        row = (await db.execute(select(StudioFeatureFlag).where(
            StudioFeatureFlag.studio_id == ids["studio"]))).scalar_one()
        row.is_enabled = True
        await db.commit()


# ─── Статические свойства ────────────────────────────────────────────────────

def test_payment_url_comes_only_from_the_server():
    """Адрес оплаты собирает платёжный домен и никто больше."""
    import inspect

    for module in (agent_search, response_plan, __import__(
            "services.response_render", fromlist=["x"])):
        source = inspect.getsource(module)
        assert "checkout.stripe.com" not in source, module.__name__
        assert "stripe.checkout" not in source, module.__name__
    # План несёт готовую ссылку, а не составляет её.
    assert "payment_url" in inspect.getsource(response_plan.ResponsePlan)


def test_only_one_place_creates_a_booking_session():
    """Форму оплаты записи заводит ровно одна функция продукта."""
    import ast
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1]
    callers = []
    for path in list(root.glob("services/*.py")) + list(root.glob("routers/**/*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == "create_hosted_checkout_session"):
                callers.append(str(path.relative_to(root)).replace("\\", "/"))
    assert sorted(set(callers)) == [
        "routers/booking/miniapp_users.py",     # покупка абонемента клиентом
        "services/booking_payment.py",          # оплата занятия (P4)
    ], callers


def test_expire_is_an_operation_not_a_local_decision():
    """Освобождение места идёт только через ответ Stripe."""
    import inspect

    source = inspect.getsource(booking_payment._resolve)
    assert "expire_session" in source
    # НИ ОДНОГО освобождения места до того, как состояние формы прочитано у
    # Stripe: локальный срок не доказывает, что денег не было.
    head = source[:source.index("fetch_session")]
    assert "_release(" not in head, head


def test_sweeper_is_not_behind_a_feature_flag():
    """В проходе разбора нет ни одного обращения к флагам."""
    import inspect

    from workers import main as worker

    source = inspect.getsource(worker._watch_stale_holds)
    assert "feature_flags" not in source and "is_enabled" not in source
    assert "sweep" in source
    assert "feature_flags" not in inspect.getsource(booking_payment.sweep)
    assert "feature_flags" not in inspect.getsource(booking_payment._resolve)


def test_terms_have_one_definition():
    """«Условия изменились» определено один раз — и для записи, и для оплаты."""
    import inspect

    assert "lesson_part" in inspect.getsource(booking.material_change)
    assert "lesson_part_now" in inspect.getsource(booking_payment.settle)
    assert "lesson_part_now" in inspect.getsource(booking_payment.unfulfillable_reason)


def test_a_hold_can_never_be_called_a_booking():
    """Ни одна ветка не имеет права сказать «вы записаны» про удержанное место.

    Обычно про удержанное место отвечает платёжный ход. Но запрет не должен
    держаться на том, что он всегда успевает: место под неоплаченную бронь —
    это не запись, и таблица формулировок обязана знать об этом сама.
    """
    from services import response_render

    for status, forbidden in (("hold", True), ("pending", True), ("active", False)):
        plan = response_plan.build_booking(
            booking.Result(booking.Outcome.OK, 1, status, None))
        text = response_render.render(plan, lang="ru")["text"].lower()
        assert ("записаны" not in text) is forbidden, (status, text)


def test_event_of_the_wrong_mode_is_dropped():
    """Событие тестового режима не закрывает боевую заявку, и наоборот.

    Обычно такое событие не проходит подпись — секреты у режимов разные. Но
    «обычно» про деньги не аргумент: разъехавшийся секрет вебхука превращает
    тестовую оплату в проведённую боевую продажу, и наоборот.
    """
    import asyncio as _asyncio

    from routers.checkout import stripe_pay
    from services import stripe_env

    class _Event(dict):
        livemode = True

    class _Req:
        headers = {"stripe-signature": "sig"}

        async def body(self):
            return b"{}"

    class _Obj(dict):
        payment_status = "paid"

    obj = _Obj(id="cs_x")
    event = _Event({"type": "checkout.session.completed", "data": {"object": obj}})

    applied: list = []

    async def _never(*a, **k):
        applied.append(a)
        return True

    saved = (stripe_connect.parse_webhook, stripe_pay.apply_paid,
             stripe_env.expects_livemode)
    stripe_connect.parse_webhook = lambda *_a, **_k: event
    stripe_pay.apply_paid = _never
    # Ключ платформы — тестовый, событие — боевое.
    stripe_env.expects_livemode = lambda: False
    try:
        assert _asyncio.run(stripe_pay.stripe_webhook(_Req())) == {"status": "ignored"}
        assert applied == [], "событие чужого режима дошло до проведения"
        # …а совпадающий режим проходит как обычно.
        stripe_env.expects_livemode = lambda: True
        assert _asyncio.run(stripe_pay.stripe_webhook(_Req())) == {"status": "ok"}
        assert len(applied) == 1
    finally:
        (stripe_connect.parse_webhook, stripe_pay.apply_paid,
         stripe_env.expects_livemode) = saved


# ─── Один прогон ─────────────────────────────────────────────────────────────

def test_booking_saga_against_the_database():
    async def run():
        ids = await _seed()
        try:
            who = await _verified(ids)
            for step in (_journey, _one_live_form, _concurrent_confirms,
                         _lost_response, _complete_is_not_paid, _wrong_payment,
                         _lesson_moved, _lesson_cancelled, _expiry,
                         _paid_after_release, _double_payment,
                         _discount_reaches_stripe, _price_changed,
                         _attempt_window_rolls,
                         _refund, _seat_given_without_payment,
                         _disabled_client, _flag_off,
                         _revoked_cannot_start):
                await step(ids, who)
                await _wipe(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_payment_url_comes_only_from_the_server()
    test_only_one_place_creates_a_booking_session()
    test_expire_is_an_operation_not_a_local_decision()
    test_sweeper_is_not_behind_a_feature_flag()
    test_terms_have_one_definition()
    test_booking_saga_against_the_database()
    print("booking saga ok")

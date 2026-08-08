"""Вебхук Stripe по подписке на Velora — единственный источник истины о её состоянии.

Публичный, без JWT (Stripe наш токен не носит) и без гейта подписки: просроченный
тариф не повод потерять оплату, которой его и продлевают.

Порядок строгий: подпись → отбросить чужой аккаунт → найти подписку студии →
зеркалировать. На валидное событие ВСЕГДА 200 — 4xx/5xx заставит Stripe ретраить,
а обработка уже прошла (тот же принцип, что в вебхуке кассы).
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import async_session_maker
from models import StudioBillingPlan, BillingInvoice, PaymentCard, StudioMember
from services import stripe_billing
from .plans import PLANS

logger = logging.getLogger(__name__)
router = APIRouter()

# Статус подписки у Stripe → наш, который читает пейволл.
# past_due остаётся отдельным: перевод по IBAN идёт 1-2 дня, и всё это время
# подписка именно в нём. Отрубать студию за деньги в пути нельзя, поэтому гейт
# его пускает — в отличие от unpaid/canceled.
_STATUS_MAP = {
    "active": "active",
    "trialing": "active",
    "past_due": "past_due",
    "incomplete": "pending",
    "unpaid": "expired",
    "canceled": "expired",
    "incomplete_expired": "expired",
}

_INVOICE_STATUS = {
    "invoice.paid": "paid",
    "invoice.payment_failed": "failed",
}


def map_subscription_status(stripe_status: str) -> str:
    """Неизвестный статус трактуем как expired, а не как active: ошибиться в
    сторону «не пустить» безопаснее, чем раздать тариф бесплатно."""
    return _STATUS_MAP.get(stripe_status, "expired")


def _customer_id(obj) -> str | None:
    """id клиента из события. Строкой или объектом — как и подписка."""
    customer = getattr(obj, "customer", None)
    if isinstance(customer, str):
        return customer
    return getattr(customer, "id", None) if customer is not None else None


async def find_plan_by_subscription(
    db: AsyncSession, subscription_id: str | None, customer_id: str | None = None,
) -> StudioBillingPlan | None:
    """Подписка студии по её id у Stripe, с привязкой по клиенту при первой встрече.

    Основной ключ — stripe_subscription_id: он уникален и однозначен.

    Но у КАРТОЧНОЙ первой оплаты его взяться неоткуда: Checkout Session отдаёт
    только ссылку, сама подписка появляется у Stripe уже после того, как владелец
    заплатил. Поэтому здесь есть второй заход — по stripe_customer_id, который мы
    сохраняем ДО похода в Stripe. Найдя студию по клиенту, тут же записываем ей
    subscription_id: дальше работает быстрый путь.

    Без этого запасного пути карточные оплаты не привязывались бы никогда, а каждый
    следующий клик по «Оплатить» заводил бы студии ещё одну живую подписку.
    """
    if subscription_id:
        plan = (await db.execute(
            select(StudioBillingPlan).where(
                StudioBillingPlan.stripe_subscription_id == subscription_id
            )
        )).scalar_one_or_none()
        if plan is not None:
            return plan

    if not customer_id:
        return None

    plan = (await db.execute(
        select(StudioBillingPlan).where(
            StudioBillingPlan.stripe_customer_id == customer_id
        )
    )).scalar_one_or_none()
    # Перепривязываем не только пустую ссылку, но и НЕ ЖИВУЮ: студия с брошенной
    # incomplete-подпиской, оформившая оплату заново, получает у Stripe новый
    # объект. Оставить указатель на старый значит отправлять следующую смену тарифа
    # в мёртвую подписку (502) при том, что статус зеркалится уже с новой.
    # Живую (active/past_due) НЕ трогаем — иначе отставшее событие об отменённой
    # подписке перебило бы актуальную привязку.
    stale = plan is not None and plan.status not in ("active", "past_due")
    if plan is not None and subscription_id and (not plan.stripe_subscription_id or stale):
        plan.stripe_subscription_id = subscription_id
        logger.info(
            "Stripe billing: подписка %s привязана к студии %s по клиенту %s",
            subscription_id, plan.studio_id, customer_id,
        )
    return plan


def _subscription_id(obj) -> str | None:
    """id подписки из счёта. В разных версиях API поле лежит то строкой в
    `subscription`, то объектом, то в `parent.subscription_details`."""
    sub = getattr(obj, "subscription", None)
    if isinstance(sub, str):
        return sub
    if sub is not None:
        return getattr(sub, "id", None)
    parent = getattr(obj, "parent", None)
    details = getattr(parent, "subscription_details", None) if parent else None
    detail_sub = getattr(details, "subscription", None) if details else None
    return detail_sub if isinstance(detail_sub, str) else getattr(detail_sub, "id", None)


def _period_end(subscription) -> int | None:
    """Конец оплаченного периода. У Subscription этого поля БОЛЬШЕ НЕТ — с API
    2026-07-29 оно переехало на позицию (`SubscriptionItem.current_period_end`),
    тем же поколением, что перенесло invoice.subscription в parent.subscription_details.

    Плоское поле оставлено вторым шагом на случай отката версии API.
    """
    items = getattr(subscription, "items", None)
    data = getattr(items, "data", None) if items is not None else None
    if data:
        end = getattr(data[0], "current_period_end", None)
        if end:
            return end
    return getattr(subscription, "current_period_end", None)


async def mirror_invoice(
    db: AsyncSession, plan: StudioBillingPlan, stripe_invoice,
) -> BillingInvoice:
    """Зеркало счёта Stripe в нашей БД (upsert по stripe_invoice_id).

    Идемпотентность держится на уникальном stripe_invoice_id: ретрай вебхука
    находит существующую строку, а не заводит вторую.
    """
    stripe_id = stripe_invoice["id"]
    row = (await db.execute(
        select(BillingInvoice).where(BillingInvoice.stripe_invoice_id == stripe_id)
    )).scalar_one_or_none()

    metadata = getattr(stripe_invoice, "metadata", None)
    if not getattr(metadata, "plan", None):
        # У автогенерируемых счетов цикла подписки метаданных на верхнем уровне НЕТ —
        # Stripe кладёт их в parent.subscription_details.metadata, а не в invoice.metadata.
        # Без этого фолбэка period_months навсегда пинится к 1 на каждом продлении.
        parent = getattr(stripe_invoice, "parent", None)
        details = getattr(parent, "subscription_details", None) if parent else None
        metadata = getattr(details, "metadata", None) or metadata
    plan_name = getattr(metadata, "plan", None) if metadata is not None else None
    period = getattr(metadata, "period_months", None) if metadata is not None else None

    fields = dict(
        studio_id=plan.studio_id,
        plan_name=plan_name or plan.plan_name,
        period_months=int(period) if period else 1,
        amount=getattr(stripe_invoice, "amount_due", 0) or 0,
        payment_method="iban" if getattr(stripe_invoice, "collection_method", "") == "send_invoice" else "card",
        hosted_invoice_url=getattr(stripe_invoice, "hosted_invoice_url", None),
        pdf_url=getattr(stripe_invoice, "invoice_pdf", None),
    )

    if row is None:
        row = BillingInvoice(stripe_invoice_id=stripe_id, status="pending", **fields)
        db.add(row)
        await db.flush()
    else:
        for key, value in fields.items():
            # Ссылки на PDF Stripe заполняет при финализации, а не в каждом событии;
            # 0/None/"" из усечённого события не должны затирать уже верное значение
            # (иначе ретрай без amount_due обнуляет уже правильную сумму счёта).
            if value not in (None, "", 0):
                setattr(row, key, value)
    return row


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Колбэк Stripe по подписке на тариф."""
    event = stripe_billing.parse_webhook(
        await request.body(), request.headers.get("stripe-signature", ""),
    )
    if event is None:
        return {"status": "ignored"}

    # Тариф платят ПЛАТФОРМЕ, и событий подключённых аккаунтов тут быть не может.
    # У них заполнено `account`, а объекты на своём аккаунте создаёт его владелец —
    # без этой проверки студия выписывала бы себе оплаченный счёт, заплатив ту же
    # сумму самой себе (деньги садятся на её же баланс). Та же проверка живёт в
    # кассе: checkout/stripe_pay.py, apply_paid.
    connected = getattr(event, "account", None)
    if connected:
        logger.warning("Stripe billing: событие подключённого аккаунта %s отброшено", connected)
        return {"status": "ignored"}

    # У StripeObject (stripe 15.x) НЕТ метода .get() — это не dict. Обращение к
    # возможно отсутствующему полю только через getattr с дефолтом, иначе
    # AttributeError роняет хендлер в 500, и Stripe трое суток ретраит впустую.
    obj = event["data"]["object"]
    event_type = event["type"]

    async with async_session_maker() as db:
        try:
            if event_type.startswith("customer.subscription."):
                await _handle_subscription(db, event_type, obj)
            elif event_type.startswith("invoice."):
                await _handle_invoice(db, event_type, obj)
            elif event_type == "charge.refunded":
                await _handle_refund(db, obj)
        except Exception:
            # Всегда 200: 4xx/5xx заставит Stripe ретраить, а гонка двух параллельных
            # доставок одного события (unique на stripe_invoice_id/stripe_subscription_id)
            # — штатный исход, который чинит следующий ретрай того же события.
            logger.exception("Stripe billing: событие %s не обработано", event_type)

    return {"status": "ok"}


async def _handle_subscription(db: AsyncSession, event_type: str, obj) -> None:
    """Зеркалирование статуса и срока подписки."""
    plan = await find_plan_by_subscription(db, obj["id"], _customer_id(obj))
    if plan is None:
        logger.info("Stripe billing: подписка %s не привязана к студии", obj["id"])
        return

    if event_type == "customer.subscription.deleted":
        plan.status = "expired"
        # Гейт (dependencies.py) смотрит на дату, а не только на статус: без
        # прижатия студия вернула бы деньги и доработала период бесплатно.
        plan.expires_at = datetime.utcnow()
        # Ссылку на мёртвую подписку снимаем, иначе повторное оформление оставит
        # план указывающим на отменённый объект: привязка по клиенту пропустит
        # запись (id ещё truthy), а следующая смена тарифа уйдёт в несуществующую
        # подписку и вернёт 502.
        plan.stripe_subscription_id = None
    else:
        plan.status = map_subscription_status(getattr(obj, "status", ""))
        if plan.status == "expired":
            plan.expires_at = datetime.utcnow()
        elif plan.status in ("active", "past_due"):
            period_end = _period_end(obj)
            if period_end:
                plan.expires_at = datetime.utcfromtimestamp(period_end)
            else:
                logger.error(
                    "Stripe billing: не удалось прочитать конец периода подписки %s — "
                    "expires_at не обновлён, студия рискует получить 402 при живой оплате",
                    obj["id"],
                )
        # `pending` (incomplete): Stripe проставляет период ЕЩЁ ДО того, как деньги
        # прошли — SCA не пройден, карта не списана. Двигать expires_at здесь значит
        # выдать оплаченный период неоплатившему: гейт (dependencies.py) смотрит на дату.

    await db.commit()


async def _handle_invoice(db: AsyncSession, event_type: str, obj) -> None:
    """Зеркалирование счёта и его статуса.

    Сумму с нашим расчётом НЕ сверяем: её считает Stripe по Price, Stripe Tax и
    прорейтингу, и `amount_for()` о них не знает. Защита от чужого события — в том,
    что подписка из счёта обязана принадлежать студии в нашей БД, а Price заведён
    нами (services/stripe_catalog.py).
    """
    plan = await find_plan_by_subscription(db, _subscription_id(obj), _customer_id(obj))
    if plan is None:
        logger.info("Stripe billing: счёт %s не привязан к подписке студии", obj["id"])
        return

    currency = getattr(obj, "currency", None)
    if currency is not None and str(currency).lower() != stripe_billing.CURRENCY:
        logger.error(
            "Stripe billing: валюта счёта %s не сходится — пришло %s, ожидалось %s",
            obj["id"], currency, stripe_billing.CURRENCY,
        )
        return

    invoice = await mirror_invoice(db, plan, obj)

    status = _INVOICE_STATUS.get(event_type)
    if status is not None:
        await apply_status(db, invoice, status)
    else:
        await db.commit()


async def _handle_refund(db: AsyncSession, obj) -> None:
    """Возврат. Полный — переводит счёт в refunded и отменяет подписку, частичный
    (или без сумм в событии) не трогает ни счёт, ни подписку.

    Отмену делает Stripe по нашему запросу, а статус в БД подвинет пришедшее следом
    `customer.subscription.deleted` — сами его тут не проставляем, чтобы переход был
    один и тот же независимо от того, откуда пришёл возврат.
    """
    intent = getattr(obj, "payment_intent", None)
    intent_id = intent if isinstance(intent, str) else getattr(intent, "id", None)
    stripe_invoice_id = getattr(obj, "invoice", None)
    stripe_invoice_id = (
        stripe_invoice_id if isinstance(stripe_invoice_id, str)
        else getattr(stripe_invoice_id, "id", None)
    )
    if not stripe_invoice_id:
        logger.info("Stripe billing: возврат %s не привязан к счёту", intent_id)
        return

    invoice = (await db.execute(
        select(BillingInvoice).where(BillingInvoice.stripe_invoice_id == stripe_invoice_id)
    )).scalar_one_or_none()
    if invoice is None:
        return

    # Сумму сверяем ДО перевода счёта в refunded — он конечный (apply_status), и
    # частичный возврат не должен НЕОБРАТИМО потерять счёт. Событие без сумм
    # (amount=0, дефолт getattr) тоже не читаем как «вернули всё»: 0 < 0 иначе
    # ложно попадает в ветку полного возврата и отменяет платящую студию.
    amount = getattr(obj, "amount", 0) or 0
    refunded = getattr(obj, "amount_refunded", 0) or 0
    if not amount or refunded < amount:
        logger.info(
            "Stripe billing: частичный или без сумм возврат по счёту %s, счёт и подписку не трогаем",
            invoice.id,
        )
        return

    await apply_status(db, invoice, "refunded")

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
    )).scalar_one_or_none()
    if plan and plan.stripe_subscription_id:
        try:
            await stripe_billing.cancel_subscription(plan.stripe_subscription_id)
        except Exception:
            logger.exception("Stripe billing: не удалось отменить подписку %s", plan.stripe_subscription_id)


async def apply_status(
    db: AsyncSession, invoice: BillingInvoice, status: str, *, subscription=None,
) -> bool:
    """Переводит счёт в статус, подтверждённый Stripe. True — если что-то изменилось.

    Общая точка вебхука и ручной сверки (POST /invoices/{id}/sync): переход один и
    тот же, откуда бы правда ни пришла. Идемпотентно — повтор конечного статуса по
    уже переведённому счёту ничего не делает, поэтому ретраи Stripe не начисляют
    тариф дважды.
    """
    if invoice.status == status:
        return False
    # Оплаченный счёт назад в failed не роняем: событие о неудачной попытке может
    # прийти уже ПОСЛЕ успешной оплаты другим способом.
    if invoice.status == "paid" and status == "failed":
        return False
    # Возврат — конечное состояние. Без этой строки ручная сверка по возвращённому
    # счёту начисляла бы период второй раз — уже без денег.
    if invoice.status == "refunded":
        return False

    if status == "paid":
        invoice.status = "paid"
        invoice.paid_at = datetime.utcnow()
        await _activate(db, invoice)
    elif status in ("failed", "refunded"):
        invoice.status = status
    else:
        return False

    await db.commit()

    # Поход в Stripe — ТОЛЬКО после коммита. Внутри транзакции он держал бы блокировки
    # строк всё время синхронного запроса, а Stripe бросает вебхук примерно на 20-й
    # секунде и ретраит: каждый ретрай упирался бы в те же блокировки. Срок периода к
    # этому моменту уже зеркалит customer.subscription.updated (_handle_subscription,
    # сети не требует), так что здесь остаётся только маска карты — не настолько
    # критичная, чтобы платить за неё блокировками строк.
    if status == "paid":
        plan = (await db.execute(
            select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
        )).scalar_one_or_none()
        if plan and plan.stripe_subscription_id:
            await _sync_card(db, plan, subscription)
            await db.commit()
        # Чек владельцу — тоже после коммита и тоже не роняет обработку: тариф уже
        # оплачен, и упавший SMTP не повод отдать Stripe 500 и получить ретрай уже
        # применённого события (send_receipt глотает свои ошибки сам).
        # Импорт локальный: модуль тянет notifier, а тот — половину моделей.
        from services.billing_mail import send_receipt

        await send_receipt(db, invoice)

    return True


async def _activate(db: AsyncSession, invoice: BillingInvoice) -> None:
    """paid → тариф и лимиты студии по оплаченному счёту.

    Срок (`expires_at`) здесь НЕ считаем: его ставит зеркало подписки из
    `current_period_end` (_handle_subscription). Своей арифметики периодов больше нет.
    Карту (Stripe round-trip) сюда тоже не зовём — это сделает apply_status ПОСЛЕ
    commit, вне пишущей транзакции (см. её комментарий).
    """
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == invoice.studio_id)
    )).scalar_one_or_none()
    if plan is None:
        return

    plan.status = "active"
    if invoice.plan_name in PLANS:
        plan.plan_name = invoice.plan_name
        limits = PLANS[invoice.plan_name]["limits"]
        plan.max_staff = limits["staff"] or 9999  # None (business) = безлимит


async def _sync_card(
    db: AsyncSession, plan: StudioBillingPlan, subscription=None,
) -> None:
    """Маска карты из Stripe. Вызывается ПОСЛЕ commit (см. apply_status) — вне
    пишущей транзакции, чтобы синхронный запрос к Stripe не держал блокировки строк.

    `subscription` — передаётся, если вызывающая сторона его уже получила (раскрытым,
    с `default_payment_method`); иначе фетчим сами. Сбой запроса не роняет активацию —
    тариф уже оплачен, карта — только удобство для кнопки «Продлить».
    """
    if subscription is None:
        try:
            subscription = await stripe_billing.fetch_subscription(plan.stripe_subscription_id)
        except Exception:
            logger.exception("Stripe billing: не удалось прочитать подписку %s", plan.stripe_subscription_id)
            return

    method = getattr(subscription, "default_payment_method", None)
    card = getattr(method, "card", None) if method else None
    if card is None:
        return

    # Карту привязываем к владельцу студии — единственному, кому доступны эндпоинты
    # биллинга (require_role("owner") в routers/billing/router.py). Счета студии
    # заводит владелец (user_id ставится в checkout.py), но не заводит вебхук —
    # автопродление на второй/третий период идёт без похода через checkout.py, и
    # искать «последний счёт с user_id» там было бы либо мимо (пусто), либо мимо
    # цели (случайный чужой счёт).
    owner_id = (await db.execute(
        select(StudioMember.user_id).where(
            StudioMember.studio_id == plan.studio_id,
            StudioMember.role == "owner",
            StudioMember.status == "active",
        )
    )).scalars().first()
    if owner_id is None:
        return

    row = (await db.execute(
        select(PaymentCard).where(PaymentCard.user_id == owner_id)
    )).scalar_one_or_none()
    fields = dict(
        card_last4=getattr(card, "last4", "") or "----",
        card_brand=getattr(card, "brand", "card"),
        card_expiry=f"{getattr(card, 'exp_month', 0):02d}/{str(getattr(card, 'exp_year', 0))[-2:]}",
        rectoken=method.id,
        stripe_customer_id=plan.stripe_customer_id,
        method_type="card",
    )
    if row is None:
        db.add(PaymentCard(user_id=owner_id, cardholder_name="", is_primary=True, **fields))
    else:
        for key, value in fields.items():
            setattr(row, key, value)


if __name__ == "__main__":
    import asyncio
    import types

    # Маппинг статусов: неизвестный трактуется как expired, а не как active.
    assert map_subscription_status("active") == "active"
    assert map_subscription_status("trialing") == "active"
    assert map_subscription_status("past_due") == "past_due"
    assert map_subscription_status("canceled") == "expired"
    assert map_subscription_status("unpaid") == "expired"
    assert map_subscription_status("что-то новое") == "expired"
    # incomplete → pending: _handle_subscription обязан НЕ двигать по нему expires_at
    # (SCA не пройден, денег ещё нет) — сам маппинг это не проверяет, но это условие
    # (`elif plan.status in ("active", "past_due")`) держится именно на этом значении.
    assert map_subscription_status("incomplete") == "pending"

    # Конец периода читается у ПОЗИЦИИ: у Subscription этого поля больше нет
    # (stripe 15.4.0 / API 2026-07-29-dahlia).
    _item = types.SimpleNamespace(current_period_end=1800000000)
    _sub = types.SimpleNamespace(items=types.SimpleNamespace(data=[_item]))
    assert _period_end(_sub) == 1800000000
    # Плоское поле — фолбэк на случай отката версии API.
    assert _period_end(types.SimpleNamespace(items=None, current_period_end=123)) == 123
    # Нет ни того ни другого — None, и вызывающая сторона обязана залогировать, не молчать.
    assert _period_end(types.SimpleNamespace(items=None)) is None

    # apply_status: ветки без похода в БД — повтор конечного статуса, откат paid, мусор.
    _fake_db = types.SimpleNamespace(commit=lambda: asyncio.sleep(0))
    _inv = lambda status: types.SimpleNamespace(status=status)  # noqa: E731

    assert asyncio.run(apply_status(_fake_db, _inv("paid"), "paid")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("refunded"), "refunded")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("failed"), "failed")) is False
    assert asyncio.run(apply_status(_fake_db, _inv("pending"), "processing")) is False

    _declined = _inv("pending")
    assert asyncio.run(apply_status(_fake_db, _declined, "failed")) is True
    assert _declined.status == "failed"

    # Неудачная попытка не должна обнулять уже прошедшую оплату.
    _paid = _inv("paid")
    assert asyncio.run(apply_status(_fake_db, _paid, "failed")) is False
    assert _paid.status == "paid"

    # Возврат конечен: сверка по возвращённому счёту не начисляет период второй раз.
    _returned = _inv("refunded")
    assert asyncio.run(apply_status(_fake_db, _returned, "paid")) is False
    assert _returned.status == "refunded"

    # id подписки достаётся из всех трёх форм, которыми его отдаёт Stripe.
    assert _subscription_id(types.SimpleNamespace(subscription="sub_1")) == "sub_1"
    assert _subscription_id(
        types.SimpleNamespace(subscription=types.SimpleNamespace(id="sub_2"))
    ) == "sub_2"
    assert _subscription_id(
        types.SimpleNamespace(
            subscription=None,
            parent=types.SimpleNamespace(
                subscription_details=types.SimpleNamespace(subscription="sub_3"),
            ),
        )
    ) == "sub_3"
    assert _subscription_id(types.SimpleNamespace(subscription=None, parent=None)) is None

    # id клиента — тоже строкой или объектом, тот же паттерн, что у подписки.
    # Это запасной путь линковки первой карточной оплаты (find_plan_by_subscription).
    assert _customer_id(types.SimpleNamespace(customer="cus_1")) == "cus_1"
    assert _customer_id(types.SimpleNamespace(customer=types.SimpleNamespace(id="cus_2"))) == "cus_2"
    assert _customer_id(types.SimpleNamespace(customer=None)) is None

    assert "/webhook/stripe" in [r.path for r in router.routes]
    print("billing webhook self-check ok")

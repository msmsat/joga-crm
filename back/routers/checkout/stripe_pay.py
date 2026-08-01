"""Оплата картой в кассе через Stripe Connect: деньги идут НА СЧЁТ СТУДИИ.

Поток: касса зовёт POST /checkout/session → мы кладём заявку (StripeCheckout,
status=pending) и отдаём client_secret → форма Stripe рисуется в модалке Velora
(embedded checkout, без ухода со страницы) → оплата проводится в CRM ровно один
раз, кто бы ни сообщил о ней первым:

  * вебхук `checkout.session.completed` — основной путь, работает и если вкладку
    закрыли сразу после оплаты;
  * POST /checkout/confirm из onComplete модалки — страховка на дев-машине,
    где `stripe listen` не запущен.

Оба зовут `apply_paid`, где идемпотентность держится на строке заявки под
`FOR UPDATE`: второй пришедший видит status != pending и ничего не делает.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import async_session_maker, get_db
from dependencies import get_current_user, require_role, StudioContext
from models import OnlineChannel, StripeCheckout, Studio, User
from schemas.checkout import (
    CheckoutConfirmRequest, CheckoutConfirmResult, CheckoutPayRequest, CheckoutSessionResult,
)
from services import stripe_connect

from .router import _get_client_package, _quote, perform_pay, resolve_account

logger = logging.getLogger(__name__)

# `completed` — обычная карта. `async_payment_succeeded` — отложенные методы
# (банковский перевод, SEPA): у них completed приходит ещё неоплаченным, и без
# второго типа события такая оплата не провелась бы в CRM никогда.
_PAID_EVENTS = ("checkout.session.completed", "checkout.session.async_payment_succeeded")
# Денег не будет: форма протухла или банк отказал по отложенному методу.
_DEAD_EVENTS = ("checkout.session.expired", "checkout.session.async_payment_failed")

# Один и тот же ответ поднимают apply_paid и confirm — деньги у Stripe, продажи в
# CRM нет. Фронт ловит код и показывает кассиру «не платите второй раз».
_NOT_APPLIED = {
    "code": "checkout.paid_not_applied",
    "message": "Оплата прошла у Stripe, но не проведена в CRM — проверьте условия продажи",
}

router = APIRouter(prefix="/checkout")
# Вебхук монтируется в main.py отдельно и БЕЗ гейта подписки: Stripe не носит наш
# JWT, а деньги клиента уже списаны — просроченный тариф студии не повод их потерять.
webhook_router = APIRouter(prefix="/checkout")

# Валюта студии не задана только если онбординг не доводили до конца.
_FALLBACK_CURRENCY = "CZK"


async def _connected_account(db: AsyncSession, studio_id: int) -> str:
    """acct_… студии или 400 с внятной причиной, почему картой нельзя."""
    channel = (await db.execute(
        select(OnlineChannel).where(
            OnlineChannel.studio_id == studio_id,
            OnlineChannel.channel_type == "stripe",
        )
    )).scalar_one_or_none()

    if channel is None or not channel.account_id:
        raise HTTPException(status_code=400, detail={
            "code": "checkout.stripe_not_connected",
            "message": "Stripe не подключён — сделайте это в Финансы → Онлайн-платежи",
        })
    if not channel.is_active:
        raise HTTPException(status_code=400, detail={
            "code": "checkout.stripe_disabled",
            "message": "Приём оплат через Stripe выключен",
        })

    # Лишний запрос к Stripe на старте оплаты окупается: без него незавершённая
    # верификация роняет создание сессии с невнятным «Stripe отклонил запрос»,
    # и кассир не понимает, что делать. Stripe недоступен — не блокируем, пусть
    # падает дальше по общему пути.
    try:
        charges_enabled, _submitted, _due = await stripe_connect.account_status(channel.account_id)
    except Exception:
        logger.exception("Stripe: не удалось проверить готовность аккаунта %s", channel.account_id)
    else:
        if not charges_enabled:
            raise HTTPException(status_code=400, detail={
                "code": "checkout.stripe_not_ready",
                "message": "Stripe ещё не разрешил приём платежей — завершите настройку в Финансы → Онлайн-платежи",
            })

    return channel.account_id


@router.post("/session", response_model=CheckoutSessionResult)
async def create_session(
    body: CheckoutPayRequest,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ссылка на оплату картой. Деньги в CRM ещё не двигаются и бонусы не
    списываются — только после подтверждения от Stripe (иначе брошенная на
    полпути оплата съедала бы бонусы клиента)."""
    # Публичный ключ проверяем наравне с секретным: без него форма во фронте не
    # инициализируется, и владелец увидел бы пустую модалку вместо причины.
    if not stripe_connect.configured() or not stripe_connect.PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail={
            "code": "checkout.stripe_not_configured",
            "message": "Приём оплат через Stripe не настроен на сервере",
        })

    account_id = await _connected_account(db, ctx.studio_id)
    # Счёт проверяем ДО ухода в Stripe: после списания эта же проверка упала бы
    # уже в вебхуке, когда деньги клиента забраны, а провести их некуда.
    await resolve_account(db, ctx.studio_id, body.account_id)
    _client, package = await _get_client_package(
        db, ctx.studio_id, body.client_id, body.product_id, body.product_type,
    )
    quote = await _quote(
        db, ctx.studio_id, body.client_id, package,
        body.product_type, body.promo_code, body.use_bonuses,
        body.use_deposit, body.certificate_code,
    )
    if quote.total_price <= 0:
        raise HTTPException(status_code=400, detail={
            "code": "checkout.nothing_to_pay",
            "message": "Оплачивать нечего — сумма уже покрыта",
        })

    studio = (await db.execute(select(Studio).where(Studio.id == ctx.studio_id))).scalar_one()
    currency = studio.currency or _FALLBACK_CURRENCY

    try:
        session_id, client_secret = await stripe_connect.create_checkout_session(
            account_id=account_id,
            amount_minor=stripe_connect.to_minor_units(quote.total_price, currency),
            currency=currency,
            description=package.name,
            metadata={"studio_id": str(ctx.studio_id), "client_id": str(body.client_id)},
        )
    except Exception as exc:
        logger.exception("Stripe: не удалось создать сессию оплаты для студии %s", ctx.studio_id)
        raise HTTPException(status_code=502, detail={
            "code": "checkout.stripe_error", "message": "Stripe отклонил запрос",
        }) from exc

    db.add(StripeCheckout(
        studio_id=ctx.studio_id,
        user_id=current_user.id,
        session_id=session_id,
        account_id=account_id,
        payload=body.model_dump(mode="json"),
        amount=quote.total_price,
    ))
    await db.commit()

    return CheckoutSessionResult(
        client_secret=client_secret,
        session_id=session_id,
        publishable_key=stripe_connect.PUBLISHABLE_KEY,
        account_id=account_id,
    )


async def apply_paid(db: AsyncSession, session_id: str, *, account_id: str | None = None) -> bool:
    """Провести оплату по заявке ровно один раз. True — провели именно сейчас.

    `with_for_update` держит строку до конца транзакции: вебхук и возврат на
    success_url прилетают одновременно, и без блокировки оба увидели бы pending
    и начислили абонемент дважды.

    `account_id` (из поля `account` события Connect) сверяем с заявкой: на наш
    единственный эндпоинт сыплются события ВСЕХ подключённых аккаунтов, и заявку
    одной студии не должно закрывать событие другой.
    """
    # populate_existing обязателен вместе с блокировкой: в /confirm заявка уже
    # загружена в ЭТУ же сессию, и без него ORM вернёт объект из identity map со
    # старым status='pending' — строка блокируется, а решение принимается по
    # устаревшему значению, и оплата проводится вторым абонементом.
    checkout = (await db.execute(
        select(StripeCheckout).where(StripeCheckout.session_id == session_id)
        .with_for_update().execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if checkout is None:
        logger.info("Stripe: заявка на оплату не найдена, session=%s", session_id)
        return False
    if account_id is not None and checkout.account_id != account_id:
        logger.warning(
            "Stripe: событие с чужого аккаунта %s по заявке %s (ожидался %s)",
            account_id, session_id, checkout.account_id,
        )
        return False
    if checkout.status != "pending":
        return False

    # Пометка и проведение уходят одним commit'ом внутри perform_pay: упало
    # проведение — откатилась и пометка, заявка снова pending и повтор сработает.
    checkout.status = "paid"
    try:
        result = await perform_pay(
            db, checkout.studio_id, checkout.user_id,
            CheckoutPayRequest.model_validate(checkout.payload), method="stripe",
        )
    except HTTPException as exc:
        # Деньги у Stripe УЖЕ списаны, а бизнес-правило отвергло проведение:
        # сертификат погасили в другом окне, промокод кончился, пакет сняли с
        # продажи. Ретрай это не починит, а молча оставить заявку pending значит
        # потерять оплату без следа — гасим её как failed и кричим в лог.
        #
        # Ловим только HTTPException: сбой БД/сети — повод как раз ретраить,
        # поэтому он летит наверх и Stripe придёт ещё раз.
        await db.rollback()
        marked = (await db.execute(
            update(StripeCheckout)
            .where(StripeCheckout.session_id == session_id, StripeCheckout.status == "pending")
            .values(status="failed")
        )).rowcount
        await db.commit()
        if not marked:
            # Заявка уже не pending — значит оплата прошла, а упало что-то после
            # commit'а (например уведомления). Деньги на месте, тревога не нужна.
            logger.exception("Stripe: сбой ПОСЛЕ проведения оплаты, session=%s", session_id)
            return True
        logger.error(
            "Stripe: оплата session=%s списана, но не проведена в CRM (%s) — разбор вручную",
            session_id, exc.detail,
        )
        raise HTTPException(status_code=409, detail=_NOT_APPLIED) from exc

    # ponytail: цена пересчитывается на момент проведения, а списали её на момент
    # создания сессии. Разойтись они могут, только если между этим у клиента
    # потратили бонусы/депозит в другом окне — тогда в Финансах осядет не та сумма.
    # Лечится снимком цены в заявке; пока — предупреждение в логе.
    if result.total_price != checkout.amount:
        logger.warning(
            "Stripe: сумма разошлась, session=%s списано=%s проведено=%s",
            session_id, checkout.amount, result.total_price,
        )
    return True


@router.post("/confirm", response_model=CheckoutConfirmResult)
async def confirm(
    body: CheckoutConfirmRequest,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Возврат кассира с оплаты. Факт оплаты подтверждает Stripe, а не фронт:
    session_id виден в адресной строке, и на слово ему верить нельзя."""
    checkout = (await db.execute(
        select(StripeCheckout).where(
            StripeCheckout.session_id == body.session_id,
            StripeCheckout.studio_id == ctx.studio_id,
        )
    )).scalar_one_or_none()
    if checkout is None:
        raise HTTPException(status_code=404, detail={
            "code": "checkout.session_not_found", "message": "Оплата не найдена",
        })

    if checkout.status == "pending" and await stripe_connect.session_paid(body.session_id, checkout.account_id):
        # Провалилось бизнес-правило — apply_paid сам поднимет 409 _NOT_APPLIED.
        await apply_paid(db, body.session_id)
        # Сессия живёт с expire_on_commit=False: без refresh статус остался бы
        # тем, каким его прочитали ДО проведения.
        await db.refresh(checkout)

    # Итог берём из статуса, а не из факта вызова: заявку мог закрыть вебхук,
    # прилетевший параллельно. Раньше здесь безусловно возвращался paid=True — и
    # кассир видел «оплата проведена» по заявке, которую вебхук пометил failed.
    if checkout.status == "failed":
        raise HTTPException(status_code=409, detail=_NOT_APPLIED)
    return CheckoutConfirmResult(paid=checkout.status == "paid")


@webhook_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Колбэк Stripe. На валидное событие ВСЕГДА 200 — 4xx/5xx заставит Stripe
    ретраить, а обработка уже прошла (тот же принцип, что в вебхуке Fondy)."""
    event = stripe_connect.parse_webhook(
        await request.body(), request.headers.get("stripe-signature", ""),
    )
    if event is None:
        return {"status": "ignored"}

    session = event["data"]["object"]
    # У StripeObject (stripe 15.x) НЕТ метода .get() — это не dict. Обращение к
    # возможно отсутствующему полю только через getattr с дефолтом, иначе
    # AttributeError роняет хендлер в 500 ещё до проведения, и Stripe трое суток
    # ретраит оплату впустую. Тот же капкан описан в stripe_connect.account_status.
    if event["type"] in _PAID_EVENTS:
        # Оплата может быть отложенной (банковский перевод) — проводим только
        # когда деньги реально списаны.
        if getattr(session, "payment_status", None) == "paid":
            async with async_session_maker() as db:
                try:
                    await apply_paid(db, session["id"], account_id=getattr(event, "account", None))
                except HTTPException:
                    # Уже помечено failed и залогировано внутри apply_paid.
                    # Отдать Stripe ошибку значит получить те же ретраи впустую.
                    pass
    elif event["type"] in _DEAD_EVENTS:
        # Снимаем заявку с pending: денег по ней уже не будет, а висящая вечно
        # pending мешает понять, чем кончилась продажа. Статус отдельный от
        # failed — там деньги списаны и нужен разбор, здесь списания не было.
        async with async_session_maker() as db:
            await db.execute(
                update(StripeCheckout)
                .where(StripeCheckout.session_id == session["id"], StripeCheckout.status == "pending")
                .values(status="cancelled")
            )
            await db.commit()

    return {"status": "ok"}

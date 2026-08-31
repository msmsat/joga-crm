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
import hashlib
import json
import logging
import time
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from database import async_session_maker, get_db
from ratelimit import limiter
from dependencies import get_current_user, require_role, StudioContext
from models import (
    ClientSubscription, GiftCertificate, Operation, OnlineChannel, StripeCheckout,
    Studio, StudioDiscountConfig, StudioLoyaltyConfig, SubscriptionPackage, User,
)
from schemas.checkout import (
    CheckoutConfirmRequest, CheckoutConfirmResult, CheckoutPayRequest, CheckoutSessionResult,
)
from routers.clients.subscriptions import attach_subscription
from services import platform_fee, stripe_connect
from services.notifier import notify_payment

from .router import _get_client_package, _quote, consume_quote, perform_pay, reject_dead_promo, resolve_account

logger = logging.getLogger(__name__)

# То же правило, что у биллинга платформы: 200 только по ПРОЧИТАННОМУ признаку.
from services.webhook_guard import require as _require  # noqa: E402

# `completed` — обычная карта. `async_payment_succeeded` — отложенные методы
# (банковский перевод, SEPA): у них completed приходит ещё неоплаченным, и без
# второго типа события такая оплата не провелась бы в CRM никогда.
_PAID_EVENTS = ("checkout.session.completed", "checkout.session.async_payment_succeeded")
# Денег не будет: форма протухла или банк отказал по отложенному методу.
_DEAD_EVENTS = ("checkout.session.expired", "checkout.session.async_payment_failed")
# Деньги были и ушли обратно. Приходят как Charge, а не Session (см. _mark_reversed).
_DISPUTE_EVENT = "charge.dispute.created"
_REVERSED_EVENTS = ("charge.refunded", _DISPUTE_EVENT)
# Исход спора. Объект события — Dispute (не Charge): у него свой `status`, и именно
# он говорит, остались деньги у студии или ушли к клиенту.
_DISPUTE_CLOSED_EVENT = "charge.dispute.closed"

# Ключ метаданных сессии Stripe, в котором едет id НАШЕЙ попытки оплаты
# (StripeCheckout.attempt_id). Он же уходит в `client_reference_id`.
#
# Зачем два места под одно значение: `client_reference_id` — штатное поле сессии
# и читается из объекта события напрямую, метаданные — страховка на случай, если
# поле окажется пустым (легаси-сессия, созданная до этой правки). Оба заполняет
# сервер, снаружи ни одно из них не принимается: чужой attempt_id означал бы
# возможность приклеить свою оплату к чужой заявке.
ATTEMPT_KEY = "checkout_attempt"

# Сколько заявка может простоять в pending, прежде чем её начнёт разбирать
# сверка. Меньше ставить нельзя: человек открывает форму Stripe и думает —
# оплата в этот момент законно не завершена, а сессия жива до своего срока.
RECONCILE_AFTER = timedelta(minutes=20)

# Когда заявку без найденной сессии можно закрывать. Больше суток: столько живёт
# Checkout Session у Stripe, и до этого срока «сессии не видно» может означать
# просто отставание списка, а не её отсутствие.
ORPHAN_CLOSE_AFTER = timedelta(hours=25)

# Окно ОДНОЙ ПОПЫТКИ ОПЛАТЫ. Внутри него повтор того же запроса — двойной клик,
# ретрай сети, вторая вкладка, десять параллельных POST — считается той же
# попыткой и получает ТУ ЖЕ платёжную форму, а не вторую.
#
# Ключ попытки детерминирован (`business_attempt_id`) и уникален в БД, поэтому
# гонку закрывает сам индекс: из десяти одновременных вставок проходит одна,
# остальные ловят IntegrityError и переиспользуют победителя. «Сначала SELECT,
# потом INSERT» здесь не годится — ровно этот случай он и пропускает.
#
# Осознанная вторая покупка того же пакета окном не блокируется: как только
# прежняя заявка перестала быть `pending` (оплачена, отменена, протухла), ключ
# больше не переиспользуется и попытка заводится новая.
ATTEMPT_WINDOW = timedelta(minutes=15)

# Оплата по этой попытке уже идёт: форма открыта и, возможно, уже оплачена, а
# проведение ещё не дошло. Второй формы на ту же покупку быть не должно — но и
# отдавать закрытую сессию нельзя: в модалке она не отрисуется.
_ATTEMPT_IN_PROGRESS = {
    "code": "checkout.attempt_in_progress",
    "message": "Оплата по этой продаже уже начата — дождитесь результата или обновите страницу",
}

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
# Каждый вызов заводит объект у Stripe. Лимит — не защита (за ручкой JWT кассира
# и все серверные проверки), а предохранитель от зациклившегося ретрая фронта и
# от угнанного токена: живой кассир пробивает единицы продаж в минуту, а не
# десятки. Бизнес-идемпотентность попытки (reserve_checkout) от лимита не
# зависит и работает сама по себе.
@limiter.limit("30/minute")
async def create_session(
    request: Request,
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
    client, package = await _get_client_package(
        db, ctx.studio_id, body.client_id, body.product_id, body.product_type,
    )
    quote = await _quote(
        db, ctx.studio_id, body.client_id, package,
        body.product_type, body.promo_code, body.use_bonuses,
        body.use_deposit, body.certificate_code,
    )
    # Ровно та же проверка, что в perform_pay, и обязательно ДО Stripe: раньше
    # протухший промокод пропускался сюда, карта списывалась по полной цене, и
    # только потом perform_pay отказывался проводить продажу — деньги у студии,
    # клиент ни с чем. Фронт от этого не защищает: кнопка оплаты активна.
    reject_dead_promo(body.promo_code, quote)
    if quote.total_price <= 0:
        raise HTTPException(status_code=400, detail={
            "code": "checkout.nothing_to_pay",
            "message": "Оплачивать нечего — сумма уже покрыта",
        })

    studio = (await db.execute(select(Studio).where(Studio.id == ctx.studio_id))).scalar_one()
    currency = studio.currency or _FALLBACK_CURRENCY

    # Комиссию считаем от суммы ПОСЛЕ скидок и бонусов (quote.total_price) — ровно
    # от тех денег, которые реально спишутся с карты и сядут на счёт студии.
    amount_minor = stripe_connect.to_minor_units(quote.total_price, currency)
    # Касса CRM — тот же приём денег на аккаунт студии, что и мини-приложение,
    # поэтому доля платформы удерживается и здесь: иначе студия на тарифе
    # «процент» проводила бы продажи через кассу и не платила бы ничего.
    fee_minor = await platform_fee.fee_for_studio(db, ctx.studio_id, amount_minor)

    # СНАЧАЛА резервируем заявку у себя, и только потом идём в Stripe. Обратный
    # порядок оставлял окно, в котором сессия уже создана, а строки в CRM ещё
    # нет: падение процесса или БД здесь означало живую платёжную форму без
    # заявки — клиент платит, деньги садятся на счёт студии, вебхук отвечает
    # «заявка не найдена», продажи не происходит. Тот же порядок и по той же
    # причине, что у счетов постоплаты (services/offline_fee_billing._bill).
    checkout, needs_session = await reserve_checkout(
        db,
        studio_id=ctx.studio_id,
        user_id=current_user.id,
        account_id=account_id,
        payload=body.model_dump(mode="json"),
        amount=quote.total_price,
        application_fee=fee_minor,
    )

    try:
        if needs_session:
            session_id, client_secret = await stripe_connect.create_checkout_session(
                account_id=account_id,
                amount_minor=amount_minor,
                currency=currency,
                description=package.name,
                metadata={
                    "studio_id": str(ctx.studio_id),
                    "client_id": str(body.client_id),
                    # Обратная ссылка на нашу заявку: по ней её находят и вебхук,
                    # и сверка, даже если id сессии записать не успели.
                    ATTEMPT_KEY: checkout.attempt_id,
                },
                application_fee_minor=fee_minor,
                # Квитанцию клиенту шлёт Stripe от лица студии; почты нет — без чека.
                receipt_email=client.email,
                client_reference_id=checkout.attempt_id,
                # Одна попытка — одна сессия. Ретрай сети поверх уже принятого
                # Stripe запроса вернёт ту же форму, а не заведёт вторую.
                idempotency_key=f"cs:{checkout.attempt_id}",
            )
            checkout.session_id = session_id
            await db.commit()
        else:
            # Повтор в окне попытки: форма уже создана, забираем её у Stripe.
            # Свежий client_secret обязателен — хранить его у себя нельзя, он
            # одноразовый по смыслу и живёт вместе с сессией.
            session = await stripe_connect.fetch_session(checkout.session_id, account_id)
            _require_open(session, checkout)
            session_id, client_secret = checkout.session_id, session.client_secret
    except HTTPException:
        raise
    except Exception as exc:
        # Заявку НЕ отменяем: Stripe мог принять запрос и создать сессию, а
        # потеряться могла уже наша сторона ответа. Оставленная в pending, она
        # попадёт в сверку — та найдёт сессию по client_reference_id и проведёт
        # оплату, если та случилась. Не найдёт за сутки — закроет сама.
        logger.exception("Stripe: не удалось создать сессию оплаты для студии %s", ctx.studio_id)
        raise HTTPException(status_code=502, detail={
            "code": "checkout.stripe_error", "message": "Stripe отклонил запрос",
        }) from exc

    return CheckoutSessionResult(
        client_secret=client_secret,
        session_id=session_id,
        publishable_key=stripe_connect.PUBLISHABLE_KEY,
        account_id=account_id,
    )


def _require_open(session, checkout) -> None:
    """Переиспользовать можно только ОТКРЫТУЮ сессию.

    Узкий, но живой случай: клиент заплатил минуту назад, а проведение ещё не
    дошло (вебхук в пути) — заявка всё ещё `pending`, и повторный запрос попал бы
    на неё. Отдать такую сессию значит нарисовать кассиру форму без
    `client_secret`, то есть пустую модалку вместо ответа.

    Заводить вторую форму здесь тоже нельзя: покупка одна, и вторая означала бы
    второе списание. Поэтому честный отказ — «оплата уже идёт».
    """
    if getattr(session, "status", None) != "open":
        logger.info(
            "Stripe: заявка %s уже в работе (сессия %s), вторую форму не создаём",
            checkout.id, getattr(session, "status", None),
        )
        raise HTTPException(status_code=409, detail=_ATTEMPT_IN_PROGRESS)


def business_attempt_id(studio_id: int, payload: dict, amount: int) -> str:
    """Ключ ОДНОЙ попытки оплаты: студия + чем и за что платят + окно времени.

    Детерминированный, а не случайный, и это главное: два одновременных запроса с
    одинаковым смыслом обязаны получить ОДИН ключ, чтобы уникальный индекс
    оставил из них одну заявку. Случайный uuid дал бы две — то есть две живые
    платёжные формы на одну покупку.

    В ключ входит ВЕСЬ payload: сменил клиент промокод или снял галку «списать
    баллы» — это другая покупка с другой суммой, и подсовывать ей чужую форму
    нельзя. Сумма добавлена отдельно, хотя и выводится из payload: цена пакета
    могла измениться между попытками, а платёжная форма Stripe несёт старую.

    Хэш, а не склейка: payload — свободный JSON, и в 64 символа колонки он не
    влезет, зато обязан отличаться до последнего поля.
    """
    material = json.dumps(
        {"s": studio_id, "a": amount, "p": payload}, sort_keys=True, ensure_ascii=False,
    )
    bucket = int(time.time() // ATTEMPT_WINDOW.total_seconds())
    return hashlib.sha256(f"{material}|{bucket}".encode()).hexdigest()[:48]


async def reserve_checkout(
    db: AsyncSession, *, studio_id: int, user_id: int | None, account_id: str,
    payload: dict, amount: int, application_fee: int,
) -> tuple[StripeCheckout, bool]:
    """Заявка на оплату ДО похода в Stripe. → (строка, нужна ли новая сессия).

    Порядок «сначала у себя, потом в Stripe» — тот же, что у счетов постоплаты
    (services/offline_fee_billing._bill), и по той же причине: сессия, созданная
    раньше локальной строки, при падении процесса остаётся живой платёжной формой
    без заявки в CRM. Клиент по ней платит, деньги садятся на счёт студии, вебхук
    отвечает «заявка не найдена» — и узнать об этом можно только из банка.

    Второе назначение — бизнес-идемпотентность. Ключ попытки детерминирован, а
    колонка уникальна: повтор того же запроса упирается в индекс, находит уже
    заведённую заявку и переиспользует её сессию вместо второй.

    False во втором значении = сессия у заявки уже есть, создавать нечего.
    """
    attempt_id = business_attempt_id(studio_id, payload, amount)
    row = StripeCheckout(
        studio_id=studio_id,
        user_id=user_id,
        attempt_id=attempt_id,
        session_id=None,
        account_id=account_id,
        payload=payload,
        amount=amount,
        application_fee=application_fee,
    )
    db.add(row)
    try:
        await db.commit()
        return row, True
    except IntegrityError:
        await db.rollback()

    existing = (await db.execute(
        select(StripeCheckout).where(StripeCheckout.attempt_id == attempt_id)
    )).scalar_one_or_none()
    # Заявка перестала быть ожидающей (оплачена, отменена, ушла в разбор) — это
    # уже НОВАЯ покупка, и переиспользовать её форму нельзя. Заводим попытку со
    # случайным ключом: детерминированный занят навсегда.
    if existing is None or existing.status != "pending":
        row = StripeCheckout(
            studio_id=studio_id,
            user_id=user_id,
            attempt_id=uuid4().hex,
            session_id=None,
            account_id=account_id,
            payload=payload,
            amount=amount,
            application_fee=application_fee,
        )
        db.add(row)
        await db.commit()
        return row, True

    logger.info(
        "Stripe: повтор оплаты в окне попытки — переиспользуем заявку %s", existing.id,
    )
    return existing, existing.session_id is None


# Опись списанного (баллы, депозит, сертификат) внутри payload заявки. Лежит
# здесь, а не отдельной колонкой: три числа на заявку не стоят миграции, а
# payload и так хранит всё, чем платили.
CONSUMED_KEY = "consumed"


def _record_consumption(checkout: StripeCheckout, consumed: dict) -> None:
    """Запомнить, чем клиент расплатился помимо карты, чтобы возврат вернул это
    назад (`_revert_sale`). Пересчитать при возврате нельзя: сертификат уже
    погашен, а баллы списаны — расчёт дал бы нули.

    payload переприсваивается целиком: правка вложенного словаря на месте не
    помечает JSON-колонку изменённой, и SQLAlchemy молча не сохранит её.
    """
    if not any(consumed.values()):
        return
    checkout.payload = {**checkout.payload, CONSUMED_KEY: consumed}


async def _apply_client_subscription_purchase(db: AsyncSession, checkout: StripeCheckout) -> int:
    """Клиент купил абонемент сам в мини-приложении (`checkout.user_id is
    None` — не кассир). Тот же контракт, что у `perform_pay`: один `commit` и
    `notify_payment` внутри — `apply_paid` вызывает эту функцию ВМЕСТО
    `perform_pay` для заявок мини-приложения, а не вместе с ней.

    Возвращает id проданного абонемента: его записывает `apply_paid`, чтобы
    возврат мог погасить именно его (`_revert_sale`).
    """
    client_id = checkout.payload["client_id"]
    package_id = checkout.payload["package_id"]

    package = (await db.execute(
        select(SubscriptionPackage).where(SubscriptionPackage.id == package_id)
    )).scalar_one_or_none()
    if package is None:
        # Пакет сняли с продажи между созданием сессии Stripe и оплатой —
        # деньги списаны, проводить нечем. Ловит общая ветка _NOT_APPLIED.
        raise HTTPException(status_code=400, detail="Пакет абонемента снят с продажи")

    # Пересчёт по тем же рычагам, что клиент выбрал при создании сессии
    # (промокод, сертификат, депозит, баллы) — payload хранит ЗАПРОС, не итог.
    # Ровно как у кассира: perform_pay тоже считает заново и не верит фронту.
    quote = await _quote(
        db, checkout.studio_id, client_id, package, "subscription",
        checkout.payload.get("promo_code"), checkout.payload.get("use_bonuses", False),
        checkout.payload.get("use_deposit", False), checkout.payload.get("certificate_code"),
    )
    # Сумма обязана сойтись со списанной. Разошлась — клиент потратил баллы или
    # погасил сертификат в другом окне между созданием сессии и оплатой: провести
    # «как получится» значит записать в Финансы не то, что забрали у клиента.
    # 400 уводит заявку в общую ветку «списано, но не проведено» (_NOT_APPLIED).
    if quote.total_price != checkout.amount:
        raise HTTPException(
            status_code=400,
            detail="Сумма изменилась с момента оплаты — проведите продажу вручную",
        )

    # attach_subscription с price > 0 обращается к account.id — без реального
    # счёта упадёт AttributeError. Клиент мини-приложения счёт не выбирает
    # (это понятие только у кассы), поэтому берём дефолтный счёт студии — та
    # же ветка, что у кассира, который тоже не выбрал счёт.
    account = await resolve_account(db, checkout.studio_id, None, default_type="online")
    sub = await attach_subscription(
        db, checkout.studio_id, client_id, package, account,
        mark_paid=True, price=checkout.amount,
        # ОБЯЗАТЕЛЬНО "stripe": по этому признаку attach_subscription отличает
        # онлайн-оплату от офлайновой. Без него продажа в мини-приложении
        # получила бы ВТОРУЮ комиссию счётом — при уже удержанной Stripe доле.
        payment_method="stripe",
    )
    await db.flush()

    # Сертификат, депозит, баллы и одноразовые скидки списываем ЗДЕСЬ, а не при
    # создании сессии: до этой строки деньги не списаны, и клиент, закрывший
    # вкладку Stripe, не должен лишиться ни баллов, ни сертификата.
    _record_consumption(checkout, await consume_quote(db, checkout.studio_id, client_id, quote))

    log_activity(
        db, checkout.studio_id, "payment",
        title=f"Абонемент «{package.name}» куплен в мини-приложении",
        actor_name="Мини-приложение",
        entity_type="client", entity_id=client_id,
    )
    checkout.subscription_id = sub.id
    await db.commit()
    await notify_payment(db, checkout.studio_id, client_id, checkout.amount)
    return sub.id


async def apply_paid(
    db: AsyncSession, session_id: str, *,
    account_id: str | None = None, attempt_id: str | None = None,
) -> bool:
    """Провести оплату по заявке ровно один раз. True — провели именно сейчас.

    `with_for_update` держит строку до конца транзакции: вебхук и возврат на
    success_url прилетают одновременно, и без блокировки оба увидели бы pending
    и начислили абонемент дважды. Та же блокировка разводит вебхук и фоновую
    сверку (`reconcile_pending`) — они ходят сюда же и ровно за этим.

    `account_id` (из поля `account` события Connect) сверяем с заявкой: на наш
    единственный эндпоинт сыплются события ВСЕХ подключённых аккаунтов, и заявку
    одной студии не должно закрывать событие другой.

    `attempt_id` — наша ссылка на заявку (`client_reference_id` сессии). Нужна
    ровно тогда, когда id сессии в заявку записать не успели: без неё оплаченная
    сессия остаётся «не найденной» навсегда.
    """
    # populate_existing обязателен вместе с блокировкой: в /confirm заявка уже
    # загружена в ЭТУ же сессию, и без него ORM вернёт объект из identity map со
    # старым status='pending' — строка блокируется, а решение принимается по
    # устаревшему значению, и оплата проводится вторым абонементом.
    checkout = (await db.execute(
        select(StripeCheckout).where(StripeCheckout.session_id == session_id)
        .with_for_update().execution_options(populate_existing=True)
    )).scalar_one_or_none()

    adopted = None
    if checkout is None and attempt_id:
        # Заявка есть, а id сессии в ней нет: процесс упал между ответом Stripe и
        # коммитом. Находим по НАШЕЙ ссылке — иначе оплаченная сессия навсегда
        # остаётся «не найденной», деньги у студии, продажи нет. Только среди
        # НЕПРИПИСАННЫХ (session_id IS NULL): уже связанную заявку переклеить на
        # другую сессию нельзя.
        adopted = (await db.execute(
            select(StripeCheckout).where(
                StripeCheckout.attempt_id == attempt_id,
                StripeCheckout.session_id.is_(None),
            ).with_for_update().execution_options(populate_existing=True)
        )).scalar_one_or_none()
        checkout = adopted

    if checkout is None:
        logger.info("Stripe: заявка на оплату не найдена, session=%s", session_id)
        return False
    # Сверка аккаунта — ДО того, как что-либо записано. Владелец подключённого
    # аккаунта распоряжается им сам и может создать у себя сессию с ЧУЖИМ
    # `client_reference_id`: не проверив аккаунт раньше записи, мы вписали бы его
    # id сессии в заявку другой студии. Отказ ниже её всё равно не проведёт, но
    # ссылку бы уже испортил — а «не проведёт» держится на том, что вызывающий не
    # коммитит, то есть на удаче.
    if account_id is not None and checkout.account_id != account_id:
        logger.warning(
            "Stripe: событие с чужого аккаунта %s по заявке %s (ожидался %s)",
            account_id, session_id, checkout.account_id,
        )
        return False

    if adopted is not None:
        adopted.session_id = session_id
        logger.warning(
            "Stripe: заявка %s связана с сессией %s по attempt_id — id сессии "
            "не был записан при создании",
            adopted.id, session_id,
        )
    if checkout.status != "pending":
        return False

    # Пометка и проведение уходят одним commit'ом внутри perform_pay /
    # _apply_client_subscription_purchase: упало проведение — откатилась и
    # пометка, заявка снова pending и повтор сработает.
    checkout.status = "paid"
    try:
        if checkout.user_id is None:
            # Заявка мини-приложения: клиент купил абонемент сам, не через
            # кассу — своя проводка, а не CheckoutPayRequest кассира.
            await _apply_client_subscription_purchase(db, checkout)
        else:
            result = await perform_pay(
                db, checkout.studio_id, checkout.user_id,
                CheckoutPayRequest.model_validate(checkout.payload), method="stripe",
                # Пересчёт обязан сойтись со списанной суммой, иначе в Финансы
                # осядет не то, что забрали у клиента. Не сошлось — 409 из
                # perform_pay, дальше общая ветка «списано, но не проведено».
                expected_total=checkout.amount,
            )
            # Отдельным commit'ом: perform_pay закрывает транзакцию сам и отдаёт
            # id уже после неё. Продажа к этому моменту проведена, и упади запись
            # ссылки — потеряется только автооткат возврата, а не деньги.
            _record_consumption(checkout, {
                "bonuses": result.bonuses_applied,
                "deposit": result.deposit_applied,
                "certificate_code": (
                    checkout.payload.get("certificate_code")
                    if result.certificate_applied > 0 else None
                ),
            })
            if result.subscription_id is not None:
                checkout.subscription_id = result.subscription_id
            await db.commit()
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

    # Удержанная Stripe доля платформы — в леджер доходов. СТРОГО после проводки
    # и своим commit'ом: продажа уже закрыта, и упавшая строка отчётности не
    # повод откатывать оплату или отдать Stripe 500 на применённое событие.
    # Идемпотентность — на уникальном external_id (record_revenue).
    if checkout.application_fee > 0:
        try:
            studio = (await db.execute(
                select(Studio).where(Studio.id == checkout.studio_id)
            )).scalar_one()
            await platform_fee.record_revenue(
                db, checkout.studio_id, "connect_fee",
                checkout.application_fee, studio.currency or _FALLBACK_CURRENCY,
                f"cs:{session_id}",
            )
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Леджер: доход с session=%s не записан", session_id)

    return True


@router.post("/confirm", response_model=CheckoutConfirmResult)
# Возврат кассира с формы оплаты — один вызов на продажу; каждый спрашивает
# Stripe о статусе сессии.
@limiter.limit("60/minute")
async def confirm(
    request: Request,
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
    ретраить, а обработка уже прошла (тот же принцип, что в вебхуке биллинга).
    Исключение — непроверяемая подпись: см. ниже."""
    event = stripe_connect.parse_webhook(
        await request.body(), request.headers.get("stripe-signature", ""),
    )
    if event is None:
        # 400, а НЕ 200 — та же причина, что в вебхуке биллинга (routers/billing/
        # webhook.py): не сошедшаяся подпись это почти всегда разъехавшийся
        # секрет, и 200 превращает поломку в бесшумную. Здесь цена ещё выше:
        # покупка абонемента в мини-приложении проводится ТОЛЬКО этим вебхуком —
        # страховки вида /checkout/confirm (её зовёт касса CRM) у клиента нет.
        # Молча отброшенное событие значит «клиент заплатил и не получил ничего».
        raise HTTPException(status_code=400, detail="invalid signature")

    # data.object — Session у событий об оплате и Charge у событий о возврате.
    obj = event["data"]["object"]
    account_id = getattr(event, "account", None)
    # У StripeObject (stripe 15.x) НЕТ метода .get() — это не dict. Обращение к
    # возможно отсутствующему полю только через getattr с дефолтом, иначе
    # AttributeError роняет хендлер в 500 ещё до проведения, и Stripe трое суток
    # ретраит оплату впустую. Тот же капкан описан в stripe_connect.account_status.
    if event["type"] in _PAID_EVENTS:
        # Оплата может быть отложенной (банковский перевод) — проводим только
        # когда деньги реально списаны.
        # `unpaid`/`no_payment_required` — законные состояния (деньги ещё в пути,
        # придёт async_payment_succeeded), на них 200 правилен. А вот ОТСУТСТВИЕ
        # поля значит, что мы не разобрали сессию: промолчав, мы потеряли бы
        # оплату навсегда — ретрая после 200 не будет.
        payment_status = getattr(obj, "payment_status", None)
        _require(payment_status, event["type"], obj, "у сессии нет payment_status")
        if payment_status == "paid":
            async with async_session_maker() as db:
                try:
                    await apply_paid(
                        db, obj["id"], account_id=account_id,
                        attempt_id=_attempt_of(obj),
                    )
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
                .where(StripeCheckout.session_id == obj["id"], StripeCheckout.status == "pending")
                .values(status="cancelled")
            )
            await db.commit()
    elif event["type"] in _REVERSED_EVENTS:
        await _mark_reversed(obj, event["type"], account_id)
    elif event["type"] == _DISPUTE_CLOSED_EVENT:
        await _close_dispute(obj, account_id)

    return {"status": "ok"}


def _attempt_of(session) -> str | None:
    """id нашей попытки оплаты из объекта сессии, или None.

    Читаем оба места, куда его кладёт создание сессии: штатное поле
    `client_reference_id` и метаданные. Второе — не дублирование ради
    дублирования: у сессий, созданных до появления этой связи, пусто и то и
    другое, и различать «поля нет» от «поле пустое» здесь не нужно.
    """
    reference = getattr(session, "client_reference_id", None)
    if reference:
        return reference
    metadata = getattr(session, "metadata", None)
    return getattr(metadata, ATTEMPT_KEY, None) if metadata is not None else None


async def reconcile_pending(db: AsyncSession) -> int:
    """Разобрать заявки, застрявшие в `pending`. Вернуть число проведённых оплат.

    Зачем это существует. Покупка абонемента в мини-приложении проводится ТОЛЬКО
    вебхуком: страховки вида `/checkout/confirm` (её зовёт касса, вернувшись с
    формы) у клиента нет. Ретраи Stripe живут трое суток; эндпоинт, лежавший
    дольше — или проверявший подпись разъехавшимся секретом, — теряет событие
    навсегда. Тогда деньги на счету студии, а абонемента нет, и узнать об этом
    можно только по жалобе.

    Истина — у Stripe, и спрашиваем мы именно его. Проведение идёт ТЕМ ЖЕ
    `apply_paid`, что и вебхук: второй бизнес-логики для тех же денег быть не
    должно, а блокировка строки внутри разводит нас с параллельным вебхуком —
    fulfillment случится ровно один раз, кто бы ни пришёл первым.

    Разбираются три состояния сессии:
      * оплачена            → проводим;
      * протухла (`expired`)→ закрываем заявку, денег по ней не будет;
      * ещё открыта         → не трогаем, человек может дойти и заплатить.

    Заявка без `session_id` (процесс упал между ответом Stripe и коммитом) сперва
    ищет свою сессию по `client_reference_id` и дописывает id — иначе такая
    оплата не находится вообще ничем.

    Сбой по одной заявке не должен ронять остальные: аккаунты студий отвечают
    вразнобой, ради чего весь этот проход и существует.
    """
    cutoff = datetime.utcnow() - RECONCILE_AFTER
    rows = (await db.execute(
        select(StripeCheckout).where(
            StripeCheckout.status == "pending",
            StripeCheckout.created_at < cutoff,
        ).order_by(StripeCheckout.id).limit(200)
    )).scalars().all()

    applied = 0
    for row in rows:
        try:
            session_id = row.session_id
            if not session_id:
                if not row.attempt_id:
                    # Легаси-заявка без обеих ссылок — искать нечем. Такие строки
                    # заводились до локальной резервации; кричим и идём дальше.
                    logger.error(
                        "Сверка оплат: заявка %s без session_id и attempt_id — разбор вручную",
                        row.id,
                    )
                    continue
                session_id = await stripe_connect.find_session_by_reference(
                    row.account_id, row.attempt_id,
                    int(row.created_at.replace(tzinfo=timezone.utc).timestamp()),
                )
                if not session_id:
                    # Сессии нет — значит и денег не было: платить было негде.
                    # Ждём дольше её собственного срока жизни (сутки), потому что
                    # «не видно в списке» до этого момента может означать
                    # отставание, а не отсутствие. После — закрываем, иначе
                    # заявка от неудавшегося запроса висит в pending вечно.
                    if datetime.utcnow() - row.created_at > ORPHAN_CLOSE_AFTER:
                        await db.execute(
                            update(StripeCheckout)
                            .where(
                                StripeCheckout.id == row.id,
                                StripeCheckout.status == "pending",
                            )
                            .values(status="cancelled")
                        )
                        await db.commit()
                        logger.info(
                            "Сверка оплат: заявка %s закрыта — форма оплаты так и не создалась",
                            row.id,
                        )
                    else:
                        logger.warning(
                            "Сверка оплат: сессия заявки %s пока не найдена у Stripe", row.id,
                        )
                    continue

            session = await stripe_connect.fetch_session(session_id, row.account_id)

            # Сессия обязана быть НАШЕЙ. Ссылку ставим мы при создании, и её
            # расхождение означает, что в заявке лежит чужой id — провести по
            # такой сессии значит записать студии продажу за чужой платёж.
            # Пустая ссылка — легаси-сессия до появления попыток, её пропускаем.
            reference = getattr(session, "client_reference_id", None)
            if reference and row.attempt_id and reference != row.attempt_id:
                logger.error(
                    "Сверка оплат: сессия %s не принадлежит заявке %s — пропускаем",
                    session_id, row.id,
                )
                continue

            if getattr(session, "payment_status", None) == "paid":
                logger.warning(
                    "Сверка оплат: заявка %s оплачена, но вебхук не дошёл — проводим",
                    row.id,
                )
                # attempt_id обязателен: у заявки без session_id проведение иначе
                # не найдёт её саму (мы нашли сессию, но в БД связи ещё нет).
                if await apply_paid(
                    db, session_id, account_id=row.account_id, attempt_id=row.attempt_id,
                ):
                    applied += 1
            elif getattr(session, "status", None) == "expired":
                # Тот же переход, что делает вебхук по checkout.session.expired:
                # денег не было, заявка закрывается. Условие по статусу в WHERE —
                # чтобы не переписать заявку, которую параллельно уже провели.
                await db.execute(
                    update(StripeCheckout)
                    .where(StripeCheckout.id == row.id, StripeCheckout.status == "pending")
                    .values(status="cancelled")
                )
                await db.commit()
        except HTTPException:
            # Бизнес-правило отвергло проведение — apply_paid уже пометил заявку
            # failed и закричал в лог. Это разбор вручную, а не повод падать.
            continue
        except Exception:
            await db.rollback()
            logger.exception("Сверка оплат: заявка %s не разобрана", row.id)

    return applied


async def _checkout_for_payment(
    payment_intent: str | None, account_id: str | None, event_type: str,
) -> str | None:
    """session_id заявки CRM по платежу, или None. Общее для возврата и спора:
    в обоих событиях приходит платёж, а заявка живёт по session_id."""
    if not payment_intent or not account_id:
        logger.error("Stripe: %s без payment_intent/account — заявку не найти", event_type)
        return None
    try:
        return await stripe_connect.session_id_for_payment_intent(payment_intent, account_id)
    except Exception:
        logger.exception("Stripe: не удалось найти сессию по %s", payment_intent)
        return None


async def _close_dispute(dispute, account_id: str | None) -> None:
    """Спор закрыт: `charge.dispute.created` только пометил заявку, решает исход.

    Раньше на это событие мы не подписывались вовсе, и заявка навсегда оставалась
    в `disputed`: выигранный спор не возвращал продажу в норму (абонемент числился
    живым, но заявка выглядела проблемной), а проигранный не откатывал её вообще —
    деньги ушли клиенту, а абонемент оставался действующим.

    * `won` — деньги остаются у студии, продажа как была: возвращаем заявку в `paid`.
    * `lost` — деньги ушли: откатываем продажу тем же путём, что и полный возврат.
    * промежуточные статусы (`warning_*`, `under_review`) не трогаем — спор ещё идёт.
    """
    status = getattr(dispute, "status", None)
    # Промежуточный статус — законный «пока ничего не делаем». Пустой статус —
    # нечитаемое событие: проигранный спор так и остался бы неоткаченным.
    _require(status, _DISPUTE_CLOSED_EVENT, dispute, "у спора нет статуса")
    if status not in ("won", "lost"):
        logger.info("Stripe: спор в промежуточном статусе %s — заявку не трогаем", status)
        return

    intent = getattr(dispute, "payment_intent", None)
    intent_id = intent if isinstance(intent, str) else getattr(intent, "id", None)
    _require(intent_id, _DISPUTE_CLOSED_EVENT, dispute, "в споре нет payment_intent")
    session_id = await _checkout_for_payment(intent_id, account_id, _DISPUTE_CLOSED_EVENT)
    if session_id is None:
        return

    async with async_session_maker() as db:
        checkout = (await db.execute(
            select(StripeCheckout).where(
                StripeCheckout.session_id == session_id,
                StripeCheckout.status == "disputed",
            )
        )).scalar_one_or_none()
        if checkout is None:
            logger.info("Stripe: исход спора по заявке %s — она не в статусе disputed", session_id)
            return

        if status == "won":
            checkout.status = "paid"
            title = f"Чарджбэк на {checkout.amount} оспорен успешно — продажа в силе"
        else:
            checkout.status = "chargeback"
            charge = getattr(dispute, "charge", None)
            await _revert_sale(
                db, checkout,
                charge if isinstance(charge, str) else getattr(charge, "id", None),
            )
            title = f"Чарджбэк на {checkout.amount} проигран: абонемент погашен, деньги списаны со счёта"

        log_activity(
            db, checkout.studio_id, "payment", title=title,
            entity_type="client", entity_id=checkout.payload.get("client_id"),
        )
        await db.commit()

    logger.info("Stripe: спор по заявке %s закрыт со статусом %s", session_id, status)


async def _revert_loyalty(
    db: AsyncSession, studio_id: int, client_id: int, amount: int,
) -> None:
    """Снять баллы и сумму покупок, начисленные возвращённой оплатой. Не коммитит.

    Баллы считаем той же формулой, что и начисление (loyalty.accrue_points +
    кэшбек из register_purchase), и ОБРЕЗАЕМ по остатку: клиент мог их уже
    потратить, а уводить баланс в минус нельзя — apply_points_change на это
    отвечает 400 и уронил бы весь откат.

    Снимаем через apply_points_change, а не правкой баланса: сгорание баллов
    (expire_points) считает по журналу транзакций, и молчаливая правка остатка
    развалила бы его арифметику.

    ponytail: если ставку начисления или кэшбек поменяли между покупкой и
    возвратом, снимется по новой ставке. Точный откат требует ссылки на
    начисляющие транзакции — заводить её ради редкого случая не стали.
    """
    from routers.clients.loyalty import _get_or_create_card, apply_points_change
    from routers.loyalty.cards import _get_or_create_levels, _level_for

    card = await _get_or_create_card(client_id, studio_id, db)

    points = 0
    loyalty_cfg = (await db.execute(
        select(StudioLoyaltyConfig).where(StudioLoyaltyConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if loyalty_cfg is not None and loyalty_cfg.is_enabled and loyalty_cfg.points_exchange_rate > 0:
        points += amount // loyalty_cfg.points_exchange_rate

    discount_cfg = (await db.execute(
        select(StudioDiscountConfig).where(StudioDiscountConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if discount_cfg is not None and discount_cfg.is_enabled and discount_cfg.discount_type == "cashback":
        points += amount * discount_cfg.discount_value // 100

    points = min(points, card.points_balance)
    if points > 0:
        await apply_points_change(client_id, studio_id, -points, "Возврат оплаты", db)

    card.total_spent = max(0, card.total_spent - amount)
    card.level_id = _level_for(card.total_spent, await _get_or_create_levels(studio_id, db))


async def _restore_consumed(db: AsyncSession, checkout: StripeCheckout) -> None:
    """Вернуть баллы, депозит и сертификат, которыми была оплачена возвращённая
    покупка. Не коммитит. Идемпотентна: опись стирается после отката, поэтому
    повторный возврат (спор поверх refund) не начислит второй раз.

    Сертификат ищем по коду: он уникален глобально, и это единственная форма,
    которая одинаково доступна и кассе, и мини-приложению.
    """
    from routers.clients.loyalty import apply_deposit_change, apply_points_change

    consumed = (checkout.payload or {}).get(CONSUMED_KEY)
    if not consumed:
        return

    client_id = checkout.payload.get("client_id")
    if client_id is None:
        return

    if consumed.get("bonuses"):
        await apply_points_change(
            client_id, checkout.studio_id, consumed["bonuses"], "Возврат оплаты бонусами", db,
        )
    if consumed.get("deposit"):
        await apply_deposit_change(
            client_id, checkout.studio_id, consumed["deposit"], "Возврат оплаты депозитом", db,
        )
    code = consumed.get("certificate_code")
    if code:
        cert = (await db.execute(
            select(GiftCertificate).where(
                GiftCertificate.code == code,
                GiftCertificate.studio_id == checkout.studio_id,
            )
        )).scalar_one_or_none()
        # Истёкший за это время сертификат обратно в "active" не воскрешаем —
        # это был бы подарок сверх возврата.
        if cert is not None and cert.status == "used":
            cert.status = "active"
            cert.used_at = None

    payload = {**checkout.payload}
    payload.pop(CONSUMED_KEY, None)
    checkout.payload = payload


async def _reverse_platform_fee(
    db: AsyncSession, checkout: StripeCheckout, charge_id: str | None,
) -> None:
    """Снять из леджера долю платформы, которую Stripe вернул вместе с платежом.

    Без этого фактура за онлайн-комиссию (services/offline_fee_billing.
    _bill_online_fees) выставлялась бы на комиссию с платежа, которого больше нет —
    документ на несуществующий доход, — а `_month_platform_revenue` завышала бы
    выручку студии, и счёт на добор до минимума выходил бы меньше положенного.

    Сумму берём у Stripe (`refunded_application_fee`), а не равной удержанной:
    вернулась комиссия или осталась у платформы — решает студия галкой в своём
    дашборде, и половину случаев мы бы угадали неверно.

    Ошибку глушим: возврат уже проведён, и упавший запрос к Stripe не повод
    откатывать погашенный абонемент. Расхождение видно в логе.
    """
    if checkout.application_fee <= 0 or not charge_id:
        return
    try:
        refunded = await stripe_connect.refunded_application_fee(charge_id, checkout.account_id)
    except Exception:
        logger.exception(
            "Леджер: не удалось узнать судьбу комиссии по заявке %s — строка не снята",
            checkout.session_id,
        )
        return
    if refunded <= 0:
        return

    studio = (await db.execute(
        select(Studio).where(Studio.id == checkout.studio_id)
    )).scalar_one()
    await platform_fee.record_revenue(
        db, checkout.studio_id, "connect_fee",
        -refunded, studio.currency or _FALLBACK_CURRENCY,
        # Свой external_id: исходная строка (`cs:…`) остаётся на месте, а повтор
        # события (возврат, потом спор поверх него) не снимет комиссию дважды.
        f"rev:cs:{checkout.session_id}",
    )


async def _revert_sale(
    db: AsyncSession, checkout: StripeCheckout, charge_id: str | None = None,
) -> None:
    """Откатить проведённую продажу по полному возврату. Не коммитит.

    Гасит абонемент, снимает деньги со счёта компенсирующей операцией, откатывает
    лояльность и снимает долю платформы из леджера. Без этого CRM молча расходилась
    с банком: деньги у клиента вернулись, а абонемент числился действующим и выручка
    стояла как была.

    Операцию именно ДОБАВЛЯЕМ расходом, а не удаляем доходную: проведённую
    запись в Финансах задним числом не стирают — иначе отчёты за закрытый период
    начинают меняться сами по себе.
    """
    await _reverse_platform_fee(db, checkout, charge_id)

    if checkout.subscription_id is not None:
        sub = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.id == checkout.subscription_id)
        )).scalar_one_or_none()
        # Все выборки абонементов фильтруют status == "active", поэтому
        # "cancelled" убирает его и из кошелька клиента, и из записи на занятия.
        if sub is not None and sub.status != "cancelled":
            sub.status = "cancelled"

    # Баллы, депозит и сертификат — тоже деньги клиента. Карту банк вернул сам,
    # а это вернуть обязаны мы: без такого отката клиент, купивший абонемент за
    # сертификат + карту, после возврата остался бы и без абонемента, и без
    # сертификата. Опись пишет _record_consumption в момент проведения.
    await _restore_consumed(db, checkout)

    if checkout.amount <= 0:
        return

    client_id = checkout.payload.get("client_id")
    account = await resolve_account(
        db, checkout.studio_id, checkout.payload.get("account_id"), default_type="online",
    )
    db.add(Operation(
        studio_id=checkout.studio_id,
        type="out",
        title="Возврат оплаты картой",
        amount=checkout.amount,
        op_date=date.today(),
        # Та же категория, по которой ручной возврат снимает комиссию
        # (platform_fee.is_refund_category) — литералом она однажды разъедется.
        category=platform_fee.REFUND_CATEGORY,
        method="stripe",
        account_id=account.id,
        client_id=client_id,
    ))
    account.balance -= checkout.amount

    if client_id is not None:
        await _revert_loyalty(db, checkout.studio_id, client_id, checkout.amount)


def _is_full_refund(charge) -> bool:
    """Вернули ВСЮ сумму платежа. Событие без сумм (amount=0) — не «вернули всё»:
    иначе 0 >= 0 молча откатило бы продажу платящему клиенту."""
    amount = getattr(charge, "amount", 0) or 0
    refunded = getattr(charge, "amount_refunded", 0) or 0
    return bool(amount) and refunded >= amount


async def _mark_reversed(charge, event_type: str, account_id: str | None) -> None:
    """Возврат или чарджбэк по проведённой оплате.

    Полный возврат откатывает продажу автоматически (`_revert_sale`). Частичный —
    только помечает и кричит в ленту: абонемент к этому моменту может быть
    наполовину отходен, и решение «сколько вернуть» бизнесовое.

    Чарджбэк (`charge.dispute.created`) продажу НЕ трогает: спор ещё не проигран,
    и погасить абонемент клиенту, который выиграет спор в пользу студии, значит
    отобрать оплаченное. Итог спора приходит отдельным событием
    (`charge.dispute.closed`) и разбирается автоматически — см. `_close_dispute`:
    выигранный возвращает заявку в `paid`, проигранный откатывает продажу.
    """
    payment_intent = getattr(charge, "payment_intent", None)
    # Без ссылки на платёж искать заявку не по чему. «Платёж вне кассы CRM» — это
    # ответ, полученный ПОИСКОМ; здесь же поиск не начинался, и тихий выход
    # означал бы невозвращённую продажу при возврате денег клиенту.
    _require(payment_intent, event_type, charge, "в событии нет payment_intent")
    session_id = await _checkout_for_payment(payment_intent, account_id, event_type)
    if session_id is None:
        logger.info("Stripe: %s по платежу %s вне кассы CRM", event_type, payment_intent)
        return

    status = "disputed" if event_type == _DISPUTE_EVENT else "refunded"
    async with async_session_maker() as db:
        checkout = (await db.execute(
            select(StripeCheckout).where(
                StripeCheckout.session_id == session_id,
                StripeCheckout.status == "paid",
            )
        )).scalar_one_or_none()
        if checkout is None:
            # Заявка не в paid: возврат по неудавшейся продаже (failed) — там уже
            # был разбор вручную, второй сигнал ничего не добавит.
            logger.info("Stripe: %s по заявке %s не в статусе paid", event_type, session_id)
            return

        checkout.status = status
        reverted = status == "refunded" and _is_full_refund(charge)
        if reverted:
            await _revert_sale(db, checkout, charge["id"])
        log_activity(
            db, checkout.studio_id, "payment",
            title=(
                f"Чарджбэк по оплате картой на {checkout.amount} — разберите вручную"
                if status == "disputed"
                else f"Возврат {checkout.amount}: абонемент погашен, деньги списаны со счёта"
                if reverted
                else f"Частичный возврат по оплате картой на {checkout.amount} — разберите вручную"
            ),
            entity_type="client", entity_id=checkout.payload.get("client_id"),
        )
        await db.commit()

    if reverted:
        logger.info(
            "Stripe: возврат по заявке %s (студия %s, сумма %s) — продажа откачена",
            session_id, checkout.studio_id, checkout.amount,
        )
    else:
        logger.error(
            "Stripe: %s по заявке %s (студия %s, сумма %s) — продажа в CRM НЕ откачена",
            event_type, session_id, checkout.studio_id, checkout.amount,
        )

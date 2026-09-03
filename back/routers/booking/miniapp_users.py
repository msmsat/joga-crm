"""Профиль, абонементы, история, настройки клиента (`/global/me/*`).

Всё про самого клиента из токена — расписание и брони живут в
`miniapp_lessons.py`. `invite_code` не генерируем заново: переиспользуем
`_unique_invite_code` из `routers/clients/referrals.py` (V5-6) — второй
генератор кода означал бы два независимых источника уникальности на одну
колонку.
"""
import json
import os
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from activity import log_activity
from database import get_db
from ratelimit import limiter
from models import (
    BookingChannelConfig, Client, ClientPayment, ClientSubscription, OnlineChannel,
    Studio, StripeCheckout, SubscriptionPackage,
)
# Касса CRM и мини-приложение считают одним движком: `_quote` — единственное
# место, где цена превращается в «сколько снять деньгами», а `consume_quote` —
# единственное, где списываются сертификат, депозит и баллы.
from routers.checkout.router import _quote, consume_quote, reject_dead_promo
from uuid import uuid4

from routers.checkout.stripe_pay import ATTEMPT_KEY, _require_open, reserve_checkout
from routers.clients.referrals import _unique_invite_code
from routers.clients.subscriptions import attach_subscription
from schemas._base import BaseSchema, OptPhone
from services import platform_fee, stripe_connect
from services.notifier import _fmt_amount, _studio_prefs
from services.studio_link import public_ref

from .miniapp import get_current_client, verify_init_data

router = APIRouter()


class MiniappMe(BaseSchema):
    id: int
    name: str
    # Пусто — почта не привязана: профиль показывает «Привязать email», чтобы
    # телеграмный клиент мог входить в ЭТУ ЖЕ карточку из браузера
    # (routers/booking/miniapp_email_auth.py, режим привязки).
    email: Optional[str]
    # Пусто — мини-приложение попросит номер перед записью с оплатой на месте
    # (POST /me/phone). `phone_verified` различает подтверждённый Telegram'ом
    # номер и введённый руками.
    phone: Optional[str]
    phone_verified: bool
    notifs_enabled: bool
    reminders_enabled: bool
    registration_date: datetime
    invite_code: str


class MiniappSubscription(BaseSchema):
    id: int
    type: str
    total_classes: int
    used_classes: int
    classes_left: int
    expires_at: date
    status: str
    is_frozen: bool


class MiniappPayment(BaseSchema):
    amount: int
    amount_str: str
    description: str
    status: str
    created_at: datetime
    action_type: str
    item_key: str


class MeSettingsUpdate(BaseSchema):
    notifs_enabled: Optional[bool] = None
    reminders_enabled: Optional[bool] = None


class MeSettingsResponse(BaseSchema):
    notifs_enabled: bool
    reminders_enabled: bool


class MePhoneRequest(BaseSchema):
    """Телефон клиента — два пути, и оба ведут в одну колонку.

    `contact_data` — подписанный ответ Telegram `requestContact`: Telegram сам
    подтвердил, что номер принадлежит этому аккаунту, и подписал ответ ботовым
    токеном студии. SMS-шлюз для подтверждения не нужен и в продукте его нет.

    `phone` — ручной ввод: браузер (там Telegram недоступен) и старые клиенты,
    у которых `requestContact` не возвращает подписанный ответ. Такой номер
    сохраняется неподтверждённым — студия видит разницу в карточке клиента.
    """
    contact_data: Optional[str] = None
    phone: OptPhone = None


class MePhoneResponse(BaseSchema):
    phone: str
    phone_verified: bool


@router.get("/me", response_model=MiniappMe)
async def get_me(
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    if client.invite_code is None:
        client.invite_code = await _unique_invite_code(db)
        await db.commit()
        await db.refresh(client)

    return MiniappMe(
        id=client.id,
        name=client.name,
        email=client.email,
        phone=client.phone,
        phone_verified=client.phone_verified,
        notifs_enabled=client.notifs_enabled,
        reminders_enabled=client.reminders_enabled,
        registration_date=client.registration_date,
        invite_code=client.invite_code,
    )


@router.get("/me/subscriptions", response_model=list[MiniappSubscription])
async def get_my_subscriptions(
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    subs = (await db.execute(
        select(ClientSubscription)
        .where(ClientSubscription.client_id == client.id)
        .order_by(ClientSubscription.created_at.desc())
    )).scalars().all()
    if not subs:
        return []

    package_ids = {sub.package_id for sub in subs if sub.package_id is not None}
    packages_by_id: dict[int, SubscriptionPackage] = {}
    if package_ids:
        packages = (await db.execute(
            select(SubscriptionPackage).where(SubscriptionPackage.id.in_(package_ids))
        )).scalars().all()
        packages_by_id = {pkg.id: pkg for pkg in packages}

    result = []
    for sub in subs:
        package = packages_by_id.get(sub.package_id) if sub.package_id is not None else None
        result.append(MiniappSubscription(
            id=sub.id,
            type=package.name if package is not None else sub.type,
            total_classes=sub.total_classes,
            used_classes=sub.used_classes,
            classes_left=sub.total_classes - sub.used_classes,
            expires_at=sub.expires_at,
            status=sub.status,
            is_frozen=sub.is_frozen,
        ))
    return result


@router.get("/me/payments", response_model=list[MiniappPayment])
async def get_my_payments(
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    payments = (await db.execute(
        select(ClientPayment)
        .where(ClientPayment.client_id == client.id)
        .order_by(ClientPayment.created_at.desc())
    )).scalars().all()
    if not payments:
        return []

    _, currency = await _studio_prefs(db, client.studio_id)
    return [
        MiniappPayment(
            amount=payment.amount,
            amount_str=_fmt_amount(payment.amount, currency),
            description=payment.description,
            status=payment.status,
            created_at=payment.created_at,
            action_type=payment.action_type,
            item_key=payment.item_key,
        )
        for payment in payments
    ]


@router.patch("/me/settings", response_model=MeSettingsResponse)
async def update_my_settings(
    body: MeSettingsUpdate,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    if body.notifs_enabled is not None:
        client.notifs_enabled = body.notifs_enabled
    if body.reminders_enabled is not None:
        client.reminders_enabled = body.reminders_enabled
    await db.commit()
    await db.refresh(client)

    return MeSettingsResponse(
        notifs_enabled=client.notifs_enabled,
        reminders_enabled=client.reminders_enabled,
    )


@router.post("/me/phone", response_model=MePhoneResponse)
@limiter.limit("10/minute")
async def set_my_phone(
    request: Request,
    body: MePhoneRequest,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    """Оставить номер телефона — предусловие записи с оплатой на месте.

    Подпись `contact_data` проверяется ровно тем же `verify_init_data`, что и
    вход в мини-приложение: у ответа `requestContact` та же схема подписи, что у
    `initData`, и заводить вторую проверку HMAC было бы двумя разными правдами
    об одном и том же секрете.

    Обязательна сверка `user_id` из подписанного контакта с `tg_id` клиента:
    подпись говорит «этот номер выдал наш бот», но не «выдал ИМЕННО этому
    клиенту». Без сверки чужой подписанный контакт той же студии можно было бы
    переиграть на свой аккаунт.

    Подтверждённый номер ручным вводом не перезаписывается: Telegram уже сказал,
    кому он принадлежит, и подменять его текстом из формы — шаг назад.
    """
    if body.contact_data:
        channel = (await db.execute(
            select(BookingChannelConfig).where(
                BookingChannelConfig.studio_id == client.studio_id,
                BookingChannelConfig.channel_type == "telegram",
            )
        )).scalar_one_or_none()
        bot_token = ((channel.config or {}).get("token") if channel else None)
        if not bot_token:
            raise HTTPException(status_code=503, detail="Студия не подключила Telegram-бота")
        try:
            verified = verify_init_data(body.contact_data, bot_token)
            contact = json.loads(verified.get("contact") or "{}")
            phone = str(contact["phone_number"]).strip()
            contact_user_id = int(contact["user_id"])
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            raise HTTPException(status_code=401, detail="Не удалось проверить номер телефона")
        if client.tg_id is None or contact_user_id != client.tg_id:
            raise HTTPException(status_code=403, detail="Номер принадлежит другому аккаунту Telegram")
        # Telegram отдаёт номер без плюса («420777123456») — в CRM он хранится в
        # E.164 наравне с введёнными руками (schemas/_base.to_e164).
        client.phone = phone if phone.startswith("+") else f"+{phone}"
        client.phone_verified = True
    elif body.phone:
        if client.phone_verified:
            raise HTTPException(status_code=409, detail="Номер уже подтверждён через Telegram")
        client.phone = body.phone
        client.phone_verified = False
    else:
        raise HTTPException(status_code=422, detail="Нужен номер телефона")

    await db.commit()
    await db.refresh(client)
    return MePhoneResponse(phone=client.phone, phone_verified=client.phone_verified)


class CheckoutCalcRequest(BaseSchema):
    """Чем клиент хочет расплатиться. Ровно те же рычаги, что у кассира в CRM
    (schemas/checkout.CheckoutPayRequest) — суммы считает один и тот же `_quote`,
    поэтому касса и мини-приложение не могут разойтись в итоге."""
    package_id: int
    promo_code: Optional[str] = None
    use_bonuses: bool = False
    use_deposit: bool = False
    certificate_code: Optional[str] = None


class CheckoutSessionRequest(CheckoutCalcRequest):
    # Откуда платят. True (дефолт — прежнее поведение) возвращает в t.me, False
    # — на веб-адрес мини-приложения. Флаг, а не готовый URL от клиента:
    # адрес возврата строит сервер, иначе это открытый редирект со страницы
    # Stripe на что угодно.
    in_telegram: bool = True


class CheckoutCalcResponse(BaseSchema):
    """Разбор цены для чека в мини-приложении. Все суммы — и числом, и строкой:
    формат валюты живёт на сервере (_fmt_amount), клиент его не собирает."""
    base_price: int
    base_price_str: str
    discount: int
    discount_str: str
    # Введён промокод, которого нет / он истёк. Предпросмотр из-за этого не
    # падает (клиент дописывает код по одной букве) — просто скидки нет.
    promo_valid: bool
    certificate_applied: int
    certificate_applied_str: str
    deposit_available: int
    deposit_applied: int
    deposit_applied_str: str
    bonuses_available: int
    # available/applied — БАЛЛЫ, *_value_str — деньги по цене балла на уровне
    # клиента. На «Бриллианте» 125 баллов снимают 250 ₴, и в чеке должна стоять
    # вторая цифра, а первая — подписью «сколько баллов ушло».
    bonuses_available_value_str: str
    bonuses_applied: int
    bonuses_value: int
    bonuses_value_str: str
    point_value: int
    point_unit_str: str
    total_price: int
    total_price_str: str
    # Всё покрыто сертификатом/депозитом/баллами — Stripe не нужен, покупка
    # проводится сразу. Мини-приложение по этому флагу меняет текст кнопки.
    fully_covered: bool


class CheckoutSessionResponse(BaseSchema):
    # None, когда платить нечего (fully_covered) — абонемент уже начислен и
    # открывать Stripe не нужно.
    url: Optional[str] = None
    paid: bool = False


async def _checkout_return_base(
    db: AsyncSession, client: Client, in_telegram: bool, request: Request,
) -> str:
    """Куда Stripe вернёт клиента после оплаты — префикс, к которому дописывают
    `paysuccess`/`paycancel`.

    Из Telegram — только t.me: обычный https-адрес открыл бы внешний браузер, где
    сессии мини-приложения нет. Из браузера — наоборот, t.me выкинул бы человека
    из вкладки, в которой он платил, поэтому возвращаем на веб-адрес той же студии.

    Возвращаем ровно на ТОТ ЖЕ origin, с которого пришёл запрос, а не на
    `MINIAPP_URL`. Токен клиента лежит в localStorage, а он у каждого origin
    свой: вернув с дев-сервера (:5174) на боевой домен, мы приводим человека в
    кабинет, где он не залогинен, — и мини-приложение честно просит войти
    заново. Origin берём только из белого списка (`CORS_ORIGINS` + `MINIAPP_URL`):
    доверять адресу от клиента нельзя — это открытый редирект со страницы Stripe
    куда угодно. Чужой/пустой Origin → `MINIAPP_URL`, как раньше.

    Не настроен `MINIAPP_URL` и Origin не опознан — честно падаем в t.me:
    вернуться в Telegram неудобно, но это работающий кабинет, а битый
    success_url ломает оплату целиком.
    """
    web_base = (os.getenv("MINIAPP_URL") or "").rstrip("/")
    origin = (request.headers.get("origin") or "").rstrip("/")
    allowed = {
        o.strip().rstrip("/")
        for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()
    }
    if web_base:
        allowed.add(web_base)
    if origin in allowed:
        web_base = origin

    if not in_telegram and web_base:
        return f"{web_base}/s/{await public_ref(db, client.studio_id)}?pay="

    telegram_channel = (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.studio_id == client.studio_id,
            BookingChannelConfig.channel_type == "telegram",
        )
    )).scalar_one_or_none()
    bot_username = (telegram_channel.config or {}).get("bot_username") if telegram_channel else None
    if not bot_username:
        raise HTTPException(status_code=503, detail="Студия не подключила Telegram-бота")
    return f"https://t.me/{bot_username}?startapp="


async def _sellable_package(db: AsyncSession, studio_id: int, package_id: int) -> SubscriptionPackage:
    package = (await db.execute(
        select(SubscriptionPackage).where(
            SubscriptionPackage.id == package_id,
            SubscriptionPackage.studio_id == studio_id,
            SubscriptionPackage.is_active == True,
        )
    )).scalar_one_or_none()
    if package is None:
        raise HTTPException(status_code=404, detail="Пакет абонемента не найден")
    return package


async def _grant_fully_covered(
    db: AsyncSession, client: Client, package: SubscriptionPackage, quote,
) -> CheckoutSessionResponse:
    """Абонемент, полностью оплаченный сертификатом/депозитом/баллами.

    Stripe тут не участвует: платить нечего. Одна транзакция, как и у кассы, —
    начислить абонемент, списать всё, чем расплатились, зафиксировать покупку.

    `price=0` в attach_subscription не ошибка: сертификат и депозит уже
    проведены доходом в момент выпуска/пополнения, и вторая Operation на ту же
    сумму задвоила бы выручку (то же правило, что в кассе, V5-6 1.1).
    """
    # price=0 не только про Operation: attach_subscription сам зовёт
    # accrue_points и register_purchase этой же суммой, и на нуле они —
    # осознанный no-op. Начислять баллы и уровень за покупку, оплаченную ранее
    # начисленными баллами, значило бы считать одни и те же деньги дважды.
    sub = await attach_subscription(
        db, client.studio_id, client.id, package, None, mark_paid=True, price=0,
    )
    await consume_quote(db, client.studio_id, client.id, quote)
    await db.flush()
    log_activity(
        db, client.studio_id, "payment",
        title=f"Абонемент «{package.name}» оформлен из бонусов в мини-приложении",
        actor_name="Мини-приложение",
        entity_type="client", entity_id=client.id,
    )
    await db.commit()
    await db.refresh(sub)
    return CheckoutSessionResponse(url=None, paid=True)


@router.post("/checkout/calculate", response_model=CheckoutCalcResponse)
@limiter.limit("60/minute")
async def calculate_checkout(
    request: Request,
    body: CheckoutCalcRequest,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    """Разбор цены до оплаты: что даёт промокод, сколько снимет сертификат,
    депозит и баллы, сколько останется к оплате картой.

    Zero Trust, как и в кассе: считает сервер, мини-приложение только рисует.
    Ничего не списывает и не гасит — это предпросмотр, его дёргают на каждый
    введённый символ промокода (отсюда лимит выше, чем у создания сессии).
    """
    package = await _sellable_package(db, client.studio_id, body.package_id)
    _, currency = await _studio_prefs(db, client.studio_id)

    quote = await _quote(
        db, client.studio_id, client.id, package,
        "subscription", body.promo_code, body.use_bonuses,
        body.use_deposit, body.certificate_code,
    )

    return CheckoutCalcResponse(
        base_price=quote.base_price,
        base_price_str=_fmt_amount(quote.base_price, currency),
        discount=quote.discount,
        discount_str=_fmt_amount(quote.discount, currency),
        promo_valid=quote.promo_valid,
        certificate_applied=quote.certificate_applied,
        certificate_applied_str=_fmt_amount(quote.certificate_applied, currency),
        deposit_available=quote.deposit_available,
        deposit_applied=quote.deposit_applied,
        deposit_applied_str=_fmt_amount(quote.deposit_applied, currency),
        bonuses_available=quote.bonuses_available,
        bonuses_available_value_str=_fmt_amount(
            quote.bonuses_available * quote.point_value, currency,
        ),
        bonuses_applied=quote.bonuses_applied,
        bonuses_value=quote.bonuses_value,
        bonuses_value_str=_fmt_amount(quote.bonuses_value, currency),
        point_value=quote.point_value,
        point_unit_str=_fmt_amount(quote.point_value, currency),
        total_price=quote.total_price,
        total_price_str=_fmt_amount(quote.total_price, currency),
        fully_covered=quote.total_price <= 0,
    )


@router.post("/checkout/session", response_model=CheckoutSessionResponse)
@limiter.limit("10/minute")
async def create_checkout_session(
    request: Request,
    body: CheckoutSessionRequest,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    """Ссылка на хостед-страницу Stripe для оплаты абонемента клиентом самим
    собой. `apply_paid` (routers/checkout/stripe_pay.py) проводит эту заявку
    по вебхуку `checkout.session.completed` — тот же путь, что у кассы CRM,
    просто по заявке с `user_id=NULL` (см. models/finances.py:StripeCheckout).
    """
    package = await _sellable_package(db, client.studio_id, body.package_id)

    # Цена и списания — тем же `_quote`, что считает касса CRM. Промокод,
    # сертификат, депозит и баллы в мини-приложении обязаны давать ровно тот же
    # итог, что у кассира: два расчёта money-пути неизбежно разъезжаются.
    quote = await _quote(
        db, client.studio_id, client.id, package,
        "subscription", body.promo_code, body.use_bonuses,
        body.use_deposit, body.certificate_code,
    )
    # Клиент явно ввёл промокод и ждёт скидку — молча списать полную цену нельзя.
    reject_dead_promo(body.promo_code, quote)

    # Платить нечего: сертификат/депозит/баллы покрыли пакет целиком. Stripe на
    # нулевую сумму сессию не создаст, а отказывать клиенту в том, что он честно
    # накопил, — та же несдержанная обещание. Проводим здесь и сейчас.
    if quote.total_price <= 0:
        return await _grant_fully_covered(db, client, package, quote)

    if not stripe_connect.configured():
        raise HTTPException(status_code=503, detail="Приём оплат через Stripe не настроен на сервере")

    stripe_channel = (await db.execute(
        select(OnlineChannel).where(
            OnlineChannel.studio_id == client.studio_id,
            OnlineChannel.channel_type == "stripe",
        )
    )).scalar_one_or_none()
    if stripe_channel is None or not stripe_channel.is_active or not stripe_channel.account_id:
        raise HTTPException(status_code=503, detail="Студия не подключила приём онлайн-оплаты")

    return_base = await _checkout_return_base(db, client, body.in_telegram, request)

    studio = (await db.execute(select(Studio).where(Studio.id == client.studio_id))).scalar_one()
    currency = studio.currency or "RUB"

    amount_minor = stripe_connect.to_minor_units(quote.total_price, currency)
    # Комиссия платформы на тарифах «процент»/«комбо» — считается от той же суммы
    # в младших единицах, что уходит в Stripe (см. services/platform_fee.py).
    fee_minor = await platform_fee.fee_for_studio(db, client.studio_id, amount_minor)

    # Заявку резервируем ДО похода в Stripe — тот же порядок, что у кассы
    # (routers/checkout/stripe_pay.create_session) и по той же причине: иначе
    # падение между ответом Stripe и коммитом оставляет живую платёжную страницу
    # без заявки в CRM. Здесь это дороже вдвойне: у покупки из мини-приложения
    # нет ни кнопки «подтвердить», ни кассира — только вебхук и сверка.
    checkout, needs_session = await reserve_checkout(
        db,
        studio_id=client.studio_id,
        user_id=None,                       # не кассир: клиент купил абонемент сам
        account_id=stripe_channel.account_id,
        # Храним ЗАПРОС (чем клиент собрался платить), а не посчитанный итог —
        # так же, как заявка кассира (stripe_pay.create_session). Вебхук
        # пересчитает `_quote` по этим же рычагам и сверит с `amount`: сумма
        # разошлась (баллы потратили в другом окне) — продажа не проводится
        # молча, а уходит в ветку «списано, но не проведено».
        payload={
            "client_id": client.id,
            "package_id": package.id,
            "promo_code": body.promo_code,
            "use_bonuses": body.use_bonuses,
            "use_deposit": body.use_deposit,
            "certificate_code": body.certificate_code,
        },
        # Реально списываемая сумма: по ней вебхук сверяет пересчёт, а возврат —
        # откатывает баллы (stripe_pay._revert_loyalty).
        amount=quote.total_price,
        application_fee=fee_minor,
    )

    try:
        if needs_session:
            session_id, url = await stripe_connect.create_hosted_checkout_session(
                account_id=stripe_channel.account_id,
                amount_minor=amount_minor,
                currency=currency,
                description=package.name,
                metadata={
                    "studio_id": str(client.studio_id),
                    "client_id": str(client.id),
                    "package_id": str(package.id),
                    ATTEMPT_KEY: checkout.attempt_id,
                },
                success_url=f"{return_base}paysuccess",
                cancel_url=f"{return_base}paycancel",
                application_fee_minor=fee_minor,
                # Квитанцию клиенту отправит сам Stripe от лица студии. Почты у
                # клиента может не быть (вход по Telegram) — тогда просто без чека.
                receipt_email=client.email,
                client_reference_id=checkout.attempt_id,
                # Одна попытка — одна сессия. Двойной тап по «Оплатить» и ретрай
                # сети вернут ту же страницу вместо второй платёжной формы.
                idempotency_key=f"cs:{checkout.attempt_id}",
            )
            checkout.session_id = session_id
            await db.commit()
        else:
            # Повтор в окне попытки — отдаём ту же страницу, а не вторую.
            session = await stripe_connect.fetch_session(
                checkout.session_id, stripe_channel.account_id,
            )
            _require_open(session, checkout)
            url = session.url
    except Exception as exc:
        # Заявку НЕ отменяем: сессия могла быть создана, а потеряться могла наша
        # сторона ответа. Оставленную в pending подберёт сверка
        # (stripe_pay.reconcile_pending) — по client_reference_id.
        raise HTTPException(status_code=502, detail="Stripe отклонил запрос") from exc

    return CheckoutSessionResponse(url=url)

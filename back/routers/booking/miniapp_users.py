"""Профиль, абонементы, история, настройки клиента (`/global/me/*`).

Всё про самого клиента из токена — расписание и брони живут в
`miniapp_lessons.py`. `invite_code` не генерируем заново: переиспользуем
`_unique_invite_code` из `routers/clients/referrals.py` (V5-6) — второй
генератор кода означал бы два независимых источника уникальности на одну
колонку.
"""
import os
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from ratelimit import limiter
from models import (
    BookingChannelConfig, Client, ClientPayment, ClientSubscription, OnlineChannel,
    Studio, StripeCheckout, SubscriptionPackage,
)
from routers.clients.referrals import _unique_invite_code
from schemas._base import BaseSchema
from services import stripe_connect
from services.notifier import _fmt_amount, _studio_prefs

from .miniapp import get_current_client

router = APIRouter()


class MiniappMe(BaseSchema):
    id: int
    name: str
    # Пусто — почта не привязана: профиль показывает «Привязать email», чтобы
    # телеграмный клиент мог входить в ЭТУ ЖЕ карточку из браузера
    # (routers/booking/miniapp_email_auth.py, режим привязки).
    email: Optional[str]
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


class CheckoutSessionRequest(BaseSchema):
    package_id: int
    # Откуда платят. True (дефолт — прежнее поведение) возвращает в t.me, False
    # — на веб-адрес мини-приложения. Флаг, а не готовый URL от клиента:
    # адрес возврата строит сервер, иначе это открытый редирект со страницы
    # Stripe на что угодно.
    in_telegram: bool = True


class CheckoutSessionResponse(BaseSchema):
    url: str


async def _checkout_return_base(db: AsyncSession, client: Client, in_telegram: bool) -> str:
    """Куда Stripe вернёт клиента после оплаты — префикс, к которому дописывают
    `paysuccess`/`paycancel`.

    Из Telegram — только t.me: обычный https-адрес открыл бы внешний браузер, где
    сессии мини-приложения нет. Из браузера — наоборот, t.me выкинул бы человека
    из вкладки, в которой он платил, поэтому возвращаем на веб-адрес
    (`MINIAPP_URL`) той же студии. Не настроен `MINIAPP_URL` — честно падаем в
    t.me: вернуться в Telegram неудобно, но это работающий кабинет, а битый
    success_url ломает оплату целиком.
    """
    web_base = (os.getenv("MINIAPP_URL") or "").rstrip("/")
    if not in_telegram and web_base:
        return f"{web_base}/s/{client.studio_id}?pay="

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
    package = (await db.execute(
        select(SubscriptionPackage).where(
            SubscriptionPackage.id == body.package_id,
            SubscriptionPackage.studio_id == client.studio_id,
            SubscriptionPackage.is_active == True,
        )
    )).scalar_one_or_none()
    if package is None:
        raise HTTPException(status_code=404, detail="Пакет абонемента не найден")

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

    return_base = await _checkout_return_base(db, client, body.in_telegram)

    studio = (await db.execute(select(Studio).where(Studio.id == client.studio_id))).scalar_one()
    currency = studio.currency or "RUB"

    try:
        session_id, url = await stripe_connect.create_hosted_checkout_session(
            account_id=stripe_channel.account_id,
            amount_minor=stripe_connect.to_minor_units(package.price, currency),
            currency=currency,
            description=package.name,
            metadata={
                "studio_id": str(client.studio_id),
                "client_id": str(client.id),
                "package_id": str(package.id),
            },
            success_url=f"{return_base}paysuccess",
            cancel_url=f"{return_base}paycancel",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Stripe отклонил запрос") from exc

    db.add(StripeCheckout(
        studio_id=client.studio_id,
        user_id=None,
        session_id=session_id,
        account_id=stripe_channel.account_id,
        payload={"client_id": client.id, "package_id": package.id},
        amount=package.price,
    ))
    await db.commit()

    return CheckoutSessionResponse(url=url)

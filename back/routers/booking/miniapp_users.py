"""Профиль, абонементы, история, настройки клиента (`/global/me/*`).

Всё про самого клиента из токена — расписание и брони живут в
`miniapp_lessons.py`. `invite_code` не генерируем заново: переиспользуем
`_unique_invite_code` из `routers/clients/referrals.py` (V5-6) — второй
генератор кода означал бы два независимых источника уникальности на одну
колонку.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import Client, ClientPayment, ClientSubscription, SubscriptionPackage
from routers.clients.referrals import _unique_invite_code
from schemas._base import BaseSchema
from services.notifier import _fmt_amount, _studio_prefs

from .miniapp import get_current_client

router = APIRouter()


class MiniappMe(BaseSchema):
    id: int
    name: str
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

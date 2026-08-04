"""Каталог студии для мини-приложения (`GET /global/studio`).

Одна ручка на весь статический контекст — мини-приложение дёргает её один раз
при старте, а не по кускам (студия, филиалы, услуги, абонементы — четыре
разных источника в CRM, но один снимок на клиенте проще четырёх независимых
загрузок со своими скелетонами).
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from ratelimit import limiter
from models import (
    BookingChannelConfig, BranchWorkingHours, Client, OnlineChannel, Service, Studio,
    StudioBookingSettings, StudioBranch, SubscriptionPackage,
)
from schemas._base import BaseSchema
from services.notifier import _fmt_amount

from .miniapp import get_current_client

router = APIRouter()

DEFAULT_ACCENT_COLOR = "#FCAE91"


class StudioInfo(BaseSchema):
    id: int
    name: str
    currency: str
    logo_url: Optional[str]
    accent_color: str
    language: str
    # Для реферальной ссылки t.me/{bot_username}?startapp=... (профиль клиента).
    # None — Telegram ещё не подключён, тогда клиент никак сюда и не попал бы
    # (auth/telegram требует активный канал), но поле optional на случай, если
    # канал отключили уже после выдачи токена.
    bot_username: Optional[str]


class BookingRules(BaseSchema):
    min_booking_advance_min: int
    booking_window_days: int
    cancellation_deadline_min: int


class BranchInfo(BaseSchema):
    id: int
    name: str
    city: Optional[str]
    address: Optional[str]
    photo_url: Optional[str]
    opens: str
    closes: str


class ServiceInfo(BaseSchema):
    id: int
    name: str
    price: int
    price_str: str
    duration_min: int
    color: Optional[str]


class PackageInfo(BaseSchema):
    id: int
    name: str
    class_count: int
    price: int
    price_str: str
    duration_days: int


class StudioCatalog(BaseSchema):
    studio: StudioInfo
    rules: BookingRules
    branches: list[BranchInfo]
    services: list[ServiceInfo]
    packages: list[PackageInfo]
    can_pay_online: bool


def _branch_hours_today(hours: list[BranchWorkingHours]) -> tuple[str, str]:
    """Часы работы филиала на сегодня. Нет рабочего дня всю неделю (отпуск,
    ещё не заполнили Каталог) — честная пара "00:00"/"00:00": `studioState()`
    (lib/studio-status.ts, не трогаем) на равных opens/closes всё равно не
    даёт корректного "закрыто навсегда", это предел самой функции, а не то,
    что чинит этот блок.
    """
    by_day = {wh.day_of_week: wh for wh in hours}
    today = datetime.now().weekday()  # 0=Пн … 6=Вс — та же схема, что в BranchWorkingHours
    for offset in range(7):
        day = (today + offset) % 7
        wh = by_day.get(day)
        if wh is not None and wh.is_open:
            return wh.open_time, wh.close_time
    return "00:00", "00:00"


class StudioBrand(BaseSchema):
    name: str
    logo_url: Optional[str]
    accent_color: str
    language: str


@router.get("/public/{studio_id}/brand", response_model=StudioBrand)
@limiter.limit("30/minute")
async def get_studio_brand(
    request: Request,
    studio_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Витрина студии для экрана входа — без токена, потому что токена там ещё
    нет: человек только что открыл ссылку `/s/<studio_id>` в браузере и должен
    увидеть, в чей кабинет он входит, ДО того как вводить почту. Ответ строго
    публичный (то же, что видно на вывеске), никаких данных клиентов.

    Полный каталог (`GET /studio`) остаётся за токеном — он отдаёт цены,
    расписание и пакеты, это уже не витрина.
    """
    studio = (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one_or_none()
    if studio is None:
        raise HTTPException(status_code=404, detail="Студия не найдена")

    settings = (await db.execute(
        select(StudioBookingSettings).where(StudioBookingSettings.studio_id == studio_id)
    )).scalar_one_or_none()

    return StudioBrand(
        name=studio.name,
        logo_url=studio.logo_url,
        accent_color=(settings.widget_accent_color if settings else None) or DEFAULT_ACCENT_COLOR,
        language=studio.language or "ru",
    )


@router.get("/studio", response_model=StudioCatalog)
@limiter.limit("30/minute")
async def get_studio_catalog(
    request: Request,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    studio_id = client.studio_id

    studio = (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one()
    settings = (await db.execute(
        select(StudioBookingSettings).where(StudioBookingSettings.studio_id == studio_id)
    )).scalar_one_or_none()

    telegram_channel = (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.studio_id == studio_id,
            BookingChannelConfig.channel_type == "telegram",
        )
    )).scalar_one_or_none()
    bot_username = (telegram_channel.config or {}).get("bot_username") if telegram_channel else None

    branches = (await db.execute(
        select(StudioBranch).where(StudioBranch.studio_id == studio_id).order_by(StudioBranch.id)
    )).scalars().all()
    hours_by_branch: dict[int, list[BranchWorkingHours]] = {}
    if branches:
        rows = (await db.execute(
            select(BranchWorkingHours).where(
                BranchWorkingHours.branch_id.in_([b.id for b in branches])
            )
        )).scalars().all()
        for wh in rows:
            hours_by_branch.setdefault(wh.branch_id, []).append(wh)

    services = (await db.execute(
        select(Service).where(Service.studio_id == studio_id).order_by(Service.name)
    )).scalars().all()

    packages = (await db.execute(
        select(SubscriptionPackage)
        .where(SubscriptionPackage.studio_id == studio_id, SubscriptionPackage.is_active == True)
        .order_by(SubscriptionPackage.sort_order)
    )).scalars().all()

    # Дешёвая проверка «подключён ли Stripe» — по строке в БД, без похода в сам
    # Stripe: эта ручка дёргается на каждом старте мини-приложения, а не по
    # запросу владельца, как /finances/gateways, где живой charges_enabled уместен.
    stripe_channel = (await db.execute(
        select(OnlineChannel).where(
            OnlineChannel.studio_id == studio_id,
            OnlineChannel.channel_type == "stripe",
        )
    )).scalar_one_or_none()
    can_pay_online = bool(stripe_channel and stripe_channel.is_active and stripe_channel.account_id)

    currency = studio.currency or "RUB"
    branch_hours = {branch.id: _branch_hours_today(hours_by_branch.get(branch.id, [])) for branch in branches}

    return StudioCatalog(
        studio=StudioInfo(
            id=studio.id,
            name=studio.name,
            currency=currency,
            logo_url=studio.logo_url,
            accent_color=(settings.widget_accent_color if settings else None) or DEFAULT_ACCENT_COLOR,
            language=studio.language or "ru",
            bot_username=bot_username,
        ),
        rules=BookingRules(
            min_booking_advance_min=settings.min_booking_advance_min if settings else 120,
            booking_window_days=settings.booking_window_days if settings else 7,
            cancellation_deadline_min=settings.cancellation_deadline_min if settings else 240,
        ),
        branches=[
            BranchInfo(
                id=branch.id,
                name=branch.name,
                city=branch.city,
                address=branch.address,
                photo_url=branch.photo_url,
                opens=branch_hours[branch.id][0],
                closes=branch_hours[branch.id][1],
            )
            for branch in branches
        ],
        services=[
            ServiceInfo(
                id=service.id,
                name=service.name,
                price=service.price,
                price_str=_fmt_amount(service.price, currency),
                duration_min=service.duration_min,
                color=service.color,
            )
            for service in services
        ],
        packages=[
            PackageInfo(
                id=package.id,
                name=package.name,
                class_count=package.class_count,
                price=package.price,
                price_str=_fmt_amount(package.price, currency),
                duration_days=package.duration_days,
            )
            for package in packages
        ],
        can_pay_online=can_pay_online,
    )

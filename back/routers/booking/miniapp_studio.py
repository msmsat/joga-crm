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
    BookingChannelConfig, BranchWorkingHours, OnlineChannel, Service, Studio,
    StudioBranch, SubscriptionPackage,
)
from schemas._base import BaseSchema
from services.booking_rules import load_rules
from services.notifier import _fmt_amount
from services.pricing import resolve_price
from services.studio_link import require_studio_id

from .miniapp import Viewer, get_viewer

router = APIRouter()


class StudioInfo(BaseSchema):
    id: int
    name: str
    currency: str
    logo_url: Optional[str]
    accent_color: str
    language: str
    dark_mode: bool
    # None — Telegram ещё не подключён, тогда клиент никак сюда и не попал бы
    # (auth/telegram требует активный канал), но поле optional на случай, если
    # канал отключили уже после выдачи токена.
    bot_username: Optional[str]
    # Контакты студии из Настроек → Общие: по ним клиент связывается со студией
    # в разделе «Підтримка». Все Optional — студия могла ничего не заполнить,
    # и тогда мини-приложение честно говорит, что контактов нет, вместо того
    # чтобы показывать пустые строки или выдуманный адрес.
    phone: Optional[str]
    email: Optional[str]
    website: Optional[str]


class BookingRules(BaseSchema):
    """Правила записи из настроек студии — мини-приложение рисует по ним UI
    (какие дни листаются, что показывать вместо кнопки), но решает не оно:
    те же правила проверяет бэкенд при create_reservation."""
    booking_active: bool
    min_booking_advance_min: int
    booking_window_days: int
    cancellation_deadline_min: int
    repeat_booking_allowed: bool
    confirmation_required: bool
    prepay_required: bool
    widget_work_start: str
    widget_work_end: str


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
    # Цена со скидками этого клиента (студийная / персональный оффер / скидка
    # новичка по реферальной ссылке) — ровно та сумма, что уйдёт в Stripe.
    # Без неё клиент видел бы в списке одну цену, а списалась бы другая.
    # Скидки нет — final_price == price и discount_label == None: мини-приложение
    # рисует обычную строку, а не «−0 %».
    final_price: int
    final_price_str: str
    discount_label: Optional[str]


class StudioCatalog(BaseSchema):
    studio: StudioInfo
    rules: BookingRules
    branches: list[BranchInfo]
    services: list[ServiceInfo]
    packages: list[PackageInfo]
    can_pay_online: bool


def _discount_label(base_price: int, final_price: int) -> Optional[str]:
    """«−15 %» для бейджа над ценой. Процент, а не сумма: он одинаково читается
    в любой валюте, а сама экономия и так видна зачёркнутой ценой рядом.

    Скидки нет — None, чтобы мини-приложение не рисовало пустой бейдж.
    """
    if base_price <= 0 or final_price >= base_price:
        return None
    return f"−{round((base_price - final_price) * 100 / base_price)} %"


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
    dark_mode: bool


@router.get("/public/{studio_ref}/brand", response_model=StudioBrand)
@limiter.limit("30/minute")
async def get_studio_brand(
    request: Request,
    studio_ref: str,
    db: AsyncSession = Depends(get_db),
):
    """Витрина студии для экрана входа — без токена, потому что токена там ещё
    нет: человек только что открыл ссылку `/s/<code>` в браузере и должен
    увидеть, в чей кабинет он входит, ДО того как вводить почту. Ответ строго
    публичный (то же, что видно на вывеске), никаких данных клиентов.

    `studio_ref` — публичный код студии из той же ссылки (services/studio_link);
    числовой id принимается ради ссылок, разосланных до его появления.

    Полный каталог (`GET /studio`) остаётся за токеном — он отдаёт цены,
    расписание и пакеты, это уже не витрина.
    """
    studio_id = await require_studio_id(db, studio_ref)
    studio = (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one_or_none()
    if studio is None:
        raise HTTPException(status_code=404, detail="Студия не найдена")

    rules = await load_rules(db, studio_id)

    return StudioBrand(
        name=studio.name,
        # Логотип виджета — отдельная картинка от логотипа CRM: студия ставит в
        # кабинет клиента другой вариант знака. Не задан — берём общий.
        logo_url=rules.widget_logo_url or studio.logo_url,
        accent_color=rules.widget_accent_color,
        language=rules.widget_language,
        dark_mode=rules.widget_dark_mode,
    )


@router.get("/studio", response_model=StudioCatalog)
@limiter.limit("30/minute")
async def get_studio_catalog(
    request: Request,
    viewer: Viewer = Depends(get_viewer),
    db: AsyncSession = Depends(get_db),
):
    """Витрина студии. Токен не обязателен: занятие выбирают до регистрации, и
    гость, пришедший по ссылке `/s/<code>`, обязан увидеть филиалы, услуги и
    правила записи. Клиентского здесь ровно одно поле — цена пакета со скидкой
    (см. ниже), и она считается только когда клиент есть."""
    studio_id = viewer.studio_id

    studio = (await db.execute(
        select(Studio).where(Studio.id == studio_id)
    )).scalar_one_or_none()
    # Гость называет студию сам — код из ссылки может быть каким угодно.
    if studio is None:
        raise HTTPException(status_code=404, detail="Студия не найдена")
    rules = await load_rules(db, studio_id)

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

    # Цена со скидками — по каждому пакету, потому что часть скидок зависит от
    # суммы (min_purchase_amount у студийной, фиксированный оффер в деньгах).
    # ponytail: N × resolve_price при N ~ 3-6 пакетах; если каталог разрастётся —
    # тянуть конфиги один раз и считать скидку в памяти.
    #
    # Гостю считать нечего: скидки привязаны к карточке клиента, которой ещё нет.
    # Он видит базовую цену — ту же, что увидит новичок сразу после входа.
    final_prices: dict[int, int] = {}
    for package in packages:
        final_prices[package.id] = (
            (await resolve_price(db, studio_id, viewer.client.id, package.price)).final_price
            if viewer.client is not None
            else package.price
        )

    return StudioCatalog(
        studio=StudioInfo(
            id=studio.id,
            name=studio.name,
            currency=currency,
            logo_url=rules.widget_logo_url or studio.logo_url,
            accent_color=rules.widget_accent_color,
            language=rules.widget_language,
            dark_mode=rules.widget_dark_mode,
            bot_username=bot_username,
            phone=studio.phone,
            email=studio.email,
            website=studio.website,
        ),
        rules=BookingRules(
            booking_active=rules.booking_active,
            min_booking_advance_min=rules.min_booking_advance_min,
            booking_window_days=rules.booking_window_days,
            cancellation_deadline_min=rules.cancellation_deadline_min,
            repeat_booking_allowed=rules.repeat_booking_allowed,
            confirmation_required=rules.trainer_confirmation_required,
            prepay_required=rules.prefill_on_booking,
            widget_work_start=rules.widget_work_start,
            widget_work_end=rules.widget_work_end,
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
                final_price=final_prices[package.id],
                final_price_str=_fmt_amount(final_prices[package.id], currency),
                discount_label=_discount_label(package.price, final_prices[package.id]),
            )
            for package in packages
        ],
        can_pay_online=can_pay_online,
    )

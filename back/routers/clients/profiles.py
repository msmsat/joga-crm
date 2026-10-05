from dataclasses import asdict
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, cast, extract, func, or_, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import random

from activity import log_activity
from database import get_db
from dependencies import get_current_user, require_role, StudioContext
from models import (
    Account, ActivityLog, Client, ClientNote, ClientPayment, ClientSubscription,
    Lesson, LoyaltyPointTransaction, ReferralRecord, Reservation, Studio, StudioClientSegmentConfig,
    StudioSubscriptionProgramConfig, SubscriptionPackage, User,
)
from routers.clients._scope import client_scope
from routers.clients.loyalty import expire_points
from routers.clients.subscriptions import attach_subscription
from routers.finances.accounts import get_or_create_default_account
from services import booking, geo_locale, studio_time
from services.client_visits import visit_summary, visit_condition, appointment_state
from services.client_event_dates import action_stamp, event_order, payment_event, reservation_event
from services.booking_access import assert_can_book
from services.booking_http import reject
from services.booking_rules import assert_staff_bookable, load_rules
from services.client_segments import (
    CATEGORY_KEYS, DEFAULT_RULES, SegmentRules, category_condition, get_segment_rules, resolve_status,
)
from services.contacts import contact_taken, ensure_client_contacts_free
from services.client_search import client_search_condition
from services.bumpix_import.note_access import visible_notes
from services.referral import fire_referral
from services.subscription_charge import notify_subscription_remaining
from schemas import (
    ActionMessageOut,
    ActivityPointOut,
    BookingCreate,
    BookingCreatedOut,
    CategoryStatOut,
    ClientCreate,
    ClientCreatedOut,
    ClientFreezeUpdate,
    ClientListItemOut,
    ClientProfileOut,
    ClientRegistrationDateUpdate,
    ClientTagAction,
    ClientUpdate,
    CountOut,
    EventRecordOut,
    MessageSend,
    NoteCreate,
    NoteCreatedOut,
    NoteOut,
    NoteUpdate,
    OkFrozenOut,
    OkOut,
    SegmentRulesOut,
    SegmentRulesUpdate,
    TagsOut,
)
from schemas.clients.responses import ActiveSubscriptionOut, ClientLoyaltyLevelOut, ClientProductOut, DefaultCityOut
from schemas.common import Page
from services.plan_limits import check_plan_limit
from services.notifier import notify
from services.points import point_value_of
from services.schedule_guard import lock_studio

router = APIRouter()

_AVATAR_COLORS = [
    "#FCAE91", "#A3C9A8", "#D88C9A", "#9BB5D8", "#C8A8D8",
    "#D8C8A8", "#A8D8C8", "#D8A8B5", "#B5D8A8", "#A8B5D8",
]


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _live_products(client: Client) -> list[ClientSubscription]:
    """Живые продукты клиента: идущие абонементы/разовые + ждущая очередь.

    Порядок показа тот же, в каком они будут тратиться (booking_access):
    сначала идущие по дате сгорания, потом очередь по порядку покупки. У ждущих
    expires_at провизорный, сортировать по нему нельзя.
    """
    today = date.today()
    live = [
        s for s in client.subscriptions
        if s.used_classes < s.total_classes
        and (s.status == "pending" or (s.status == "active" and s.expires_at >= today))
    ]
    live.sort(key=lambda s: (
        s.status != "active",
        s.expires_at if s.status == "active" else date.max,
        s.id,
    ))
    return live


def _product_out(sub: ClientSubscription) -> ClientProductOut:
    pending = sub.status == "pending"
    return ClientProductOut(
        id=sub.id,
        used=sub.used_classes,
        total=sub.total_classes,
        # У ждущего дата условная — фронт её не показывает, рисует бейдж очереди.
        expires_at=sub.expires_at.isoformat(),
        type=sub.type,
        is_frozen=sub.is_frozen,
        is_pending=pending,
        starts_at=sub.starts_at.isoformat() if sub.starts_at else None,
    )


async def _studio_levels(db: AsyncSession, studio_id: int) -> list:
    """Лестница уровней студии. Читаем, а не `_get_or_create_levels`: список
    клиентов — GET, создавать в нём строки (и коммитить ради этого) незачем.
    Лестницы ещё нет → уровня у клиента нет, карточка просто не рисует блок."""
    from models import LoyaltyLevel  # ponytail: рядом с локальным импортом _level_for, чтобы модель уровней не тянуть в шапку ради одного места

    return list((await db.execute(
        select(LoyaltyLevel)
        .where(LoyaltyLevel.studio_id == studio_id)
        .order_by(LoyaltyLevel.sort_order)
    )).scalars().all())


def _client_level(client: Client, levels: list) -> ClientLoyaltyLevelOut | None:
    """Уровень клиента и выгода от него — тем же расчётом, что в «Клубе»
    (`_level_for` по `card.total_spent`), а не по сумме платежей: разойдись эти
    два числа, владелец и клиент увидели бы разные ступени одной лестницы."""
    from routers.loyalty.cards import _level_for  # ponytail: локальный импорт разрывает цикл (как в services/pricing.py)

    if not levels:
        return None

    card = client.loyalty_card
    total_spent = card.total_spent if card else 0
    points = card.points_balance if card else 0

    level_id = _level_for(total_spent, levels)
    current = next((lvl for lvl in levels if lvl.id == level_id), None)
    if current is None:
        return None

    value = point_value_of(current)
    nxt = next((lvl for lvl in levels if total_spent < lvl.min_threshold), None)
    return ClientLoyaltyLevelOut(
        name=current.name,
        color=current.color,
        point_value=value,
        points_value=points * value,
        next_name=nxt.name if nxt else None,
        to_next=(nxt.min_threshold - total_spent) if nxt else None,
        next_point_value=point_value_of(nxt) if nxt else None,
    )


def _client_list_item(
    client: Client, rules: SegmentRules = DEFAULT_RULES, levels: list | None = None, studio=None,
) -> ClientListItemOut:
    today = studio_time.today(studio)
    visit_count, last_visit = visit_summary(
        (r for r in client.reservations if r.lesson and r.lesson.studio_id == client.studio_id), studio,
    )
    stored_visit = client.last_visit_date if client.last_visit_date and client.last_visit_date <= today else None
    last_visit = max(filter(None, (last_visit, stored_visit)), default=None)
    total_spent = sum(p.amount for p in client.payments if p.status == "success")
    products = _live_products(client)
    # Для таблицы клиентов — первый в том же порядке (ближайший к сгоранию),
    # но только реально идущий: очередь в одну строку выводить нечего.
    active_sub = next((s for s in products if s.status == "active" and not s.is_frozen), None)
    loyalty_points = client.loyalty_card.points_balance if client.loyalty_card else 0
    return ClientListItemOut(
        id=client.id,
        name=client.name,
        last_name=client.last_name,
        phone=client.phone,
        email=client.email,
        avatar_color=client.avatar_color,
        avatar_url=client.avatar_url,
        # Статус выводится из данных (регистрация/визиты/оплаты), а не берётся из
        # колонки — см. services/client_segments.
        status=resolve_status(client, visit_count=visit_count, total_spent=total_spent, rules=rules, last_visit=last_visit, today=today),
        tags=client.tags or [],
        visit_count=visit_count,
        total_spent=total_spent,
        active_subscription=ActiveSubscriptionOut(
            used=active_sub.used_classes,
            total=active_sub.total_classes,
            expires_at=active_sub.expires_at.isoformat(),
            type=active_sub.type,
        ) if active_sub else None,
        products=[_product_out(s) for s in products],
        loyalty_points=loyalty_points,
        loyalty_level=_client_level(client, levels or []),
        last_visit_date=last_visit.isoformat() if last_visit else None,
        registration_date=client.registration_date.date().isoformat() if client.registration_date else None,
    )


def _subscription_for_reminder(client: Client) -> ClientSubscription | None:
    """Возвращает текущий почти исчерпанный абонемент либо последний завершённый."""
    active = next(
        (
            sub for sub in sorted(client.subscriptions, key=lambda sub: (sub.expires_at, sub.id))
            if sub.status == "active"
            and not sub.is_frozen
            and sub.expires_at >= date.today()
            and sub.used_classes < sub.total_classes
        ),
        None,
    )
    if active is not None:
        return active if active.total_classes - active.used_classes <= 2 else None

    return next(
        (
            sub for sub in sorted(client.subscriptions, key=lambda sub: (sub.expires_at, sub.id), reverse=True)
            if not sub.is_frozen
            and sub.expires_at >= date.today()
            and sub.used_classes >= sub.total_classes
        ),
        None,
    )


async def _get_client_or_404(
    client_id: int,
    ctx: StudioContext,
    db: AsyncSession,
    *,
    load_relations: bool = False,
) -> Client:
    """Берёт ctx, а не studio_id, намеренно: скоуп роли применяется здесь один
    раз и его физически нельзя забыть — через эту функцию ходят все ручки
    карточки. Чужой клиент для тренера — 404, а не 403: 403 подтвердил бы, что
    такой клиент в студии есть."""
    q = select(Client).where(Client.id == client_id, *client_scope(ctx))
    if load_relations:
        q = q.options(
            selectinload(Client.subscriptions),
            selectinload(Client.payments),
            selectinload(Client.reservations).selectinload(Reservation.lesson),
            selectinload(Client.loyalty_card),
            selectinload(Client.notes),
        )
    client = (await db.execute(q)).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    return client


def _last_12_months() -> list[str]:
    today = date.today()
    result = []
    year, month = today.year, today.month
    for _ in range(12):
        result.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(result))


# ─── GET /clients/ ─────────────────────────────────────────────────────────────

@router.get("/", response_model=Page[ClientListItemOut])
async def list_clients(
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=100),
):
    studio_id = ctx.studio_id
    rules = await get_segment_rules(db, studio_id)
    conditions = client_scope(ctx)   # тренеру — только его клиенты

    if search and search.strip():
        conditions.append(client_search_condition(search))

    # status и category резолвятся одним и тем же правилом — иначе бейдж клиента
    # и таб-фильтр разошлись бы.
    for key in (status, category):
        if key:
            cond = category_condition(key, rules=rules)
            if cond is not None:
                conditions.append(cond)

    if tag:
        conditions.append(cast(Client.tags, JSONB).contains([tag]))

    total = (await db.execute(
        select(func.count(Client.id)).where(and_(*conditions))
    )).scalar() or 0

    q = (
        select(Client)
        .where(and_(*conditions))
        .options(
            selectinload(Client.subscriptions),
            selectinload(Client.payments),
            selectinload(Client.reservations).selectinload(Reservation.lesson),
            selectinload(Client.loyalty_card),
        )
        .order_by(Client.registration_date.desc())
        .offset(offset)
        .limit(limit)
    )
    clients = (await db.execute(q)).scalars().all()
    # Лестница одна на студию — грузим её раз на страницу, а не на клиента:
    # иначе таблица на 50 строк дала бы 50 одинаковых запросов.
    levels = await _studio_levels(db, ctx.studio_id)
    studio = await db.get(Studio, studio_id)
    return Page(
        items=[_client_list_item(c, rules, levels, studio) for c in clients],
        total=total,
        offset=offset,
        limit=limit,
    )


# ─── GET /clients/count ────────────────────────────────────────────────────────

@router.get("/count", response_model=CountOut)
async def get_clients_count(
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Бейдж бокового меню — висит на КАЖДОЙ странице. Тренеру он показывает
    число его клиентов, а не студии."""
    count = (await db.execute(
        select(func.count(Client.id)).where(*client_scope(ctx))
    )).scalar() or 0
    return CountOut(count=count)


# ─── GET /clients/categories ──────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryStatOut])
async def get_categories(
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    today = studio_time.today(await db.get(Studio, studio_id))
    rules = await get_segment_rules(db, studio_id)
    base = client_scope(ctx)   # счётчики табов считаем по тому же срезу, что и список

    async def _count(key: str) -> int:
        cond = category_condition(key, today, rules)
        extra = () if cond is None else (cond,)
        return (await db.execute(
            select(func.count(Client.id)).where(*base, *extra)
        )).scalar() or 0

    # Порядок табов; подписи фронт переводит сам по key (categories.*).
    order = ["all", "vip", "active", "new", "has_subscription", "inactive", "frozen", "birthday"]
    labels = {
        "all": "Все", "vip": "VIP", "active": "Активные", "new": "Новые",
        "has_subscription": "С абонементом", "inactive": "Неактивные",
        "frozen": "Заморожены", "birthday": "День рождения",
    }
    assert set(order) == set(CATEGORY_KEYS), "таб без правила в client_segments"

    return [
        CategoryStatOut(key=key, label=labels[key], count=await _count(key))
        for key in order
    ]


# ─── GET/PATCH /clients/segment-rules ─────────────────────────────────────────
# Объявлены до /{client_id}, иначе FastAPI прочитает «segment-rules» как int.

@router.get("/segment-rules", response_model=SegmentRulesOut)
async def get_client_segment_rules(
    # Читать пороги может любая роль — по ним рисуется бейдж статуса в списке;
    # менять (PATCH ниже) по-прежнему только владелец.
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rules = await get_segment_rules(db, ctx.studio_id)
    return SegmentRulesOut(**asdict(rules))


@router.patch("/segment-rules", response_model=SegmentRulesOut)
async def update_client_segment_rules(
    body: SegmentRulesUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Правила меняет только владелец: они переопределяют статусы всех клиентов."""
    studio_id = ctx.studio_id
    cfg = (await db.execute(
        select(StudioClientSegmentConfig).where(StudioClientSegmentConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if cfg is None:
        cfg = StudioClientSegmentConfig(studio_id=studio_id)
        db.add(cfg)

    for field, value in body.model_dump().items():
        setattr(cfg, field, value)

    await db.commit()
    return SegmentRulesOut(**body.model_dump())


# ─── GET /clients/check-contact ───────────────────────────────────────────────
# Объявлен до /{client_id}, иначе FastAPI читает «check-contact» как int.

@router.get("/check-contact")
async def check_client_contact(
    field: Literal["email", "phone"],
    value: str,
    exclude_id: Optional[int] = Query(None, description="Кого не считать — правимый клиент"),
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Подсказка фронту: занят ли контакт другим клиентом этой студии.

    Область — студия: у разных студий клиенты не пересекаются. Барьер —
    guard на записи, эта ручка только гасит кнопку заранее.
    """
    return {
        "taken": await contact_taken(
            db, Client, field, value, studio_id=ctx.studio_id, exclude_id=exclude_id,
        )
    }


# ─── GET /clients/default-city ────────────────────────────────────────────────
# Объявлен до /{client_id} по той же причине, что и check-contact.

@router.get("/default-city", response_model=DefaultCityOut)
async def get_default_city(
    request: Request,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Город и страна для формы нового клиента — по IP того, кто её открыл.

    Клиенты студии почти всегда живут там же, где сидит администратор, так что
    догадка по его адресу верна чаще, чем пустое поле. База офлайновая
    (services/geo_locale): IP никуда не уходит. Её нет или адрес локальный —
    берём город и страну из профиля студии; нет и там — поле остаётся пустым.
    """
    ip = geo_locale.visitor_ip(
        request.headers.get("CF-Connecting-IP"),
        request.headers.get("X-Forwarded-For"),
        request.client.host if request.client else None,
    )
    place = geo_locale.locate_ip(ip)
    if place.city:
        return DefaultCityOut(
            city=place.city,
            country=geo_locale.visitor_country(request.headers.get("CF-IPCountry"), ip),
            source="ip",
        )
    studio = await db.get(Studio, ctx.studio_id)
    return DefaultCityOut(
        city=studio.city if studio else None,
        country=studio.country if studio else None,
        source="studio" if studio and studio.city else "none",
    )


# ─── GET /clients/{id} ────────────────────────────────────────────────────────

@router.get("/{client_id}", response_model=ClientProfileOut)
async def get_client(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, ctx, db, load_relations=True)
    if await expire_points(db, studio_id, client_id):
        await db.commit()
    base = _client_list_item(
        client, await get_segment_rules(db, studio_id), await _studio_levels(db, studio_id),
        await db.get(Studio, studio_id),
    )
    subscription_alert = _subscription_for_reminder(client)
    # Неоплаченные занятия («оплата на месте»). Сумма, а не список: карточке
    # нужен факт долга и его размер, разбор по занятиям виден в Журнале.
    debt = (await db.execute(
        select(func.coalesce(func.sum(ClientPayment.amount), 0)).where(
            ClientPayment.client_id == client_id, ClientPayment.status == "pending",
        )
    )).scalar() or 0
    recent_notes = (await db.scalars(select(ClientNote).where(ClientNote.client_id == client_id,
        *visible_notes(ctx)).order_by(ClientNote.created_at.desc()).limit(3))).all()
    return ClientProfileOut(
        **base.model_dump(),
        debt=debt,
        phone_verified=client.phone_verified,
        subscription_alert=ActiveSubscriptionOut(
            used=subscription_alert.used_classes,
            total=subscription_alert.total_classes,
            expires_at=subscription_alert.expires_at.isoformat(),
            type=subscription_alert.type,
        ) if subscription_alert else None,
        instagram=client.instagram,
        phone2=client.phone2, address=client.address, balance=client.balance, discount=client.discount,
        birth_date=client.birth_date.isoformat() if client.birth_date else None,
        city=client.city,
        source=client.source,
        notifs_enabled=client.notifs_enabled,
        reminders_enabled=client.reminders_enabled,
        is_active=client.is_active,
        notes=[
            NoteOut(
                id=n.id,
                text=n.text,
                photos=n.photos or [],
                created_at=n.created_at.isoformat(),
                updated_at=n.updated_at.isoformat() if n.updated_at else None,
            )
            for n in recent_notes
        ],
    )


# ─── GET /clients/{id}/events ─────────────────────────────────────────────────

@router.get("/{client_id}/events", response_model=list[EventRecordOut])
async def get_client_events(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    event_type: Optional[str] = Query(None, description="all | payment | visit (all appointments) | completed | cancel | bonus"),
):
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, ctx, db)

    studio = await db.get(Studio, studio_id)
    events: list[EventRecordOut] = []
    # Fetch an appointment once. The Visit tab is the full appointment history;
    # Completed/Cancellations are subsets, not extra copies in All.
    if not event_type or event_type in ("all", "visit", "completed", "booking", "cancel"):
        stmt = (select(Reservation, ClientPayment.status)
            .join(Lesson, Lesson.id == Reservation.lesson_id)
            .outerjoin(ClientPayment, ClientPayment.id == Reservation.debt_payment_id)
            .where(Reservation.client_id == client_id, Lesson.studio_id == studio_id,
                   Reservation.status != "hold")
            .options(selectinload(Reservation.lesson)))
        if ctx.role == 'trainer':
            stmt = stmt.where(Lesson.teacher_id == ctx.user.id)
        rows = (await db.execute(stmt)).all()
        for reservation, debt_status in rows:
            state = appointment_state(reservation, studio)
            if event_type == "completed" and state != "completed": continue
            if event_type == "cancel" and state != "cancelled": continue
            if event_type == "booking" and state not in ("upcoming", "ongoing"): continue
            kind = "cancel" if state == "cancelled" else "completed" if state == "completed" else "booking"
            events.append(reservation_event(reservation, kind, studio, debt_status=debt_status))

    if not event_type or event_type in ("all", "payment"):
        rows = (await db.execute(
            select(ClientPayment, Reservation, Lesson).select_from(ClientPayment)
            .outerjoin(Reservation, Reservation.debt_payment_id == ClientPayment.id)
            .outerjoin(Lesson, and_(Lesson.studio_id == studio_id, or_(
                Lesson.id == Reservation.lesson_id,
                and_(Reservation.id.is_(None), ClientPayment.action_type == "lesson",
                     cast(Lesson.id, String) == ClientPayment.item_key),
            )))
            .where(ClientPayment.client_id == client_id, ClientPayment.status == "success")
        )).all()
        events.extend(payment_event(p, r, lesson, studio) for p, r, lesson in rows)

    if not event_type or event_type in ("all", "bonus"):
        rows = (await db.execute(
            select(LoyaltyPointTransaction).where(LoyaltyPointTransaction.client_id == client_id)
        )).scalars().all()
        for tr in rows:
            occurred = action_stamp(tr.created_at, studio)
            events.append(EventRecordOut(date=occurred, occurred_at=occurred, type="bonus",
                title=tr.description, amount=f"{'+' if tr.points >= 0 else ''}{tr.points}"))

    if not event_type or event_type in ("all", "freeze"):
        rows = (await db.execute(select(ClientSubscription).where(
            ClientSubscription.client_id == client_id, ClientSubscription.is_frozen == True,
        ))).scalars().all()
        for sub in rows:
            occurred = action_stamp(sub.frozen_at, studio)
            events.append(EventRecordOut(date=occurred, occurred_at=occurred,
                type="freeze", title=f"Заморозка: {sub.type}", subject=sub.type, freeze_action="freeze"))
        logs = (await db.execute(select(ActivityLog).where(
            ActivityLog.studio_id == studio_id, ActivityLog.entity_type == "client",
            ActivityLog.entity_id == client_id, ActivityLog.event_type.in_(("freeze", "unfreeze")),
        ))).scalars().all()
        for log in logs:
            occurred = action_stamp(log.created_at, studio)
            events.append(EventRecordOut(date=occurred, occurred_at=occurred, type="freeze", title=log.title,
                freeze_action=log.event_type))

    events.sort(key=lambda event: event_order(event, studio), reverse=True)
    return events


# ─── GET /clients/{id}/notes ──────────────────────────────────────────────────

@router.get("/{client_id}/notes", response_model=list[NoteOut])
async def get_client_notes(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, ctx, db)

    notes = (await db.execute(
        select(ClientNote)
        .where(ClientNote.client_id == client_id, *visible_notes(ctx))
        .order_by(ClientNote.created_at.desc())
    )).scalars().all()

    return [
        NoteOut(
            id=n.id,
            text=n.text,
            photos=n.photos or [],
            created_at=n.created_at.isoformat(),
            updated_at=n.updated_at.isoformat() if n.updated_at else None,
        )
        for n in notes
    ]


# ─── GET /clients/{id}/activity ───────────────────────────────────────────────

@router.get("/{client_id}/activity", response_model=list[ActivityPointOut])
async def get_client_activity(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, ctx, db)

    months = _last_12_months()
    today = date.today()
    cutoff = date(today.year - 1, today.month, 1)

    visit_rows = (await db.execute(
        select(
            extract("year", Lesson.start_time).label("yr"),
            extract("month", Lesson.start_time).label("mo"),
            func.count(func.distinct(Reservation.lesson_id)).label("cnt"),
        )
        .join(Lesson, Reservation.lesson_id == Lesson.id)
        .where(
            Reservation.client_id == client_id,
            visit_condition(),
            Lesson.studio_id == studio_id,
            *([Lesson.teacher_id == ctx.user.id] if ctx.role == "trainer" else []),
            Lesson.start_time >= datetime(cutoff.year, cutoff.month, 1),
        )
        .group_by("yr", "mo")
    )).all()

    visit_map = {f"{int(r.yr):04d}-{int(r.mo):02d}": int(r.cnt) for r in visit_rows}

    pay_rows = (await db.execute(
        select(
            extract("year", ClientPayment.created_at).label("yr"),
            extract("month", ClientPayment.created_at).label("mo"),
            func.sum(ClientPayment.amount).label("total"),
        )
        .where(
            ClientPayment.client_id == client_id,
            ClientPayment.status == "success",
            ClientPayment.created_at >= datetime(cutoff.year, cutoff.month, 1),
        )
        .group_by("yr", "mo")
    )).all()

    pay_map = {f"{int(r.yr):04d}-{int(r.mo):02d}": int(r.total) for r in pay_rows}

    return [
        ActivityPointOut(
            month=m,
            visits=visit_map.get(m, 0),
            payments_total=pay_map.get(m, 0),
        )
        for m in months
    ]


# ─── POST /clients/ ───────────────────────────────────────────────────────────

@router.post("/", status_code=201, response_model=ClientCreatedOut)
async def create_client(
    body: ClientCreate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await check_plan_limit(db, studio_id, "clients")
    await ensure_client_contacts_free(db, studio_id, email=body.email, phone=body.phone)
    client = Client(
        studio_id=studio_id,
        name=body.name,
        last_name=body.last_name,
        phone=body.phone,
        email=body.email,
        instagram=body.instagram,
        birth_date=body.birth_date,
        city=body.city,
        tags=body.tags or [],
        source=body.source,
        avatar_color=random.choice(_AVATAR_COLORS),
        status="new",
    )
    db.add(client)
    await db.flush()

    if body.invite_code:
        referrer = (await db.execute(
            select(Client).where(
                Client.studio_id == studio_id,
                Client.invite_code == body.invite_code,
                Client.id != client.id,
            )
        )).scalar_one_or_none()
        if referrer is not None:
            # UNIQUE(referred_client_id) на ReferralRecord гарантирует, что один
            # клиент не может быть приглашён дважды — повторный insert упадёт.
            db.add(ReferralRecord(
                studio_id=studio_id,
                referrer_client_id=referrer.id,
                referred_client_id=client.id,
                status="pending",
            ))
            # Триггер 'registration' — тот же, что в мини-приложении: клиент,
            # заведённый администратором по коду друга, должен считаться так же.
            await db.flush()
            await fire_referral(db, studio_id, client.id, "registration", referred_name=client.name)

    if body.note:
        db.add(ClientNote(
            client_id=client.id,
            studio_id=studio_id,
            author_id=current_user.id,
            text=body.note,
        ))

    log_activity(
        db, studio_id, "client",
        title=f"Новый клиент: {client.name} {client.last_name or ''}".strip(),
        actor_name=f"{current_user.name} {current_user.last_name or ''}".strip(),
        entity_type="client", entity_id=client.id,
    )

    if body.membership_id is not None:
        package = (await db.execute(
            select(SubscriptionPackage).where(
                SubscriptionPackage.id == body.membership_id,
                SubscriptionPackage.studio_id == studio_id,
            )
        )).scalar_one_or_none()
        if package is None:
            raise HTTPException(status_code=404, detail="Пакет не найден")
        if not package.is_active:
            raise HTTPException(status_code=400, detail="Пакет снят с продажи")

        account = None
        if body.is_membership_paid:
            account = await get_or_create_default_account(db, studio_id)

        await attach_subscription(
            db, studio_id, client.id, package, account,
            mark_paid=body.is_membership_paid,
        )
        log_activity(
            db, studio_id, "client",
            title=f"Подключён абонемент «{package.name}»",
            actor_name=f"{current_user.name} {current_user.last_name or ''}".strip(),
            entity_type="client", entity_id=client.id,
        )

    await db.commit()
    await db.refresh(client)

    await notify(db, studio_id, "admin", "a3", {
        "client_name": f"{client.name} {client.last_name or ''}".strip(),
    })

    return ClientCreatedOut(id=client.id, message="Клиент создан")


# ─── PATCH /clients/{id} ──────────────────────────────────────────────────────

@router.patch("/{client_id}", response_model=OkOut)
async def update_client(
    client_id: int,
    body: ClientUpdate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await lock_studio(db, ctx.studio_id)
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, ctx, db)
    patch = body.model_dump(exclude_unset=True)
    # Только изменённые контакты: прежние значения — свои же, и на исторические
    # дубли (до появления проверки) нельзя запирать правку остальных полей.
    await ensure_client_contacts_free(
        db, studio_id,
        email=patch.get("email") if patch.get("email") != client.email else None,
        phone=patch.get("phone") if patch.get("phone") != client.phone else None,
        exclude_id=client_id,
    )
    for field, value in patch.items():
        if field == "name" and not value:
            continue  # name в БД NOT NULL — пустое значение не применяем
        setattr(client, field, value)
    await db.commit()
    return OkOut(ok=True)


# ─── PATCH /clients/{id}/freeze ───────────────────────────────────────────────

@router.patch("/{client_id}/freeze", response_model=OkFrozenOut)
async def freeze_client(
    client_id: int,
    body: ClientFreezeUpdate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, ctx, db)

    if body.frozen:
        config = (await db.execute(
            select(StudioSubscriptionProgramConfig).where(StudioSubscriptionProgramConfig.studio_id == studio_id)
        )).scalar_one_or_none()
        if config is not None and not config.allow_freeze:
            raise HTTPException(status_code=400, detail={
                "code": "loyalty.freeze_disabled",
                "message": "Заморозка клиентов выключена в настройках Каталога → Абонементы",
            })

    was_frozen = client.status == "frozen"
    client.status = "frozen" if body.frozen else "active"
    client.is_active = not body.frozen
    if was_frozen != body.frozen:
        label = "Заморозка" if body.frozen else "Разморозка"
        log_activity(
            db, studio_id, "freeze" if body.frozen else "unfreeze",
            title=f"{label} клиента: {client.name} {client.last_name or ''}".strip(),
            actor_name=f"{current_user.name} {current_user.last_name or ''}".strip(),
            entity_type="client", entity_id=client.id,
        )
    await db.commit()
    return OkFrozenOut(ok=True, frozen=body.frozen)


# ─── PATCH /clients/{id}/registration-date ────────────────────────────────────

@router.patch("/{client_id}/registration-date", response_model=OkOut)
async def update_registration_date(
    client_id: int,
    body: ClientRegistrationDateUpdate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, ctx, db)
    client.registration_date = datetime.combine(body.registration_date, datetime.min.time())
    await db.commit()
    return OkOut(ok=True)


# ─── POST /clients/{id}/tags ──────────────────────────────────────────────────

@router.post("/{client_id}/tags", response_model=TagsOut)
async def add_tag(
    client_id: int,
    body: ClientTagAction,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, ctx, db)
    tags = list(client.tags or [])
    if body.tag not in tags:
        tags.append(body.tag)
        client.tags = tags
        await db.commit()
    return TagsOut(tags=client.tags or [])


# ─── DELETE /clients/{id}/tags ────────────────────────────────────────────────

@router.delete("/{client_id}/tags", response_model=TagsOut)
async def remove_tag(
    client_id: int,
    body: ClientTagAction,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, ctx, db)
    tags = [t for t in (client.tags or []) if t != body.tag]
    client.tags = tags
    await db.commit()
    return TagsOut(tags=client.tags or [])


# ─── POST /clients/{id}/notes ─────────────────────────────────────────────────

@router.post("/{client_id}/notes", status_code=201, response_model=NoteCreatedOut)
async def add_note(
    client_id: int,
    body: NoteCreate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, ctx, db)
    note = ClientNote(
        client_id=client_id,
        studio_id=studio_id,
        author_id=current_user.id,
        text=body.text,
        photos=body.photos,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return NoteCreatedOut(
        id=note.id,
        text=note.text,
        photos=note.photos or [],
        created_at=note.created_at.isoformat(),
    )


# ─── PATCH /clients/{id}/notes/{note_id} ─────────────────────────────────────

@router.patch("/{client_id}/notes/{note_id}", response_model=OkOut)
async def update_note(
    client_id: int,
    note_id: int,
    body: NoteUpdate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, ctx, db)
    note = (await db.execute(
        select(ClientNote).where(ClientNote.id == note_id, ClientNote.client_id == client_id)
    )).scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Заметка не найдена")
    note.text = body.text
    if body.photos is not None:
        note.photos = body.photos
    note.updated_at = datetime.utcnow()
    await db.commit()
    return OkOut(ok=True)


# ─── DELETE /clients/{id}/notes/{note_id} ─────────────────────────────────────

@router.delete("/{client_id}/notes/{note_id}", response_model=OkOut)
async def delete_note(
    client_id: int,
    note_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, ctx, db)
    note = (await db.execute(
        select(ClientNote).where(ClientNote.id == note_id, ClientNote.client_id == client_id)
    )).scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Заметка не найдена")
    await db.delete(note)
    await db.commit()
    return OkOut(ok=True)


# ─── POST /clients/{id}/booking ───────────────────────────────────────────────

@router.post("/{client_id}/booking", status_code=201, response_model=BookingCreatedOut)
async def book_lesson(
    client_id: int,
    body: BookingCreate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await lock_studio(db, ctx.studio_id)
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, ctx, db)

    lesson = (await db.execute(
        select(Lesson).where(Lesson.id == body.lesson_id, Lesson.studio_id == studio_id)
    )).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    if lesson.status == "cancelled":
        raise HTTPException(status_code=400, detail="Занятие отменено — запись невозможна")
    # То же правило, что в Журнале: за стойкой мешает только уже прошедшее
    # занятие, а окно самостоятельной записи клиента здесь не применяется
    # (services/booking_rules, «Полномочия студии за стойкой»).
    studio = await db.get(Studio, studio_id)
    assert_staff_bookable(lesson, studio)

    # ПЕРЕХОД ДЕЛАЕТ ДОМЕН — тот же, что в Журнале, и с теми же параметрами:
    # запись из карточки клиента и запись из расписания обязаны отличаться
    # только кнопкой, а не правилами (подарок раньше зависел от того, какую
    # из них нажал администратор).
    result = await booking.create(
        db, studio_id=studio_id, client_id=client_id, lesson_id=body.lesson_id,
        source="manual", actor=booking.Actor.STAFF, require_funding=False,
        # Как в Журнале: без абонемента и первого занятия — долг «оплата на
        # месте», а не отказ.
        allow_payment=True,
    )
    if result.outcome is booking.Outcome.NO_FUNDING:
        # Только гонка: абонемент кончился между проверкой и списанием.
        await assert_can_book(db, client_id, lesson)  # здесь всегда бросает — ради точной причины
    reject(result,
           NO_CAPACITY=(400, "Все места заняты"),
           ALREADY_BOOKED=(400, "Клиент уже записан на это занятие"),
           SPOT_TAKEN=(409, "Это место только что заняли"),
           WINDOW_CLOSED=(400, "Занятие уже закончилось — записать на него нельзя"))
    reservation = await db.get(Reservation, result.reservation_id)
    remaining = result.remaining
    log_activity(
        db, studio_id, "booking",
        title=f"Запись на «{lesson.name}»",
        actor_name=f"{current_user.name} {current_user.last_name or ''}".strip(),
        entity_type="reservation", entity_id=reservation.id,
    )
    await db.commit()
    await db.refresh(reservation)
    await notify_subscription_remaining(db, studio_id, client_id, remaining)
    return BookingCreatedOut(id=reservation.id, message="Запись создана")


# ─── POST /clients/{id}/call ──────────────────────────────────────────────────

@router.post("/{client_id}/call", response_model=ActionMessageOut)
async def log_call(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, ctx, db)
    return ActionMessageOut(ok=True, message=f"Звонок клиенту {client.name} инициирован")


# ─── POST /clients/{id}/message ───────────────────────────────────────────────

@router.post("/{client_id}/subscription-reminder", response_model=ActionMessageOut)
async def send_subscription_reminder(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    client = await _get_client_or_404(client_id, ctx, db, load_relations=True)
    subscription = _subscription_for_reminder(client)
    remaining = max(0, subscription.total_classes - subscription.used_classes) if subscription else 0
    event_id = "c6" if remaining == 0 else "c5"
    delivered = await notify(
        db, ctx.studio_id, "client", event_id,
        {"client_id": client.id, "remaining": remaining},
    )
    if not delivered:
        return ActionMessageOut(
            ok=False,
            message="Напоминание не отправлено: включите нужный канал для этого события в Уведомлениях",
        )
    return ActionMessageOut(ok=True, message="Напоминание отправлено клиенту")


@router.post("/{client_id}/message", response_model=ActionMessageOut)
async def send_message(
    client_id: int,
    body: MessageSend,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, ctx, db)
    return ActionMessageOut(ok=True, message=f"Сообщение отправлено клиенту {client.name} через {body.channel}")


# ─── DELETE /clients/{id} ─────────────────────────────────────────────────────

@router.delete("/{client_id}", response_model=OkOut)
async def delete_client(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await lock_studio(db, ctx.studio_id)
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, ctx, db)
    await db.delete(client)
    await db.commit()
    return OkOut(ok=True)

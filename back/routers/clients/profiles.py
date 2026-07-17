from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, cast, extract, func, or_
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import random

from activity import log_activity
from database import get_db
from dependencies import get_current_user, require_role, StudioContext
from models import (
    Client, ClientNote, ClientPayment, ClientSubscription,
    Lesson, Reservation, User,
)
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
    ClientStatusUpdate,
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
    TagsOut,
)
from schemas.clients.responses import ActiveSubscriptionOut
from schemas.common import Page
from services.plan_limits import check_plan_limit

router = APIRouter()

_AVATAR_COLORS = [
    "#FCAE91", "#A3C9A8", "#D88C9A", "#9BB5D8", "#C8A8D8",
    "#D8C8A8", "#A8D8C8", "#D8A8B5", "#B5D8A8", "#A8B5D8",
]


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _client_list_item(client: Client) -> ClientListItemOut:
    visit_count = sum(1 for r in client.reservations if r.status == "attended")
    total_spent = sum(p.amount for p in client.payments if p.status == "success")
    active_sub = next(
        (s for s in client.subscriptions if s.status == "active" and not s.is_frozen),
        None,
    )
    loyalty_points = client.loyalty_card.points_balance if client.loyalty_card else 0
    return ClientListItemOut(
        id=client.id,
        name=client.name,
        last_name=client.last_name,
        phone=client.phone,
        email=client.email,
        avatar_color=client.avatar_color,
        status=client.status,
        tags=client.tags or [],
        visit_count=visit_count,
        total_spent=total_spent,
        active_subscription=ActiveSubscriptionOut(
            used=active_sub.used_classes,
            total=active_sub.total_classes,
            expires_at=active_sub.expires_at.isoformat(),
            type=active_sub.type,
        ) if active_sub else None,
        loyalty_points=loyalty_points,
        last_visit_date=client.last_visit_date.isoformat() if client.last_visit_date else None,
        registration_date=client.registration_date.date().isoformat() if client.registration_date else None,
    )


async def _get_client_or_404(
    client_id: int,
    studio_id: int,
    db: AsyncSession,
    *,
    load_relations: bool = False,
) -> Client:
    q = select(Client).where(Client.id == client_id, Client.studio_id == studio_id)
    if load_relations:
        q = q.options(
            selectinload(Client.subscriptions),
            selectinload(Client.payments),
            selectinload(Client.reservations),
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
    ctx: StudioContext = Depends(require_role("owner", "admin")),
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
    conditions = [Client.studio_id == studio_id]

    if search:
        s = f"%{search}%"
        conditions.append(or_(
            Client.name.ilike(s),
            Client.last_name.ilike(s),
            Client.phone.ilike(s),
            Client.email.ilike(s),
        ))

    if status:
        conditions.append(Client.status == status)

    if category == "has_subscription":
        sub_q = select(ClientSubscription.client_id).where(ClientSubscription.status == "active")
        conditions.append(Client.id.in_(sub_q))
    elif category == "birthday":
        today = date.today()
        conditions.append(and_(
            extract("month", Client.birth_date) == today.month,
            extract("day", Client.birth_date) == today.day,
        ))
    elif category in ("vip", "active", "new", "inactive", "frozen"):
        conditions.append(Client.status == category)

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
            selectinload(Client.reservations),
            selectinload(Client.loyalty_card),
        )
        .order_by(Client.registration_date.desc())
        .offset(offset)
        .limit(limit)
    )
    clients = (await db.execute(q)).scalars().all()
    return Page(
        items=[_client_list_item(c) for c in clients],
        total=total,
        offset=offset,
        limit=limit,
    )


# ─── GET /clients/count ────────────────────────────────────────────────────────

@router.get("/count", response_model=CountOut)
async def get_clients_count(
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    count = (await db.execute(
        select(func.count(Client.id)).where(Client.studio_id == studio_id)
    )).scalar() or 0
    return CountOut(count=count)


# ─── GET /clients/categories ──────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryStatOut])
async def get_categories(
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    today = date.today()
    base = Client.studio_id == studio_id

    async def _count(*extra):
        return (await db.execute(
            select(func.count(Client.id)).where(base, *extra)
        )).scalar() or 0

    total = await _count()
    vip = await _count(Client.status == "vip")
    active = await _count(Client.status == "active")
    new = await _count(Client.status == "new")
    inactive = await _count(Client.status == "inactive")
    frozen = await _count(Client.status == "frozen")

    sub_ids = (await db.execute(
        select(ClientSubscription.client_id)
        .distinct()
        .join(Client, Client.id == ClientSubscription.client_id)
        .where(Client.studio_id == studio_id, ClientSubscription.status == "active")
    )).scalars().all()
    has_subscription = len(sub_ids)

    birthday = await _count(
        extract("month", Client.birth_date) == today.month,
        extract("day", Client.birth_date) == today.day,
    )

    return [
        CategoryStatOut(key="all", label="Все", count=total),
        CategoryStatOut(key="vip", label="VIP", count=vip),
        CategoryStatOut(key="active", label="Активные", count=active),
        CategoryStatOut(key="new", label="Новые", count=new),
        CategoryStatOut(key="has_subscription", label="С абонементом", count=has_subscription),
        CategoryStatOut(key="inactive", label="Неактивные", count=inactive),
        CategoryStatOut(key="frozen", label="Заморожены", count=frozen),
        CategoryStatOut(key="birthday", label="День рождения", count=birthday),
    ]


# ─── GET /clients/{id} ────────────────────────────────────────────────────────

@router.get("/{client_id}", response_model=ClientProfileOut)
async def get_client(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, studio_id, db, load_relations=True)
    base = _client_list_item(client)
    return ClientProfileOut(
        **base.model_dump(),
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
                created_at=n.created_at.isoformat(),
                updated_at=n.updated_at.isoformat() if n.updated_at else None,
            )
            for n in sorted(client.notes, key=lambda x: x.created_at, reverse=True)[:3]
        ],
    )


# ─── GET /clients/{id}/events ─────────────────────────────────────────────────

@router.get("/{client_id}/events", response_model=list[EventRecordOut])
async def get_client_events(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    event_type: Optional[str] = Query(None, description="payment | visit | freeze"),
):
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, studio_id, db)

    events: list[EventRecordOut] = []

    if not event_type or event_type in ("all", "visit"):
        rows = (await db.execute(
            select(Reservation)
            .where(Reservation.client_id == client_id, Reservation.status == "attended")
            .options(selectinload(Reservation.lesson))
        )).scalars().all()
        for r in rows:
            lesson = r.lesson
            events.append(EventRecordOut(
                date=lesson.start_time.date().isoformat() if lesson else None,
                type="visit",
                title=lesson.name if lesson else "Занятие",
                trainer=lesson.teacher_name if lesson else None,
            ))

    if not event_type or event_type in ("all", "payment"):
        rows = (await db.execute(
            select(ClientPayment)
            .where(ClientPayment.client_id == client_id, ClientPayment.status == "success")
            .order_by(ClientPayment.created_at.desc())
        )).scalars().all()
        for p in rows:
            events.append(EventRecordOut(
                date=p.created_at.date().isoformat(),
                type="payment",
                title=p.description,
                amount=str(p.amount),
            ))

    if not event_type or event_type in ("all", "freeze"):
        rows = (await db.execute(
            select(ClientSubscription)
            .where(
                ClientSubscription.client_id == client_id,
                ClientSubscription.is_frozen == True,
            )
        )).scalars().all()
        for s in rows:
            events.append(EventRecordOut(
                date=s.frozen_at.date().isoformat() if s.frozen_at else None,
                type="freeze",
                title=f"Заморозка: {s.type}",
            ))

    events.sort(key=lambda e: e.date or "0000-00-00", reverse=True)
    return events


# ─── GET /clients/{id}/notes ──────────────────────────────────────────────────

@router.get("/{client_id}/notes", response_model=list[NoteOut])
async def get_client_notes(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, studio_id, db)

    notes = (await db.execute(
        select(ClientNote)
        .where(ClientNote.client_id == client_id)
        .order_by(ClientNote.created_at.desc())
    )).scalars().all()

    return [
        NoteOut(
            id=n.id,
            text=n.text,
            created_at=n.created_at.isoformat(),
            updated_at=n.updated_at.isoformat() if n.updated_at else None,
        )
        for n in notes
    ]


# ─── GET /clients/{id}/activity ───────────────────────────────────────────────

@router.get("/{client_id}/activity", response_model=list[ActivityPointOut])
async def get_client_activity(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, studio_id, db)

    months = _last_12_months()
    today = date.today()
    cutoff = date(today.year - 1, today.month, 1)

    visit_rows = (await db.execute(
        select(
            extract("year", Lesson.start_time).label("yr"),
            extract("month", Lesson.start_time).label("mo"),
            func.count(Reservation.id).label("cnt"),
        )
        .join(Lesson, Reservation.lesson_id == Lesson.id)
        .where(
            Reservation.client_id == client_id,
            Reservation.status == "attended",
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
    client = Client(
        studio_id=studio_id,
        name=body.name,
        last_name=body.last_name,
        phone=body.phone,
        email=body.email,
        birth_date=body.birth_date,
        city=body.city,
        tags=body.tags or [],
        source=body.source,
        avatar_color=random.choice(_AVATAR_COLORS),
        status="new",
    )
    db.add(client)
    await db.flush()

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
    await db.commit()
    await db.refresh(client)
    return ClientCreatedOut(id=client.id, message="Клиент создан")


# ─── PATCH /clients/{id}/status ───────────────────────────────────────────────

@router.patch("/{client_id}/status", response_model=OkOut)
async def update_client_status(
    client_id: int,
    body: ClientStatusUpdate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, studio_id, db)
    client.status = body.status
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
    client = await _get_client_or_404(client_id, studio_id, db)
    client.status = "frozen" if body.frozen else "active"
    client.is_active = not body.frozen
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
    client = await _get_client_or_404(client_id, studio_id, db)
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
    client = await _get_client_or_404(client_id, studio_id, db)
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
    client = await _get_client_or_404(client_id, studio_id, db)
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
    await _get_client_or_404(client_id, studio_id, db)
    note = ClientNote(
        client_id=client_id,
        studio_id=studio_id,
        author_id=current_user.id,
        text=body.text,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return NoteCreatedOut(id=note.id, text=note.text, created_at=note.created_at.isoformat())


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
    await _get_client_or_404(client_id, studio_id, db)
    note = (await db.execute(
        select(ClientNote).where(ClientNote.id == note_id, ClientNote.client_id == client_id)
    )).scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Заметка не найдена")
    note.text = body.text
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
    await _get_client_or_404(client_id, studio_id, db)
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
    studio_id = ctx.studio_id
    await _get_client_or_404(client_id, studio_id, db)

    lesson = (await db.execute(
        select(Lesson).where(Lesson.id == body.lesson_id, Lesson.studio_id == studio_id)
    )).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Занятие не найдено")

    existing_count = (await db.execute(
        select(func.count(Reservation.id))
        .where(Reservation.lesson_id == body.lesson_id, Reservation.status != "cancelled")
    )).scalar() or 0

    if existing_count >= lesson.total_spots:
        raise HTTPException(status_code=400, detail="Все места заняты")

    duplicate = (await db.execute(
        select(Reservation).where(
            Reservation.client_id == client_id,
            Reservation.lesson_id == body.lesson_id,
            Reservation.status == "active",
        )
    )).scalar_one_or_none()
    if duplicate:
        raise HTTPException(status_code=400, detail="Клиент уже записан на это занятие")

    reservation = Reservation(
        client_id=client_id,
        lesson_id=body.lesson_id,
        spot_number=existing_count + 1,
        status="active",
        booking_channel="manual",
    )
    db.add(reservation)
    await db.flush()  # нужен reservation.id для ленты
    log_activity(
        db, studio_id, "booking",
        title=f"Запись на «{lesson.name}»",
        actor_name=f"{current_user.name} {current_user.last_name or ''}".strip(),
        entity_type="reservation", entity_id=reservation.id,
    )
    await db.commit()
    await db.refresh(reservation)
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
    client = await _get_client_or_404(client_id, studio_id, db)
    return ActionMessageOut(ok=True, message=f"Звонок клиенту {client.name} инициирован")


# ─── POST /clients/{id}/message ───────────────────────────────────────────────

@router.post("/{client_id}/message", response_model=ActionMessageOut)
async def send_message(
    client_id: int,
    body: MessageSend,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, studio_id, db)
    return ActionMessageOut(ok=True, message=f"Сообщение отправлено клиенту {client.name} через {body.channel}")


# ─── DELETE /clients/{id} ─────────────────────────────────────────────────────

@router.delete("/{client_id}", response_model=OkOut)
async def delete_client(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    client = await _get_client_or_404(client_id, studio_id, db)
    await db.delete(client)
    await db.commit()
    return OkOut(ok=True)

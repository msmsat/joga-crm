import secrets
from datetime import date, datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_role, StudioContext
from models import (
    Hall, Lesson, Reservation, Service, StaffWorkingHours, Studio, StudioMember, User,
)
from schemas import (
    StaffCreate, StaffUpdate,
    StaffListResponse, StaffProfileResponse, StaffMutateResponse,
)
from schemas.staff.staff import StaffWorkingHoursItem
from security import get_password_hash
from services.contacts import (
    ensure_user_contacts_free, normalize, normalized_column,
)
from services.invites import send_invite
from services.notifier import notify
from services.plan_limits import check_plan_limit

router = APIRouter()


# ─── HELPERS ──────────────────────────────────────────────────────────────────

async def _get_staff_member(
    staff_id: int, studio_id: int, db: AsyncSession
) -> tuple[User, StudioMember]:
    result = await db.execute(
        select(User, StudioMember)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id, User.id == staff_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return row[0], row[1]


async def _find_user_by_contacts(
    email: str, phone: Optional[str], db: AsyncSession
) -> Optional[User]:
    """Аккаунт продукта с таким email или телефоном, если он уже существует.

    Сравнение нормализованное: в БД до миграции могли остаться значения в разных
    форматах, и «+7 999 …» не должен разойтись с «79999…».
    """
    conditions = [
        normalized_column(User, field) == normalize(field, value)
        for field, value in (("email", email), ("phone", phone))
        if normalize(field, value) is not None
    ]
    if not conditions:
        return None
    result = await db.execute(
        select(User).options(selectinload(User.services)).where(or_(*conditions)).limit(1)
    )
    return result.scalars().first()


async def _studio_of(studio_id: int, db: AsyncSession) -> Studio:
    """Студия для письма-приглашения — нужны её название, лого и язык."""
    return (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one()


async def _membership_of(
    user_id: int, studio_id: int, db: AsyncSession
) -> Optional[StudioMember]:
    result = await db.execute(
        select(StudioMember).where(
            StudioMember.user_id == user_id,
            StudioMember.studio_id == studio_id,
        )
    )
    return result.scalars().first()


async def _resolve_services(service_ids: list[int], studio_id: int, db: AsyncSession) -> list[Service]:
    """Услуги по id, скоуп студии. Чужой/несуществующий id → 404."""
    if not service_ids:
        return []
    result = await db.execute(
        select(Service).where(Service.id.in_(service_ids), Service.studio_id == studio_id)
    )
    services = result.scalars().all()
    if len(services) != len(set(service_ids)):
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    return list(services)


async def _replace_schedule(
    user_id: int, studio_id: int, schedule: list[StaffWorkingHoursItem], db: AsyncSession
) -> None:
    """Полная замена графика сотрудника В ЭТОЙ студии (пришёл список — он и есть истина).

    Скоуп по studio_id обязателен: у человека, работающего в двух студиях, два
    независимых графика, и правка одной студией не должна затирать другую
    (docs/ROADMAP_ACCOUNTS, решение 7).
    """
    await db.execute(
        delete(StaffWorkingHours).where(
            StaffWorkingHours.user_id == user_id,
            StaffWorkingHours.studio_id == studio_id,
        )
    )
    for item in schedule:
        db.add(StaffWorkingHours(
            user_id=user_id,
            studio_id=studio_id,
            day_of_week=item.day_of_week,
            is_open=item.is_open,
            open_time=item.open_time,
            close_time=item.close_time,
        ))


def _is_online(user: User) -> bool:
    """Онлайн = сегодня заходил в CRM (задача 12); полночь сбрасывает статус сама."""
    return user.last_online_at == date.today()


def _staff_list_item(user: User, membership: StudioMember) -> dict:
    """Личные поля — с аккаунта, студийные (роль, должность) — с membership."""
    return {
        "id": user.id,
        "name": user.name,
        "last_name": user.last_name,
        "email": user.email,
        "phone": user.phone,
        "role": membership.role,
        "department": membership.department,
        "is_online": _is_online(user),
        # Приглашённый, но ещё не принявший приглашение сотрудник — не активен:
        # пароля у него нет, войти он не может (см. services/invites.py).
        "is_active": user.is_verified,
        "photo_url": user.photo_url,
        "avatar_gradient": user.avatar_gradient,
    }


# ─── GET /staff/ ──────────────────────────────────────────────────────────────

@router.get("/", response_model=StaffListResponse)
async def list_staff(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=100),
):
    studio_id = ctx.studio_id

    result = await db.execute(
        select(User, StudioMember)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id)
        .order_by(User.name)
    )
    rows = result.all()

    # summary считаем по всей студии, страницу вырезаем из уже загруженных строк.
    # ponytail: срез в Python ок на десятках сотрудников; тысячи — тогда offset/limit в SQL.
    by_role: dict[str, int] = {}
    online_count = 0
    for u, sm in rows:
        by_role[sm.role] = by_role.get(sm.role, 0) + 1
        if _is_online(u):
            online_count += 1

    page_rows = rows[offset:offset + limit]
    staff_items = [_staff_list_item(u, sm) for u, sm in page_rows]

    return {
        "summary": {
            "total": len(rows),
            "online": online_count,
            "by_role": by_role,
        },
        "staff": {
            "items": staff_items,
            "total": len(rows),
            "offset": offset,
            "limit": limit,
        },
    }


# ─── GET /staff/check-contact ─────────────────────────────────────────────────
# Объявлен до /{staff_id}, иначе FastAPI пытается прочитать «check-contact» как int.

@router.get("/check-contact")
async def check_staff_contact(
    field: Literal["email", "phone"],
    value: str,
    exclude_id: Optional[int] = Query(None, description="Кого не считать — правимый сотрудник"),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Два разных факта об одном контакте — форма берёт нужный ей.

    `in_studio` — человек с этим контактом УЖЕ работает в этой студии. При
    добавлении это настоящая ошибка: второе членство в одной студии запрещено
    (uq_studio_member).

    `taken` — контакт принадлежит какому-то аккаунту продукта, возможно из чужой
    студии. При ДОБАВЛЕНИИ это НЕ ошибка: человека привяжем к студии, а не
    создадим второй аккаунт (решение 8), и говорить «email уже зарегистрирован»
    здесь нельзя — владельцу это ничего не объясняет и только блокирует форму.
    А вот при ПРАВКЕ карточки ошибка: там контакт переписывается, и
    update_staff ответит 409.
    """
    normalized = normalize(field, value)
    if normalized is None:
        return {"taken": False, "in_studio": False}

    query = select(User.id).where(normalized_column(User, field) == normalized)
    if exclude_id is not None:
        query = query.where(User.id != exclude_id)
    user_id = (await db.execute(query.limit(1))).scalars().first()
    if user_id is None:
        return {"taken": False, "in_studio": False}

    in_studio = await _membership_of(user_id, ctx.studio_id, db) is not None
    return {"taken": True, "in_studio": in_studio}


# ─── GET /staff/{staff_id} ────────────────────────────────────────────────────

@router.get("/{staff_id}", response_model=StaffProfileResponse)
async def get_staff_profile(
    staff_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    user, membership = await _get_staff_member(staff_id, studio_id, db)

    services_result = await db.execute(
        select(Service)
        .join(Service.users)
        .where(User.id == staff_id, Service.studio_id == studio_id)
    )
    services = [{"id": s.id, "name": s.name} for s in services_result.scalars().all()]

    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = today_start + timedelta(days=1)
    month_ago = datetime.now() - timedelta(days=90)

    # Total bookings & attended
    bookings_result = await db.execute(
        select(Reservation.status, func.count(Reservation.id))
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Lesson.teacher_id == staff_id, Lesson.studio_id == studio_id)
        .group_by(Reservation.status)
    )
    bookings_by_status: dict[str, int] = {row[0]: row[1] for row in bookings_result.all()}
    total_bookings = sum(v for k, v in bookings_by_status.items() if k != "cancelled")
    total_attended = bookings_by_status.get("attended", 0)

    # Load % — ratio of booked seats vs total seats over next 4 weeks
    load_window_end = datetime.now() + timedelta(weeks=4)
    load_result = await db.execute(
        select(
            func.sum(Lesson.total_spots).label("total_spots"),
            func.count(Reservation.id).label("booked"),
        )
        .outerjoin(
            Reservation,
            (Reservation.lesson_id == Lesson.id) & (Reservation.status != "cancelled"),
        )
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Lesson.start_time >= datetime.now(),
            Lesson.start_time <= load_window_end,
            Lesson.status != "cancelled",
        )
    )
    load_row = load_result.first()
    total_spots = load_row.total_spots or 0
    booked_spots = load_row.booked or 0
    load_percent = round(booked_spots / total_spots * 100) if total_spots > 0 else 0

    # Total revenue — sum of price × attended reservations per lesson
    revenue_result = await db.execute(
        select(func.sum(Lesson.price))
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Reservation.status == "attended",
        )
    )
    total_revenue = revenue_result.scalar() or 0

    # Halls used in last 90 days
    halls_result = await db.execute(
        select(Hall)
        .join(Lesson, Lesson.hall_id == Hall.id)
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Lesson.start_time >= month_ago,
        )
        .distinct(Hall.id)
    )
    halls = [
        {"id": h.id, "name": h.name, "color": h.color}
        for h in halls_result.scalars().all()
    ]
    # Today's schedule
    today_lessons_result = await db.execute(
        select(Lesson)
        .options(selectinload(Lesson.hall), selectinload(Lesson.reservations))
        .where(
            Lesson.teacher_id == staff_id,
            Lesson.studio_id == studio_id,
            Lesson.start_time >= today_start,
            Lesson.start_time < today_end,
            Lesson.status != "cancelled",
        )
        .order_by(Lesson.start_time)
    )
    today_schedule = []
    for lesson in today_lessons_result.scalars().all():
        booked = sum(1 for r in lesson.reservations if r.status != "cancelled")
        today_schedule.append({
            "id": lesson.id,
            "name": lesson.name,
            "start_time": lesson.start_time.strftime("%H:%M"),
            "duration_min": lesson.duration_min,
            "booked_count": booked,
            "total_spots": lesson.total_spots,
            "hall": {"id": lesson.hall.id, "name": lesson.hall.name, "color": lesson.hall.color}
            if lesson.hall else None,
        })

    # Weekly working hours — только этой студии: в другой у него свой график.
    wh_result = await db.execute(
        select(StaffWorkingHours)
        .where(
            StaffWorkingHours.user_id == staff_id,
            StaffWorkingHours.studio_id == studio_id,
        )
        .order_by(StaffWorkingHours.day_of_week)
    )
    week_working_hours = [
        {
            "day_of_week": wh.day_of_week,
            "is_open": wh.is_open,
            "open_time": wh.open_time,
            "close_time": wh.close_time,
        }
        for wh in wh_result.scalars().all()
    ]

    return {
        "id": user.id,
        "name": user.name,
        "last_name": user.last_name,
        "email": user.email,
        "phone": user.phone,
        "role": membership.role,
        # Должность и деньги — условия работы В ЭТОЙ студии, поэтому с membership.
        # avg_rating остаётся с аккаунта: это оценка человека, а не студии.
        "department": membership.department,
        "is_online": _is_online(user),
        "is_active": user.is_verified,
        "photo_url": user.photo_url,
        "avatar_gradient": user.avatar_gradient,
        "salary": membership.salary,
        "rate": membership.rate,
        "rate_type": membership.rate_type,
        "avg_rating": user.avg_rating,
        "stats": {
            "total_bookings": total_bookings,
            "total_attended": total_attended,
            "load_percent": load_percent,
            "total_revenue": total_revenue,
        },
        "halls": halls,
        "services": services,
        "today_schedule": today_schedule,
        "week_working_hours": week_working_hours,
    }


# ─── POST /staff/ ─────────────────────────────────────────────────────────────

@router.post("/", status_code=201, response_model=StaffMutateResponse)
async def create_staff(
    data: StaffCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    await check_plan_limit(db, studio_id, "staff")

    services = await _resolve_services(data.service_ids, studio_id, db)

    # Аккаунт глобальный: если контакт уже известен продукту, второго User с ним
    # быть не может — человека ПРИВЯЗЫВАЕМ к студии, а не создаём заново
    # (docs/ROADMAP_ACCOUNTS, решение 8). Так один тренер работает в нескольких
    # студиях под одним логином и паролем.
    user = await _find_user_by_contacts(data.email, data.phone, db)

    if user is None:
        user = User(
            email=data.email,
            name=data.name,
            last_name=data.last_name,
            phone=data.phone,
            photo_url=data.photo_url,
            # Пароля ещё нет — его задаст сам сотрудник по ссылке из письма.
            # Хэш всё равно ставим случайный, а не пустой: NOT NULL в схеме, и
            # подобрать «пустой пароль» на /login должно быть невозможно.
            hashed_password=get_password_hash(secrets.token_urlsafe(32)),
            is_verified=False,      # станет True, когда сотрудник примет приглашение
            is_onboarded=True,      # онбординг только для владельца новой студии
            services=services,
        )
        db.add(user)
        await db.flush()
    else:
        # Уже в этой студии — настоящая ошибка, а не приглашение.
        if await _membership_of(user.id, studio_id, db) is not None:
            raise HTTPException(
                status_code=409,
                detail="Этот человек уже работает в вашей студии",
            )
        # Личные данные чужого аккаунта не перезаписываем: имя, пароль, фото и
        # контакты принадлежат человеку, а не студии, которая его позвала.
        # Услуги студийные (Service.studio_id), поэтому их добавить можно.
        user.services = list({*user.services, *services})

    membership = StudioMember(
        user_id=user.id,
        studio_id=studio_id,
        role=data.role,
        department=data.department,
        salary=data.salary,
        rate=data.rate,
        rate_type=data.rate_type,
    )
    db.add(membership)
    await _replace_schedule(user.id, studio_id, data.schedule, db)
    await db.commit()
    await db.refresh(user)
    await db.refresh(membership)

    await notify(db, studio_id, "owner", "o5", {
        "staff_name": f"{user.name} {user.last_name or ''}".strip(),
    })

    studio = await _studio_of(studio_id, db)
    invite_url = await send_invite(user, studio, membership.role)
    return {"ok": True, "staff": _staff_list_item(user, membership), "invite_url": invite_url}


# ─── POST /staff/{staff_id}/invite ────────────────────────────────────────────

@router.post("/{staff_id}/invite", response_model=StaffMutateResponse)
async def resend_invite(
    staff_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Отправить приглашение повторно (письмо не дошло, ссылка протухла).

    Ссылка — новый токен от текущего момента, а не тот же самый: у прежнего
    свой `exp`, и «отправить повторно» на седьмой день иначе прислало бы
    мёртвую ссылку.
    """
    user, membership = await _get_staff_member(staff_id, ctx.studio_id, db)
    studio = await _studio_of(ctx.studio_id, db)
    invite_url = await send_invite(user, studio, membership.role)
    return {"ok": True, "staff": _staff_list_item(user, membership), "invite_url": invite_url}


# ─── PUT /staff/{staff_id} ────────────────────────────────────────────────────

@router.put("/{staff_id}", response_model=StaffMutateResponse)
async def update_staff(
    staff_id: int,
    data: StaffUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    user_result = await db.execute(
        select(User, StudioMember)
        .join(StudioMember, StudioMember.user_id == User.id)
        .options(selectinload(User.services))
        .where(StudioMember.studio_id == studio_id, User.id == staff_id)
    )
    row = user_result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    user, membership = row

    # Проверяем только изменённые контакты: в БД остались исторические дубли по email
    # (docs/ROADMAP_ACCOUNTS, решение 3 — чистка), и на них нельзя запирать правку
    # остальных полей карточки. Новый конфликт при этом ввести всё равно нельзя.
    await ensure_user_contacts_free(
        db,
        email=data.email if data.email != user.email else None,
        phone=data.phone if data.phone != user.phone else None,
        exclude_id=staff_id,
    )

    services = await _resolve_services(data.service_ids, studio_id, db)

    role_changed = data.role is not None and membership.role != data.role

    user.name = data.name
    user.last_name = data.last_name
    user.email = data.email
    user.phone = data.phone
    user.photo_url = data.photo_url
    user.services = services
    # Условия работы — в membership этой студии. У человека, работающего ещё
    # где-то, там своя ставка и своя должность, и они остаются нетронутыми.
    membership.department = data.department
    membership.salary = data.salary
    membership.rate = data.rate
    membership.rate_type = data.rate_type
    if data.role is not None:
        membership.role = data.role
    await _replace_schedule(user.id, studio_id, data.schedule, db)
    await db.commit()
    await db.refresh(user)

    if role_changed:
        await notify(db, studio_id, "owner", "o7", {
            "staff_name": f"{user.name} {user.last_name or ''}".strip(),
            "role": data.role,
        })

    return {"ok": True, "staff": _staff_list_item(user, membership)}


# ─── DELETE /staff/{staff_id} ─────────────────────────────────────────────────

@router.delete("/{staff_id}", response_model=dict)
async def delete_staff(
    staff_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    _, membership = await _get_staff_member(staff_id, studio_id, db)

    if membership.role == 'owner':
        owner_count_result = await db.execute(
            select(func.count()).select_from(StudioMember)
            .where(StudioMember.studio_id == studio_id, StudioMember.role == 'owner')
        )
        if owner_count_result.scalar_one() <= 1:
            raise HTTPException(status_code=403, detail="Нельзя удалить единственного владельца студии")

    await db.delete(membership)
    await db.commit()

    return {"ok": True}

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import get_current_user, oauth2_scheme, SECRET_KEY, ALGORITHM
from models import (
    Hall, Lesson, Reservation, StaffWorkingHours, StudioMember, User,
)
from schemas import (
    StaffCreate, StaffUpdate,
    StaffListResponse, StaffProfileResponse, StaffMutateResponse,
)

router = APIRouter()


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _studio_id_from_token(token: str) -> int:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    studio_id = payload.get("studio_id")
    if not studio_id:
        raise HTTPException(status_code=401, detail="studio_id не найден в токене")
    return int(studio_id)


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


def _staff_list_item(user: User, role: str) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "last_name": user.last_name,
        "email": user.email,
        "phone": user.phone,
        "role": role,
        "department": user.department,
        "is_online": user.is_online,
        "photo_url": user.photo_url,
        "avatar_gradient": user.avatar_gradient,
    }


# ─── GET /staff/ ──────────────────────────────────────────────────────────────

@router.get("/", response_model=StaffListResponse)
async def list_staff(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)

    result = await db.execute(
        select(User, StudioMember)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id)
        .order_by(User.name)
    )
    rows = result.all()

    staff_list = [_staff_list_item(u, sm.role) for u, sm in rows]

    by_role: dict[str, int] = {}
    online_count = 0
    for u, sm in rows:
        by_role[sm.role] = by_role.get(sm.role, 0) + 1
        if u.is_online:
            online_count += 1

    return {
        "summary": {
            "total": len(rows),
            "online": online_count,
            "by_role": by_role,
        },
        "staff": staff_list,
    }


# ─── GET /staff/{staff_id} ────────────────────────────────────────────────────

@router.get("/{staff_id}", response_model=StaffProfileResponse)
async def get_staff_profile(
    staff_id: int,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)
    user, membership = await _get_staff_member(staff_id, studio_id, db)

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

    # Weekly working hours
    wh_result = await db.execute(
        select(StaffWorkingHours)
        .where(StaffWorkingHours.user_id == staff_id)
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
        "department": user.department,
        "is_online": user.is_online,
        "is_active": user.is_verified,
        "photo_url": user.photo_url,
        "avatar_gradient": user.avatar_gradient,
        "salary": user.salary,
        "rate": user.rate,
        "rate_type": user.rate_type,
        "avg_rating": user.avg_rating,
        "stats": {
            "total_bookings": total_bookings,
            "total_attended": total_attended,
            "load_percent": load_percent,
            "total_revenue": total_revenue,
        },
        "halls": halls,
        "today_schedule": today_schedule,
        "week_working_hours": week_working_hours,
    }


# ─── POST /staff/ ─────────────────────────────────────────────────────────────

@router.post("/", status_code=201, response_model=StaffMutateResponse)
async def create_staff(
    data: StaffCreate,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)

    user = User(
        email=data.email,
        name=data.name,
        last_name=data.last_name,
        phone=data.phone,
        department=data.department,
        salary=data.salary,
        rate=data.rate,
        rate_type=data.rate_type,
        hashed_password="",
        is_verified=False,
        is_onboarded=False,
        is_online=False,
    )
    db.add(user)
    await db.flush()

    membership = StudioMember(user_id=user.id, studio_id=studio_id, role=data.role)
    db.add(membership)
    await db.commit()
    await db.refresh(user)

    return {"ok": True, "staff": _staff_list_item(user, data.role)}


# ─── PUT /staff/{staff_id} ────────────────────────────────────────────────────

@router.put("/{staff_id}", response_model=StaffMutateResponse)
async def update_staff(
    staff_id: int,
    data: StaffUpdate,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)
    user, membership = await _get_staff_member(staff_id, studio_id, db)

    user.name = data.name
    user.last_name = data.last_name
    user.email = data.email
    user.phone = data.phone
    user.department = data.department
    user.salary = data.salary
    user.rate = data.rate
    user.rate_type = data.rate_type
    membership.role = data.role

    await db.commit()
    await db.refresh(user)

    return {"ok": True, "staff": _staff_list_item(user, membership.role)}


# ─── DELETE /staff/{staff_id} ─────────────────────────────────────────────────

@router.delete("/{staff_id}", response_model=dict)
async def delete_staff(
    staff_id: int,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)
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

"""Расписание и брони мини-приложения клиента (`/global/lessons/*`,
`/global/reservations/*`).

Оба семейства ручек живут в одном файле без общего префикса на роутере (у них
разные первые сегменты пути) — заводить третий модуль или пакет ради этого
эпик прямо запрещает (блок 0). Студия всегда берётся из `client.studio_id`
(`get_current_client`), никогда из параметров запроса — чужой lesson_id
недостижим по построению: списки и брони фильтруются по студии клиента на
уровне SQL.

Механика списания/возврата абонемента и уведомлений не своя — целиком
переиспользована из `services.booking_access`/`services.subscription_charge`/
`services.notifier`, той же, что и у Журнала (`routers/schedule/reservations.py`)
и публичной записи (`routers/booking/public.py`): расхождение логики между
ними и мини-приложением означает разъехавшиеся остатки абонементов.
"""
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from ratelimit import limiter
from models import Client, Hall, Lesson, Reservation, StudioBookingSettings
from schemas._base import BaseSchema
from services.booking_access import find_eligible_subscription
from services.notifier import _fmt_amount, _studio_prefs, notify
from services.subscription_charge import charge_reservation, notify_subscription_remaining, refund_reservation

from .miniapp import get_current_client

router = APIRouter()

# Те же дефолты, что в public.py / models/settings.py, когда у студии ещё нет
# StudioBookingSettings.
DEFAULT_MIN_BOOKING_ADVANCE_MIN = 120
DEFAULT_CANCELLATION_DEADLINE_MIN = 240
DEFAULT_HALL_COLOR = "#FCAE91"


class MiniappLesson(BaseSchema):
    id: int
    name: str
    level: str
    equipment: str
    teacher_name: str
    start_time: datetime
    duration_min: int
    price: int
    total_spots: int
    time: str
    teacher: str
    price_str: str
    color: str
    badge: str
    taken_spots: list[int]
    is_booked_by_user: bool


class MiniappUpcomingLesson(MiniappLesson):
    spot_number: int


class MiniappPastLesson(MiniappLesson):
    spot_number: int
    rating: Optional[int]


class MiniappMyLessons(BaseSchema):
    upcoming: list[MiniappUpcomingLesson]
    past: list[MiniappPastLesson]


def _badge(total_spots: int, taken: int) -> str:
    free = total_spots - taken
    if free <= 0:
        return "full"
    if free <= 2:
        return "almost"
    return "open"


def _lesson_fields(
    lesson: Lesson,
    taken_spots: list[int],
    is_booked_by_user: bool,
    currency: str,
    hall_colors: dict[int, str],
) -> dict:
    color = DEFAULT_HALL_COLOR
    if lesson.hall_id is not None:
        color = hall_colors.get(lesson.hall_id) or DEFAULT_HALL_COLOR
    return dict(
        id=lesson.id,
        name=lesson.name,
        level=lesson.level,
        equipment=lesson.equipment,
        teacher_name=lesson.teacher_name,
        start_time=lesson.start_time,
        duration_min=lesson.duration_min,
        price=lesson.price,
        total_spots=lesson.total_spots,
        time=lesson.start_time.strftime("%H:%M"),
        teacher=lesson.teacher_name,
        price_str=_fmt_amount(lesson.price, currency),
        color=color,
        badge=_badge(lesson.total_spots, len(taken_spots)),
        taken_spots=taken_spots,
        is_booked_by_user=is_booked_by_user,
    )


async def _reservations_map(
    db: AsyncSession, lesson_ids: list[int],
) -> tuple[dict[int, list[int]], dict[int, set[int]]]:
    """Один запрос на все занятия сразу — не N+1 в цикле по занятиям."""
    if not lesson_ids:
        return {}, {}
    rows = (await db.execute(
        select(Reservation.lesson_id, Reservation.spot_number, Reservation.client_id)
        .where(Reservation.lesson_id.in_(lesson_ids), Reservation.status != "cancelled")
    )).all()
    taken: dict[int, list[int]] = {}
    booked_clients: dict[int, set[int]] = {}
    for lesson_id, spot_number, client_id in rows:
        taken.setdefault(lesson_id, []).append(spot_number)
        booked_clients.setdefault(lesson_id, set()).add(client_id)
    return taken, booked_clients


async def _hall_colors(db: AsyncSession, lessons: list[Lesson]) -> dict[int, str]:
    hall_ids = {lesson.hall_id for lesson in lessons if lesson.hall_id is not None}
    if not hall_ids:
        return {}
    rows = (await db.execute(select(Hall.id, Hall.color).where(Hall.id.in_(hall_ids)))).all()
    return {hall_id: color for hall_id, color in rows if color}


@router.get("/lessons/date/{target_date}", response_model=list[MiniappLesson])
async def lessons_by_date(
    target_date: date,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    day_start = datetime.combine(target_date, time.min)
    day_end = day_start + timedelta(days=1)

    lessons = (await db.execute(
        select(Lesson)
        .where(
            Lesson.studio_id == client.studio_id,
            Lesson.status != "cancelled",
            Lesson.start_time >= day_start,
            Lesson.start_time < day_end,
        )
        .order_by(Lesson.start_time)
    )).scalars().all()
    if not lessons:
        return []

    taken_by_lesson, booked_by_client = await _reservations_map(db, [l.id for l in lessons])
    hall_colors = await _hall_colors(db, lessons)
    _, currency = await _studio_prefs(db, client.studio_id)

    return [
        MiniappLesson(**_lesson_fields(
            lesson,
            taken_by_lesson.get(lesson.id, []),
            client.id in booked_by_client.get(lesson.id, set()),
            currency,
            hall_colors,
        ))
        for lesson in lessons
    ]


@router.get("/lessons/next", response_model=Optional[MiniappLesson])
async def next_lesson(
    response: Response,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    settings = (await db.execute(
        select(StudioBookingSettings).where(StudioBookingSettings.studio_id == client.studio_id)
    )).scalar_one_or_none()
    advance_min = settings.min_booking_advance_min if settings else DEFAULT_MIN_BOOKING_ADVANCE_MIN
    earliest = datetime.now() + timedelta(minutes=advance_min)

    lesson = (await db.execute(
        select(Lesson)
        .where(
            Lesson.studio_id == client.studio_id,
            Lesson.status != "cancelled",
            Lesson.start_time >= earliest,
        )
        .order_by(Lesson.start_time)
        .limit(1)
    )).scalar_one_or_none()

    if lesson is None:
        response.status_code = 204
        return None

    taken_by_lesson, booked_by_client = await _reservations_map(db, [lesson.id])
    hall_colors = await _hall_colors(db, [lesson])
    _, currency = await _studio_prefs(db, client.studio_id)

    return MiniappLesson(**_lesson_fields(
        lesson,
        taken_by_lesson.get(lesson.id, []),
        client.id in booked_by_client.get(lesson.id, set()),
        currency,
        hall_colors,
    ))


@router.get("/lessons/my", response_model=MiniappMyLessons)
async def my_lessons(
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Reservation, Lesson)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.client_id == client.id, Reservation.status != "cancelled")
    )).all()
    if not rows:
        return MiniappMyLessons(upcoming=[], past=[])

    lessons_by_id = {lesson.id: lesson for _, lesson in rows}
    taken_by_lesson, _ = await _reservations_map(db, list(lessons_by_id))
    hall_colors = await _hall_colors(db, list(lessons_by_id.values()))
    _, currency = await _studio_prefs(db, client.studio_id)

    now = datetime.now()
    upcoming: list[MiniappUpcomingLesson] = []
    past: list[MiniappPastLesson] = []

    for reservation, lesson in rows:
        fields = _lesson_fields(
            lesson,
            taken_by_lesson.get(lesson.id, []),
            True,  # это его собственная бронь
            currency,
            hall_colors,
        )
        if lesson.start_time < now:
            past.append(MiniappPastLesson(**fields, spot_number=reservation.spot_number, rating=reservation.rating))
        else:
            upcoming.append(MiniappUpcomingLesson(**fields, spot_number=reservation.spot_number))

    upcoming.sort(key=lambda lesson: lesson.start_time)
    past.sort(key=lambda lesson: lesson.start_time, reverse=True)

    return MiniappMyLessons(upcoming=upcoming, past=past)


class ReservationCreateRequest(BaseSchema):
    lesson_id: int
    spot_number: int


class RateReservationRequest(BaseSchema):
    rating: int = Field(ge=1, le=5)


class MiniappReservation(BaseSchema):
    id: int
    lesson_id: int
    spot_number: int
    status: str
    rating: Optional[int]


async def _own_active_reservation(db: AsyncSession, client: Client, lesson_id: int) -> Reservation:
    """Своя активная бронь на занятие или 404 — общий поиск для cancel/rate."""
    reservation = (await db.execute(
        select(Reservation).where(
            Reservation.lesson_id == lesson_id,
            Reservation.client_id == client.id,
            Reservation.status != "cancelled",
        )
    )).scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return reservation


async def _studio_lesson(db: AsyncSession, client: Client, lesson_id: int) -> Lesson:
    """Занятие своей студии — чужая студия 404, как и списки выше."""
    lesson = (await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.studio_id == client.studio_id)
    )).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    return lesson


@router.post("/reservations", response_model=MiniappReservation, status_code=201)
@limiter.limit("10/minute")
async def create_reservation(
    request: Request,
    body: ReservationCreateRequest,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    """Бронь коврика. Образец — `public.py:136-285` и `reservations.py:21-104`,

    но без `assert_can_book`: клиент без подходящего абонемента должен получить
    возможность записаться и оплатить (в студии или блоком 6), а не 403 — как
    у публичной записи, а не как в Журнале. Абонемент подбирает
    `find_eligible_subscription`, списывает `charge_reservation`, если он есть.
    """
    lesson = (await db.execute(
        select(Lesson).where(
            Lesson.id == body.lesson_id,
            Lesson.studio_id == client.studio_id,
            Lesson.status != "cancelled",
        )
    )).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Занятие не найдено")

    settings = (await db.execute(
        select(StudioBookingSettings).where(StudioBookingSettings.studio_id == client.studio_id)
    )).scalar_one_or_none()
    advance_min = settings.min_booking_advance_min if settings else DEFAULT_MIN_BOOKING_ADVANCE_MIN
    if lesson.start_time < datetime.now() + timedelta(minutes=advance_min):
        raise HTTPException(status_code=400, detail="Запись на это занятие закрыта")

    if not (1 <= body.spot_number <= lesson.total_spots):
        raise HTTPException(status_code=400, detail="Неверный номер места")

    active = (await db.execute(
        select(Reservation).where(
            Reservation.lesson_id == body.lesson_id,
            Reservation.status != "cancelled",
        )
    )).scalars().all()
    if len(active) >= lesson.total_spots:
        raise HTTPException(status_code=400, detail="Все места заняты")
    if any(r.client_id == client.id for r in active):
        raise HTTPException(status_code=409, detail="Вы уже записаны на это занятие")
    if any(r.spot_number == body.spot_number for r in active):
        # Именно эта строка — плановый текст ошибки, уже понятный мини-приложению
        # (см. блок 3 EPIC_MA_REAL_BACKEND, api/user.ts:156 показывает detail как есть).
        raise HTTPException(status_code=409, detail="Це місце вже зайняте")

    reservation = Reservation(
        client_id=client.id,
        lesson_id=body.lesson_id,
        spot_number=body.spot_number,
        status="active",
        booking_channel="telegram",
    )
    db.add(reservation)
    sub = await find_eligible_subscription(db, client.id, lesson)
    remaining = await charge_reservation(db, client.studio_id, reservation, sub)
    await db.commit()
    await db.refresh(reservation)

    await notify(db, client.studio_id, "client", "c1", {
        "client_id": client.id,
        "lesson_name": lesson.name,
        "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
    })
    await notify(db, client.studio_id, "admin", "a1", {
        "lesson_name": lesson.name,
        "client_name": client.name,
    })
    if lesson.teacher_id is not None:
        await notify(db, client.studio_id, "trainer", "t1", {
            "trainer_id": lesson.teacher_id,
            "lesson_name": lesson.name,
            "client_name": client.name,
            "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
        })
    await notify_subscription_remaining(db, client.studio_id, client.id, remaining)

    return MiniappReservation(
        id=reservation.id, lesson_id=reservation.lesson_id,
        spot_number=reservation.spot_number, status=reservation.status, rating=reservation.rating,
    )


@router.post("/reservations/{lesson_id}/cancel", response_model=MiniappReservation)
@limiter.limit("10/minute")
async def cancel_reservation(
    request: Request,
    lesson_id: int,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    reservation = await _own_active_reservation(db, client, lesson_id)
    lesson = await _studio_lesson(db, client, lesson_id)

    settings = (await db.execute(
        select(StudioBookingSettings).where(StudioBookingSettings.studio_id == client.studio_id)
    )).scalar_one_or_none()
    deadline_min = settings.cancellation_deadline_min if settings else DEFAULT_CANCELLATION_DEADLINE_MIN
    if lesson.start_time < datetime.now() + timedelta(minutes=deadline_min):
        raise HTTPException(
            status_code=400,
            detail=f"Отменить запись можно не позднее чем за {deadline_min} минут до начала",
        )

    reservation.status = "cancelled"
    reservation.cancelled_at = datetime.now()
    await refund_reservation(db, reservation)  # занятие возвращается на абонемент
    await db.commit()
    await db.refresh(reservation)

    await notify(db, client.studio_id, "client", "c3", {
        "client_id": client.id,
        "lesson_name": lesson.name,
        "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
    })

    return MiniappReservation(
        id=reservation.id, lesson_id=reservation.lesson_id,
        spot_number=reservation.spot_number, status=reservation.status, rating=reservation.rating,
    )


@router.post("/reservations/{lesson_id}/rate", response_model=MiniappReservation)
@limiter.limit("10/minute")
async def rate_reservation(
    request: Request,
    lesson_id: int,
    body: RateReservationRequest,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    reservation = await _own_active_reservation(db, client, lesson_id)
    lesson = await _studio_lesson(db, client, lesson_id)

    if lesson.start_time >= datetime.now():
        raise HTTPException(status_code=403, detail="Оценить можно только прошедшее занятие")

    reservation.rating = body.rating
    await db.commit()
    await db.refresh(reservation)

    return MiniappReservation(
        id=reservation.id, lesson_id=reservation.lesson_id,
        spot_number=reservation.spot_number, status=reservation.status, rating=reservation.rating,
    )

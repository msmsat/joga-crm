"""CRM commands use staff roles and current studio, never tenant IDs from the body."""
from datetime import timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import StudioContext, require_role
from models import BookingQuote, Lesson, Reservation, Studio
from ratelimit import limiter
from schemas.schedule.hybrid import (AvailabilityRead, BookingRead, ConfirmRequest,
    CrmAvailabilityQuery, CrmQuoteRequest, CrmRescheduleQuoteRequest, QuoteRead,
    RescheduleConfirmRequest, ResourceQuoteRequest, ResourceStaffMemberRead, ResourceStaffRead)
from services import (booking_quotes as quotes, hybrid_http, resource_availability, resource_booking,
                      resource_reschedule, studio_time)

router = APIRouter()
staff = require_role("owner", "admin")


def _actor(ctx, client_id):
    return quotes.Actor(ctx.studio_id, client_id, ctx.user.id, "crm")


async def _quote_actor(db, ctx, quote_id):
    client_id = (await db.execute(select(BookingQuote.client_id).where(BookingQuote.id == quote_id,
        BookingQuote.studio_id == ctx.studio_id, BookingQuote.actor_user_id == ctx.user.id,
        BookingQuote.surface == "crm"))).scalar_one_or_none()
    if client_id is None:
        quotes.reject("NOT_FOUND", 404)
    return _actor(ctx, client_id)


async def _reservation_actor(db, ctx, reservation_id):
    client_id = (await db.execute(select(Reservation.client_id).join(Lesson).where(
        Reservation.id == reservation_id, Lesson.studio_id == ctx.studio_id))).scalar_one_or_none()
    if client_id is None:
        quotes.reject("NOT_FOUND", 404)
    return _actor(ctx, client_id)


@router.get("/availability", response_model=AvailabilityRead)
@limiter.limit("60/minute")
async def availability(request: Request, query: Annotated[CrmAvailabilityQuery, Query()],
                       ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    return await resource_availability.availability(db, studio_id=ctx.studio_id, client=False, **query.model_dump())


@router.get("/resource-staff", response_model=ResourceStaffRead)
@limiter.limit("60/minute")
async def resource_staff(request: Request, ctx: StudioContext = Depends(staff),
                         db: AsyncSession = Depends(get_db)):
    """Кто из мастеров какие индивидуальные услуги ведёт и в каких филиалах.

    Форма записи в журнале собирает услугу, филиал и мастера только из этих
    связей. Правило то же, что у расчёта времени (`_eligible_staff`): иначе
    форма давала собрать мастера с филиалом, где он не принимает, и сервер
    честно отвечал «времени нет» без единого слота.

    Все филиалы и все услуги разом: форма переключает их на месте, и за каждой
    сменой филиала ходить сюда заново незачем. Цены — числом: кабинет
    форматирует деньги сам.
    """
    report = await resource_availability.resource_staff(db, studio_id=ctx.studio_id)
    return ResourceStaffRead(reason=report.reason, staff=[
        ResourceStaffMemberRead(
            teacher_id=row.teacher_id, name=row.name, last_name=row.last_name,
            photo_url=row.photo_url, department=row.department, service_ids=row.service_ids,
            service_prices=row.service_prices, service_durations=row.service_durations,
            branch_ids=row.branch_ids)
        for row in report.staff])


@router.post("/booking-quotes", response_model=QuoteRead, status_code=201)
@limiter.limit("20/minute")
async def create_quote(request: Request, body: CrmQuoteRequest,
                       ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    row = await quotes.create(db, _actor(ctx, body.client_id), body, hall_id=getattr(body, "hall_id", None))
    await db.commit()
    return hybrid_http.quote_response(row)


@router.get("/booking-quotes/{quote_id}", response_model=QuoteRead | BookingRead)
async def get_quote(quote_id: str, ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    actor = await _quote_actor(db, ctx, quote_id)
    row = await quotes.read(db, quote_id, actor)
    return await resource_booking.existing(db, row) if row.consumed_at else hybrid_http.quote_response(row)


@router.post("/bookings", response_model=BookingRead)
async def confirm(body: ConfirmRequest, background: BackgroundTasks,
                  ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    actor = await _quote_actor(db, ctx, body.quote_id)
    return await hybrid_http.after_commit(
        db, actor, await resource_booking.confirm(db, body.quote_id, actor), background)


@router.post("/reservations/{reservation_id}/cancel", response_model=BookingRead)
async def cancel(reservation_id: int, background: BackgroundTasks,
                 ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    return await hybrid_http.cancel(
        db, await _reservation_actor(db, ctx, reservation_id), reservation_id, background)


async def _moment(db, ctx, body: CrmRescheduleQuoteRequest) -> ResourceQuoteRequest:
    """Запрос переноса в том виде, в каком его считает сервис: с точным моментом.

    Местное время переводится по зоне студии. Время, которого в этот день нет
    (перевод часов весной), — отказ INVALID_START, а не молчаливый сдвиг на час.
    """
    starts_at = body.starts_at
    if body.local_start is not None:
        studio = await db.get(Studio, ctx.studio_id)
        try:
            starts_at = studio_time.to_utc(body.local_start.replace(tzinfo=None), studio) \
                .replace(tzinfo=timezone.utc)
        except ValueError:
            quotes.reject("INVALID_START", 422)
    return ResourceQuoteRequest(
        booking_mode="resource", service_id=body.service_id, branch_id=body.branch_id,
        teacher_id=body.teacher_id, starts_at=starts_at, payment_method=body.payment_method)


@router.post("/reservations/{reservation_id}/reschedule-quotes", response_model=QuoteRead, status_code=201)
async def move_quote(reservation_id: int, body: CrmRescheduleQuoteRequest,
                     ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    actor = await _reservation_actor(db, ctx, reservation_id)
    row = await resource_reschedule.create_quote(
        db, actor, reservation_id, await _moment(db, ctx, body),
        hall_id=body.hall_id, duration_min=body.duration_min)
    await db.commit()
    return hybrid_http.quote_response(row)


@router.post("/reservations/{reservation_id}/reschedule", response_model=BookingRead)
async def move(reservation_id: int, body: RescheduleConfirmRequest, background: BackgroundTasks,
               ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    actor = await _reservation_actor(db, ctx, reservation_id)
    result = await resource_reschedule.confirm(db, actor, reservation_id, body.quote_id, body.expected_version)
    return await hybrid_http.after_commit(db, actor, result, background)

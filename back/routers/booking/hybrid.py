"""Mini-app Hybrid Booking API; tenant/client identity comes from dependencies."""
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Client
from ratelimit import limiter
from schemas.schedule.hybrid import (PublicAvailabilityQuery, AvailabilityRead, BookingQuoteRequest,
    BookingRead, ConfirmRequest, PublicStaffDayQuery, QuoteRead, RescheduleConfirmRequest,
    ResourceQuoteRequest, StaffDayMemberRead, StaffDayRead)
from services import booking_quotes as quotes, hybrid_http, resource_availability, resource_booking, resource_reschedule
from .miniapp import Viewer, get_current_client, get_viewer

router = APIRouter()


def _actor(client):
    return quotes.Actor(client.studio_id, client.id)


@router.get("/availability", response_model=AvailabilityRead)
@limiter.limit("60/minute")
async def availability(request: Request, query: Annotated[PublicAvailabilityQuery, Query()],
                       viewer: Viewer = Depends(get_viewer), db: AsyncSession = Depends(get_db)):
    return await resource_availability.availability(db, studio_id=viewer.studio_id,
                                                  **query.model_dump(exclude={"studio_id"}))


@router.get("/staff-day", response_model=StaffDayRead)
@limiter.limit("60/minute")
async def staff_day(request: Request, query: Annotated[PublicStaffDayQuery, Query()],
                    viewer: Viewer = Depends(get_viewer), db: AsyncSession = Depends(get_db)):
    """Кто из мастеров работает в этот день и сколько у каждого свободного времени.

    Отдельно от `/availability` потому, что тот вычитает занятость и склеивает
    мастеров: «работает, но занят» в его ответе неотличимо от выходного. Клиенту
    эта разница нужна — занятого он показывает серым, а не прячет.
    """
    report = await resource_availability.staff_day(
        db, studio_id=viewer.studio_id, service_id=query.service_id,
        branch_id=query.branch_id, day=query.date)
    return StaffDayRead(reason=report.reason, staff=[
        StaffDayMemberRead(
            teacher_id=row.teacher_id, name=row.name, last_name=row.last_name,
            photo_url=row.photo_url, works=row.works, reason=row.reason,
            free_count=len(row.free), first_free=row.free[0] if row.free else None)
        for row in report.staff])


@router.post("/booking-quotes", response_model=QuoteRead, status_code=201)
@limiter.limit("20/minute")
async def create_quote(request: Request, body: BookingQuoteRequest,
                       client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    row = await quotes.create(db, _actor(client), body)
    await db.commit()
    return hybrid_http.quote_response(row)


@router.get("/booking-quotes/{quote_id}", response_model=QuoteRead | BookingRead)
async def get_quote(quote_id: str, client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    row = await quotes.read(db, quote_id, _actor(client))
    if row.consumed_at is not None:
        return await resource_booking.existing(db, row)
    return hybrid_http.quote_response(row)


@router.post("/bookings", response_model=BookingRead)
@limiter.limit("20/minute")
async def confirm(request: Request, body: ConfirmRequest, background: BackgroundTasks,
                  client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    actor = _actor(client)
    return await hybrid_http.after_commit(
        db, actor, await resource_booking.confirm(db, body.quote_id, actor), background)


@router.post("/bookings/{reservation_id}/cancel", response_model=BookingRead)
async def cancel(reservation_id: int, background: BackgroundTasks,
                 client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    return await hybrid_http.cancel(db, _actor(client), reservation_id, background)


@router.post("/reservations/{reservation_id}/reschedule-quotes", response_model=QuoteRead, status_code=201)
@limiter.limit("20/minute")
async def move_quote(request: Request, reservation_id: int, body: ResourceQuoteRequest,
                     client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    row = await resource_reschedule.create_quote(db, _actor(client), reservation_id, body)
    await db.commit()
    return hybrid_http.quote_response(row)


@router.post("/reservations/{reservation_id}/reschedule", response_model=BookingRead)
async def move(reservation_id: int, body: RescheduleConfirmRequest, background: BackgroundTasks,
               client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    actor = _actor(client)
    result = await resource_reschedule.confirm(db, actor, reservation_id, body.quote_id, body.expected_version)
    return await hybrid_http.after_commit(db, actor, result, background)

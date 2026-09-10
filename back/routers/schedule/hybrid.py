"""CRM commands use staff roles and current studio, never tenant IDs from the body."""
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import StudioContext, require_role
from models import BookingQuote, Lesson, Reservation
from ratelimit import limiter
from schemas.schedule.hybrid import (AvailabilityRead, BookingRead, ConfirmRequest,
    CrmAvailabilityQuery, CrmQuoteRequest, QuoteRead, RescheduleConfirmRequest, ResourceQuoteRequest)
from services import booking_quotes as quotes, hybrid_http, resource_availability, resource_booking, resource_reschedule

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


@router.post("/reservations/{reservation_id}/reschedule-quotes", response_model=QuoteRead, status_code=201)
async def move_quote(reservation_id: int, body: ResourceQuoteRequest,
                     ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    actor = await _reservation_actor(db, ctx, reservation_id)
    row = await resource_reschedule.create_quote(db, actor, reservation_id, body)
    await db.commit()
    return hybrid_http.quote_response(row)


@router.post("/reservations/{reservation_id}/reschedule", response_model=BookingRead)
async def move(reservation_id: int, body: RescheduleConfirmRequest, background: BackgroundTasks,
               ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    actor = await _reservation_actor(db, ctx, reservation_id)
    result = await resource_reschedule.confirm(db, actor, reservation_id, body.quote_id, body.expected_version)
    return await hybrid_http.after_commit(db, actor, result, background)

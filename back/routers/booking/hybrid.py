"""Mini-app Hybrid Booking API; tenant/client identity comes from dependencies."""
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Client, Studio
from ratelimit import limiter
from schemas.schedule.hybrid import (PublicAvailabilityQuery, AvailabilityRead, BookingPayRead,
    BookingPayRequest, BookingQuoteRequest, BookingRead, ClientConfirmRequest, ClientPaymentCodes, PaymentPreviewRead, PublicResourceStaffQuery,
    PublicServicesDayQuery, PublicStaffDayQuery, QuoteRead, RescheduleConfirmRequest, ResourceQuoteRequest,
    ResourceStaffMemberRead, ResourceStaffRead, ServiceDayRead, ServicesDayRead, StaffDayMemberRead,
    StaffDayRead)
from services import (booking_checkout, booking_payment, booking_quotes as quotes, hybrid_http,
                      resource_availability, resource_booking, resource_reschedule)
from services.notifier import _fmt_amount
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


@router.get("/availability/services", response_model=ServicesDayRead)
@limiter.limit("60/minute")
async def services_availability(request: Request, query: Annotated[PublicServicesDayQuery, Query()],
                                viewer: Viewer = Depends(get_viewer), db: AsyncSession = Depends(get_db)):
    """Свободное время всех индивидуальных услуг на день — одним запросом.

    Мастер записи мини-приложения умеет начинать со времени: сначала час, потом
    услуги и мастера, свободные в этот час. Поштучный `availability` по каждой
    услуге — N запросов с одного экрана. Тот же снимок, что у Журнала, но по
    правилам клиентской записи (горизонт, минимальный запас до начала).
    """
    days = await resource_availability.services_day(db, studio_id=viewer.studio_id, day=query.day)
    return ServicesDayRead(services=[
        ServiceDayRead(service_id=row.service_id, branch_id=row.branch_id, reason=row.availability.reason,
                       free_by_teacher={teacher_id: [slot.local_start.hour * 60 + slot.local_start.minute
                           for slot in row.availability.slots if teacher_id in slot.teacher_ids]
                           for teacher_id in {tid for slot in row.availability.slots for tid in slot.teacher_ids}},
                       free=[slot.local_start.hour * 60 + slot.local_start.minute
                             for slot in row.availability.slots])
        for row in days])


@router.get("/resource-staff", response_model=ResourceStaffRead)
@limiter.limit("60/minute")
async def resource_staff(request: Request, query: Annotated[PublicResourceStaffQuery, Query()],
                         viewer: Viewer = Depends(get_viewer), db: AsyncSession = Depends(get_db)):
    """Мастера выбранных филиалов (без выбора — всех) с их услугами — экран «Записатись».

    Отдельно от `/staff-day`: тот отвечает про смены и свободное время ОДНОГО
    дня одной услуги, а этому экрану не нужно ни то, ни другое. Фильтр по
    услуге — удобство интерфейса; quote и confirm всё равно заново проверяют,
    что мастер её оказывает (`resource_availability.load`).
    """
    report = await resource_availability.resource_staff(
        db, studio_id=viewer.studio_id, branch_ids=query.branch_id, service_id=query.service_id)
    currency = (await db.get(Studio, viewer.studio_id)).currency or "RUB"
    return ResourceStaffRead(reason=report.reason, staff=[
        ResourceStaffMemberRead(
            teacher_id=row.teacher_id, name=row.name, last_name=row.last_name,
            photo_url=row.photo_url, department=row.department, service_ids=row.service_ids,
            service_prices=row.service_prices,
            service_price_strs={
                service_id: _fmt_amount(price, currency)
                for service_id, price in row.service_prices.items()
            },
            service_durations=row.service_durations,
            branch_ids=row.branch_ids)
        for row in report.staff])


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


@router.post("/booking-quotes/{quote_id}/payment-preview", response_model=PaymentPreviewRead)
@limiter.limit("60/minute")
async def payment_preview(request: Request, quote_id: str, body: ClientPaymentCodes,
                          client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    """Чек записи с промокодом, ваучером, баллами и депозитом — до подтверждения.

    Тот же расчёт, что у шага оплаты Журнала (`booking_checkout.preview`).
    Только чтение: коды начнут держаться на брони с её подтверждением.
    """
    return await booking_checkout.preview(db, _actor(client), quote_id, body)


@router.post("/bookings", response_model=BookingRead)
@limiter.limit("20/minute")
async def confirm(request: Request, body: ClientConfirmRequest, background: BackgroundTasks,
                  client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    """Подтвердить запись; с `payment` — и удержать на ней коды клиента.

    Одной транзакцией: не сошлась сумма или ваучер уже занят — откатывается и
    сама бронь. Без `payment` — прежняя запись без кодов.
    """
    actor = _actor(client)
    booked = await resource_booking.confirm(db, body.quote_id, actor)
    try:
        if body.payment is not None:
            await booking_checkout.hold(db, actor, booked, body.payment)
    except Exception:
        await db.rollback()
        raise
    return await hybrid_http.after_commit(db, actor, booked, background)


@router.post("/bookings/{reservation_id}/cancel", response_model=BookingRead)
async def cancel(reservation_id: int, background: BackgroundTasks,
                 client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    return await hybrid_http.cancel(db, _actor(client), reservation_id, background)


@router.post("/bookings/{reservation_id}/pay", response_model=BookingPayRead)
@limiter.limit("10/minute")
async def pay(request: Request, reservation_id: int, body: BookingPayRequest,
              client: Client = Depends(get_current_client), db: AsyncSession = Depends(get_db)):
    """«Оплатить» в «Моих занятиях»: ссылка на форму Stripe за свою бронь.

    Два случая, оба решает `booking_payment.pay_link` — единственное место,
    где заводится форма оплаты занятия: бронь держит место под незаконченную
    оплату картой, либо человек выбрал «на месте» и передумал. Чужая бронь,
    оплаченная, отменённая или уже начавшаяся — `stale`, а не ошибка: экран
    перечитает занятия и покажет, как есть.
    """
    from .miniapp_users import _checkout_return_base

    return_to = await _checkout_return_base(db, client, body.in_telegram, request)
    payable = await booking_payment.pay_link(
        db, studio_id=client.studio_id, reservation_id=reservation_id, client_id=client.id,
        channel="telegram" if body.in_telegram else "web", return_to=return_to)
    return BookingPayRead(
        outcome=payable.outcome.value.lower(), url=payable.url, checkout_id=payable.checkout_id,
        amount_str=_fmt_amount(payable.amount, payable.currency) if payable.amount else "")


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

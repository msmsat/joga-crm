"""Resource moves preserve the Reservation and all financial links (HB-12).

Перенос — единственный путь, которым меняется время индивидуальной записи:
кнопка «Перенести» в карточке, перетаскивание и растягивание в Журнале идут
сюда же (quote → confirm с версией). Прямого PATCH времени у такой записи нет
(routers/schedule/lessons.update_lesson), чтобы не завести вторую, более
слабую копию этих проверок.

Что может поменять перенос и кто:

* время — все;
* мастер — все; цена при этом у клиента не меняется никогда (отказ, если у
  нового мастера она другая), а стойка переносит на цену нового мастера:
  иначе клиент мог бы записаться к дешёвому, оплатить и перенестись к
  дорогому;
* длительность — только стойка (растягивание в Журнале). Цену не меняет.
"""
from dataclasses import replace
from datetime import timedelta

from sqlalchemy import select

from models import (BookingQuote, ClientPayment, ClientSubscription, Lesson, Reservation,
                    StripeCheckout, Studio, SubscriptionPackage)
from services import (booking, booking_notifications, booking_quotes as quotes,
                      resource_booking, schedule_guard, studio_time, subscription_charge)
from services.booking_access import trial_percent
from services.booking_rules import load_rules


async def _source(db, actor, reservation_id, *, now):
    await quotes.authorize(db, actor)
    found = (await db.execute(select(Reservation, Lesson).join(Lesson).where(
        Reservation.id == reservation_id, Reservation.client_id == actor.client_id,
        Lesson.studio_id == actor.studio_id).execution_options(populate_existing=True))).first()
    if found is None or found[1].booking_mode != "resource":
        quotes.reject("NOT_FOUND", 404)
    reservation, lesson = found
    if reservation.status == "hold":
        quotes.reject("PAYMENT_IN_PROGRESS")
    if reservation.status not in {"active", "pending"}:
        quotes.reject("WINDOW_CLOSED")
    attempts = (await db.execute(select(StripeCheckout.id).where(
        StripeCheckout.studio_id == actor.studio_id,
        StripeCheckout.payload["reservation_id"].as_integer() == reservation.id,
        StripeCheckout.status.in_(["pending", "disputed", "failed"])).limit(1))).first()
    if attempts is not None:
        quotes.reject("PAYMENT_IN_PROGRESS")
    studio = await db.get(Studio, actor.studio_id)
    if not lesson.tz_iana:
        quotes.reject("CONFIG_INCOMPLETE")
    from types import SimpleNamespace
    try:
        start = studio_time.to_utc(lesson.start_time, SimpleNamespace(tz_iana=lesson.tz_iana))
    except ValueError:
        quotes.reject("CONFIG_INCOMPLETE")
    rules = await load_rules(db, actor.studio_id)
    if start < now.replace(tzinfo=None) + timedelta(minutes=
            rules.cancellation_deadline_min if actor.domain is booking.Actor.CLIENT else 0):
        quotes.reject("WINDOW_CLOSED")
    originals = (await db.execute(select(BookingQuote).where(BookingQuote.studio_id == actor.studio_id,
        BookingQuote.reservation_id == reservation.id, BookingQuote.consumed_at.is_not(None))
        .order_by(BookingQuote.created_at))).scalars().all()
    if not any(q.terms.get("intent", "create") == "create" for q in originals):
        quotes.reject("CONFIG_INCOMPLETE")
    # Условия записи — из ПОСЛЕДНЕГО проведённого расчёта, а не из первого:
    # перенос к мастеру с другой ценой переписывает сумму клиента, и следующий
    # перенос обязан сохранить уже её, а не ту, что была при записи.
    return reservation, lesson, originals[-1]


async def _repriced(db, actor, funding, base_price, first_lesson_percent=None):
    """Сумма клиента за запись у нового мастера — тем же правилом, что при записи.

    Скидки клиента те же (`booking.client_price` — единственный ответ на
    «сколько он платит»), ноль — «бесплатно», как в `booking.resolve_funding`.
    Абонемент и бесплатное первое занятие цена мастера не касается: платит не
    клиент. Первое занятие со скидкой — касается: процент обещан при записи
    (`first_lesson_percent`, снимок на брони) и едет за записью к новому мастеру.
    """
    if funding.kind not in (booking.FundingKind.PAY, booking.FundingKind.FREE):
        return funding
    owed = 0 if base_price <= 0 else await booking.client_price(
        db, studio_id=actor.studio_id, client_id=actor.client_id, base_price=base_price,
        first_lesson_percent=first_lesson_percent)
    kind = booking.FundingKind.PAY if owed > 0 else booking.FundingKind.FREE
    return replace(funding, kind=kind, price=owed)


async def _calculate(db, actor, reservation_id, request, *, now, hall_id=None, duration_min=None):
    """Условия переноса и то, чем запись оплачивалась ДО него (для `_settle`)."""
    reservation, lesson, source = await _source(db, actor, reservation_id, now=now)
    if request.booking_mode != "resource" or request.service_id != lesson.service_id:
        quotes.reject("TERMS_CHANGED")
    terms = booking.Terms.from_json(source.terms["domain"])
    if terms is None:
        quotes.reject("TERMS_CHANGED")
    staff = actor.domain is booking.Actor.STAFF
    if staff:
        # Стойка способа оплаты при переносе не выбирает — он у записи уже
        # есть. Журнал его и не шлёт, и оплаченная картой запись иначе не
        # переносилась бы из CRM вовсе: запрос приходил с «на месте».
        request = request.model_copy(update={"payment_method": source.terms["payment_method"]})
        # Зал не назван — запись остаётся в своём: перенос по времени не повод
        # её из зала выселять.
        hall_id = lesson.hall_id if hall_id is None else hall_id
    elif request.payment_method != source.terms["payment_method"]:
        quotes.reject("TERMS_CHANGED")
    # Длительность меняет только стойка — растягиванием в Журнале. Клиенту в
    # мини-приложении менять её нечем, и чужое поле в запросе — не его выбор.
    if duration_min is not None and not staff:
        quotes.reject("TERMS_CHANGED")
    # Длительность САМОЙ записи, а не каталожная: растянутая до часа запись при
    # следующем переносе остаётся часовой.
    duration = lesson.duration_min if duration_min is None else duration_min
    current = await quotes.calculate(db, actor, request, now=now, hall_id=hall_id,
        exclude_lesson_id=lesson.id, preserved_funding=terms.funding, duration_min=duration)
    if current["duration_min"] != duration:
        quotes.reject("TERMS_CHANGED")
    for key in ("buffer_before_min", "buffer_after_min"):
        if current[key] != getattr(lesson, key):
            quotes.reject("TERMS_CHANGED")
    studio = await db.get(Studio, actor.studio_id)
    if (studio.currency or "RUB") != terms.funding.currency:
        quotes.reject("TERMS_CHANGED")
    quoted = booking.Terms.from_json(current["domain"])
    if current["teacher_id"] == lesson.teacher_id:
        # Мастер тот же — цена записи прежняя, даже если его прайс с тех пор
        # поменялся: клиент записывался на эту сумму.
        price, funding = lesson.price, terms.funding
    elif staff:
        price = quoted.base_price
        funding = await _repriced(db, actor, terms.funding, price, trial_percent(reservation))
    elif quoted.base_price != lesson.price:
        quotes.reject("TERMS_CHANGED")
    else:
        price, funding = lesson.price, terms.funding
    current["domain"] = replace(quoted, base_price=price, funding=funding).to_json()
    if reservation.subscription_id is not None:
        subscription = await db.get(ClientSubscription, reservation.subscription_id, populate_existing=True)
        day = request.starts_at.astimezone(studio_time.clock(studio).zone).date()
        if subscription is None or subscription.status not in {"active", "pending"} or subscription.is_frozen:
            quotes.reject("TERMS_CHANGED")
        if subscription.status == "active" and subscription.expires_at < day:
            quotes.reject("TERMS_CHANGED")
        if subscription.package_id is not None:
            package = await db.get(SubscriptionPackage, subscription.package_id)
            if package is not None and package.service_ids and lesson.service_id not in package.service_ids:
                quotes.reject("TERMS_CHANGED")
    current.update(intent="reschedule", source_reservation_id=reservation.id, source_version=lesson.version)
    return current, reservation, lesson, terms.funding


async def _settle(db, reservation, lesson, before, after, payment_method):
    """Сумма клиента поменялась вместе с мастером — привести долг к ней.

    Деньги, которые уже заплачены, система не двигает: возврат или доплата —
    решение студии, и принимает его человек у стойки. Ему возвращается, сколько
    было, сколько стало и сколько уже заплачено, — Журнал это показывает.
    """
    if before.price == after.price and before.kind is after.kind:
        return None
    paid = None
    if payment_method == "card":
        # Запись по карте, которая дошла до переноса, оплачена: незавершённую
        # оплату перенос отклоняет раньше (PAYMENT_IN_PROGRESS).
        paid = before.price
    else:
        debt = (await db.get(ClientPayment, reservation.debt_payment_id)
                if reservation.debt_payment_id is not None else None)
        if debt is not None and debt.status == "success":
            paid = debt.amount
        elif debt is not None and debt.status == "pending":
            if after.price > 0:
                debt.amount = after.price
            else:
                await subscription_charge.clear_debt(db, reservation)
        elif after.kind is booking.FundingKind.PAY:
            # Была бесплатной, стала платной — долг появляется так же, как при
            # записи: `open_debt` сам промолчит у пробного и абонемента.
            await subscription_charge.open_debt(db, reservation, lesson, amount=after.price)
    return {"previous": before.price, "current": after.price, "paid": paid}


async def create_quote(db, actor, reservation_id, request, *, now=None, hall_id=None,
                       duration_min=None):
    moment = quotes.utcnow(now)
    current, _, _, _ = await _calculate(db, actor, reservation_id, request, now=moment,
                                        hall_id=hall_id, duration_min=duration_min)
    row = BookingQuote(studio_id=actor.studio_id, client_id=actor.client_id,
        actor_user_id=actor.actor_user_id, surface=actor.surface, booking_mode="resource",
        payload_version=1, terms=current, created_at=moment, expires_at=moment + timedelta(minutes=5))
    db.add(row)
    await db.flush()
    return row


async def confirm(db, actor, reservation_id, quote_id, expected_version, *, now=None):
    try:
        studio = await schedule_guard.lock_studio(db, actor.studio_id)
        row = await quotes.read(db, quote_id, actor, lock=True)
        if row.terms.get("intent") != "reschedule" or row.terms.get("source_reservation_id") != reservation_id:
            quotes.reject("NOT_FOUND", 404)
        if row.consumed_at is not None:
            return await resource_booking.existing(db, row)
        moment = quotes.utcnow(now)
        if row.expires_at <= moment:
            quotes.reject("QUOTE_EXPIRED")
        # Длительность — из самого расчёта: подтверждение обязано пересчитать
        # ровно то, что показали, а растянутую запись клиентский запрос не знает.
        staff = actor.domain is booking.Actor.STAFF
        current, reservation, lesson, before = await _calculate(db, actor, reservation_id,
            quotes.request_for(row), now=moment, hall_id=row.terms["hall_id"],
            duration_min=row.terms["duration_min"] if staff else None)
        if lesson.version != expected_version or row.terms["source_version"] != lesson.version:
            quotes.reject("VERSION_CONFLICT")
        if current != row.terms:
            quotes.reject("TERMS_CHANGED")
        terms = booking.Terms.from_json(current["domain"])
        await schedule_guard.assert_interval_free(db, studio, teacher_id=current["teacher_id"],
            hall_id=current["hall_id"], start=terms.local_start,
            end=terms.local_start + timedelta(minutes=current["duration_min"]),
            buffer_before_min=current["buffer_before_min"], buffer_after_min=current["buffer_after_min"],
            tz_iana=current["tz_iana"], exclude_lesson_id=lesson.id)
        lesson.start_time, lesson.tz_iana = terms.local_start, current["tz_iana"]
        lesson.teacher_id, lesson.teacher_name = current["teacher_id"], terms.trainer_name
        lesson.branch_id, lesson.hall_id = current["branch_id"], current["hall_id"]
        lesson.duration_min = current["duration_min"]
        lesson.price = terms.base_price
        repricing = await _settle(db, reservation, lesson, before, terms.funding,
                                  row.terms["payment_method"])
        lesson.version += 1
        row.reservation_id, row.consumed_at = reservation.id, moment
        # Новая версия занятия — новое доменное событие: перенос обязан
        # уведомить, даже если бронь до и после в статусе active (HB-25 п.5).
        await booking_notifications.record(db, studio_id=actor.studio_id,
            reservation_id=reservation.id, lesson_version=lesson.version,
            event_code="booking_rescheduled")
        await db.flush()
        result = resource_booking.response(reservation, lesson)
        # Ключ — только когда сумма клиента поменялась: повтор подтверждения
        # (сетевой ретрай, `existing` выше) обязан вернуть тот же ответ, что и
        # первый, а в обычном переносе сообщать не о чем.
        if repricing is not None:
            result["repricing"] = repricing
        return result
    except Exception:
        await db.rollback()
        raise

"""Посещение по умолчанию — «пришёл».

КАК ЭТО РАБОТАЕТ
  * До начала занятия бронь ЖДЁТ. Студия может отметить заранее: «пришёл»
    (явился раньше) или «не пришёл» (предупредил, что не придёт).
  * С начала занятия неотмеченный считается пришедшим — так его рисует Журнал.
  * По окончании занятия бронь ЗАКРЫВАЕТ система (`run_autopilot`): неотмеченных
    отмечает пришедшими, просит отзыв и проводит долг «оплата на месте»
    наличными — тем же движком кассы, что и кассир (`perform_pay`), только без
    чека клиенту и с подписью системы в Ленте событий.
  * После занятия отметка переключается одним нажатием. «Не пришёл» по брони,
    долг которой погасила СИСТЕМА, откатывает деньги сам (`_reverse`); обратно
    «пришёл» — снова проводит их.

ЧЕГО АВТОМАТИКА НЕ ДЕЛАЕТ НАМЕРЕННО
  * Не гасит коды, придержанные на брони при записи из мини-приложения
    (сертификат, промокод, баллы, депозит — `held_codes`): их списание — решение
    кассира у стойки, и такой долг остаётся «Оплатить».
  * Не откатывает деньги, принятые кассиром: это факт, а не предположение
    системы. Неявка с такой оплатой — возврат через Финансы, как и раньше.
  * Не трогает брони, ждущие подтверждения студии (`pending`) и оплаты картой
    (`hold`): визитом они стать не могут.

ОТКАТ АВТОЗАЧИСЛЕНИЯ — по образцу возврата Stripe (`checkout/stripe_pay.
_revert_sale`): проведённый доход не стирается, а гасится расходом категории
«Возвраты» (отчёты за закрытый период не меняются задним числом), комиссия
платформы снимается компенсирующей строкой, баллы и сумма покупок — общим
`loyalty.revert_purchase`, долг снова открыт. Одноразовые скидки (оффер,
скидка новичка) не возвращаются — как и при возврате по карте.
"""
import asyncio
import logging
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from activity import log_activity
from models import Client, ClientPayment, Lesson, Reservation, Studio
from services import booking, lesson_time, reservation_payment, reservation_refund
from services.booking_rules import lesson_finished, load_rules
from services.notifier import notify
from services.schedule_guard import lock_studio
from services.subscription_charge import activate_pending_after_visit

logger = logging.getLogger(__name__)

# Подпись системы в Ленте событий: деньги провёл не человек.
SYSTEM_ACTOR = "Velora"

# Тик автоматики. Минута — Журнал открыт у стойки, и «занятие кончилось, а долг
# висит» не должно жить дольше, чем человек дойдёт до компьютера.
_SLEEP_SECONDS = 60

# Ключ advisory-лока: ASCII "attend" (48 бит). Свой, не общий с биллингом:
# проходы независимы и не должны ждать друг друга.
_LOCK_KEY = 0x617474656E64

# Сколько дней назад искать незакрытые брони. После миграции прошлое закрыто
# целиком; окно нужно, чтобы догнать занятия, кончившиеся, пока сервер лежал.
_LOOKBACK_DAYS = 14

# Самый большой сдвиг зоны вперёд от UTC (+14, Кирибати): стенное время занятия
# сравнивается с UTC в SQL грубо, точный отбор — уже по часам самого занятия.
_MAX_AHEAD = timedelta(hours=15)


def _utcnow(now: datetime | None = None) -> datetime:
    """Настоящий момент, naive UTC."""
    if now is None:
        return datetime.now(UTC).replace(tzinfo=None)
    return now.astimezone(UTC).replace(tzinfo=None) if now.tzinfo else now


def finished(lesson: Lesson, studio: Studio | None, now: datetime | None = None) -> bool:
    """Занятие закончилось — по его собственным часам (снимок зоны), иначе по
    стенным часам студии. `now` — момент (aware или naive UTC)."""
    instant = _utcnow(now).replace(tzinfo=UTC)
    wall = lesson_time.local_now(studio, instant) if studio is not None else None
    return lesson_finished(lesson, studio, now_instant=instant, now=wall)


async def _open_debt(db: AsyncSession, reservation: Reservation) -> ClientPayment | None:
    if reservation.debt_payment_id is None:
        return None
    debt = await db.get(ClientPayment, reservation.debt_payment_id, populate_existing=True)
    return debt if debt is not None and debt.status == "pending" else None


async def _on_visit(db: AsyncSession, reservation: Reservation, day: date) -> None:
    """Что меняет визит помимо статуса: дата последнего визита (удержание,
    рефералка) и запуск абонемента из очереди — купленный поверх незаконченного
    ждёт первого реального визита."""
    await db.execute(
        update(Client)
        .where(Client.id == reservation.client_id)
        .values(last_visit_date=func.greatest(func.coalesce(Client.last_visit_date, day), day))
    )
    await activate_pending_after_visit(db, reservation)


async def _forget_visit(db: AsyncSession, reservation: Reservation) -> None:
    """Визит снят — дата последнего визита снова по оставшимся визитам."""
    last = (await db.execute(
        select(func.max(func.date(Lesson.start_time)))
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(Reservation.client_id == reservation.client_id,
               Reservation.status == "attended", Reservation.id != reservation.id)
    )).scalar_one_or_none()
    await db.execute(update(Client).where(Client.id == reservation.client_id).values(last_visit_date=last))


def _require(result: booking.Result) -> None:
    """Отказ домена — ответом человеку; успех — молча."""
    if result.outcome is booking.Outcome.OK:
        return
    if result.outcome is booking.Outcome.ALREADY_CANCELLED:
        raise HTTPException(status_code=409, detail="Запись отменена — отметить посещение нельзя")
    if result.outcome is booking.Outcome.PAYMENT_REQUIRED:
        raise HTTPException(status_code=409, detail="Бронь ждёт оплаты картой — отметить посещение можно после оплаты")
    raise HTTPException(status_code=404, detail="Запись не найдена")


async def _locked(db: AsyncSession, studio_id: int, reservation_id: int) -> Reservation | None:
    """Бронь под замком студии и свежая: решение о ней принимается по тому, что
    в базе сейчас, а не по прочитанному до замка (кассир и автоматика могли
    успеть между)."""
    await lock_studio(db, studio_id)
    return (await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()


async def settle(db: AsyncSession, studio_id: int, lesson_id: int, reservation_id: int) -> bool:
    """Провести долг брони наличными от имени системы. True — проведено.

    Коммитит (через `perform_pay`). Отказ кассы (сумма поменялась, клиента нет)
    откатывается и логируется: долг остаётся «Оплатить», деньги примет кассир.
    Принимает id, а не объекты: откат сессии гасит все загруженные строки, и
    вызывающему после него можно доверять только числам.
    """
    # Касса тянет за собой роутеры чекаута — импорт здесь, как и у её
    # остальных потребителей в сервисах, иначе цикл импорта при старте.
    from routers.checkout.router import perform_pay
    from schemas.checkout import CheckoutPayRequest

    reservation = await _locked(db, studio_id, reservation_id)
    if (reservation is None or reservation.status != "attended" or reservation.no_show
            or reservation.held_codes):
        # Both callers committed the visit before settle. A no-op must release
        # the studio guard too, before _close sends review/debt notifications.
        await db.rollback()
        return False
    debt = await _open_debt(db, reservation)
    if debt is None:
        await db.rollback()
        return False

    reservation.auto_paid = True
    try:
        await perform_pay(
            db, studio_id, None,
            CheckoutPayRequest(client_id=reservation.client_id, product_id=lesson_id,
                               product_type="lesson", payment_method="cash"),
            method="cash", debt=debt, reservation_id=reservation.id,
            manual_percent=reservation_payment.manual_of(reservation, None),
            notify=False, actor_name=SYSTEM_ACTOR,
        )
    except Exception:
        await db.rollback()
        logger.exception("attendance: автозачисление брони %s не проведено", reservation_id)
        return False
    logger.info("attendance: долг брони %s проведён наличными", reservation_id)
    return True


async def _reverse(db: AsyncSession, studio: Studio, lesson: Lesson, reservation: Reservation) -> None:
    """Откатить автозачисление: клиент не пришёл, денег у стойки не было. Не коммитит."""
    payment = await db.get(ClientPayment, reservation.debt_payment_id) if reservation.debt_payment_id else None
    if payment is not None and payment.status == "success":
        # Деньги уводит тот же путь, что и отмена оплаты кассиром «Поменять»
        # (services/reservation_refund): две копии разошлись бы.
        await reservation_refund.reverse_income(
            db, studio, lesson, reservation, payment.amount, method="cash",
            title=f"Отмена автозачисления: «{lesson.name}» — клиент не пришёл",
            note="Отмена автозачисления",
        )
        # Долг снова открыт: неявка оставляет его ровно таким, каким он был у
        # неотмеченной брони до автоматики.
        payment.status = "pending"
    reservation.payment_breakdown = None
    reservation.auto_paid = False
    client = await db.get(Client, reservation.client_id)
    log_activity(
        db, studio.id, "payment",
        title=f"Автозачисление отменено — {client.name if client else ''} не пришёл(а) на «{lesson.name}»",
        actor_name=SYSTEM_ACTOR, entity_type="reservation", entity_id=reservation.id,
    )


async def mark(db: AsyncSession, *, studio: Studio, lesson: Lesson, reservation_id: int,
               attended: bool, role: str, now: datetime | None = None) -> Reservation:
    """Отметка студии «пришёл» / «не пришёл». Коммитит.

    После занятия «пришёл» сразу проводит долг (бронь уже закрыта, ждать
    следующего прохода автоматики незачем), «не пришёл» — откатывает
    автозачисление. Тренер кассу не ведёт (ТЗ 2.3): снять деньги, которые уже
    стоят в Финансах, он не может.
    """
    reservation = await _locked(db, studio.id, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    if reservation.status == "cancelled":
        raise HTTPException(status_code=409, detail="Запись отменена — отметить посещение нельзя")
    if reservation.status == "hold":
        raise HTTPException(status_code=409, detail="Бронь ждёт оплаты картой — отметить посещение можно после оплаты")
    if reservation.status == "pending":
        raise HTTPException(status_code=409, detail="Запись ждёт подтверждения студии")

    day = lesson.start_time.date()
    if attended:
        reservation.no_show = False
        if reservation.status != "attended":
            _require(await booking.attend(db, studio_id=studio.id, reservation_id=reservation_id))
            await _on_visit(db, reservation, day)
        over = finished(lesson, studio, now)
        studio_id, lesson_id = studio.id, lesson.id
        await db.commit()
        if over:
            await settle(db, studio_id, lesson_id, reservation_id)
    else:
        if reservation.auto_paid and role == "trainer":
            raise HTTPException(status_code=403, detail=(
                "Деньги за это занятие уже зачислены — отметить неявку может владелец или администратор"))
        was_visit = reservation.status == "attended"
        _require(await booking.unattend(db, studio_id=studio.id, reservation_id=reservation_id))
        reservation.no_show = True
        if was_visit:
            await _forget_visit(db, reservation)
        if reservation.auto_paid:
            await _reverse(db, studio, lesson, reservation)
        await db.commit()

    await db.refresh(reservation)
    return reservation


async def _close(db: AsyncSession, studio_id: int, lesson_id: int, reservation_id: int,
                 now: datetime) -> None:
    """Закрыть бронь закончившегося занятия: отметка, отзыв, деньги."""
    reservation = await _locked(db, studio_id, reservation_id)
    if reservation is None or reservation.closed_at is not None or reservation.status not in ("active", "attended"):
        await db.rollback()
        return
    lesson = await db.get(Lesson, lesson_id)
    lesson_name, day = lesson.name, lesson.start_time.date()
    if reservation.status == "active" and not reservation.no_show:
        _require(await booking.attend(db, studio_id=studio_id, reservation_id=reservation_id))
        await _on_visit(db, reservation, day)
    reservation.closed_at = now
    came = reservation.status == "attended"
    client_id = reservation.client_id
    await db.commit()
    if not came:
        return

    settled = await settle(db, studio_id, lesson_id, reservation_id)
    rules = await load_rules(db, studio_id)
    # «Запрос отзыва» — по окончании занятия, а не в момент отметки: просить
    # оценить занятие, которое ещё идёт (или не началось), — нелепо.
    if rules.review_request:
        await notify(db, studio_id, "client", "c8", {"client_id": client_id, "lesson_name": lesson_name})
    if not settled:
        # Долг остался (коды на брони, касса отказала) — тот самый момент, когда
        # деньги должны были перейти из рук в руки.
        refreshed = await db.get(Reservation, reservation_id, populate_existing=True)
        debt = await _open_debt(db, refreshed) if refreshed is not None else None
        if debt is not None:
            await notify(db, studio_id, "client", "c10", {
                "client_id": client_id, "lesson_name": lesson_name, "amount": debt.amount})


async def run_autopilot(db: AsyncSession, now: datetime | None = None) -> int:
    """Закрыть брони закончившихся занятий. Вернуть, сколько закрыто."""
    moment = _utcnow(now)
    rows = (await db.execute(
        select(Reservation.id, Lesson, Studio)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .join(Studio, Studio.id == Lesson.studio_id)
        .where(
            Reservation.closed_at.is_(None),
            Reservation.status.in_(("active", "attended")),
            Lesson.status != "cancelled",
            Lesson.start_time <= moment + _MAX_AHEAD,
            Lesson.start_time >= moment - timedelta(days=_LOOKBACK_DAYS),
        )
        .order_by(Lesson.start_time, Reservation.id)
    )).all()
    # Отбор — ДО первого коммита и отката: дальше в цикле живут только числа.
    due = [(rid, lesson.id, studio.id) for rid, lesson, studio in rows if finished(lesson, studio, moment)]

    closed = 0
    for reservation_id, lesson_id, studio_id in due:
        try:
            await _close(db, studio_id, lesson_id, reservation_id, moment)
            closed += 1
        except Exception:
            await db.rollback()
            logger.exception("attendance: бронь %s не закрыта", reservation_id)
    return closed


async def _pass(session_maker: async_sessionmaker) -> None:
    async with session_maker() as guard:
        # Лок живёт на соединении этой сессии — коммитить её нельзя.
        acquired = (await guard.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": _LOCK_KEY})).scalar()
        if not acquired:
            return
        try:
            async with session_maker() as db:
                closed = await run_autopilot(db)
            if closed:
                logger.info("attendance: закрыто броней — %s", closed)
        finally:
            await guard.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _LOCK_KEY})


async def _loop(session_maker: async_sessionmaker) -> None:
    while True:
        try:
            await _pass(session_maker)
        except Exception:
            logger.exception("attendance loop iteration failed")
        await asyncio.sleep(_SLEEP_SECONDS)


def start_attendance_loop(session_maker: async_sessionmaker) -> asyncio.Task:
    """Запустить фоновый таск. Петля в каждом процессе, работу делает один —
    тот, кто взял advisory-лок."""
    return asyncio.create_task(_loop(session_maker))

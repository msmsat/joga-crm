from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user, get_scoped_lesson, get_studio_context, StudioContext
from models import Client, ClientPayment, Reservation, User
# Долг за занятие гасит тот же движок, что и касса: см. pay_reservation ниже.
from routers.checkout.router import perform_pay
from schemas.checkout import CheckoutPayRequest
from schemas.schedule.reservations import ReservationCreate, ReservationPayRequest, ReservationRead
from services.booking_access import (
    assert_can_book, commit_reservation, next_free_spot, resolve_coverage,
)
from services.booking_rules import load_rules
from services.notifier import lesson_context, notify
from services.subscription_charge import (
    activate_pending_after_visit, charge_reservation, notify_subscription_remaining,
    refund_reservation,
)

router = APIRouter()


@router.post("/reservations", response_model=ReservationRead, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    body: ReservationCreate,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Записать клиента на занятие. Лимит мест и запрет двойной записи —
    та же логика, что в POST /clients/{id}/booking (book_lesson).

    Записывать/снимать клиентов могут только владелец и администратор (ТЗ 2.3).
    Клиент проверяется по studio_id — чужой клиент даёт 404.
    """
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Записывать клиентов могут владелец и администратор")

    lesson = await get_scoped_lesson(body.lesson_id, ctx, db)
    # Отменённое занятие «уже не считается» — на него нельзя записать (как в
    # публичной брони, public.py: cancelled → 404), значит и c1/a1/t1 не шлём.
    if lesson.status == "cancelled":
        raise HTTPException(status_code=400, detail="Занятие отменено — запись невозможна")
    # Записать менее чем за 2 часа до начала нельзя (правило Журнала).
    # ponytail: фикс-окно 2ч; вынести в настройки студии — если попросят.
    if lesson.start_time < datetime.now() + timedelta(hours=2):
        raise HTTPException(status_code=400, detail="Записать на занятие можно не позднее чем за 2 часа до начала")

    client = (await db.execute(
        select(Client).where(Client.id == body.client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    spot = await next_free_spot(db, lesson)
    if spot is None:
        raise HTTPException(status_code=400, detail="Все места заняты")

    duplicate = (await db.execute(
        select(Reservation.id).where(
            Reservation.client_id == body.client_id,
            Reservation.lesson_id == body.lesson_id,
            Reservation.status != "cancelled",
        )
    )).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="Клиент уже записан на это занятие")

    # Пробное занятие снимает гейт абонемента: новичка, которому студия дарит
    # первый визит, администратор обязан мочь записать — покупать ему пока
    # нечего, а без этого «Первое занятие бесплатно» работало бы только онлайн.
    rules = await load_rules(db, ctx.studio_id)
    sub, is_trial = await resolve_coverage(db, body.client_id, lesson, rules)
    if sub is None and not is_trial:
        # Подходящего абонемента нет и подарок не положен — assert_can_book
        # здесь всегда бросает; зовём её ради точной причины отказа («истекает
        # раньше занятия» / «не подходит для этого занятия» / «нет абонемента»).
        await assert_can_book(db, body.client_id, lesson)

    reservation = Reservation(
        client_id=body.client_id,
        lesson_id=body.lesson_id,
        spot_number=spot,
        status="active",
        booking_channel="manual",
        is_trial=is_trial,
    )
    db.add(reservation)
    remaining = await charge_reservation(db, ctx.studio_id, reservation, sub)
    await commit_reservation(db, conflict_detail="Это место только что заняли")
    await db.refresh(reservation)

    client_full_name = f"{client.name} {client.last_name or ''}".strip()
    lesson_ctx = await lesson_context(db, lesson)
    await notify(db, ctx.studio_id, "client", "c1", {
        **lesson_ctx, "client_id": body.client_id,
    })
    await notify(db, ctx.studio_id, "admin", "a1", {
        **lesson_ctx,
        "client_name": client_full_name,
        # Не для текста — для адресата: если админа в студии нет и письмо
        # подставляется владельцу, а занятие ведёт он сам, a1 гасится в пользу
        # его же t1 ниже (см. notifier._recipient).
        "trainer_id": lesson.teacher_id,
    })
    # Тренеру этого занятия (t1) — только если у занятия задан teacher_id.
    if lesson.teacher_id is not None:
        await notify(db, ctx.studio_id, "trainer", "t1", {
            **lesson_ctx,
            "trainer_id": lesson.teacher_id,
            "client_name": client_full_name,
        })
    await notify_subscription_remaining(db, ctx.studio_id, body.client_id, remaining)
    return ReservationRead.model_validate(reservation)


@router.patch("/reservations/{reservation_id}/cancel", response_model=ReservationRead)
async def cancel_reservation(
    reservation_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Снять клиента с занятия — освобождает место (booked_count уменьшится).

    Снимать клиентов могут только владелец и администратор (ТЗ 2.3).
    """
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Снимать клиентов могут владелец и администратор")

    reservation = (await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )).scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    lesson = await get_scoped_lesson(reservation.lesson_id, ctx, db)  # 404 чужая студия

    if reservation.status == "cancelled":
        raise HTTPException(status_code=409, detail="Запись уже отменена")

    # Снять клиента менее чем за 2 часа до начала нельзя (правило Журнала). Из-за
    # этого события a2/t2 «отмена <1ч/<2ч» больше не могут сработать отсюда —
    # блок удалён; если понадобятся, их надо врезать в другой путь отмены.
    # ponytail: фикс-окно 2ч; вынести в настройки студии — если попросят.
    # Неподтверждённая бронь (pending) из-под этого правила выведена: отклонить
    # заявку студия обязана мочь в любой момент — иначе за два часа до занятия
    # она превращается в бронь, которую нельзя ни подтвердить, ни снять.
    if reservation.status != "pending" and lesson.start_time < datetime.now() + timedelta(hours=2):
        raise HTTPException(status_code=400, detail="Снять с занятия можно не позднее чем за 2 часа до начала")

    reservation.status = "cancelled"
    reservation.cancelled_at = datetime.now()
    await refund_reservation(db, reservation)  # занятие возвращается на абонемент
    await db.commit()
    await db.refresh(reservation)

    # Клиента сняли с занятия (крестик в Журнале) — сообщаем ему об отмене его
    # записи (переиспользуем c3 «Отмена занятия»; работает с текущими галочками).
    await notify(db, ctx.studio_id, "client", "c3", {
        **await lesson_context(db, lesson), "client_id": reservation.client_id,
    })
    return ReservationRead.model_validate(reservation)


@router.patch("/reservations/{reservation_id}/confirm", response_model=ReservationRead)
async def confirm_reservation(
    reservation_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Одобрить бронь, которая ждала подтверждения.

    Заявки появляются, когда студия включила «Подтверждение тренером» на
    странице «Онлайн-запись»: клиент записался из мини-приложения или веб-виджета,
    место и занятие с абонемента уже списаны, но статус — `pending`. Одобрение
    переводит бронь в `active` и шлёт клиенту c1 «Запись подтверждена», которое
    при создании заявки намеренно не отправлялось.

    Отклонение — обычное снятие с занятия (cancel): оно и место освобождает, и
    занятие на абонемент возвращает.

    Подтверждают владелец и администратор — те же роли, что записывают и
    снимают (ТЗ 2.3). Повторный вызов идемпотентен.
    """
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Подтверждать записи могут владелец и администратор")

    reservation = (await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )).scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    lesson = await get_scoped_lesson(reservation.lesson_id, ctx, db)  # 404 чужая студия

    if reservation.status == "cancelled":
        raise HTTPException(status_code=409, detail="Запись отменена")

    if reservation.status == "pending":
        reservation.status = "active"
        await db.commit()
        await db.refresh(reservation)

        await notify(db, ctx.studio_id, "client", "c1", {
            **await lesson_context(db, lesson), "client_id": reservation.client_id,
        })
    return ReservationRead.model_validate(reservation)


@router.patch("/reservations/{reservation_id}/attend", response_model=ReservationRead)
async def attend_reservation(
    reservation_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Отметить, что клиент пришёл: status=attended + Client.last_visit_date.

    Остаток занятий здесь не меняется: занятие списывается в момент записи и
    возвращается при отмене (services/subscription_charge.py). Но именно приход
    запускает срок абонемента из очереди — купленный поверх незаконченного ждёт
    первого реального визита (activate_pending_after_visit).

    Скоуп занятия (404 чужая студия / 403 тренер на чужом) — get_scoped_lesson.
    Повторная отметка идемпотентна: статус уже attended — просто возвращаем запись.
    """
    reservation = (await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )).scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    lesson = await get_scoped_lesson(reservation.lesson_id, ctx, db)  # 404/403 по студии/роли

    if reservation.status != "attended":
        reservation.status = "attended"
        # last_visit_date нужен retention/рефералке (Эпик 3/4). Обновляем только при
        # переходе — повторная отметка ничего не трогает (идемпотентность).
        await db.execute(
            update(Client)
            .where(Client.id == reservation.client_id)
            .values(last_visit_date=date.today())
        )
        await activate_pending_after_visit(db, reservation)
        debt = await _open_debt_of(db, reservation)

        await db.commit()
        await db.refresh(reservation)

        # «Запрос отзыва» — тумблер на странице «Онлайн-запись»: студия может
        # не хотеть дёргать клиента после каждого визита.
        if (await load_rules(db, ctx.studio_id)).review_request:
            await notify(db, ctx.studio_id, "client", "c8",
                         {"client_id": reservation.client_id, "lesson_name": lesson.name})

        # Клиент пришёл, а занятие не оплачено — момент, когда долг перестаёт
        # быть бумажным: деньги должны были перейти из рук в руки. Тумблера у
        # c10 нет отдельного от матрицы уведомлений — владелец гасит его там,
        # если не хочет напоминать клиентам о деньгах письмом.
        if debt is not None:
            await notify(db, ctx.studio_id, "client", "c10", {
                "client_id": reservation.client_id,
                "lesson_name": lesson.name,
                # Число, а не строка: валюту подставляет сам шаблон
                # (services/notifier._render → _fmt_amount).
                "amount": debt.amount,
            })
    return ReservationRead.model_validate(reservation)


async def _open_debt_of(db: AsyncSession, reservation: Reservation) -> ClientPayment | None:
    """Непогашенный долг за бронь или None. Погашенный (`success`) долгом не
    считается — платёж просто остаётся в истории клиента."""
    if reservation.debt_payment_id is None:
        return None
    debt = await db.get(ClientPayment, reservation.debt_payment_id)
    return debt if debt is not None and debt.status == "pending" else None


@router.post("/reservations/{reservation_id}/pay", response_model=ReservationRead)
async def pay_reservation(
    reservation_id: int,
    body: ReservationPayRequest,
    ctx: StudioContext = Depends(get_studio_context),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Погасить долг «оплата на месте»: клиент отдал деньги на ресепшене.

    Считает и проводит не эта ручка, а общий денежный движок кассы
    (`routers/checkout/router.perform_pay`, `product_type="lesson"`): оттуда
    приезжают доход в Финансы, комиссия платформы за офлайн-оплату, баллы,
    сумма покупок клиента, событие c4 «оплата получена» и запись в Ленте
    событий. Вторая реализация этого блока разъехалась бы с кассой на первой же
    правке — как разъехались когда-то две копии реферальной выплаты.

    Деньги берут владелец и администратор: тренер отмечает посещение, но кассу
    не ведёт (ТЗ 2.3).
    """
    if ctx.role == "trainer":
        raise HTTPException(status_code=403, detail="Принимать оплату могут владелец и администратор")

    reservation = (await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )).scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    lesson = await get_scoped_lesson(reservation.lesson_id, ctx, db)  # 404 чужая студия

    debt = await _open_debt_of(db, reservation)
    if debt is None:
        # Идемпотентность: два кассира нажали «Оплатил» одновременно, второй
        # получает честный отказ, а не вторую Operation на ту же сумму.
        raise HTTPException(status_code=409, detail="За эту запись платить нечего")

    # perform_pay держит свою транзакцию и коммитит сама — после неё бронь уже
    # с погашенным долгом. Ссылку на платёж НЕ снимаем: по ней Журнал отличает
    # «оплачено» от «долга не было вовсе».
    await perform_pay(
        db, ctx.studio_id, current_user.id,
        CheckoutPayRequest(
            client_id=reservation.client_id,
            product_id=lesson.id,
            product_type="lesson",
            account_id=body.account_id,
            payment_method=body.payment_method,
        ),
        method=body.payment_method,
        debt=debt,
    )
    await db.refresh(reservation)
    return ReservationRead.model_validate(reservation)

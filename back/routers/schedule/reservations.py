from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user, get_scoped_lesson, get_studio_context, StudioContext
from models import Client, ClientPayment, Reservation, Studio, User
# Долг за занятие гасит тот же движок, что и касса: см. pay_reservation ниже.
from routers.checkout.router import perform_pay
from schemas.checkout import CheckoutPayRequest
from schemas.schedule.reservations import ReservationCreate, ReservationPayRequest, ReservationRead
from services import booking
from services.booking_access import assert_can_book
from services.booking_http import reject
from services.booking_rules import assert_staff_bookable, load_rules
from services.notifier import lesson_context, notify
from services.subscription_charge import (
    activate_pending_after_visit, notify_subscription_remaining,
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
    # Запись за стойкой: администратора держит только то, что занятие уже
    # прошло (services/booking_rules, раздел «Полномочия студии за стойкой»).
    # Окно «не позднее чем за N минут» — правило САМОСТОЯТЕЛЬНОЙ записи
    # клиента; к человеку, который пришёл за 20 минут на свободное место, оно
    # отношения не имеет, и раньше стоявшее здесь фикс-окно в 2 часа заставляло
    # администратора либо отказывать ему, либо вести мимо CRM.
    studio = await db.get(Studio, ctx.studio_id)
    assert_staff_bookable(lesson, studio)

    client = (await db.execute(
        select(Client).where(Client.id == body.client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    # ПЕРЕХОД ДЕЛАЕТ ДОМЕН. Роутер отвечает за право, разбор запроса и HTTP;
    # что такое «мест нет», «уже записан» и «чем оплачено» — знает
    # services/booking, и знает одинаково для Журнала, витрины и ассистента.
    #
    # actor=STAFF: окно самостоятельной записи к стойке не относится — его
    # заменяет `assert_staff_bookable` выше. require_funding=True: Журнал
    # записывает по абонементу либо по подарку, разовую продажу проводит касса.
    result = await booking.create(
        db, studio_id=ctx.studio_id, client_id=body.client_id,
        lesson_id=body.lesson_id, source="manual",
        actor=booking.Actor.STAFF, require_funding=True,
    )
    if result.outcome is booking.Outcome.NO_FUNDING:
        # Причину отказа называем прежними словами: «истекает раньше занятия» /
        # «не подходит для этого занятия» / «нет абонемента». Домен знает, что
        # покрытия нет; за формулировкой идём туда же, куда и раньше.
        await assert_can_book(db, body.client_id, lesson)
    reject(result,
           NO_CAPACITY=(400, "Все места заняты"),
           ALREADY_BOOKED=(409, "Клиент уже записан на это занятие"),
           SPOT_TAKEN=(409, "Это место только что заняли"),
           WINDOW_CLOSED=(400, "Занятие уже закончилось — записать на него нельзя"))
    await db.commit()
    reservation = await db.get(Reservation, result.reservation_id)
    remaining = result.remaining

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

    # Снятие за стойкой: пока занятие не кончилось — можно, место надо
    # освободить, пока оно ещё кому-то нужно. Исключения (pending, attended) и
    # обоснование — services/booking_rules, «Полномочия студии за стойкой».
    #
    # События a2/t2 «клиент отменил в последний момент» отсюда по-прежнему не
    # уходят, и теперь это выбор, а не следствие запрета: снял клиента сам
    # администратор — рассказывать администратору о его же действии незачем.
    # Их живой путь — отмена клиентом из мини-приложения (miniapp_lessons.py).
    result = await booking.cancel(
        db, studio_id=ctx.studio_id, reservation_id=reservation_id,
        actor=f"staff:{ctx.role}", by=booking.Actor.STAFF)
    reject(result, ALREADY_CANCELLED=(409, "Запись уже отменена"),
           WINDOW_CLOSED=(400, "Занятие уже закончилось — снять с него нельзя"))
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
        # Подтверждение — тоже переход домена: он же перечитывает, живо ли
        # занятие и жив ли клиент (решение приходит через минуты и часы).
        result = await booking.approve(
            db, studio_id=ctx.studio_id, reservation_id=reservation_id,
            actor=f"staff:{ctx.role}")
        reject(result, LESSON_UNAVAILABLE=(409, "Занятие отменено"),
               ALREADY_CANCELLED=(409, "Запись отменена"))
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

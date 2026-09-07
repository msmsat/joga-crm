"""HB-01 — регрессия, которую обязана пережить гибридная запись.

ЗАЧЕМ. Этот файл не проверяет новую гибридную модель — её ещё нет. Он
фиксирует, КАК СЕЙЧАС ведёт себя запись (`services/booking.py` и его роутеры),
чтобы HB-02…HB-13 могли добавлять `booking_mode`, filony и Resource-flow, не
меняя тайком существующий Event-путь. Список сценариев и их источник —
docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md §1.2/§7 (HB-01).

Сценарии закреплены как поведение, а не как желаемый результат:
  * обычная группа (несколько мест, оплата на месте — путь публичного виджета);
  * individual-as-event: `Service.service_type="individual"` + `Lesson.
    total_spots=1` уже сегодня бронируется ТЕМ ЖЕ доменом, что и группа —
    HB-02 обязан оставить это так (individual остаётся event, пока owner не
    включит resource явно, AC-02);
  * повторная запись вкл/выкл (`repeat_booking_allowed`);
  * `pending` (подтверждение тренером) и `hold` (P4, карточная бронь —
    существующий незакоммиченный код `booking.create(hold_for_payment=True)`);
  * абонемент, подаренное первое занятие, бесплатное занятие, оплата на месте;
  * контракт ID: CRM (`ReservationRead`, `BookingCreatedOut`) уже возвращает
    `reservation_id` как `id`. Мини-приложение — НЕТ: `MiniappUpcomingLesson`/
    `MiniappPastLesson` отдают только `lesson.id`, а cancel/rate принимают
    `lesson_id` и бьют по ПОСЛЕДНЕЙ активной брони клиента на это занятие
    (`_own_active_reservation`, `order_by(Reservation.id.desc()).first()`).
    Это НЕ ошибка данного файла — это подтверждённый разрыв контракта,
    который HB-21 обязан закрыть явным `reservation_id`
    (см. docs/HYBRID_BOOKING_PROGRESS.md, HB-01).

Реальная БД, ручная чистка — тот же приём, что в test_booking_domain.py и
test_agent_booking.py. Запуск из back/:
    python -m pytest tests/test_hybrid_compatibility.py -q
"""
import asyncio
import importlib
import inspect
import os
import time as _time
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    Client, ClientPayment, ClientSubscription, Hall, Lesson, Reservation,
    Service, Studio, StudioBookingSettings, StudioBranch, StudioMember, User,
)
from schemas.clients.responses import BookingCreatedOut
from schemas.schedule.reservations import ReservationRead
from services import booking
from services.booking import Actor, FundingKind, Outcome

miniapp_lessons = importlib.import_module("routers.booking.miniapp_lessons")
public_router = importlib.import_module("routers.booking.public")

_TAG = "TEST-HYBRID-COMPAT"
TOMORROW = date.today() + timedelta(days=1)


async def _seed() -> dict:
    stamp = f"{int(_time.time())}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"{_TAG}-{stamp}", tz_iana="Europe/Prague", currency="CZK")
        db.add(studio)
        await db.flush()
        db.add(StudioBookingSettings(
            studio_id=studio.id, booking_window_days=30, min_booking_advance_min=1,
            prefill_on_booking=False, widget_work_start="00:00", widget_work_end="00:00",
        ))
        branch = StudioBranch(studio_id=studio.id, name="Вацлавская", city="Praha")
        db.add(branch)
        await db.flush()
        hall = Hall(studio_id=studio.id, branch_id=branch.id, name="Зал", capacity=10)
        group_service = Service(studio_id=studio.id, name="Стретчинг", duration_min=60,
                                price=500, service_type="group", max_clients=8)
        # Старый individual — уже сегодня существует как заранее созданное
        # occasion с одним местом. HB-02 переводит его в booking_mode=event и
        # НЕ имеет права поменять это поведение.
        individual_service = Service(studio_id=studio.id, name="Массаж", duration_min=60,
                                     price=1000, service_type="individual", max_clients=1)
        teacher = User(email=f"hc-{stamp}@test.local", hashed_password="x", name="T")
        db.add_all([hall, group_service, individual_service, teacher])
        await db.flush()
        db.add(StudioMember(user_id=teacher.id, studio_id=studio.id, role="trainer",
                            status="active", name="Валерия", last_name="Ким"))
        katya = Client(studio_id=studio.id, name="Катя", phone="420700000011")
        oleg = Client(studio_id=studio.id, name="Олег", phone="420700000012")
        db.add_all([katya, oleg])
        await db.flush()

        def mk(hour, spots, price, service_id, minute=0):
            return Lesson(
                studio_id=studio.id, name="Занятие", teacher_name="Т",
                service_id=service_id, teacher_id=teacher.id, hall_id=hall.id,
                start_time=datetime.combine(TOMORROW, time(hour, minute)),
                tz_iana="Europe/Prague", duration_min=60, price=price,
                level="", equipment="", total_spots=spots, status="confirmed",
            )

        group_free = mk(10, 8, 0, group_service.id)
        group_paid = mk(11, 8, 500, group_service.id)
        individual = mk(12, 1, 1000, individual_service.id)
        repeatable = mk(13, 8, 0, group_service.id)
        db.add_all([group_free, group_paid, individual, repeatable])
        await db.flush()
        ids = {
            "studio": studio.id, "katya": katya.id, "oleg": oleg.id,
            "user": teacher.id, "hall": hall.id,
            "group_service": group_service.id, "individual_service": individual_service.id,
            "branch": branch.id,
            "group_free": group_free.id, "group_paid": group_paid.id,
            "individual": individual.id, "repeatable": repeatable.id,
            "lessons": [group_free.id, group_paid.id, individual.id, repeatable.id],
        }
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(ClientPayment).where(
            ClientPayment.client_id.in_([ids["katya"], ids["oleg"]])))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id.in_([ids["katya"], ids["oleg"]])))
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio"]))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == ids["studio"]))
        await db.execute(delete(Client).where(Client.studio_id == ids["studio"]))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id == ids["user"]))
        await db.commit()


async def _wipe(ids) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(ClientPayment).where(
            ClientPayment.client_id.in_([ids["katya"], ids["oleg"]])))
        await db.execute(delete(Reservation).where(
            Reservation.lesson_id.in_(ids["lessons"])))
        await db.execute(delete(ClientSubscription).where(
            ClientSubscription.client_id.in_([ids["katya"], ids["oleg"]])))
        await db.commit()


async def _book(ids, client_key: str, lesson_key: str, **kw):
    async with async_session_maker() as db:
        result = await booking.create(
            db, studio_id=ids["studio"], client_id=ids[client_key],
            lesson_id=ids[lesson_key], source="test", **kw)
        if result.outcome is Outcome.OK:
            await db.commit()
        else:
            await db.rollback()
        return result


async def _settings(ids):
    async with async_session_maker() as db:
        return (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()


async def _set(ids, **values) -> None:
    async with async_session_maker() as db:
        row = (await db.execute(select(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))).scalar_one()
        for key, value in values.items():
            setattr(row, key, value)
        await db.commit()


# ─── Обычная группа: путь публичного виджета (оплата на месте) ───────────────

async def _regular_group_pay_on_site(ids):
    """`routers/booking/public.py` зовёт `booking.create(require_funding=False,
    allow_payment=True)` — фиксируем это как сегодняшний контракт."""
    result = await _book(ids, "katya", "group_paid",
                         require_funding=False, allow_payment=True)
    assert result.outcome is Outcome.OK, result
    assert result.status == "active"
    assert result.terms.funding.kind is FundingKind.PAY
    assert result.terms.funding.price == 500

    async with async_session_maker() as db:
        reservation = await db.get(Reservation, result.reservation_id)
        assert reservation.debt_payment_id is not None, "оплата на месте обязана открыть долг"
        debt = await db.get(ClientPayment, reservation.debt_payment_id)
        assert debt.status == "pending"
        assert debt.amount == 500


# ─── individual-as-event: HB-02 не имеет права это сломать ───────────────────

async def _individual_as_event(ids):
    """Индивидуальная услуга с одним occasion-местом бронируется ТЕМ ЖЕ
    доменом, что и группа. `service_type` на исход не влияет — механику решает
    только `Lesson`/`Reservation`. AC-02: после HB-02 это остаётся event."""
    async with async_session_maker() as db:
        service = await db.get(Service, ids["individual_service"])
        assert service.service_type == "individual"

    result = await _book(ids, "oleg", "individual",
                         require_funding=True, allow_payment=True)
    assert result.outcome is Outcome.NO_FUNDING, (
        "требуется явное покрытие (Журнал/карточка клиента) — как у группы")

    result = await _book(ids, "oleg", "individual",
                         require_funding=False, allow_payment=True)
    assert result.outcome is Outcome.OK, result
    assert result.status == "active"

    # Вместимость 1 — второй клиент получает тот же исход, что у последнего
    # места группового занятия (NO_CAPACITY), а не отдельную ветку кода.
    second = await _book(ids, "katya", "individual",
                         require_funding=False, allow_payment=True)
    assert second.outcome is Outcome.NO_CAPACITY, second


# ─── Повторная запись вкл/выкл ────────────────────────────────────────────────

async def _repeat_booking_toggle(ids):
    await _set(ids, repeat_booking_allowed=False)
    first = await _book(ids, "katya", "repeatable")
    assert first.outcome is Outcome.OK
    second = await _book(ids, "katya", "repeatable")
    assert second.outcome is Outcome.ALREADY_BOOKED, second

    await _set(ids, repeat_booking_allowed=True)
    third = await _book(ids, "katya", "repeatable")
    assert third.outcome is Outcome.OK, third
    assert third.reservation_id != first.reservation_id

    # ЭТО И ЕСТЬ разрыв контракта, который должен закрыть HB-21: у клиента
    # теперь ДВЕ живые брони на одно занятие, а мини-приложение отменяет их
    # по lesson_id, а не по reservation_id.
    async with async_session_maker() as db:
        live = (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids["repeatable"],
            Reservation.client_id == ids["katya"],
            Reservation.status != "cancelled",
        ))).scalars().all()
    assert len(live) == 2, "повторная запись обязана давать вторую бронь, не заменять первую"

    class _FakeClient:
        id = ids["katya"]

    async with async_session_maker() as db:
        picked = await miniapp_lessons._own_active_reservation(
            db, _FakeClient(), ids["repeatable"])
    # `_own_active_reservation` берёт ПОСЛЕДНЮЮ (наибольший id) — сегодня это
    # `third`, а не `first`. Мини-приложение НЕ даёт клиенту выбрать, какую из
    # двух он отменяет; это существующее ограничение, а не то, что чинит HB-01.
    assert picked.id == third.reservation_id, (
        "если это упало — поведение _own_active_reservation изменилось, "
        "и HB-21 надо проектировать заново")

    await _set(ids, repeat_booking_allowed=False)


# ─── pending (подтверждение тренером) ─────────────────────────────────────────

async def _pending_confirmation(ids):
    await _set(ids, trainer_confirmation_required=True)
    result = await _book(ids, "katya", "group_free")
    assert result.outcome is Outcome.OK and result.status == "pending", result

    async with async_session_maker() as db:
        # pending уже держит место — второй клиент не видит свободного коврика
        # только по остальным семи (total_spots=8), считаем занятые явно.
        taken = (await db.execute(select(Reservation).where(
            Reservation.lesson_id == ids["group_free"],
            Reservation.status != "cancelled"))).scalars().all()
    assert len(taken) == 1

    async with async_session_maker() as db:
        approved = await booking.approve(
            db, studio_id=ids["studio"], reservation_id=result.reservation_id,
            actor="test")
        await db.commit()
    assert approved.outcome is Outcome.OK and approved.status == "active"
    await _set(ids, trainer_confirmation_required=False)


# ─── hold (P4, карточная бронь) — существующий незакоммиченный код ───────────

async def _hold_for_payment(ids):
    """`booking.create(hold_for_payment=True)` — единственный сегодняшний
    вызывающий код: `services/proposals.py` (агент). HB-11 подключит resource
    к тому же переходу; здесь фиксируем исходное поведение статуса."""
    result = await _book(ids, "katya", "group_paid", hold_for_payment=True)
    assert result.outcome is Outcome.OK, result
    assert result.status == "hold", "цена > 0, оплаты карты не было — обязан быть hold"

    async with async_session_maker() as db:
        reservation = await db.get(Reservation, result.reservation_id)
        # hold НЕ получает долг «оплата на месте» — иначе двойная оплата.
        assert reservation.debt_payment_id is None

    async with async_session_maker() as db:
        activated = await booking.activate_paid(
            db, studio_id=ids["studio"], reservation_id=result.reservation_id)
        await db.commit()
    assert activated.outcome is Outcome.OK and activated.status == "active"

    # Повтор идемпотентен — вторая оплата/вебхук не открывает вторую бронь.
    async with async_session_maker() as db:
        again = await booking.activate_paid(
            db, studio_id=ids["studio"], reservation_id=result.reservation_id)
    assert again.outcome is Outcome.OK and again.status == "active"


# ─── Абонемент, подарок, бесплатное занятие ───────────────────────────────────

async def _subscription_funding(ids):
    async with async_session_maker() as db:
        sub = ClientSubscription(client_id=ids["katya"], type="Стретчинг",
                                 total_classes=4, used_classes=0,
                                 expires_at=TOMORROW + timedelta(days=10),
                                 status="active")
        db.add(sub)
        await db.commit()
        sub_id = sub.id

    result = await _book(ids, "katya", "group_paid")
    assert result.outcome is Outcome.OK
    assert result.terms.funding.kind is FundingKind.SUBSCRIPTION
    assert result.terms.funding.subscription_id == sub_id

    async with async_session_maker() as db:
        reservation = await db.get(Reservation, result.reservation_id)
        assert reservation.subscription_id == sub_id
        assert reservation.debt_payment_id is None


async def _trial_funding(ids):
    await _set(ids, trial_lesson_free=True)
    result = await _book(ids, "oleg", "group_paid")
    assert result.outcome is Outcome.OK
    assert result.terms.funding.kind is FundingKind.TRIAL
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, result.reservation_id)
        assert reservation.is_trial is True
    await _set(ids, trial_lesson_free=False)


async def _free_lesson(ids):
    result = await _book(ids, "katya", "group_free")
    assert result.outcome is Outcome.OK
    assert result.terms.funding.kind is FundingKind.FREE
    assert result.terms.funding.price == 0


# ─── Контракт ID: CRM уже отдаёт reservation_id ──────────────────────────────

async def _crm_id_contract(ids):
    """`ReservationRead`/`BookingCreatedOut` уже сегодня возвращают
    reservation_id как `id`, отдельно от `lesson_id`. HB-02+ не имеет права
    это переименовать (docs/EPIC…: "без переименования старого поля id")."""
    result = await _book(ids, "katya", "group_free")
    assert result.outcome is Outcome.OK
    async with async_session_maker() as db:
        reservation = await db.get(Reservation, result.reservation_id)
        read = ReservationRead.model_validate(reservation)
        created = BookingCreatedOut(id=reservation.id, message="Запись создана")
    assert read.id == result.reservation_id
    assert read.id != read.lesson_id or ids["group_free"] != result.reservation_id
    assert read.lesson_id == ids["group_free"]
    assert created.id == result.reservation_id


def _miniapp_my_lessons_lacks_reservation_id():
    """Статически фиксируем известный разрыв: список «мои занятия» отдаёт
    только id занятия. Как только кто-то добавит `reservation_id` в схему —
    этот тест начнёт падать, и его нужно будет ПЕРЕПИСАТЬ (это HB-21), а не
    молча удалить."""
    upcoming_fields = set(miniapp_lessons.MiniappUpcomingLesson.model_fields)
    past_fields = set(miniapp_lessons.MiniappPastLesson.model_fields)
    assert "reservation_id" not in upcoming_fields, (
        "HB-21 добавил reservation_id в MiniappUpcomingLesson — обнови "
        "docs/HYBRID_BOOKING_PROGRESS.md (HB-01) и этот тест")
    assert "reservation_id" not in past_fields
    assert "id" in upcoming_fields and "id" in past_fields  # это id ЗАНЯТИЯ

    # cancel/rate сегодня принимают lesson_id, не reservation_id.
    cancel_src = inspect.getsource(miniapp_lessons.cancel_reservation)
    rate_src = inspect.getsource(miniapp_lessons.rate_reservation)
    assert "lesson_id: int" in cancel_src
    assert "lesson_id: int" in rate_src


def _public_widget_contract_locked():
    """Старый публичный виджет (без токена) — поля ответа не должны сместиться
    при появлении discriminated union HB-13."""
    assert set(public_router.PublicService.model_fields) == {
        "id", "name", "description", "price", "duration_min", "category", "color",
    }
    assert set(public_router.PublicSlot.model_fields) == {
        "lesson_id", "name", "start_time", "duration_min", "price", "level", "free_spots",
    }
    assert set(public_router.ReserveResponse.model_fields) == {
        "reservation_id", "lesson_name", "start_time",
    }


def test_hybrid_static_contracts_locked():
    _miniapp_my_lessons_lacks_reservation_id()
    _public_widget_contract_locked()


def test_hybrid_compatibility_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _regular_group_pay_on_site(ids)
            await _wipe(ids)
            await _individual_as_event(ids)
            await _wipe(ids)
            await _repeat_booking_toggle(ids)
            await _wipe(ids)
            await _pending_confirmation(ids)
            await _wipe(ids)
            await _hold_for_payment(ids)
            await _wipe(ids)
            await _subscription_funding(ids)
            await _wipe(ids)
            await _trial_funding(ids)
            await _wipe(ids)
            await _free_lesson(ids)
            await _wipe(ids)
            await _crm_id_contract(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_hybrid_static_contracts_locked()
    test_hybrid_compatibility_against_the_database()

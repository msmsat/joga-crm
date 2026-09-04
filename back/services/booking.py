"""Бизнес-переходы брони: одно место, где меняется состояние записи (P3).

ЧТО ЗДЕСЬ И ПОЧЕМУ. До сих пор бронь заводили четыре роутера, каждый со своими
проверками, и совпадали они по счастливому совпадению. Общее у них было ровно
то, что и должно быть общим, — покрытие (`booking_access`) и списание
(`subscription_charge`); всё остальное расходилось. Этот модуль собирает САМ
ПЕРЕХОД в одну функцию, чтобы у агента не было своего движка записи, а у
мини-приложения — своего.

    команда (только серверные идентификаторы)
      -> ПОЛНАЯ ПЕРЕПРОВЕРКА (всё, что могло измениться после показа)
      -> короткая транзакция без сети
      -> типизированный исход

ЧЕГО ЗДЕСЬ НЕТ:
  * естественного языка. Команда состоит из идентификаторов, которые выбрал
    сервер; модель не может назвать ни занятие, ни клиента, ни студию;
  * сети. Ни модели, ни Stripe, ни Telegram внутри транзакции: сеть в открытой
    транзакции — тот самый запрет, на котором стоит весь P0;
  * доверия к снимку. Всё, что человеку показали при подборе, — снимок.
    Перед записью каждое условие читается заново.

ТРИ ЗАЩИТЫ ОТ ГОНОК, И КАЖДАЯ О СВОЁМ:
  * место в зале  — уникальный индекс `uq_reservation_spot_active`;
  * решения о человеке (подарок, дубль, пересечение) — замок на строке клиента
    (`booking_access.lock_client`);
  * занятие абонемента — условный UPDATE (`subscription_charge`).
Ни одна из них не заменяет другие: они защищают разные вещи.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import Client, Lesson, Reservation, Studio
from services import catalog, lesson_time, studio_time
from services.booking_access import (
    lock_client, next_free_spot, resolve_coverage,
)
from services.booking_rules import BookingRules, booking_window, load_rules, within_widget_hours
from services.catalog import OCCUPIES_SPOT
from services.subscription_charge import (
    charge_reservation, clear_debt, open_debt, refund_reservation,
)

logger = logging.getLogger(__name__)


class Outcome(str, Enum):
    """Чем кончился переход. Не булево: «нельзя» бывает разным, и человеку надо
    сказать разное — «мест нет» и «уже записаны» это не одно сообщение."""
    OK = "OK"
    LESSON_UNAVAILABLE = "LESSON_UNAVAILABLE"      # нет, отменено, чужая студия
    WINDOW_CLOSED = "WINDOW_CLOSED"                # поздно, рано, запись выключена
    NO_CAPACITY = "NO_CAPACITY"
    SPOT_TAKEN = "SPOT_TAKEN"
    ALREADY_BOOKED = "ALREADY_BOOKED"
    OVERLAP = "OVERLAP"
    CLIENT_UNAVAILABLE = "CLIENT_UNAVAILABLE"
    NO_FUNDING = "NO_FUNDING"                      # нечем платить, а студия требует
    TERMS_CHANGED = "TERMS_CHANGED"                # условия не те, что показывали
    PAYMENT_REQUIRED = "PAYMENT_REQUIRED"          # нужна карта (P4)
    PAYMENT_NOT_AVAILABLE = "PAYMENT_NOT_AVAILABLE"
    NOT_FOUND = "NOT_FOUND"                        # брони нет / не ваша
    ALREADY_CANCELLED = "ALREADY_CANCELLED"


class FundingKind(str, Enum):
    SUBSCRIPTION = "subscription"
    TRIAL = "trial"
    FREE = "free"          # занятие бесплатное по прайсу
    PAY = "pay"            # платит на месте либо картой


@dataclass(frozen=True)
class Funding:
    """ЧЕМ оплачивается бронь — кортеж, а не одна цена (§16).

    Сравнивать только сумму мало: «бесплатно по абонементу» и «бесплатно, потому
    что подарок» это разные основания, и подмена одного другим меняет для
    человека всё. Абонемент истёк между показом и подтверждением — цена та же,
    основание другое, и молча превращать подарок в платное занятие нельзя.
    """
    kind: FundingKind
    subscription_id: Optional[int]
    price: int
    currency: str

    def same_as(self, other: Optional["Funding"]) -> bool:
        if other is None:
            return True                     # условий не показывали — сверять нечего
        return (self.kind is other.kind
                and self.subscription_id == other.subscription_id
                and self.price == other.price
                and self.currency == other.currency)


@dataclass(frozen=True)
class Terms:
    """Условия занятия НА МОМЕНТ ПОКАЗА — то, по чему человек принимал решение.

    Хранится не текст ответа, а факты: текст пересобирается, а факты сравнимы.
    Перед записью каждое сравнивается с текущим (`_material_change`).
    """
    lesson_id: int
    local_start: datetime
    service_name: str
    trainer_name: str
    branch_name: Optional[str]
    funding: Funding
    approval_required: bool

    def to_json(self) -> dict:
        return {
            "lesson_id": self.lesson_id,
            "local_start": self.local_start.isoformat(),
            "service_name": self.service_name,
            "trainer_name": self.trainer_name,
            "branch_name": self.branch_name,
            "funding": {"kind": self.funding.kind.value,
                        "subscription_id": self.funding.subscription_id,
                        "price": self.funding.price,
                        "currency": self.funding.currency},
            "approval_required": self.approval_required,
        }

    @staticmethod
    def from_json(raw: Optional[dict]) -> Optional["Terms"]:
        if not raw:
            return None
        try:
            funding = raw["funding"]
            return Terms(
                lesson_id=int(raw["lesson_id"]),
                local_start=datetime.fromisoformat(raw["local_start"]),
                service_name=raw["service_name"],
                trainer_name=raw["trainer_name"],
                branch_name=raw.get("branch_name"),
                funding=Funding(FundingKind(funding["kind"]),
                                funding["subscription_id"], int(funding["price"]),
                                funding["currency"]),
                approval_required=bool(raw["approval_required"]),
            )
        except (KeyError, TypeError, ValueError):
            # Условия записаны другой версией кода. Считать их совпадающими
            # нельзя: непрочитанный снимок — это не «изменений не было».
            return None


@dataclass(frozen=True)
class Quote:
    """Что будет, если записаться сейчас. НИЧЕГО НЕ МЕНЯЕТ."""
    outcome: Outcome
    terms: Optional[Terms] = None
    # Свободный коврик, который достанется этой брони.
    spot_number: Optional[int] = None
    # Занятие нужно оплатить картой (P4): абонемента нет, подарка нет, цена > 0.
    payment_required: bool = False


@dataclass(frozen=True)
class Result:
    outcome: Outcome
    reservation_id: Optional[int] = None
    status: Optional[str] = None
    terms: Optional[Terms] = None
    remaining: Optional[int] = None


async def quote(db: AsyncSession, *, studio_id: int, client_id: int, lesson_id: int,
                now: Optional[datetime] = None) -> Quote:
    """Условия записи на СЕЙЧАС — для предложения человеку. Только чтение.

    Отдельная функция, а не «create с флагом»: предложение показывают до
    согласия, и оно обязано быть физически неспособно что-либо изменить.
    """
    # Замок на клиенте здесь НЕ берётся: предложение только читает, а держать
    # на нём строку значило бы притормаживать чужую настоящую запись ради
    # нашего «а что если».
    checked = await _check(db, studio_id=studio_id, client_id=client_id,
                           lesson_id=lesson_id, now=now, spot_number=None, lock=False)
    if checked.outcome is not Outcome.OK:
        return Quote(checked.outcome)
    return Quote(Outcome.OK, checked.terms, checked.spot,
                 payment_required=checked.terms.funding.kind is FundingKind.PAY
                 and checked.terms.funding.price > 0)


@dataclass
class _Checked:
    outcome: Outcome
    lesson: Optional[Lesson] = None
    rules: Optional[BookingRules] = None
    terms: Optional[Terms] = None
    spot: Optional[int] = None
    subscription = None
    is_trial: bool = False


async def _check(db: AsyncSession, *, studio_id: int, client_id: int, lesson_id: int,
                 now: Optional[datetime], spot_number: Optional[int],
                 lock: bool = True) -> _Checked:
    """ПОЛНАЯ проверка всего, что могло измениться. Читает; не пишет.

    Порядок не случаен: сначала то, что не зависит от человека (занятие, окно
    записи), потом то, что зависит (клиент, покрытие, место). Так самый частый
    отказ — «занятие уже прошло» — не требует замка на клиенте.
    """
    lesson = (await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.studio_id == studio_id)
    )).scalar_one_or_none()
    if lesson is None or lesson.status == "cancelled":
        return _Checked(Outcome.LESSON_UNAVAILABLE)

    studio = (await db.execute(
        select(Studio).where(Studio.id == studio_id)
    )).scalar_one_or_none()
    if studio is None:
        return _Checked(Outcome.LESSON_UNAVAILABLE)

    rules = await load_rules(db, studio_id)
    wall = lesson_time.local_now(studio, now)
    if not rules.booking_active:
        return _Checked(Outcome.WINDOW_CLOSED)
    lower, upper = booking_window(rules, wall)
    if not (lower <= lesson.start_time <= upper):
        return _Checked(Outcome.WINDOW_CLOSED)
    if not within_widget_hours(rules, lesson.start_time):
        return _Checked(Outcome.WINDOW_CLOSED)

    client = (await db.execute(
        select(Client).where(Client.id == client_id, Client.studio_id == studio_id)
    )).scalar_one_or_none()
    if client is None or not client.is_active:
        return _Checked(Outcome.CLIENT_UNAVAILABLE)

    taken = (await db.execute(
        select(Reservation.spot_number, Reservation.client_id)
        .where(Reservation.lesson_id == lesson.id, OCCUPIES_SPOT)
    )).all()
    if not rules.repeat_booking_allowed and any(row.client_id == client_id for row in taken):
        return _Checked(Outcome.ALREADY_BOOKED)
    busy = {row.spot_number for row in taken}
    if len(busy) >= lesson.total_spots:
        return _Checked(Outcome.NO_CAPACITY)
    if spot_number is None:
        spot = next((n for n in range(1, lesson.total_spots + 1) if n not in busy), None)
        if spot is None:
            return _Checked(Outcome.NO_CAPACITY)
    else:
        if not (1 <= spot_number <= lesson.total_spots):
            return _Checked(Outcome.SPOT_TAKEN)
        if spot_number in busy:
            return _Checked(Outcome.SPOT_TAKEN)
        spot = spot_number

    subscription, is_trial = await resolve_coverage(db, client_id, lesson, rules,
                                                    lock=lock)
    currency = studio.currency or "RUB"
    if subscription is not None:
        funding = Funding(FundingKind.SUBSCRIPTION, subscription.id, 0, currency)
    elif is_trial:
        funding = Funding(FundingKind.TRIAL, None, 0, currency)
    elif lesson.price <= 0:
        funding = Funding(FundingKind.FREE, None, 0, currency)
    else:
        if rules.prefill_on_booking:
            # Студия требует покрытие до занятия, а его нет.
            return _Checked(Outcome.NO_FUNDING, lesson, rules)
        funding = Funding(FundingKind.PAY, None, lesson.price, currency)

    facts = await catalog.lesson(db, studio_id, lesson.id)
    if facts is None:
        return _Checked(Outcome.LESSON_UNAVAILABLE)
    terms = Terms(
        lesson_id=lesson.id,
        local_start=facts.local_start,
        service_name=facts.display_name,
        trainer_name=facts.trainer_name,
        branch_name=facts.branch_name,
        funding=funding,
        approval_required=bool(rules.trainer_confirmation_required),
    )
    checked = _Checked(Outcome.OK, lesson, rules, terms, spot)
    checked.subscription = subscription
    checked.is_trial = is_trial
    return checked


def material_change(shown: Optional[Terms], current: Terms) -> bool:
    """Изменилось ли то, ради чего человек соглашался.

    Сравниваем ФАКТЫ, а не текст: время, тренера, филиал, основание оплаты и
    необходимость подтверждения. Название услуги тоже — переименование само по
    себе безобидно, но замена «Стретчинга» на «Йогу» под тем же занятием нет.
    """
    if shown is None:
        return False
    return not (shown.lesson_id == current.lesson_id
                and shown.local_start == current.local_start
                and shown.service_name == current.service_name
                and shown.trainer_name == current.trainer_name
                and shown.branch_name == current.branch_name
                and shown.approval_required == current.approval_required
                and current.funding.same_as(shown.funding))


async def create(db: AsyncSession, *, studio_id: int, client_id: int, lesson_id: int,
                 source: str, spot_number: Optional[int] = None,
                 shown: Optional[Terms] = None,
                 now: Optional[datetime] = None,
                 allow_payment: bool = False) -> Result:
    """Записать клиента на занятие. ЕДИНСТВЕННЫЙ переход «брони не было → есть».

    НЕ КОММИТИТ: вызывающий закрывает транзакцию сам — вместе со своим
    состоянием (предложение агента, работа воркера). Порознь они дали бы бронь
    без отметки о том, кто её сделал.

    `shown` — условия, которые человек видел. Разошлись с текущими — отказ
    `TERMS_CHANGED`: подтверждали не это.
    """
    checked = await _check(db, studio_id=studio_id, client_id=client_id,
                           lesson_id=lesson_id, now=now, spot_number=spot_number)
    if checked.outcome is not Outcome.OK:
        logger.info("booking_rejected studio_id=%s lesson_id=%s outcome=%s source=%s",
                    studio_id, lesson_id, checked.outcome.value, source)
        return Result(checked.outcome)

    terms = checked.terms
    if material_change(shown, terms):
        logger.info("booking_terms_changed studio_id=%s lesson_id=%s source=%s",
                    studio_id, lesson_id, source)
        return Result(Outcome.TERMS_CHANGED, terms=terms)

    if terms.funding.kind is FundingKind.PAY and terms.funding.price > 0 \
            and not allow_payment:
        # Платить надо картой, а этот путь денег не умеет. Полусостояния не
        # заводим: ни брони, ни платежа (§53).
        return Result(Outcome.PAYMENT_REQUIRED, terms=terms)

    reservation = Reservation(
        client_id=client_id,
        lesson_id=lesson_id,
        spot_number=checked.spot,
        status="pending" if terms.approval_required else "active",
        booking_channel=source,
        is_trial=checked.is_trial,
    )
    db.add(reservation)
    remaining = await charge_reservation(db, studio_id, reservation, checked.subscription)
    if checked.subscription is not None and reservation.subscription_id is None:
        # Абонемент кончился между проверкой и списанием. Записать «бесплатно»
        # нельзя — это подарок за счёт студии.
        await db.rollback()
        return Result(Outcome.NO_FUNDING)
    await open_debt(db, reservation, checked.lesson)
    try:
        await db.flush()
    except IntegrityError:
        # Коврик заняли между проверкой и вставкой. Последнее слово — за
        # уникальным индексом, а не за нашим SELECT'ом.
        await db.rollback()
        logger.info("capacity_conflict studio_id=%s lesson_id=%s", studio_id, lesson_id)
        return Result(Outcome.SPOT_TAKEN)

    logger.info("booking_created studio_id=%s lesson_id=%s status=%s funding=%s source=%s",
                studio_id, lesson_id, reservation.status, terms.funding.kind.value, source)
    return Result(Outcome.OK, reservation.id, reservation.status, terms, remaining)


async def cancel(db: AsyncSession, *, studio_id: int, reservation_id: int,
                 actor: str, reason: Optional[str] = None,
                 client_id: Optional[int] = None,
                 now: Optional[datetime] = None) -> Result:
    """Отменить бронь. Идемпотентно: вторая отмена — тот же безопасный исход.

    МЕСТО ОСВОБОЖДАЕТСЯ ВСЕГДА. Поздняя отмена может стоить клиенту занятия
    абонемента (это решает студия своими правилами), но держать за ним коврик,
    на который он не придёт, — наказание не его, а тех, кто хотел записаться.
    """
    reservation = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id, Lesson.studio_id == studio_id)
        .with_for_update(of=Reservation)
    )).scalar_one_or_none()
    if reservation is None:
        return Result(Outcome.NOT_FOUND)
    if client_id is not None and reservation.client_id != client_id:
        # Чужая бронь. Снаружи неотличимо от «нет такой»: перебирать номера в
        # надежде на другой ответ нечего.
        return Result(Outcome.NOT_FOUND)
    if reservation.status == "cancelled":
        return Result(Outcome.ALREADY_CANCELLED, reservation.id, reservation.status)

    await refund_reservation(db, reservation)
    reservation.status = "cancelled"
    reservation.cancelled_at = datetime.utcnow()
    if reason:
        reservation.cancellation_reason = reason[:300]
    logger.info("booking_cancelled studio_id=%s reservation_id=%s actor=%s",
                studio_id, reservation_id, actor)
    return Result(Outcome.OK, reservation.id, "cancelled")


async def approve(db: AsyncSession, *, studio_id: int, reservation_id: int,
                  actor: str, now: Optional[datetime] = None) -> Result:
    """Подтвердить ждущую бронь. Переход делает СТУДИЯ, не клиент.

    ЧТО ПЕРЕСЧИТЫВАЕТСЯ. Подтверждение приходит через минуты или часы, и за это
    время занятие могли отменить или перенести. Место и списание НЕ
    пересчитываются: они были заняты в момент запроса и держатся с тех пор —
    иначе ожидание решения студии стоило бы клиенту очереди. Пересчитывается
    то, что от него не зависит: живо ли занятие и жив ли клиент.
    """
    reservation = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id, Lesson.studio_id == studio_id)
        .with_for_update(of=Reservation)
    )).scalar_one_or_none()
    if reservation is None:
        return Result(Outcome.NOT_FOUND)
    if reservation.status == "cancelled":
        return Result(Outcome.ALREADY_CANCELLED, reservation.id, reservation.status)
    if reservation.status != "pending":
        # Уже подтверждена (или отмечена посещённой) — повтор безопасен.
        return Result(Outcome.OK, reservation.id, reservation.status)

    lesson = await db.get(Lesson, reservation.lesson_id)
    if lesson is None or lesson.status == "cancelled":
        return Result(Outcome.LESSON_UNAVAILABLE)
    client = await db.get(Client, reservation.client_id)
    if client is None or not client.is_active:
        return Result(Outcome.CLIENT_UNAVAILABLE)

    reservation.status = "active"
    logger.info("booking_approved studio_id=%s reservation_id=%s actor=%s",
                studio_id, reservation_id, actor)
    return Result(Outcome.OK, reservation.id, "active")


async def reject(db: AsyncSession, *, studio_id: int, reservation_id: int,
                 actor: str, reason: Optional[str] = None) -> Result:
    """Отклонить ждущую бронь — это отмена: место и занятие возвращаются."""
    return await cancel(db, studio_id=studio_id, reservation_id=reservation_id,
                        actor=actor, reason=reason or "отклонено студией")


async def reschedule(db: AsyncSession, *, studio_id: int, reservation_id: int,
                     target_lesson_id: int, actor: str,
                     client_id: Optional[int] = None,
                     shown: Optional[Terms] = None,
                     now: Optional[datetime] = None) -> Result:
    """Перенести бронь на другое занятие — ОДНОЙ операцией.

    Порядок здесь не вкусовщина. «Отменить, потом записать» теряет бронь, если
    вторая половина не удалась; «записать, потом отменить» оставляет две, если
    не удалась первая. Поэтому обе половины идут в ОДНОЙ транзакции
    вызывающего, и неудача любой откатывает всё: человек остаётся ровно с той
    бронью, что была.

    Занятие абонемента возвращается и списывается снова — на новое занятие мог
    подойти другой абонемент, и переносить ссылку вслепую значило бы оплатить
    йогу пакетом для стретчинга.
    """
    source = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id, Lesson.studio_id == studio_id)
        .with_for_update(of=Reservation)
    )).scalar_one_or_none()
    if source is None:
        return Result(Outcome.NOT_FOUND)
    if client_id is not None and source.client_id != client_id:
        return Result(Outcome.NOT_FOUND)
    if source.status == "cancelled":
        return Result(Outcome.ALREADY_CANCELLED)
    if source.lesson_id == target_lesson_id:
        return Result(Outcome.ALREADY_BOOKED, source.id, source.status)

    booked_client = source.client_id
    # Освобождаем старое место ПЕРВЫМ и в той же транзакции: иначе проверка
    # «не записан ли уже» на новом занятии увидит нас самих, а место старого
    # занятия останется занятым нами же в момент, когда мы его уже покидаем.
    await refund_reservation(db, source)
    source.status = "cancelled"
    source.cancelled_at = datetime.utcnow()
    source.cancellation_reason = "перенос"
    await db.flush()

    moved = await create(db, studio_id=studio_id, client_id=booked_client,
                         lesson_id=target_lesson_id, source=actor, shown=shown, now=now)
    if moved.outcome is not Outcome.OK:
        # Ничего не случилось: вызывающий откатит транзакцию целиком, и старая
        # бронь останется живой. Возвращаем причину, по которой не вышло.
        logger.info("reschedule_failed studio_id=%s reservation_id=%s outcome=%s",
                    studio_id, reservation_id, moved.outcome.value)
        return moved
    logger.info("booking_rescheduled studio_id=%s from=%s to=%s actor=%s",
                studio_id, reservation_id, moved.reservation_id, actor)
    return moved

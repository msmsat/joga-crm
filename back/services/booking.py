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

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models import Client, Lesson, Reservation, Studio
from services import booking_notifications, catalog, lesson_time, pricing, schedule_guard, studio_time
from services.booking_access import (
    lock_client, next_free_spot, resolve_coverage,
)
from services.booking_rules import (
    BookingRules, booking_window, lesson_finished, load_rules, within_widget_hours,
)
from services.catalog import OCCUPIES_SPOT
from services.subscription_charge import (
    charge_reservation, clear_debt, open_debt, refund_reservation,
)
from services.schedule_guard import lock_studio

logger = logging.getLogger(__name__)

# Имя частичного уникального индекса «один коврик — один человек»
# (models/schedule.Reservation). По нему и только по нему нарушение целостности
# читается как «место уже заняли».
_SPOT_INDEX = "uq_reservation_spot_active"


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
    # Клиент отмечен пришедшим: визит состоялся, и отменять его нечем.
    ATTENDED = "ATTENDED"


class FundingKind(str, Enum):
    SUBSCRIPTION = "subscription"
    TRIAL = "trial"
    FREE = "free"          # занятие бесплатное по прайсу
    PAY = "pay"            # платит на месте либо картой


class Actor(str, Enum):
    """КТО записывает. От этого зависит окно записи, и только оно.

    Правила «не позднее чем за два часа», «не дальше чем на неделю вперёд» и
    «только в часы виджета» — это правила САМОСТОЯТЕЛЬНОЙ записи клиента.
    К администратору, сажающему человека на свободное место за двадцать минут
    до начала, они отношения не имеют: студия распоряжается своим залом сама
    (см. `booking_rules.assert_staff_bookable`). Единственный запрет за стойкой
    — занятие уже прошло: посадить человека в зал задним числом нельзя.
    """
    CLIENT = "client"
    STAFF = "staff"


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
    # Цена ЗАНЯТИЯ по прайсу. `funding.price` — цена ЭТОГО КЛИЕНТА, она же
    # платится картой; здесь лежит то, из чего она посчитана.
    #
    # Зачем хранить обе. Скидка клиента и цена занятия меняются по разным
    # причинам и означают разное: правку прайса делает студия — это изменение
    # УСЛОВИЙ ЗАНЯТИЯ, и открытая оплата по нему недействительна; смену скидки
    # делает студия клиенту — уже заключённый договор она не переписывает
    # (§46, §49 задания). Различить их можно, только зная обе цены.
    base_price: int = 0

    def to_json(self) -> dict:
        return {
            "base_price": self.base_price,
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
                # Снимок прежнего выпуска цены прайса не знал. Считать её
                # равной клиентской — единственное безопасное чтение: так
                # «цена не менялась» останется правдой для старой записи.
                base_price=int(raw.get("base_price", funding["price"])),
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
                now: Optional[datetime] = None, actor: Actor = Actor.CLIENT,
                require_funding: Optional[bool] = None) -> Quote:
    """Условия записи на СЕЙЧАС — для предложения человеку. Только чтение.

    Отдельная функция, а не «create с флагом»: предложение показывают до
    согласия, и оно обязано быть физически неспособно что-либо изменить.
    """
    # Замок на клиенте здесь НЕ берётся: предложение только читает, а держать
    # на нём строку значило бы притормаживать чужую настоящую запись ради
    # нашего «а что если».
    checked = await _check(db, studio_id=studio_id, client_id=client_id,
                           lesson_id=lesson_id, now=now, spot_number=None, lock=False,
                           actor=actor, require_funding=require_funding)
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
                 lock: bool = True, actor: Actor = Actor.CLIENT,
                 require_funding: Optional[bool] = None, _resource: bool = False) -> _Checked:
    """ПОЛНАЯ проверка всего, что могло измениться. Читает; не пишет.

    Порядок не случаен: сначала то, что не зависит от человека (занятие, окно
    записи), потом то, что зависит (клиент, покрытие, место). Так самый частый
    отказ — «занятие уже прошло» — не требует замка на клиенте.

    `require_funding` — чем поверхность считает бронь без абонемента:
      None  — по настройке студии «Предоплата при записи» (мини-приложение);
      True  — покрытие обязательно всегда (Журнал: администратор записывает по
              абонементу, а разовую продажу проводит касса);
      False — не требуется никогда (веб-виджет: там платят на месте).
    Три разных ответа существовали в продукте и до этого модуля; здесь они
    названы, а не растворены по роутерам.
    """
    lesson = (await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.studio_id == studio_id)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if lesson is None or lesson.status == "cancelled" or (lesson.booking_mode != "event" and not _resource):
        return _Checked(Outcome.LESSON_UNAVAILABLE)

    studio = (await db.execute(
        select(Studio).where(Studio.id == studio_id).execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if studio is None:
        return _Checked(Outcome.LESSON_UNAVAILABLE)

    rules = await load_rules(db, studio_id)
    wall = lesson_time.local_now(studio, now)
    if actor is Actor.STAFF:
        # За стойкой окно записи не действует — действует только физика:
        # закончившееся занятие уже нельзя посетить.
        if lesson_finished(lesson, studio, now):
            return _Checked(Outcome.WINDOW_CLOSED, lesson, rules)
    else:
        if not rules.booking_active:
            return _Checked(Outcome.WINDOW_CLOSED, lesson, rules)
        lower, upper = booking_window(rules, wall)
        if not (lower <= lesson.start_time <= upper):
            return _Checked(Outcome.WINDOW_CLOSED, lesson, rules)
        if not within_widget_hours(rules, lesson.start_time):
            return _Checked(Outcome.WINDOW_CLOSED, lesson, rules)

    client = (await db.execute(
        select(Client).where(Client.id == client_id, Client.studio_id == studio_id)
        .execution_options(populate_existing=True)
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

    funding, subscription, is_trial = await resolve_funding(
        db, studio=studio, client_id=client_id, lesson=lesson, rules=rules,
        lock=lock, require_funding=require_funding)
    if funding is None:
        return _Checked(Outcome.NO_FUNDING, lesson, rules)

    facts = await catalog.lesson(db, studio_id, lesson.id, include_resource=_resource)
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
        base_price=int(lesson.price or 0),
    )
    checked = _Checked(Outcome.OK, lesson, rules, terms, spot)
    checked.subscription = subscription
    checked.is_trial = is_trial
    return checked


async def resolve_funding(db: AsyncSession, *, studio, client_id: int, lesson,
                          rules: BookingRules, lock: bool = False,
                          require_funding: Optional[bool] = None):
    """Shared funding resolver for persisted events and unsaved resource candidates.

    The candidate needs service_id/start_time/price, not a database Lesson ID.
    Does not debit subscriptions or create a reservation.
    """
    studio_id = studio.id
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
        needs = rules.prefill_on_booking if require_funding is None else require_funding
        if needs:
            # Покрытие обязательно, а его нет.
            return None, None, False
        # ЦЕНА КЛИЕНТА, А НЕ ПРАЙС. Скидка студии, персональный оффер и скидка
        # новичка — часть договора; взять с человека полную цену, когда у него
        # есть скидка, значит взять лишнее.
        payable = await client_price(db, studio_id=studio_id, client_id=client_id,
                                     base_price=lesson.price)
        if payable <= 0:
            # Скидка покрыла занятие целиком. Платить нечего — значит и
            # платёжного пути нет: ни формы, ни долга.
            funding = Funding(FundingKind.FREE, None, 0, currency)
        else:
            funding = Funding(FundingKind.PAY, None, payable, currency)

    return funding, subscription, is_trial


async def client_price(db: AsyncSession, *, studio_id: int, client_id: int,
                       base_price: int) -> int:
    """Сколько это занятие стоит ИМЕННО ЭТОМУ клиенту. Только чтение.

    ЕДИНСТВЕННЫЙ ОТВЕТ НА ВОПРОС «сколько человек согласился заплатить».
    Считает его тот же `services/pricing.resolve_price`, которым считает касса
    (`routers/checkout/router._quote`): скидка студии, персональный оффер,
    скидка новичка по рефералке — по правилу «самая выгодная, без стека».
    Второго движка цен в продукте нет и заводить его нельзя — разъехавшись,
    они дадут одну цену в предложении и другую в кассе.

    Баллы, депозит и сертификат сюда НЕ входят: это средства оплаты, которые
    человек выбирает у стойки, а не цена. У кассы они появляются флагами
    запроса; в разговоре их выбрать негде, и молча тратить чужие баллы за
    человека нельзя.

    Ничего не помечает использованным: одноразовые скидки гасит `consume_quote`
    в момент состоявшейся продажи. Предложение — ещё не продажа.
    """
    resolved = await pricing.resolve_price(db, studio_id, client_id, base_price)
    return resolved.final_price


def lesson_part(terms: Terms) -> list:
    """Часть условий, зависящая ТОЛЬКО от занятия, — в виде, пригодном для JSON.

    ОДНО ОПРЕДЕЛЕНИЕ НА ДВА ВОПРОСА, и в этом весь смысл функции:

      * «изменилось ли то, ради чего человек соглашался» — между показом и
        записью (`material_change` ниже);
      * «остаётся ли открытая оплата действительной» — между созданием
        платёжной формы и её оплатой (`services/booking_payment`).

    Вопрос один и тот же, и второго определения «условия изменились» в продукте
    быть не должно: разъехавшись, они дают оплату за 19:00 и посадку на 20:30.
    """
    return [terms.lesson_id, terms.local_start.isoformat(), terms.service_name,
            terms.trainer_name, terms.branch_name, terms.base_price]


async def lesson_part_now(db: AsyncSession, *, studio_id: int,
                          lesson_id: int) -> Optional[list]:
    """Тот же снимок занятия, пересчитанный из каталога СЕЙЧАС.

    None — занятия больше нет или оно отменено (`catalog.lessons` отменённые не
    отдаёт вовсе). Для открытой оплаты это тот же ответ, что и «условия
    изменились»: исполнить её нечем.
    """
    facts = await catalog.lesson(db, studio_id, lesson_id, include_resource=True)
    if facts is None:
        return None
    price = (await db.execute(
        select(Lesson.price).where(Lesson.id == lesson_id)
    )).scalar_one_or_none()
    return [lesson_id, facts.local_start.isoformat(), facts.display_name,
            facts.trainer_name, facts.branch_name, int(price or 0)]


def material_change(shown: Optional[Terms], current: Terms) -> bool:
    """Изменилось ли то, ради чего человек соглашался.

    Сравниваем ФАКТЫ, а не текст: время, тренера, филиал, основание оплаты и
    необходимость подтверждения. Название услуги тоже — переименование само по
    себе безобидно, но замена «Стретчинга» на «Йогу» под тем же занятием нет.
    """
    if shown is None:
        return False
    return not (lesson_part(shown) == lesson_part(current)
                and shown.approval_required == current.approval_required
                and current.funding.same_as(shown.funding))


async def create(db: AsyncSession, *, studio_id: int, client_id: int, lesson_id: int,
                 source: str, spot_number: Optional[int] = None,
                 shown: Optional[Terms] = None,
                 now: Optional[datetime] = None,
                 allow_payment: bool = False,
                 hold_for_payment: bool = False,
                 actor: Actor = Actor.CLIENT,
                 require_funding: Optional[bool] = None, _resource: bool = False) -> Result:
    """Записать клиента на занятие. ЕДИНСТВЕННЫЙ переход «брони не было → есть».

    НЕ КОММИТИТ: вызывающий закрывает транзакцию сам — вместе со своим
    состоянием (предложение агента, работа воркера). Порознь они дали бы бронь
    без отметки о том, кто её сделал.

    `shown` — условия, которые человек видел. Разошлись с текущими — отказ
    `TERMS_CHANGED`: подтверждали не это.

    HB-06: замок студии — ПЕРВЫЙ шаг, до всего остального (§6.2). Берётся и
    при strict=false (иначе включение strict могло бы разминуться с уже
    идущей командой) — `_check` ниже читает Lesson/Studio/Client заново, уже
    под замком с populate_existing, чтобы обновить identity map.
    """
    await schedule_guard.lock_studio(db, studio_id)
    checked = await _check(db, studio_id=studio_id, client_id=client_id,
                           lesson_id=lesson_id, now=now, spot_number=spot_number,
                           actor=actor, require_funding=require_funding, _resource=_resource)
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
            and not allow_payment and not hold_for_payment:
        # Платить надо, а этот путь денег не умеет ни картой, ни на месте.
        # Полусостояния не заводим: ни брони, ни платежа.
        return Result(Outcome.PAYMENT_REQUIRED, terms=terms)

    # СТАТУС — ЭТО ОБЕЩАНИЕ, и оно должно быть правдой:
    #   pending — студия ещё не одобрила. Одобрение ПЕРВЕЕ денег: брать оплату
    #             за бронь, которую могут отклонить, значит потом её возвращать;
    #   hold    — место держится, пока человек платит картой. Записью это ещё
    #             не является, и говорить «вы записаны» здесь нельзя;
    #   active  — состоялось.
    paying = (hold_for_payment and terms.funding.kind is FundingKind.PAY
              and terms.funding.price > 0)
    if terms.approval_required:
        status = "pending"
    elif paying:
        status = "hold"
    else:
        status = "active"
    reservation = Reservation(
        client_id=client_id,
        lesson_id=lesson_id,
        spot_number=checked.spot,
        status=status,
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
    if not paying:
        # Долг «оплата на месте» — альтернатива карте, а не дополнение к ней.
        # Заведи его под карточную бронь, и человек заплатит дважды.
        # Долг выставляется по ЦЕНЕ КЛИЕНТА: касса при погашении пересчитает
        # ровно её (`perform_pay` -> `_quote`), и показывать до этого прайс
        # значило бы обещать человеку не ту сумму.
        await open_debt(db, reservation, checked.lesson, amount=terms.funding.price)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        # ТОЛЬКО индекс коврика значит «место заняли». Любое другое нарушение
        # целостности — наша ошибка (несогласованный CHECK, битая ссылка), и
        # выдавать её за «мест нет» значит прятать поломку за правдоподобным
        # ответом: человек уйдёт искать другое занятие, а чинить будет нечего.
        if _SPOT_INDEX not in str(getattr(exc, "orig", exc)):
            raise
        logger.info("capacity_conflict studio_id=%s lesson_id=%s", studio_id, lesson_id)
        return Result(Outcome.SPOT_TAKEN)

    logger.info("booking_created studio_id=%s lesson_id=%s status=%s funding=%s source=%s",
                studio_id, lesson_id, reservation.status, terms.funding.kind.value, source)
    result = Result(Outcome.OK, reservation.id, reservation.status, terms, remaining)
    # HB-25: намерение уведомить — в ЭТОЙ транзакции. Откат брони уносит его
    # с собой, а успешный commit гарантирует попытку воркера даже если
    # процесс умрёт сразу после.
    await booking_notifications.record_result(db, studio_id=studio_id, result=result,
                                              lesson=checked.lesson)
    return result


async def cancel(db: AsyncSession, *, studio_id: int, reservation_id: int,
                 actor: str, reason: Optional[str] = None,
                 client_id: Optional[int] = None,
                 now: Optional[datetime] = None,
                 by: Actor = Actor.STAFF,
                 enforce_policy: bool = True) -> Result:
    """Отменить бронь. Идемпотентно: вторая отмена — тот же безопасный исход.

    МЕСТО ОСВОБОЖДАЕТСЯ ВСЕГДА. Поздняя отмена может стоить клиенту занятия
    абонемента (это решает студия своими правилами), но держать за ним коврик,
    на который он не придёт, — наказание не его, а тех, кто хотел записаться.

    ДВА РАЗНЫХ ПРАВИЛА, И ОБА СУЩЕСТВОВАЛИ ДО ЭТОГО МОДУЛЯ:
      STAFF   — пока занятие не кончилось, снять можно в любой момент;
                `pending` снимается всегда (иначе неподтверждённая заявка после
                занятия становится вечной), `attended` — никогда (визит уже
                состоялся, и возврат занятия стёр бы его из посещаемости);
      CLIENT  — окно студии «не позднее чем за N минут» (`cancellation_
                deadline_min`), считанное по НАСТОЯЩЕМУ времени, а не по
                разности стенных.

    `enforce_policy=False` — отмена не по просьбе человека, а следствие: студия
    отменила само занятие, и снимать с него людей надо независимо от окон.

    HB-06: замок студии — ПЕРВЫЙ шаг (§6.2), до блокировки Reservation ниже.
    """
    await schedule_guard.lock_studio(db, studio_id)
    reservation = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id, Lesson.studio_id == studio_id)
        .with_for_update(of=Reservation)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if reservation is None:
        return Result(Outcome.NOT_FOUND)
    if client_id is not None and reservation.client_id != client_id:
        # Чужая бронь. Снаружи неотличимо от «нет такой»: перебирать номера в
        # надежде на другой ответ нечего.
        return Result(Outcome.NOT_FOUND)
    if reservation.status == "cancelled":
        return Result(Outcome.ALREADY_CANCELLED, reservation.id, reservation.status)

    lesson = None
    if enforce_policy:
        lesson = await db.get(Lesson, reservation.lesson_id, populate_existing=True)
        studio = await db.get(Studio, studio_id)
        if by is Actor.STAFF:
            if reservation.status == "attended":
                return Result(Outcome.ATTENDED, reservation.id, reservation.status)
            if reservation.status != "pending" and lesson_finished(lesson, studio, now):
                return Result(Outcome.WINDOW_CLOSED, reservation.id, reservation.status)
        else:
            rules = await load_rules(db, studio_id)
            left = lesson_time.until(lesson, studio, now)
            deadline = timedelta(minutes=rules.cancellation_deadline_min)
            too_late = (left < deadline if left is not None
                        else lesson.start_time
                        < lesson_time.local_now(studio, now) + deadline)
            if too_late:
                return Result(Outcome.WINDOW_CLOSED, reservation.id, reservation.status)

    await refund_reservation(db, reservation)
    reservation.status = "cancelled"
    reservation.cancelled_at = datetime.utcnow()
    if reason:
        reservation.cancellation_reason = reason[:300]
    # An individual booking owns its interval. Event cancellations only free a seat.
    await db.execute(update(Lesson).where(Lesson.id == reservation.lesson_id,
        Lesson.studio_id == studio_id, Lesson.booking_mode == "resource",
        Lesson.status != "cancelled").values(status="cancelled", version=Lesson.version + 1))
    logger.info("booking_cancelled studio_id=%s reservation_id=%s actor=%s",
                studio_id, reservation_id, actor)
    result = Result(Outcome.OK, reservation.id, "cancelled")
    # Версия занятия тут не несёт смысла и намеренно не дочитывается ради неё
    # отдельным запросом: отменить бронь можно ровно один раз (выше возврат
    # ALREADY_CANCELLED), поэтому ключ уникален и без неё.
    await booking_notifications.record_result(db, studio_id=studio_id, result=result, lesson=lesson)
    return result


async def activate_paid(db: AsyncSession, *, studio_id: int,
                        reservation_id: int) -> Result:
    """Оплата подтверждена -> место, которое держалось, становится записью.

    Переход живёт ЗДЕСЬ, а не в платёжном мосте, по той же причине, по которой
    здесь живут все остальные: состояние брони меняет домен брони. Мост
    (`services/booking_payment`) отвечает за другое — доказать, что заплатили
    именно за эту бронь, именно столько и именно в этой студии.

    Идемпотентно: второй вебхук, возврат на success_url и фоновая сверка
    приходят сюда втроём, и двое из них обязаны быть безобидны.
    """
    await lock_studio(db, studio_id)
    reservation = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id, Lesson.studio_id == studio_id)
        .with_for_update(of=Reservation)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if reservation is None:
        return Result(Outcome.NOT_FOUND)
    if reservation.status == "cancelled":
        return Result(Outcome.ALREADY_CANCELLED, reservation.id, "cancelled")
    if reservation.status != "hold":
        # Уже активна (или ждёт одобрения) — повтор ничего не меняет.
        return Result(Outcome.OK, reservation.id, reservation.status)

    lesson = await db.get(Lesson, reservation.lesson_id, populate_existing=True)
    if lesson is None or lesson.status == "cancelled":
        # Занятие отменили, пока человек платил. Деньги пришли, сажать некуда:
        # решение — возврат, а не тихая активация.
        return Result(Outcome.LESSON_UNAVAILABLE, reservation.id, reservation.status)

    reservation.status = "active"
    logger.info("booking_activated_by_payment studio_id=%s reservation_id=%s",
                studio_id, reservation_id)
    # Отдельный код события: pending → hold → active НЕ меняет версию занятия,
    # и без него активация после одобрения слилась бы с самим одобрением
    # в один уникальный ключ (HB-25 п.4).
    await booking_notifications.record(db, studio_id=studio_id, reservation_id=reservation.id,
                                       lesson_version=lesson.version or 1,
                                       event_code="booking_activated")
    return Result(Outcome.OK, reservation.id, "active")


async def attend(db: AsyncSession, *, studio_id: int, reservation_id: int) -> Result:
    """Клиент пришёл. Единственный переход «бронь → визит».

    ПОЧЕМУ ЗДЕСЬ, А НЕ В РОУТЕРЕ. До этого отметку ставил напрямую роутер
    журнала, и она была единственным переходом брони без правил домена:
    `status = "attended"` выполнялся из ЛЮБОГО состояния. Два следствия, оба
    настоящие:

      * `hold` → `attended`: карточная бронь, за которую ещё не заплатили,
        становилась состоявшимся визитом. §4.2 эпика прямо запрещает это —
        «сперва деньги, потом визит»;
      * `cancelled` → `attended`: отменённая бронь воскресала визитом, минуя
        и возврат абонемента, и освобождение места.

    Идемпотентно: повторная отметка — тот же безопасный исход. Замок студии
    первым шагом, как у всех остальных переходов (§6.2).
    """
    await lock_studio(db, studio_id)
    reservation = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id, Lesson.studio_id == studio_id)
        .with_for_update(of=Reservation)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if reservation is None:
        return Result(Outcome.NOT_FOUND)
    if reservation.status == "attended":
        return Result(Outcome.OK, reservation.id, "attended")
    if reservation.status == "cancelled":
        return Result(Outcome.ALREADY_CANCELLED, reservation.id, "cancelled")
    if reservation.status == "hold":
        # Место держится под неоплаченную карту. Разрешить визит — значит
        # подарить занятие и потерять деньги: сверка потом освободит бронь,
        # а посещение уже записано.
        return Result(Outcome.PAYMENT_REQUIRED, reservation.id, reservation.status)

    reservation.status = "attended"
    logger.info("booking_attended studio_id=%s reservation_id=%s", studio_id, reservation_id)
    return Result(Outcome.OK, reservation.id, "attended")


async def approve(db: AsyncSession, *, studio_id: int, reservation_id: int,
                  actor: str, now: Optional[datetime] = None) -> Result:
    """Подтвердить ждущую бронь. Переход делает СТУДИЯ, не клиент.

    ЧТО ПЕРЕСЧИТЫВАЕТСЯ. Подтверждение приходит через минуты или часы, и за это
    время занятие могли отменить или перенести. Место и списание НЕ
    пересчитываются: они были заняты в момент запроса и держатся с тех пор —
    иначе ожидание решения студии стоило бы клиенту очереди. Пересчитывается
    то, что от него не зависит: живо ли занятие и жив ли клиент.
    """
    await lock_studio(db, studio_id)
    reservation = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id, Lesson.studio_id == studio_id)
        .with_for_update(of=Reservation)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if reservation is None:
        return Result(Outcome.NOT_FOUND)
    if reservation.status == "cancelled":
        return Result(Outcome.ALREADY_CANCELLED, reservation.id, reservation.status)
    if reservation.status != "pending":
        # Уже подтверждена (или отмечена посещённой) — повтор безопасен.
        return Result(Outcome.OK, reservation.id, reservation.status)

    lesson = await db.get(Lesson, reservation.lesson_id, populate_existing=True)
    if lesson is None or lesson.status == "cancelled":
        return Result(Outcome.LESSON_UNAVAILABLE)
    client = await db.get(Client, reservation.client_id, populate_existing=True)
    if client is None or not client.is_active:
        return Result(Outcome.CLIENT_UNAVAILABLE)

    # New quote commands retain the chosen payment path across approval.
    # A pending card booking must first become a hold, never an unpaid active visit.
    from models import BookingQuote
    snapshots = (await db.execute(select(BookingQuote.terms).where(
        BookingQuote.studio_id == studio_id, BookingQuote.reservation_id == reservation_id,
        BookingQuote.consumed_at.is_not(None)).order_by(BookingQuote.created_at))).scalars().all()
    card_pending = any(s.get("payment_method") == "card"
        and s.get("domain", {}).get("funding", {}).get("kind") == FundingKind.PAY.value
        and s.get("domain", {}).get("funding", {}).get("price", 0) > 0 for s in snapshots)
    reservation.status = "hold" if card_pending else "active"
    logger.info("booking_approved studio_id=%s reservation_id=%s actor=%s",
                studio_id, reservation_id, actor)
    result = Result(Outcome.OK, reservation.id, reservation.status)
    await booking_notifications.record_result(db, studio_id=studio_id, result=result, lesson=lesson)
    return result


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

    HB-06: замок студии — ПЕРВЫЙ шаг, до блокировки исходной Reservation
    (`create` ниже возьмёт его повторно для целевого занятия — тот же замок
    той же транзакции, второй раз он не блокирует и не бросает).
    """
    await schedule_guard.lock_studio(db, studio_id)
    source = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id, Lesson.studio_id == studio_id)
        .with_for_update(of=Reservation)
        .execution_options(populate_existing=True)
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

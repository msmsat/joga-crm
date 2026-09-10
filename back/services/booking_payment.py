"""Оплата занятия картой — мост между бронью и УЖЕ СУЩЕСТВУЮЩИМ денежным
доменом (P4).

ВТОРОГО ДЕНЕЖНОГО ЖУРНАЛА ЗДЕСЬ НЕ ПОЯВЛЯЕТСЯ. Заявка на оплату в продукте
одна — `StripeCheckout`, и она уже умеет то, ради чего её обычно переписывают:
свой идентификатор попытки ДО похода в сеть, детерминированный ключ (одна живая
форма на одну покупку), блокировку строки при проведении, сверку подключённого
аккаунта Connect ДО любой записи, усыновление сессии по `attempt_id`, фоновую
сверку, возвраты, споры и чарджбэки. Здесь добавляется ровно одно: третий вид
покупки — занятие.

    подтверждение записи (домен)
      -> место держится статусом `hold`      | одна короткая транзакция
      КОММИТ
      -> заявка StripeCheckout               | своя транзакция, без сети
      -> сессия Stripe (сеть, ВНЕ транзакции)
      -> человек платит
      -> вебхук/сверка -> АВТОРИТЕТНОЕ «оплачено»
      -> hold -> active                      (services/booking)

ЧТО ЗДЕСЬ ГЛАВНОЕ. Событие Stripe — это ТРИГГЕР, а не деньги. Решение принимает
свежее состояние объекта в правильном аккаунте (`stripe_pay.apply_paid` уже так
и делает), а перед переводом брони в `active` сверяется ещё и то, за ЧТО
заплатили: сумма, валюта, студия, аккаунт, та ли это бронь и не изменились ли
условия занятия под открытой формой.

ДВА РАЗНЫХ ВОПРОСА, КОТОРЫЕ НЕЛЬЗЯ ПУТАТЬ (§62 задания):

  * ПРАВО НАЧАТЬ ОПЛАТУ — это про личность в чате. Отозванная связь новую
    оплату завести не может;
  * СВЕРКА ПОСЛЕ ОПЛАТЫ — это про деньги. Деньги уже у студии, и «в чате больше
    не подтверждён» их не отменяет: договор был заключён подтверждённым
    человеком, и исполняется он по карточке клиента, а не по чату.

ГРАНИЦА СЕТИ ВНУТРИ МОДУЛЯ. `start` и `settle` живут в транзакции вызывающего и
сети не касаются вовсе. `pay_link` и `sweep` — наоборот: они ходят в Stripe и
вызываются ТОЛЬКО из своей отдельной транзакции. Тест `test_booking_payment`
проверяет это пофункционально, а не по модулю: иначе граница держалась бы на
внимательности.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    BookingChannelConfig, Client, Lesson, OnlineChannel, Reservation,
    StripeCheckout, Studio,
)
from services import booking
from services.booking import Terms

logger = logging.getLogger(__name__)

# Вид покупки в `StripeCheckout.payload`. Заявки без этого ключа — прежние
# (касса CRM и покупка абонемента клиентом); их путь не меняется ни на строку.
PAYLOAD_KIND = "lesson_booking"

# Отметка «эта оплата больше не исполнима на этих условиях». Лежит В ЗАЯВКЕ, а
# не в новом статусе: статусов у заявки шесть, каждый читается в пяти местах, и
# седьмой стоил бы аудита всех. Отметка durable — переживает перезапуск, и
# именно она означает «мы ещё не знаем, двинулись ли деньги» (§28 задания).
VOID_KEY = "void"

# Сколько место держится под неоплаченную бронь. Не «сколько живёт сессия
# Stripe»: сессия своя, и её состояние авторитетнее нашего таймера. Это предел,
# после которого мы ИДЁМ СПРАШИВАТЬ, а не предел, после которого освобождаем.
HOLD_MINUTES = 20

# После этого срока неразобранная оплата перестаёт быть техническим шумом и
# становится поводом позвать человека (§35). Молча держать место сутками нельзя
# ни ради клиента, ни ради студии.
ESCALATE_AFTER = timedelta(hours=6)


class Settlement(str, Enum):
    """Чем кончилась попытка провести оплаченную бронь."""
    ACTIVATED = "ACTIVATED"
    # Уже проведена — повтор вебхука, возврат на success_url и сверка приходят
    # сюда втроём, и двое из них обязаны быть безобидны.
    ALREADY = "ALREADY"
    # Заплатили не за то: сумма, валюта, студия, аккаунт или бронь не сходятся.
    MISMATCH = "MISMATCH"
    # Брони больше нет, она отменена, занятие снято или условия изменились:
    # деньги пришли, сажать некуда.
    UNFULFILLABLE = "UNFULFILLABLE"
    # ВТОРАЯ оплата той же брони. Одна бронь не может тихо впитать два платежа:
    # это возврат и тревога, а не «уже активна».
    DUPLICATE = "DUPLICATE"


class PayOutcome(str, Enum):
    """Чем кончилась попытка выдать человеку ссылку на оплату."""
    OPEN = "OPEN"                  # форма готова, ссылка есть
    PENDING = "PENDING"            # оплата уже идёт, ответа ждём
    UNAVAILABLE = "UNAVAILABLE"    # Stripe не подключён либо отказал
    STALE = "STALE"                # бронь уже не держится: платить не за что


@dataclass(frozen=True)
class Started:
    checkout_id: int
    attempt_id: str
    needs_session: bool
    amount: int
    currency: str


@dataclass(frozen=True)
class Payable:
    outcome: PayOutcome
    url: Optional[str] = None
    checkout_id: Optional[int] = None
    amount: int = 0
    currency: str = ""


def payload_for(*, reservation_id: int, client_id: int, lesson_id: int,
                amount: int, currency: str, terms: Optional[list] = None,
                thread_id: Optional[int] = None,
                channel: Optional[str] = None) -> dict:
    """Экономическая правда заявки — то, что сверяется при проведении.

    Здесь нет ни текста, ни цены «как показали»: только то, что сервер сам
    посчитал в момент подтверждения условий. `terms` — снимок ЗАНЯТИЯ
    (`booking.lesson_part`), по которому видно, что занятие переехало под уже
    открытой формой оплаты.
    """
    return {
        "kind": PAYLOAD_KIND,
        "reservation_id": reservation_id,
        "client_id": client_id,
        "lesson_id": lesson_id,
        "amount": amount,
        "currency": currency,
        "terms": terms,
        "thread_id": thread_id,
        "channel": channel,
    }


def is_booking(checkout: StripeCheckout) -> bool:
    return (checkout.payload or {}).get("kind") == PAYLOAD_KIND


def voided(checkout: StripeCheckout) -> Optional[dict]:
    """Отметка «оплата недействительна» или None."""
    return (checkout.payload or {}).get(VOID_KEY)


def _mark_void(checkout: StripeCheckout, reason: str) -> None:
    """Пометить заявку недействительной. НЕ закрывает её и не трогает деньги.

    payload переприсваивается целиком: правка вложенного словаря на месте не
    помечает JSON-колонку изменённой, и SQLAlchemy молча не сохранит её (тот же
    капкан, что в `stripe_pay._record_consumption`).
    """
    if voided(checkout):
        return
    checkout.payload = {**(checkout.payload or {}),
                        VOID_KEY: {"reason": reason,
                                   "at": datetime.utcnow().isoformat()}}
    logger.warning("payment_voided checkout_id=%s reason=%s", checkout.id, reason)


# ─── Заведение заявки: транзакция вызывающего, СЕТИ НЕТ ──────────────────────

async def start(db: AsyncSession, *, studio_id: int, reservation_id: int,
                client_id: int, lesson_id: int, terms: Terms,
                account_id: str, application_fee: int = 0,
                lesson_terms: Optional[list] = None,
                thread_id: Optional[int] = None,
                channel: Optional[str] = None) -> Started:
    """Завести заявку на оплату занятия. СЕТИ ЗДЕСЬ НЕТ.

    Порядок «сначала у себя, потом в Stripe» — тот же, что у остальных заявок
    продукта, и по той же причине: сессия, созданная раньше локальной строки,
    при падении процесса остаётся живой платёжной формой без заявки в CRM.

    Одна живая форма на одну бронь держится детерминированным ключом попытки
    (`stripe_pay.business_attempt_id` считает его из студии, тела и суммы) —
    повтор подтверждения находит ту же заявку, а не заводит вторую. Изменились
    условия — меняется и ключ: переиспользовать чужой ключ с другими
    параметрами Stripe запрещает прямо (идемпотентность сверяет параметры).
    """
    from routers.checkout.stripe_pay import reserve_checkout
    from services.schedule_guard import lock_studio

    await lock_studio(db, studio_id)

    payload = payload_for(reservation_id=reservation_id, client_id=client_id,
                          lesson_id=lesson_id, amount=terms.funding.price,
                          currency=terms.funding.currency,
                          terms=lesson_terms or booking.lesson_part(terms),
                          thread_id=thread_id, channel=channel)
    checkout, needs_session = await reserve_checkout(
        db, studio_id=studio_id, user_id=None, account_id=account_id,
        payload=payload, amount=terms.funding.price,
        application_fee=application_fee,
    )
    logger.info("checkout_created studio_id=%s reservation_id=%s checkout_id=%s new=%s",
                studio_id, reservation_id, checkout.id, needs_session)
    return Started(checkout.id, checkout.attempt_id, needs_session,
                   terms.funding.price, terms.funding.currency)


# ─── Проведение: транзакция вызывающего, СЕТИ НЕТ ───────────────────────────

async def settle(db: AsyncSession, checkout: StripeCheckout) -> Settlement:
    """Оплата подтверждена платёжной системой -> бронь становится записью.

    ЧТО СВЕРЯЕТСЯ ПЕРЕД ПЕРЕХОДОМ (и почему каждое):

      сумма и валюта   — заплатить 1 крону за занятие за 500 не значит купить
                         его; событие «оплачено» об этом не говорит ничего;
      студия           — заявка и бронь обязаны принадлежать одной студии,
                         иначе событие чужого аккаунта закрывает нашу бронь;
      занятие          — бронь должна быть той самой, за которую платили;
      УСЛОВИЯ ЗАНЯТИЯ  — занятие могли перенести, пока форма была открыта.
                         Человек платил за 19:00, и посадить его на 20:30
                         молча нельзя (§24);
      клиент           — карточку могли отключить; исполнять договор с
                         несуществующим клиентом нечем;
      состояние брони  — отменённую не трогаем, а активную БЕЗ нашей оплаты
                         считаем вторым платежом, а не безобидным повтором.

    Аккаунт Connect сверяет вызывающий (`stripe_pay.apply_paid`) ещё до того,
    как что-либо записано, — здесь он уже сошёлся.

    Не коммитит: перевод брони и пометка заявки обязаны лечь одной транзакцией.
    """
    payload = checkout.payload or {}
    reservation_id = payload.get("reservation_id")
    if not reservation_id:
        return Settlement.MISMATCH

    reservation = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id,
               Lesson.studio_id == checkout.studio_id)
        .with_for_update(of=Reservation)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if reservation is None:
        logger.warning("payment_mismatch studio_id=%s checkout_id=%s reason=no_reservation",
                       checkout.studio_id, checkout.id)
        return Settlement.UNFULFILLABLE
    if reservation.lesson_id != payload.get("lesson_id"):
        logger.warning("payment_mismatch studio_id=%s checkout_id=%s reason=lesson",
                       checkout.studio_id, checkout.id)
        return Settlement.MISMATCH

    studio = await db.get(Studio, checkout.studio_id)
    expected_currency = (studio.currency or "RUB") if studio else "RUB"
    if payload.get("currency") != expected_currency:
        logger.warning("payment_mismatch studio_id=%s checkout_id=%s reason=currency",
                       checkout.studio_id, checkout.id)
        return Settlement.MISMATCH
    if int(payload.get("amount") or -1) != int(checkout.amount):
        logger.warning("payment_mismatch studio_id=%s checkout_id=%s reason=amount",
                       checkout.studio_id, checkout.id)
        return Settlement.MISMATCH

    # Оплату уже признали недействительной (занятие перенесли, отменили, связь
    # отозвали) — деньги пришли за то, чего больше нет.
    if voided(checkout):
        logger.warning("payment_unfulfillable studio_id=%s checkout_id=%s reason=void",
                       checkout.studio_id, checkout.id)
        return Settlement.UNFULFILLABLE

    # Условия занятия под открытой формой. Одно определение с `material_change`
    # (`booking.lesson_part`) — второго «условия изменились» в продукте нет.
    shown = payload.get("terms")
    if shown is not None:
        current = await booking.lesson_part_now(
            db, studio_id=checkout.studio_id, lesson_id=reservation.lesson_id)
        if current is None or list(shown) != current:
            logger.warning(
                "payment_unfulfillable studio_id=%s checkout_id=%s reason=terms_changed",
                checkout.studio_id, checkout.id)
            return Settlement.UNFULFILLABLE

    # Карточку клиента отключили, пока человек платил. Деньги есть, сажать
    # некого: это возврат, а не тихая запись (§32).
    client = await db.get(Client, reservation.client_id)
    if client is None or not client.is_active:
        logger.warning("payment_unfulfillable studio_id=%s checkout_id=%s reason=client",
                       checkout.studio_id, checkout.id)
        return Settlement.UNFULFILLABLE

    # «Провели сейчас» и «было проведено раньше» различаются ДО перехода:
    # после него обе брони выглядят одинаково активными, а повтор вебхука
    # обязан быть отличим от настоящей оплаты — по нему считают выручку.
    was_holding = reservation.status == "hold"
    # ПЕРЕХОД ДЕЛАЕТ ДОМЕН БРОНИ. Здесь доказано, что заплатили именно за эту
    # бронь; менять её состояние — не наше дело, и второй писатель статуса
    # ровно так и заводится.
    moved = await booking.activate_paid(db, studio_id=checkout.studio_id,
                                        reservation_id=reservation.id)
    if moved.outcome is booking.Outcome.LESSON_UNAVAILABLE:
        logger.warning("payment_unfulfillable studio_id=%s checkout_id=%s reason=lesson_cancelled",
                       checkout.studio_id, checkout.id)
        return Settlement.UNFULFILLABLE
    if moved.outcome is booking.Outcome.ALREADY_CANCELLED:
        logger.warning("payment_unfulfillable studio_id=%s checkout_id=%s reason=cancelled",
                       checkout.studio_id, checkout.id)
        return Settlement.UNFULFILLABLE
    if moved.outcome is not booking.Outcome.OK:
        return Settlement.UNFULFILLABLE
    if not was_holding:
        # Бронь уже была активной. Либо это повтор ЭТОЙ ЖЕ заявки (безобидно),
        # либо за одну бронь заплатили дважды — и второй платёж обязан быть
        # виден, а не раствориться в «уже активна».
        if await _paid_sibling(db, checkout, reservation_id):
            logger.error(
                "payment_duplicate studio_id=%s reservation_id=%s checkout_id=%s — "
                "за одну бронь заплачено дважды, нужен возврат",
                checkout.studio_id, reservation_id, checkout.id)
            return Settlement.DUPLICATE
        return Settlement.ALREADY
    await _tell_the_client(db, checkout, reservation)
    logger.info("payment_settled studio_id=%s reservation_id=%s checkout_id=%s",
                checkout.studio_id, reservation.id, checkout.id)
    return Settlement.ACTIVATED


async def _tell_the_client(db: AsyncSession, checkout: StripeCheckout,
                           reservation: Reservation) -> None:
    """«Готово, вы записаны» в тот же разговор — ПОСЛЕ проведения оплаты.

    Человек мог закрыть страницу Stripe и не вернуться: возврат на success_url
    не является ни доказательством оплаты, ни единственным способом узнать о
    ней. Поэтому сообщение ставит проведение — то самое место, где оплата
    признана авторитетной, кто бы о ней ни сообщил первым.

    Ключ дедупликации — БРОНЬ, а не событие: вебхук, возврат на страницу и
    фоновая сверка приходят втроём, и человек обязан получить одно сообщение.

    Не коммитит: сообщение и перевод брони обязаны лечь одной транзакцией —
    иначе бывает «записан, но не сказали» или «сказали, но не записан».
    """
    from services import ai_language, catalog, outbound, response_plan, response_render

    payload = checkout.payload or {}
    thread_id = payload.get("thread_id")
    if not thread_id:
        return                       # оплата не из разговора (касса, витрина)

    shown = payload.get("terms") or []
    # Длина не фиксируется числом: снимок занятия (`booking.lesson_part`) может
    # прирасти полем, и жёсткая пятёрка молча превратила бы подтверждение
    # человеку в его отсутствие. Нужны первые пять — они и берутся.
    if len(shown) < 5:
        return                       # снимка нет — сказать фактами нечего
    lesson_id, local_start, service_name, trainer_name, branch_name = shown[:5]
    terms = booking.Terms(
        lesson_id=int(lesson_id), local_start=datetime.fromisoformat(local_start),
        service_name=service_name, trainer_name=trainer_name, branch_name=branch_name,
        funding=booking.Funding(booking.FundingKind.PAY, None,
                                int(payload.get("amount") or 0),
                                payload.get("currency") or ""),
        approval_required=False,
        base_price=int(shown[5]) if len(shown) > 5 else 0)
    ref = await catalog.studio(db, checkout.studio_id)
    lang = ai_language.resolve([], studio_language=ref.language if ref else None).code
    plan = response_plan.build_booking(booking.Result(
        booking.Outcome.OK, reservation.id, "active", terms))
    await outbound.enqueue(
        db, studio_id=checkout.studio_id, thread_id=int(thread_id),
        dedup_key=f"booking-paid:{reservation.id}",
        payload=response_render.render(plan, lang=lang,
                                       channel=payload.get("channel") or "telegram"),
        origin="payment")


# Сколько заявок студии просматриваем в поиске «второго платежа за ту же бронь».
# ponytail: скан по студии за окно, потому что `payload` — обычный JSON и по
# ключу внутри него индекса нет. Заявки живут коротко; станет узко — колонка
# reservation_id и индекс.
_SIBLING_WINDOW = timedelta(days=3)
_SIBLING_LIMIT = 500


async def _paid_sibling(db: AsyncSession, checkout: StripeCheckout,
                        reservation_id: int) -> Optional[int]:
    """Другая ПРОВЕДЁННАЯ заявка на ту же бронь. None — такой нет."""
    rows = (await db.execute(
        select(StripeCheckout).where(
            StripeCheckout.studio_id == checkout.studio_id,
            StripeCheckout.status.in_(("paid", "refunded", "disputed", "chargeback")),
            StripeCheckout.id != checkout.id,
            StripeCheckout.created_at > datetime.utcnow() - _SIBLING_WINDOW,
        ).order_by(StripeCheckout.id.desc()).limit(_SIBLING_LIMIT)
    )).scalars().all()
    for row in rows:
        if is_booking(row) and (row.payload or {}).get("reservation_id") == reservation_id:
            return row.id
    return None


async def record_income(db: AsyncSession, checkout: StripeCheckout) -> None:
    """Оплаченное занятие -> доход в Финансах. ЧЕРЕЗ ОБЩИЙ ДВИЖОК, не мимо.

    Продажа занятия за наличные у стойки уже проводится `perform_pay`: доход в
    Финансы, строка в историю платежей клиента, баллы, покупка в лояльность,
    запись в ленту событий, уведомление об оплате. Карточная оплата того же
    занятия обязана дать РОВНО ТО ЖЕ, иначе в отчётах студии появляется
    выручка, которой не видно, а у клиента — визит, за который он как будто не
    платил. Своей проводки здесь нет и быть не должно: второй денежный путь
    разойдётся с первым на первой же правке.

    `expected_total` — сумма, которую Stripe уже списал. `perform_pay` считает
    цену заново и отказывается проводить, если она разошлась: в Финансы обязано
    лечь то, что реально забрали у человека, а не то, что стоило бы сегодня.
    Отказ уводит заявку в существующую ветку «списано, но не проведено» — с
    тревогой и возвратом, а не с тихой записью не той суммы.

    ЭТА ФУНКЦИЯ НЕ ИДЕМПОТЕНТНА САМА ПО СЕБЕ, и ей это не нужно. Единственный
    вызывающий — `stripe_pay.apply_paid`, который переводит заявку из `pending`
    под блокировкой строки: до сюда доходит ровно одна попытка на одну оплату,
    сколько бы вебхуков, возвратов на страницу и проходов сверки ни пришло. Тот
    же гейт держит проведение абонементов.

    Коммитит (внутри `perform_pay`) — вместе с переводом брони и пометкой
    заявки, начатыми вызывающим. Одной транзакцией: падение между ними иначе
    оставило бы запись без дохода.
    """
    from routers.checkout.router import perform_pay
    from schemas.checkout import CheckoutPayRequest

    payload = checkout.payload or {}
    await perform_pay(
        db, checkout.studio_id,
        # Не кассир: продажу провела оплата клиента, а не сотрудник. Подпись в
        # ленте останется пустой — так же, как у покупки из мини-приложения.
        checkout.user_id,
        CheckoutPayRequest(
            client_id=payload["client_id"],
            product_id=payload["lesson_id"],
            product_type="lesson",
            # Счёт не выбран: возьмётся дефолтный онлайн-счёт студии — та же
            # ветка, что у кассира, не выбравшего счёт.
            account_id=None,
            payment_method="card",
        ),
        method="stripe",
        expected_total=int(checkout.amount),
    )


async def release_refunded(db: AsyncSession, checkout: StripeCheckout) -> None:
    """Деньги вернулись клиенту -> занятие за ним больше не числится.

    Зовётся из общего пути возвратов и споров (`stripe_pay._revert_sale`), где
    решение «полный возврат» уже принято по объекту Stripe. Здесь только
    следствие для брони, и снимает её ДОМЕН — платёжный мост состояние брони
    не пишет.

    Идемпотентно: повтор события (возврат, потом проигранный спор поверх него)
    находит бронь уже снятой и ничего не меняет.

    Не коммитит: откат обязан лечь одной транзакцией со сменой статуса заявки.
    """
    reservation_id = (checkout.payload or {}).get("reservation_id")
    if not reservation_id:
        return
    result = await booking.cancel(
        db, studio_id=checkout.studio_id, reservation_id=reservation_id,
        actor="refund", reason="возврат оплаты", enforce_policy=False)
    logger.warning("booking_refunded studio_id=%s reservation_id=%s outcome=%s",
                   checkout.studio_id, reservation_id, result.outcome.value)


# ─── Что перестало быть исполнимым: чтение, СЕТИ НЕТ ───────────────────────

async def unfulfillable_reason(db: AsyncSession, checkout: StripeCheckout, *,
                               now: Optional[datetime] = None) -> Optional[str]:
    """Почему открытую оплату больше нельзя оставить как есть. None — можно.

    РЕШЕНИЕ ЖИВЁТ ЗДЕСЬ, А НЕ В МЕСТАХ, ГДЕ МЕНЯЮТ ЗАНЯТИЕ. Это осознанный
    выбор, и вот его причина. Занятие двигают из Журнала, из кабинета тренера,
    перетаскиванием мышью, сменой услуги, правкой цены, отменой и синхронизацией
    календаря — и каждому такому месту пришлось бы помнить про открытые оплаты.
    Забытое место означает «человек заплатил за 19:00, а сядет на 20:30», и
    забыть его легко: связь между правкой расписания и чужой платёжной формой
    неочевидна никому.

    Поэтому вопрос задаётся с другой стороны: не «что изменилось», а «можно ли
    ЕЩЁ исполнить эту оплату». Ответ считается из состояния, а не из события,
    и потому не зависит от того, вспомнил ли кто-то позвать эту функцию.

    Сравниваются те же условия, по которым человек соглашался
    (`booking.lesson_part`) — одно определение на запись и на оплату.

    Сети здесь нет вовсе: это чтение, и его ответ от Stripe не зависит.
    """
    payload = checkout.payload or {}
    reservation_id = payload.get("reservation_id")
    if not reservation_id:
        return "no_reservation"
    reservation = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id,
               Lesson.studio_id == checkout.studio_id)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if reservation is None or reservation.status == "cancelled":
        return "booking_gone"
    if reservation.status != "hold":
        # Бронь перестала ждать оплату, но не через неё: администратор отметил
        # приход прямо из Журнала, где `hold` выглядит обычной записью. Место
        # человек уже получил — и может заплатить за него по всё ещё открытой
        # форме. Закрываем форму; пришедшие деньги уйдут в разбор с возвратом.
        #
        # Ложного срабатывания на НАШЕЙ оплате здесь быть не может: проведение
        # снимает заявку с `pending` той же транзакцией, что переводит бронь, и
        # в этот проход она уже не попадает (`open_attempts`).
        return "no_longer_waiting"

    shown = payload.get("terms")
    if shown is not None:
        current = await booking.lesson_part_now(
            db, studio_id=checkout.studio_id, lesson_id=reservation.lesson_id)
        if current is None:
            return "lesson_gone"
        if list(shown) != current:
            return "terms_changed"
    mark = voided(checkout)
    if mark:
        return mark.get("reason") or "void"

    moment = now or datetime.utcnow()
    created = reservation.created_at or moment
    if created < moment - timedelta(minutes=HOLD_MINUTES):
        # Место держится слишком долго. Это НЕ решение освободить его — это
        # повод спросить у платёжной системы.
        return "stale"
    return None


# ─── Поиск заявок ────────────────────────────────────────────────────────────

async def checkout_for(db: AsyncSession, *, studio_id: int, reservation_id: int,
                       statuses: tuple = ("pending",)) -> Optional[StripeCheckout]:
    """Заявка на оплату этой брони. None — платить нечем.

    По умолчанию среди `pending`: закрытая заявка (оплачена, отменена, ушла в
    разбор) к живой оплате отношения уже не имеет. Разбору (`sweep`) нужны и
    закрытые — он спрашивает «а была ли вообще оплата».

    Заявку по брони ищем в Python: `payload` хранится обычным JSON, и выражение
    по ключу внутри него было бы вторым способом связать их — первый,
    `payload["reservation_id"]`, уже есть и читается кодом.
    """
    rows = (await db.execute(
        select(StripeCheckout).where(
            StripeCheckout.studio_id == studio_id,
            StripeCheckout.status.in_(statuses),
        ).order_by(StripeCheckout.id.desc()).limit(_SIBLING_LIMIT)
    )).scalars().all()
    for row in rows:
        if is_booking(row) and (row.payload or {}).get("reservation_id") == reservation_id:
            return row
    return None


async def stale_holds(db: AsyncSession, *, now: Optional[datetime] = None,
                      limit: int = 100) -> list[tuple[int, int]]:
    """Брони, которые держат место слишком долго. `(бронь, студия)`.

    ЭТО НЕ РЕШЕНИЕ ОСВОБОДИТЬ МЕСТО. Местный таймер не доказывает, что человек
    не заплатил: он доказывает только, что пора СПРОСИТЬ у платёжной системы.
    Ответ даёт разбор (`sweep`), который ходит в Stripe за текущим состоянием
    сессии; до его ответа место остаётся занятым. Освободить его под возможную
    оплату значит получить деньги за бронь, которой уже нет.
    """
    moment = now or datetime.utcnow()
    edge = moment - timedelta(minutes=HOLD_MINUTES)
    rows = (await db.execute(
        select(Reservation.id, Lesson.studio_id)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.status == "hold", Reservation.created_at < edge)
        .order_by(Reservation.id)
        .limit(limit)
    )).all()
    return [(row[0], row[1]) for row in rows]


async def open_attempts(db: AsyncSession, *,
                        limit: int = 200) -> list[StripeCheckout]:
    """Незакрытые заявки на оплату занятий — материал для разбора."""
    rows = (await db.execute(
        select(StripeCheckout).where(StripeCheckout.status == "pending")
        .order_by(StripeCheckout.id).limit(_SIBLING_LIMIT)
    )).scalars().all()
    return [row for row in rows if is_booking(row)][:limit]


# ─── Ссылка на оплату: СВОЯ транзакция, СЕТЬ ЕСТЬ ───────────────────────────

async def account_for(db: AsyncSession, studio_id: int) -> Optional[str]:
    """acct_… студии или None. Ошибку НЕ поднимаем: «студия не подключила
    оплату» — это законный ответ человеку, а не сбой."""
    channel = (await db.execute(
        select(OnlineChannel).where(
            OnlineChannel.studio_id == studio_id,
            OnlineChannel.channel_type == "stripe",
        )
    )).scalar_one_or_none()
    if channel is None or not channel.is_active or not channel.account_id:
        return None
    return channel.account_id


async def return_base(db: AsyncSession, studio_id: int, channel: str) -> Optional[str]:
    """Куда Stripe вернёт человека после оплаты. Собирает СЕРВЕР.

    Ни одного значения снаружи: адрес, куда уедет клиент со страницы Stripe, —
    это открытый редирект, если его подсказывает кто угодно кроме нас.

    Не переиспользуем `miniapp_users._checkout_return_base`: та отвечает на
    другой вопрос — «с какого origin пришёл браузер», потому что токен клиента
    лежит в localStorage конкретного origin. У разговора в мессенджере origin'а
    нет вовсе, и возвращать человека надо туда, откуда он пришёл, — в чат.
    """
    import os

    telegram = (await db.execute(
        select(BookingChannelConfig).where(
            BookingChannelConfig.studio_id == studio_id,
            BookingChannelConfig.channel_type == "telegram",
        )
    )).scalar_one_or_none()
    bot = (telegram.config or {}).get("bot_username") if telegram is not None else None
    if channel == "telegram" and bot:
        return f"https://t.me/{bot}?startapp="

    from services.studio_link import public_ref

    web = (os.getenv("MINIAPP_URL") or "").rstrip("/")
    if web:
        return f"{web}/s/{await public_ref(db, studio_id)}?pay="
    return f"https://t.me/{bot}?startapp=" if bot else None


async def pay_link(db: AsyncSession, *, studio_id: int, reservation_id: int,
                   client_id: int, channel: str = "telegram",
                   thread_id: Optional[int] = None) -> Payable:
    """Ссылка на оплату брони. ЕДИНСТВЕННАЯ точка, где заводится форма оплаты.

    Ни агент, ни роутер, ни обработчик нажатия сессию Stripe не создают: иначе
    «одна живая форма на одну бронь» держалась бы на том, что все три места
    помнят про детерминированный ключ.

    ПРАВО НАЧАТЬ ОПЛАТУ ПЕРЕЧИТЫВАЕТСЯ ИЗ БАЗЫ (§61): бронь та, клиент тот,
    место ещё держится, занятие живо. Состоянию разговора здесь не верят — оно
    старше решения на целый ход.

    Порядок: локальная заявка (коммит) -> сеть -> запись id сессии (коммит).
    Сеть между коммитами, а не внутри транзакции.
    """
    from services import stripe_connect
    from routers.checkout.stripe_pay import ATTEMPT_KEY
    from services.schedule_guard import lock_studio

    await lock_studio(db, studio_id)
    reservation = (await db.execute(
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.id == reservation_id, Lesson.studio_id == studio_id)
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if (reservation is None or reservation.status != "hold"
            or reservation.client_id != client_id):
        return Payable(PayOutcome.STALE)

    lesson = await db.get(Lesson, reservation.lesson_id, populate_existing=True)
    studio = await db.get(Studio, studio_id)
    client = await db.get(Client, client_id, populate_existing=True)
    if (lesson is None or lesson.status == "cancelled" or studio is None
            or client is None or not client.is_active):
        return Payable(PayOutcome.STALE)

    currency = studio.currency or "RUB"
    # ЦЕНА КЛИЕНТА, ОДНИМ ИСТОЧНИКОМ С ПРЕДЛОЖЕНИЕМ. Прайс занятия здесь не
    # годится: у человека может быть скидка, и взять с него полную цену значит
    # взять лишнее. Считает `booking.client_price` — тот же расчёт, что у кассы.
    amount = await booking.client_price(
        db, studio_id=studio_id, client_id=client_id, base_price=int(lesson.price or 0))
    if amount <= 0:
        return Payable(PayOutcome.STALE)

    account_id = await account_for(db, studio_id)
    if not account_id or not stripe_connect.configured():
        return Payable(PayOutcome.UNAVAILABLE)
    base = await return_base(db, studio_id, channel)
    if not base:
        return Payable(PayOutcome.UNAVAILABLE)

    open_now = await checkout_for(db, studio_id=studio_id, reservation_id=reservation_id)
    if open_now is not None and voided(open_now):
        # Оплату уже признали неисполнимой (занятие перенесли, сняли, место
        # отдали). Закрывать форму — операция со своим ответом от Stripe: этим
        # займётся разбор, а второй формы рядом быть не должно.
        return Payable(PayOutcome.PENDING, checkout_id=open_now.id,
                       amount=int(open_now.amount), currency=currency)

    from services import platform_fee

    amount_minor = stripe_connect.to_minor_units(amount, currency)
    fee_minor = await platform_fee.fee_for_studio(db, studio_id, amount_minor)
    terms = booking.Terms(
        lesson_id=lesson.id, local_start=lesson.start_time, service_name=lesson.name,
        trainer_name=lesson.teacher_name or "", branch_name=None,
        funding=booking.Funding(booking.FundingKind.PAY, None, amount, currency),
        approval_required=False, base_price=int(lesson.price or 0))
    snapshot = await booking.lesson_part_now(db, studio_id=studio_id, lesson_id=lesson.id)
    # ЧИТАЕМ ПОЛЯ ДО `start`. Внутри него живёт `reserve_checkout`, а тот на
    # столкновении ключа попытки делает `rollback` — и все ORM-объекты этой
    # сессии становятся просроченными. Обращение к `lesson.name` после отката
    # ушло бы за SELECT'ом, а синхронный доступ к атрибуту в async-сессии так
    # не умеет: MissingGreenlet вместо ссылки на оплату.
    lesson_id, description, email = lesson.id, lesson.name, client.email

    if open_now is not None:
        # ЖИВАЯ ЗАЯВКА ПО ЭТОЙ БРОНИ УЖЕ ЕСТЬ — переиспользуем её, а не заводим
        # новую. Полагаться здесь на детерминированный ключ попытки НЕЛЬЗЯ: он
        # считается с окном времени (`stripe_pay.ATTEMPT_WINDOW`, 15 минут), а
        # место держится дольше (`HOLD_MINUTES`, 20). Повтор на шестнадцатой
        # минуте попал бы в СЛЕДУЮЩЕЕ окно, получил бы другой ключ и завёл
        # вторую платёжную форму на ту же бронь — то есть второе списание.
        #
        # Окно защищает от двойного клика по РАЗНЫМ покупкам; «одна форма на
        # одну бронь» — свойство брони, и держать его обязана бронь.
        #
        # СУММА БЕРЁТСЯ ИЗ ЗАЯВКИ, А НЕ ПЕРЕСЧИТЫВАЕТСЯ. Договор уже заключён:
        # человек согласился на конкретную сумму, и она у Stripe. Смена скидки
        # после этого его не переписывает — ни в большую сторону, ни в меньшую
        # (§49 задания). Правку САМОГО ЗАНЯТИЯ ловит разбор, там своя дорога.
        checkout = open_now
        amount = int(checkout.amount)
        attempt_id, needs_session = checkout.attempt_id, checkout.session_id is None
    else:
        started = await start(
            db, studio_id=studio_id, reservation_id=reservation_id,
            client_id=client_id, lesson_id=lesson_id, terms=terms,
            account_id=account_id, application_fee=fee_minor,
            lesson_terms=snapshot, thread_id=thread_id, channel=channel)
        # `start` -> `reserve_checkout` уже закоммитил заявку: она обязана
        # существовать ДО того, как у Stripe появится форма.
        checkout = await db.get(StripeCheckout, started.checkout_id)
        attempt_id, needs_session = started.attempt_id, started.needs_session
    # id заявки читаем ДО сети: обработчик сбоя откатывает транзакцию, а после
    # отката обращение к атрибуту ORM-объекта уходит за SELECT'ом — в
    # async-сессии это MissingGreenlet вместо честного ответа.
    checkout_id = checkout.id

    try:
        if needs_session:
            session_id, url = await stripe_connect.create_hosted_checkout_session(
                account_id=account_id,
                amount_minor=amount_minor,
                currency=currency,
                description=description,
                metadata={
                    "studio_id": str(studio_id),
                    "client_id": str(client_id),
                    "reservation_id": str(reservation_id),
                    ATTEMPT_KEY: attempt_id,
                },
                success_url=f"{base}paysuccess",
                cancel_url=f"{base}paycancel",
                application_fee_minor=fee_minor,
                receipt_email=email,
                client_reference_id=attempt_id,
                # Одна попытка — одна сессия. Ретрай сети поверх уже принятого
                # Stripe запроса вернёт ту же форму, а не заведёт вторую.
                idempotency_key=f"cs:{attempt_id}",
            )
            checkout.session_id = session_id
            await db.commit()
        else:
            session = await stripe_connect.fetch_session(checkout.session_id, account_id)
            if getattr(session, "status", None) != "open":
                # Оплата по этой попытке уже идёт: форма закрыта, а проведение
                # ещё не дошло. Второй формы быть не должно.
                return Payable(PayOutcome.PENDING, checkout_id=checkout_id,
                               amount=amount, currency=currency)
            url = session.url
    except Exception:
        # Заявку НЕ отменяем: Stripe мог принять запрос и создать сессию, а
        # потеряться могла наша сторона ответа. Оставленную в pending подберёт
        # сверка по `client_reference_id`.
        await db.rollback()
        logger.exception("checkout_session_failed studio_id=%s reservation_id=%s",
                         studio_id, reservation_id)
        return Payable(PayOutcome.UNAVAILABLE, checkout_id=checkout_id,
                       amount=amount, currency=currency)

    if not url:
        # Сессия есть, ссылки нет (форма уже неактивна) — платить по ней нечем.
        return Payable(PayOutcome.PENDING, checkout_id=checkout_id,
                       amount=amount, currency=currency)
    logger.info("payment_link_issued studio_id=%s reservation_id=%s checkout_id=%s",
                studio_id, reservation_id, checkout_id)
    return Payable(PayOutcome.OPEN, url=url, checkout_id=checkout_id,
                   amount=amount, currency=currency)


# ─── Разбор: СВОЯ транзакция, СЕТЬ ЕСТЬ ─────────────────────────────────────

async def sweep(db: AsyncSession, *, now: Optional[datetime] = None,
                limit: int = 50) -> dict:
    """Разобрать оплаты, которые больше нельзя оставить как есть.

    ПРОСРОЧКА — ОПЕРАЦИЯ, А НЕ ФАКТ. Наш таймер не отменяет форму у Stripe;
    отменить её может только Stripe (`POST /checkout/sessions/:id/expire`, и
    только пока форма `open`). Поэтому здесь ровно три исхода на заявку:

      освободили   — Stripe подтвердил, что денег не было и уже не будет;
      провели      — деньги нашлись, бронь стала записью (общий `apply_paid`);
      разбираемся  — ответа нет либо он неоднозначен. МЕСТО ОСТАЁТСЯ ЗАНЯТЫМ:
                     освободить его под возможную оплату значит получить деньги
                     за бронь, которой уже нет.

    Проход идёт ПО ЗАЯВКАМ, а не по броням: заявка — это то, где могут быть
    деньги, и именно её нельзя оставить неразобранной. Бронь может быть уже
    снята, а форма всё ещё открыта — этот случай проходом по броням не виден
    вовсе.

    Работает НЕЗАВИСИМО ОТ ФЛАГА `AGENT_PAYMENTS`: флаг решает, заводить ли
    НОВЫЕ оплаты. Уже начатые обязаны быть доведены до конца — иначе
    выключение раскатки бросает чужие деньги.
    """
    counts = {"released": 0, "settled": 0, "reconciling": 0, "unfulfillable": 0}
    handled = 0
    for checkout in await open_attempts(db):
        if handled >= limit:
            break
        reason = await unfulfillable_reason(db, checkout, now=now)
        if reason is None:
            continue
        handled += 1
        try:
            counts[await _resolve(db, checkout, reason, now=now)] += 1
        except Exception:
            await db.rollback()
            logger.exception("payment_sweep_failed checkout_id=%s", checkout.id)
            counts["reconciling"] += 1
    if any(counts.values()):
        logger.info("payment_sweep %s", counts)
    return counts


# Причины, по которым бронь трогать НЕЛЬЗЯ: её либо уже нет, либо человек уже
# в зале. Закрыть надо форму оплаты, а не запись — иначе разбор денег стирал бы
# состоявшийся визит.
_KEEP_BOOKING = frozenset({"booking_gone", "no_longer_waiting", "no_reservation"})


async def _resolve(db: AsyncSession, checkout: StripeCheckout, reason: str, *,
                   now: Optional[datetime] = None) -> str:
    """Разобрать ОДНУ заявку. Возвращает ключ исхода для счётчиков `sweep`."""
    from services import stripe_connect
    from routers.checkout.stripe_pay import apply_paid
    from services.schedule_guard import lock_studio

    await lock_studio(db, checkout.studio_id)
    await db.refresh(checkout, with_for_update=True)
    if checkout.status != "pending":
        await db.commit()
        return "settled" if checkout.status == "paid" else "reconciling"
    current_reason = await unfulfillable_reason(db, checkout, now=now)
    if current_reason is None:
        await db.commit()
        return "reconciling"
    reason = current_reason
    reservation_id = (checkout.payload or {}).get("reservation_id")
    if reason != "stale":
        # Отметка ставится ПЕРВОЙ и переживает перезапуск: исполнить эту оплату
        # уже нечем, чем бы ни кончился поход в Stripe.
        #
        # «Слишком долго держится» СЮДА НЕ ВХОДИТ, и это принципиально: срок не
        # доказывает, что денег не было. Пометь мы такую заявку — пришедшая
        # через секунду оплата была бы отвергнута собственной уборкой.
        _mark_void(checkout, reason)
    # Release the Studio/checkout locks before any Stripe request, including stale holds.
    await db.commit()

    if not checkout.session_id:
        # Форма могла быть создана, а её id мы записать не успели. Связь
        # восстанавливает общая сверка (`stripe_pay.reconcile_pending`) — своим
        # проходом и своим сроком. До её ответа место занято.
        return _escalate(checkout, reservation_id, "session_unknown")

    try:
        session = await stripe_connect.fetch_session(checkout.session_id,
                                                     checkout.account_id)
    except Exception:
        logger.warning("payment_unreachable checkout_id=%s", checkout.id)
        return _escalate(checkout, reservation_id, "stripe_unreachable")

    if getattr(session, "payment_status", None) == "paid":
        # Деньги есть. Проводим ТЕМ ЖЕ путём, что вебхук: второй бизнес-логики
        # для тех же денег быть не должно. Условия сверяются там же — оплату за
        # изменившееся занятие проведение отвергнет само.
        try:
            await apply_paid(db, checkout.session_id, account_id=checkout.account_id,
                             attempt_id=checkout.attempt_id)
            return "settled"
        except Exception:
            # `apply_paid` уже пометил заявку failed и закричал: деньги списаны,
            # исполнить нечем. Место при этом НЕ освобождаем вслепую — решение
            # о возврате принимает человек.
            await db.rollback()
            return "unfulfillable"

    status = getattr(session, "status", None)
    if status == "open":
        try:
            closed = await stripe_connect.expire_session(checkout.session_id,
                                                         checkout.account_id)
        except Exception:
            # Форму закрыть не удалось: её могли оплатить прямо сейчас (Stripe
            # просрочивает только `open`). Ответа нет — решения тоже.
            logger.warning("payment_expire_failed checkout_id=%s", checkout.id)
            return _escalate(checkout, reservation_id, "expire_failed")
        if getattr(closed, "payment_status", None) == "paid":
            # Успели заплатить между чтением и закрытием. Разберёт следующий
            # проход общим путём проведения.
            return _escalate(checkout, reservation_id, "paid_while_expiring")
        status = "expired"

    if status == "expired":
        await lock_studio(db, checkout.studio_id)
        await db.refresh(checkout, with_for_update=True)
        if checkout.status != "pending":
            await db.commit()
            return "settled" if checkout.status == "paid" else "reconciling"
        checkout.status = "cancelled"
        if reservation_id and reason not in _KEEP_BOOKING:
            return await _release(db, studio_id=checkout.studio_id,
                                  reservation_id=reservation_id, reason=reason)
        await db.commit()
        return "released"

    # `complete`, но не `paid` — отложенный метод оплаты в пути (банковский
    # перевод, SEPA). Ни отменять, ни активировать нельзя: деньги ещё едут.
    return _escalate(checkout, reservation_id, "payment_processing")


def _escalate(checkout: StripeCheckout, reservation_id, reason: str) -> str:
    """Ответа нет — держим место и, если это тянется слишком долго, зовём человека.

    Тревога поднимается ОДИН раз по сроку, а не каждый проход: `logger.error`
    уходит в оперативный канал (services/alerts), и час за часом повторять одно
    и то же значит утопить в этом настоящие тревоги.
    """
    age = datetime.utcnow() - (checkout.created_at or datetime.utcnow())
    if age > ESCALATE_AFTER:
        logger.error(
            "payment_needs_attention studio_id=%s reservation_id=%s checkout_id=%s "
            "reason=%s age_hours=%s — место держится, состояние оплаты неизвестно",
            checkout.studio_id, reservation_id, checkout.id, reason,
            int(age.total_seconds() // 3600))
    else:
        logger.info("payment_reconciling checkout_id=%s reason=%s", checkout.id, reason)
    return "reconciling"


async def _release(db: AsyncSession, *, studio_id: int, reservation_id: int,
                   reason: str) -> str:
    """Освободить место. Только когда доказано, что денег нет и не будет.

    Снимает бронь ДОМЕН (`booking.cancel`): платёжный мост состояние брони не
    пишет ни здесь, ни где-либо ещё.
    """
    from services.schedule_guard import lock_studio
    await lock_studio(db, studio_id)
    reservation = (await db.execute(select(Reservation).join(Lesson).where(
        Reservation.id == reservation_id, Lesson.studio_id == studio_id,
    ).execution_options(populate_existing=True))).scalar_one_or_none()
    if reservation is None or reservation.status != "hold":
        await db.commit()
        return "released"
    result = await booking.cancel(db, studio_id=studio_id, reservation_id=reservation_id,
                                  actor="payment", reason=f"оплата: {reason}",
                                  enforce_policy=False)
    await db.commit()
    logger.info("hold_released studio_id=%s reservation_id=%s outcome=%s",
                studio_id, reservation_id, result.outcome.value)
    return "released"


if __name__ == "__main__":
    from services.booking import Funding, FundingKind

    terms = Terms(lesson_id=7, local_start=datetime(2027, 5, 13, 18, 30),
                  service_name="Стретчинг", trainer_name="Валерия Ким",
                  branch_name="Вацлавская",
                  funding=Funding(FundingKind.PAY, None, 500, "CZK"),
                  approval_required=False)
    body = payload_for(reservation_id=1, client_id=2, lesson_id=7,
                       amount=terms.funding.price, currency=terms.funding.currency,
                       terms=booking.lesson_part(terms))
    assert body["kind"] == PAYLOAD_KIND
    # Экономическая правда лежит в заявке целиком: сверять при проведении есть что.
    for field in ("reservation_id", "client_id", "lesson_id", "amount", "currency",
                  "terms"):
        assert field in body, field
    # Снимок занятия — тот же, по которому сверяются условия записи.
    assert body["terms"] == booking.lesson_part(terms)
    # Заявки прежних видов этим путём не пойдут.
    assert not is_booking(type("X", (), {"payload": {"client_id": 1}})())
    assert is_booking(type("X", (), {"payload": body})())

    row = type("X", (), {"payload": dict(body), "id": 1})()
    assert voided(row) is None
    _mark_void(row, "lesson_changed")
    assert voided(row)["reason"] == "lesson_changed"
    print("booking_payment self-check ok")

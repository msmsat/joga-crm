"""Расписание и брони мини-приложения клиента (`/global/lessons/*`,
`/global/reservations/*`).

Оба семейства ручек живут в одном файле без общего префикса на роутере (у них
разные первые сегменты пути) — заводить третий модуль или пакет ради этого
эпик прямо запрещает (блок 0). Студия всегда берётся из `client.studio_id`
(`get_current_client`), никогда из параметров запроса — чужой lesson_id
недостижим по построению: списки и брони фильтруются по студии клиента на
уровне SQL.

Механика списания/возврата абонемента и уведомлений не своя — целиком
переиспользована из `services.booking_access`/`services.subscription_charge`/
`services.notifier`, той же, что и у Журнала (`routers/schedule/reservations.py`)
и публичной записи (`routers/booking/public.py`): расхождение логики между
ними и мини-приложением означает разъехавшиеся остатки абонементов.
"""
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from ratelimit import limiter
from models import Client, Hall, Lesson, Reservation
from schemas._base import BaseSchema
from services.booking_access import find_eligible_subscription
from services.booking_rules import (
    BookingRules, assert_bookable, booking_window, load_rules, within_widget_hours,
)
from services.notifier import _fmt_amount, _studio_prefs, lesson_context, notify
from services.referral import fire_referral
from services.subscription_charge import charge_reservation, notify_subscription_remaining, refund_reservation

from .miniapp import get_current_client

router = APIRouter()

DEFAULT_HALL_COLOR = "#FCAE91"

# Сколько человек должно согласиться, чтобы затея состоялась: одной идти не с кем,
# поэтому до порога не показываем места и не шлём напоминание после занятия.
COFFEE_MIN_GROUP = 2


class CoffeeParticipant(BaseSchema):
    """Участница кофе глазами другой участницы: имя и цвет аватара, больше ничего.

    Ни фамилии, ни телефона, ни client_id — это единственное место в продукте, где
    один клиент видит другого, и наружу уходит ровно то, что нужно узнать человека
    за столиком.
    """
    name: str
    avatar_color: Optional[str] = None


class CoffeeSpot(BaseSchema):
    name: str
    address: str = ""
    url: Optional[str] = None


class CoffeeState(BaseSchema):
    """Состояние «кофе после занятия» для конкретного клиента и занятия."""
    enabled: bool = False
    count: int = 0
    joined: bool = False
    # Непусто только при joined=True — см. _coffee_map.
    participants: list[CoffeeParticipant] = []
    # Непусто только при count >= COFFEE_MIN_GROUP: одной идти некуда.
    spots: list[CoffeeSpot] = []


class MiniappLesson(BaseSchema):
    id: int
    name: str
    level: str
    equipment: str
    teacher_name: str
    start_time: datetime
    duration_min: int
    price: int
    total_spots: int
    time: str
    teacher: str
    price_str: str
    color: str
    badge: str
    taken_spots: list[int]
    is_booked_by_user: bool
    # Занятие проходит все правила онлайн-записи студии (запись включена, окно
    # дней, минимум времени до начала, часы работы виджета). False — карточка в
    # расписании видна, но кнопка записи не работает: убирать занятие из списка
    # нельзя, клиент должен видеть, что оно вообще есть.
    bookable: bool
    coffee: CoffeeState = CoffeeState()


class MiniappUpcomingLesson(MiniappLesson):
    spot_number: int
    # "active" — бронь подтверждена, "pending" — студия включила подтверждение
    # тренером и бронь ждёт решения (место при этом уже держится).
    status: str


class MiniappPastLesson(MiniappLesson):
    spot_number: int
    rating: Optional[int]


class MiniappMyLessons(BaseSchema):
    upcoming: list[MiniappUpcomingLesson]
    past: list[MiniappPastLesson]


def _badge(total_spots: int, taken: int) -> str:
    free = total_spots - taken
    if free <= 0:
        return "full"
    if free <= 2:
        return "almost"
    return "open"


def _is_bookable(rules: BookingRules, lesson: Lesson) -> bool:
    """Те же четыре правила, что проверяет assert_bookable при самой записи —
    здесь без исключения, чтобы отдать флаг на карточку."""
    if not rules.booking_active:
        return False
    lower, upper = booking_window(rules)
    return lower <= lesson.start_time <= upper and within_widget_hours(rules, lesson.start_time)


def _lesson_fields(
    lesson: Lesson,
    taken_spots: list[int],
    is_booked_by_user: bool,
    currency: str,
    hall_colors: dict[int, str],
    rules: BookingRules,
    coffee: Optional[dict] = None,
) -> dict:
    color = DEFAULT_HALL_COLOR
    if lesson.hall_id is not None:
        color = hall_colors.get(lesson.hall_id) or DEFAULT_HALL_COLOR
    return dict(
        id=lesson.id,
        name=lesson.name,
        level=lesson.level,
        equipment=lesson.equipment,
        teacher_name=lesson.teacher_name,
        start_time=lesson.start_time,
        duration_min=lesson.duration_min,
        price=lesson.price,
        total_spots=lesson.total_spots,
        time=lesson.start_time.strftime("%H:%M"),
        teacher=lesson.teacher_name,
        price_str=_fmt_amount(lesson.price, currency),
        color=color,
        badge=_badge(lesson.total_spots, len(taken_spots)),
        taken_spots=taken_spots,
        is_booked_by_user=is_booked_by_user,
        bookable=_is_bookable(rules, lesson),
        # Пустой словарь схема развернёт в CoffeeState() с enabled=False —
        # ровно то, что нужно студии с выключенной механикой.
        coffee=coffee or {},
    )


async def _reservations_map(
    db: AsyncSession, lesson_ids: list[int],
) -> tuple[dict[int, list[int]], dict[int, set[int]]]:
    """Один запрос на все занятия сразу — не N+1 в цикле по занятиям."""
    if not lesson_ids:
        return {}, {}
    rows = (await db.execute(
        select(Reservation.lesson_id, Reservation.spot_number, Reservation.client_id)
        .where(Reservation.lesson_id.in_(lesson_ids), Reservation.status != "cancelled")
    )).all()
    taken: dict[int, list[int]] = {}
    booked_clients: dict[int, set[int]] = {}
    for lesson_id, spot_number, client_id in rows:
        taken.setdefault(lesson_id, []).append(spot_number)
        booked_clients.setdefault(lesson_id, set()).add(client_id)
    return taken, booked_clients


async def _coffee_map(
    db: AsyncSession,
    lesson_ids: list[int],
    client_id: int,
    rules: BookingRules,
    booked_lesson_ids: Optional[set[int]] = None,
) -> dict[int, dict]:
    """Состояние «кофе» по всем занятиям сразу — один запрос, не N+1.

    Здесь же, в единственном месте, режется видимость, и режется дважды:

    1. По брони: цифры и имена — только по занятиям, на которые сам записан
       (`booked_lesson_ids`; None — все переданные, так зовёт `/lessons/my`).
       Участвовать всё равно может только записавшийся, а сколько человек
       собирается пить кофе на чужом занятии — не дело смотрящего расписание.
    2. По взаимности: имена уходят только тому, кто сам согласился.

    Оба гейта обязаны жить на сервере — спрятать список в интерфейсе
    недостаточно, он всё равно уехал бы клиенту в JSON.

    Выключенная механика не стоит ничего: ни запроса, ни джойна к клиентам.
    """
    if not rules.coffee_enabled or not lesson_ids:
        return {}

    rows = (await db.execute(
        select(Reservation.lesson_id, Reservation.client_id, Client.name, Client.avatar_color)
        .join(Client, Client.id == Reservation.client_id)
        .where(
            Reservation.lesson_id.in_(lesson_ids),
            Reservation.status != "cancelled",
            Reservation.coffee.is_(True),
        )
    )).all()

    by_lesson: dict[int, list[tuple[int, str, Optional[str]]]] = {}
    for lesson_id, cid, name, avatar_color in rows:
        by_lesson.setdefault(lesson_id, []).append((cid, name, avatar_color))

    spots = [dict(spot) for spot in rules.coffee_spots]

    state: dict[int, dict] = {}
    for lesson_id in lesson_ids:
        # Не записан — механика показывается включённой, но пустой: карточка в
        # расписании про кофе ничего не рассказывает, пока не забронируешь место.
        if booked_lesson_ids is not None and lesson_id not in booked_lesson_ids:
            state[lesson_id] = dict(enabled=True, count=0, joined=False, participants=[], spots=[])
            continue

        people = by_lesson.get(lesson_id, [])
        joined = any(cid == client_id for cid, _, _ in people)
        state[lesson_id] = dict(
            enabled=True,
            count=len(people),
            joined=joined,
            participants=[
                dict(name=name, avatar_color=avatar_color)
                for cid, name, avatar_color in people
                if cid != client_id
            ] if joined else [],
            spots=spots if len(people) >= COFFEE_MIN_GROUP else [],
        )
    return state


async def _hall_colors(db: AsyncSession, lessons: list[Lesson]) -> dict[int, str]:
    hall_ids = {lesson.hall_id for lesson in lessons if lesson.hall_id is not None}
    if not hall_ids:
        return {}
    rows = (await db.execute(select(Hall.id, Hall.color).where(Hall.id.in_(hall_ids)))).all()
    return {hall_id: color for hall_id, color in rows if color}


@router.get("/lessons/date/{target_date}", response_model=list[MiniappLesson])
async def lessons_by_date(
    target_date: date,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    day_start = datetime.combine(target_date, time.min)
    day_end = day_start + timedelta(days=1)

    lessons = (await db.execute(
        select(Lesson)
        .where(
            Lesson.studio_id == client.studio_id,
            Lesson.status != "cancelled",
            Lesson.start_time >= day_start,
            Lesson.start_time < day_end,
        )
        .order_by(Lesson.start_time)
    )).scalars().all()
    if not lessons:
        return []

    taken_by_lesson, booked_by_client = await _reservations_map(db, [l.id for l in lessons])
    hall_colors = await _hall_colors(db, lessons)
    _, currency = await _studio_prefs(db, client.studio_id)
    rules = await load_rules(db, client.studio_id)
    coffee = await _coffee_map(
        db, [l.id for l in lessons], client.id, rules,
        {lid for lid, clients in booked_by_client.items() if client.id in clients},
    )

    return [
        MiniappLesson(**_lesson_fields(
            lesson,
            taken_by_lesson.get(lesson.id, []),
            client.id in booked_by_client.get(lesson.id, set()),
            currency,
            hall_colors,
            rules,
            coffee.get(lesson.id),
        ))
        for lesson in lessons
    ]


@router.get("/lessons/next", response_model=Optional[MiniappLesson])
async def next_lesson(
    response: Response,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    rules = await load_rules(db, client.studio_id)
    earliest, latest = booking_window(rules)

    # Карточка «ближайшее занятие» на главной — это предложение записаться,
    # поэтому она обязана жить внутри окна записи студии: занятие за пределами
    # окна вело бы на кнопку, которую бэкенд тут же отклонит. Часы виджета
    # фильтруются в Python — их проверка не SQL-выражение, а список короткий.
    lessons = (await db.execute(
        select(Lesson)
        .where(
            Lesson.studio_id == client.studio_id,
            Lesson.status != "cancelled",
            Lesson.start_time >= earliest,
            Lesson.start_time <= latest,
        )
        .order_by(Lesson.start_time)
        .limit(50)
    )).scalars().all()
    lesson = next((l for l in lessons if within_widget_hours(rules, l.start_time)), None)

    if lesson is None or not rules.booking_active:
        response.status_code = 204
        return None

    taken_by_lesson, booked_by_client = await _reservations_map(db, [lesson.id])
    hall_colors = await _hall_colors(db, [lesson])
    _, currency = await _studio_prefs(db, client.studio_id)
    coffee = await _coffee_map(
        db, [lesson.id], client.id, rules,
        {lesson.id} if client.id in booked_by_client.get(lesson.id, set()) else set(),
    )

    return MiniappLesson(**_lesson_fields(
        lesson,
        taken_by_lesson.get(lesson.id, []),
        client.id in booked_by_client.get(lesson.id, set()),
        currency,
        hall_colors,
        rules,
        coffee.get(lesson.id),
    ))


@router.get("/lessons/my", response_model=MiniappMyLessons)
async def my_lessons(
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Reservation, Lesson)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Reservation.client_id == client.id, Reservation.status != "cancelled")
    )).all()
    if not rows:
        return MiniappMyLessons(upcoming=[], past=[])

    lessons_by_id = {lesson.id: lesson for _, lesson in rows}
    taken_by_lesson, _ = await _reservations_map(db, list(lessons_by_id))
    hall_colors = await _hall_colors(db, list(lessons_by_id.values()))
    _, currency = await _studio_prefs(db, client.studio_id)
    rules = await load_rules(db, client.studio_id)
    coffee = await _coffee_map(db, list(lessons_by_id), client.id, rules)

    now = datetime.now()
    upcoming: list[MiniappUpcomingLesson] = []
    past: list[MiniappPastLesson] = []

    for reservation, lesson in rows:
        fields = _lesson_fields(
            lesson,
            taken_by_lesson.get(lesson.id, []),
            True,  # это его собственная бронь
            currency,
            hall_colors,
            rules,
            coffee.get(lesson.id),
        )
        if lesson.start_time < now:
            past.append(MiniappPastLesson(**fields, spot_number=reservation.spot_number, rating=reservation.rating))
        else:
            upcoming.append(MiniappUpcomingLesson(
                **fields, spot_number=reservation.spot_number, status=reservation.status,
            ))

    upcoming.sort(key=lambda lesson: lesson.start_time)
    past.sort(key=lambda lesson: lesson.start_time, reverse=True)

    return MiniappMyLessons(upcoming=upcoming, past=past)


class ReservationCreateRequest(BaseSchema):
    lesson_id: int
    spot_number: int


class RateReservationRequest(BaseSchema):
    rating: int = Field(ge=1, le=5)


class MiniappReservation(BaseSchema):
    id: int
    lesson_id: int
    spot_number: int
    status: str
    rating: Optional[int]
    # Состояние «кофе» на момент ответа — им открывается панель приглашения
    # сразу после записи. Без этого она показывала бы счётчик из списка занятий,
    # снятый ДО брони: там клиент ещё не участник, и цифра успевала устареть.
    coffee: CoffeeState = CoffeeState()


async def _own_active_reservation(db: AsyncSession, client: Client, lesson_id: int) -> Reservation:
    """Своя действующая бронь на занятие или 404 — общий поиск для cancel/rate.

    `.first()`, а не `scalar_one_or_none()`: при включённой «Повторной записи»
    броней на одно занятие у клиента может быть несколько, и отмена должна
    снимать последнюю, а не падать MultipleResultsFound.
    """
    reservation = (await db.execute(
        select(Reservation).where(
            Reservation.lesson_id == lesson_id,
            Reservation.client_id == client.id,
            Reservation.status != "cancelled",
        ).order_by(Reservation.id.desc())
    )).scalars().first()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return reservation


async def _studio_lesson(db: AsyncSession, client: Client, lesson_id: int) -> Lesson:
    """Занятие своей студии — чужая студия 404, как и списки выше."""
    lesson = (await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.studio_id == client.studio_id)
    )).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Занятие не найдено")
    return lesson


@router.post("/reservations", response_model=MiniappReservation, status_code=201)
@limiter.limit("10/minute")
async def create_reservation(
    request: Request,
    body: ReservationCreateRequest,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    """Бронь коврика по правилам студии со страницы «Онлайн-запись».

    Окно записи (активность, минимум времени до начала, дни вперёд, часы
    виджета) — `assert_bookable`, те же правила, по которым проставлен флаг
    `bookable` в списке занятий. Дальше три настройки решают, чем запись
    отличается от «просто занял место»:

      * «Предоплата при записи» — нужен подходящий абонемент (`assert_can_book`,
        тот же гейт, что в Журнале); без него клиент идёт покупать абонемент.
        Выключена — записываем и без абонемента, оплата в студии;
      * «Повторная запись» — разрешает второе место на том же занятии;
      * «Подтверждение тренером» — бронь создаётся `pending`. Место она держит
        сразу (иначе его займут, пока студия думает), занятие с абонемента тоже
        списывается сразу и возвращается при отклонении — `refund_reservation`.
    """
    lesson = (await db.execute(
        select(Lesson).where(
            Lesson.id == body.lesson_id,
            Lesson.studio_id == client.studio_id,
            Lesson.status != "cancelled",
        )
    )).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Занятие не найдено")

    rules = await load_rules(db, client.studio_id)
    assert_bookable(rules, lesson)

    if not (1 <= body.spot_number <= lesson.total_spots):
        raise HTTPException(status_code=400, detail="Неверный номер места")

    active = (await db.execute(
        select(Reservation).where(
            Reservation.lesson_id == body.lesson_id,
            Reservation.status != "cancelled",
        )
    )).scalars().all()
    if len(active) >= lesson.total_spots:
        raise HTTPException(status_code=400, detail="Все места заняты")
    if not rules.repeat_booking_allowed and any(r.client_id == client.id for r in active):
        raise HTTPException(status_code=409, detail="Вы уже записаны на это занятие")
    if any(r.spot_number == body.spot_number for r in active):
        # Именно эта строка — плановый текст ошибки, уже понятный мини-приложению
        # (см. блок 3 EPIC_MA_REAL_BACKEND, api/user.ts:156 показывает detail как есть).
        raise HTTPException(status_code=409, detail="Це місце вже зайняте")

    sub = await find_eligible_subscription(db, client.id, lesson)
    if rules.prefill_on_booking and sub is None:
        # Текст свой, а не из assert_can_book (Журнал): там он обращён к
        # администратору («у клиента нет абонемента»), а читать его будет сам
        # клиент, и следующий его шаг — купить абонемент в этом же приложении.
        raise HTTPException(
            status_code=402,
            detail="Для записи нужен действующий абонемент — оформите его в профиле",
        )

    reservation = Reservation(
        client_id=client.id,
        lesson_id=body.lesson_id,
        spot_number=body.spot_number,
        status="pending" if rules.trainer_confirmation_required else "active",
        booking_channel="telegram",
    )
    db.add(reservation)
    remaining = await charge_reservation(db, client.studio_id, reservation, sub)
    # Тот же реферальный триггер, что и у публичного виджета (booking/public.py):
    # друг, пришедший по ссылке из Telegram, записывается ИМЕННО здесь, и без
    # этого вызова пригласивший не получал бонус вовсе — самый частый путь был
    # единственным неподключённым.
    await fire_referral(db, client.studio_id, client.id, "first_visit", referred_name=client.name)
    await db.commit()
    await db.refresh(reservation)

    # c1 «Запись подтверждена» уходит только за подтверждённой бронью: пока
    # студия не одобрила, подтверждать нечего. Клиент видит статус «ожидает» в
    # мини-приложении, а c1 придёт после confirm в Журнале.
    lesson_ctx = await lesson_context(db, lesson)
    if reservation.status == "active":
        await notify(db, client.studio_id, "client", "c1", {
            **lesson_ctx, "client_id": client.id,
        })
    await notify(db, client.studio_id, "admin", "a1", {
        **lesson_ctx,
        "client_name": client.name,
        # См. reservations.py: гасит a1 владельцу, который сам ведёт занятие и
        # получит t1 (notifier._recipient).
        "trainer_id": lesson.teacher_id,
    })
    if lesson.teacher_id is not None:
        await notify(db, client.studio_id, "trainer", "t1", {
            **lesson_ctx,
            "trainer_id": lesson.teacher_id,
            "client_name": client.name,
        })
    await notify_subscription_remaining(db, client.studio_id, client.id, remaining)

    return MiniappReservation(
        id=reservation.id, lesson_id=reservation.lesson_id,
        spot_number=reservation.spot_number, status=reservation.status, rating=reservation.rating,
        # Панель приглашения на кофе открывается сразу после этого ответа —
        # отдаём ей актуальную картину, а не ту, что была в списке до брони.
        coffee=await _coffee_state(db, client, lesson.id, rules),
    )


@router.post("/reservations/{lesson_id}/cancel", response_model=MiniappReservation)
@limiter.limit("10/minute")
async def cancel_reservation(
    request: Request,
    lesson_id: int,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    reservation = await _own_active_reservation(db, client, lesson_id)
    lesson = await _studio_lesson(db, client, lesson_id)

    deadline_min = (await load_rules(db, client.studio_id)).cancellation_deadline_min
    if lesson.start_time < datetime.now() + timedelta(minutes=deadline_min):
        raise HTTPException(
            status_code=400,
            detail=f"Отменить запись можно не позднее чем за {deadline_min} минут до начала",
        )

    reservation.status = "cancelled"
    reservation.cancelled_at = datetime.now()
    await refund_reservation(db, reservation)  # занятие возвращается на абонемент
    await db.commit()
    await db.refresh(reservation)

    await notify(db, client.studio_id, "client", "c3", {
        **await lesson_context(db, lesson), "client_id": client.id,
    })

    # a2/t2 «клиент отменил в последний момент» — их единственный живой путь.
    # В CRM админ снять клиента позже чем за 2 часа не может (reservations.py их
    # оттуда и убрал), а вот сам клиент отменяет по окну своей студии
    # (cancellation_deadline_min): выставила 30 минут — поздние отмены реальны,
    # оставила дефолтные 240 — эти два события просто не наступают.
    hours_left = (lesson.start_time - datetime.now()).total_seconds() / 3600
    client_name = f"{client.name} {client.last_name or ''}".strip()
    if hours_left < 2 and lesson.teacher_id is not None:
        await notify(db, client.studio_id, "trainer", "t2", {
            "trainer_id": lesson.teacher_id,
            "client_name": client_name,
            "lesson_name": lesson.name,
            "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
        })
    if hours_left < 1:
        await notify(db, client.studio_id, "admin", "a2", {
            "client_name": client_name,
            "lesson_name": lesson.name,
            # Поздняя отмена при hours_left < 1 попадает и в t2 выше: без этого
            # владелец-тренер студии без администратора получал обе версии.
            "trainer_id": lesson.teacher_id,
        })

    return MiniappReservation(
        id=reservation.id, lesson_id=reservation.lesson_id,
        spot_number=reservation.spot_number, status=reservation.status, rating=reservation.rating,
    )


@router.post("/reservations/{lesson_id}/rate", response_model=MiniappReservation)
@limiter.limit("10/minute")
async def rate_reservation(
    request: Request,
    lesson_id: int,
    body: RateReservationRequest,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    reservation = await _own_active_reservation(db, client, lesson_id)
    lesson = await _studio_lesson(db, client, lesson_id)

    if lesson.start_time >= datetime.now():
        raise HTTPException(status_code=403, detail="Оценить можно только прошедшее занятие")

    reservation.rating = body.rating
    await db.commit()
    await db.refresh(reservation)

    # t7 «Новый отзыв» — эпик N-9 оставил его без врезки, считая, что отзыв
    # появится только со StudioReview во второй очереди. Оценка занятия из
    # мини-приложения и есть отзыв о работе тренера, так что событие живёт здесь.
    if lesson.teacher_id is not None:
        await notify(db, client.studio_id, "trainer", "t7", {
            "trainer_id": lesson.teacher_id,
            "client_name": f"{client.name} {client.last_name or ''}".strip(),
            "rating": body.rating,
            "lesson_name": lesson.name,
        })

    return MiniappReservation(
        id=reservation.id, lesson_id=reservation.lesson_id,
        spot_number=reservation.spot_number, status=reservation.status, rating=reservation.rating,
    )


async def _set_coffee(db: AsyncSession, client: Client, lesson_id: int, value: bool) -> CoffeeState:
    """Согласиться на кофе или передумать — общее тело обеих ручек.

    Участвовать может только тот, у кого есть действующая бронь: `_own_active_reservation`
    отдаёт 404 на чужое и на отменённое занятие. Обе ручки идемпотентны — повторный
    тап по «Я за» не должен быть ошибкой.
    """
    rules = await load_rules(db, client.studio_id)
    if not rules.coffee_enabled:
        raise HTTPException(status_code=403, detail="Кофе после занятия выключен студией")

    reservation = await _own_active_reservation(db, client, lesson_id)
    await _studio_lesson(db, client, lesson_id)

    if reservation.coffee != value:
        reservation.coffee = value
        await db.commit()

    return await _coffee_state(db, client, lesson_id, rules)


async def _coffee_state(
    db: AsyncSession, client: Client, lesson_id: int, rules: BookingRules,
) -> CoffeeState:
    """Состояние одного занятия для того, кто на нём уже забронирован."""
    state = await _coffee_map(db, [lesson_id], client.id, rules, {lesson_id})
    return CoffeeState(**state[lesson_id]) if state else CoffeeState()


@router.post("/reservations/{lesson_id}/coffee", response_model=CoffeeState)
@limiter.limit("20/minute")
async def join_coffee(
    request: Request,
    lesson_id: int,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    return await _set_coffee(db, client, lesson_id, True)


@router.delete("/reservations/{lesson_id}/coffee", response_model=CoffeeState)
@limiter.limit("20/minute")
async def leave_coffee(
    request: Request,
    lesson_id: int,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    return await _set_coffee(db, client, lesson_id, False)

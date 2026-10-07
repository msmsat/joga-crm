"""Что поменялось в занятии и кому об этом сказать.

Один список изменений на всех: уведомление записанным (c11/c14), строку ленты
событий студии и ответ роутера. Список — снимок «до» против снимка «после», а
не присланные поля: форма шлёт и то, что не менялось, а смена услуги тянет за
собой название и цену, которых в запросе не было.

Деньги. Цена занятия — это цена для тех, кто ЕЩЁ запишется, и сумма в отчётах и
зарплате. У записанных она меняет только неоплаченный долг («оплата на
месте») — тем же ядром кассы, которым его потом проведут (`reprice_debt`:
скидки клиента, скидка администратора, коды мини-приложения). Заплаченное не
двигается: возврат или доплата — решение человека у стойки. Абонемент и
подаренное первое занятие цены не касаются вовсе.
"""
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from activity import log_activity
from models import ClientPayment, Hall, Lesson, Reservation, Studio
from services import reservation_payment
from services.notifier import change_lines, lesson_context, notify

# Поля, которые видит клиент, — в порядке строк уведомления.
CLIENT_FIELDS = ("name", "start", "duration", "teacher", "hall", "level", "equipment")
# Только перенос: о нём говорит c11 «Занятие перенесено» — как и до c14.
MOVE_FIELDS = frozenset({"start", "duration", "hall"})


@dataclass(frozen=True)
class LessonState:
    name: str
    start_time: datetime
    duration_min: int
    teacher_name: str
    hall_name: str | None
    price: int
    level: str
    equipment: str
    total_spots: int


async def state_of(db: AsyncSession, lesson: Lesson) -> LessonState:
    hall_name = None
    if lesson.hall_id is not None:
        hall_name = (await db.execute(
            select(Hall.name).where(Hall.id == lesson.hall_id)
        )).scalar_one_or_none()
    return LessonState(
        name=lesson.name, start_time=lesson.start_time, duration_min=lesson.duration_min,
        teacher_name=lesson.teacher_name or "", hall_name=hall_name, price=lesson.price,
        level=lesson.level or "", equipment=lesson.equipment or "",
        total_spots=lesson.total_spots,
    )


def diff(before: LessonState, after: LessonState) -> list[dict]:
    """Изменения [{field, old, new}] — то, что реально стало другим."""
    pairs = (
        ("name", before.name, after.name),
        ("start", before.start_time.isoformat(), after.start_time.isoformat()),
        ("duration", before.duration_min, after.duration_min),
        ("teacher", before.teacher_name, after.teacher_name),
        ("hall", before.hall_name, after.hall_name),
        ("level", before.level, after.level),
        ("equipment", before.equipment, after.equipment),
        ("price", before.price, after.price),
        ("spots", before.total_spots, after.total_spots),
    )
    return [{"field": field, "old": old, "new": new} for field, old, new in pairs if old != new]


async def reprice_debts(db: AsyncSession, studio_id: int, lesson_id: int) -> dict[int, tuple[int, int]]:
    """Привести неоплаченные долги записанных к новой цене занятия. Не коммитит.

    Возвращает {client_id: (было, стало)} — только тех, чья сумма поменялась:
    им и только им уведомление скажет «К оплате: было → стало».
    """
    rows = (await db.execute(
        select(Reservation, ClientPayment)
        .join(ClientPayment, ClientPayment.id == Reservation.debt_payment_id)
        .where(
            Reservation.lesson_id == lesson_id,
            Reservation.status != "cancelled",
            ClientPayment.status == "pending",
        )
    )).all()
    changed: dict[int, tuple[int, int]] = {}
    for reservation, debt in rows:
        before = debt.amount
        await reservation_payment.reprice_debt(db, studio_id, reservation)
        after = debt.amount if reservation.debt_payment_id is not None else 0
        if after != before:
            changed[reservation.client_id] = (before, after)
    return changed


async def notify_booked(
    db: AsyncSession, studio_id: int, lesson: Lesson, changes: list[dict],
    dues: dict[int, tuple[int, int]],
) -> bool | None:
    """Сказать записанным, что поменялось. True — хоть одно сообщение дошло,
    False — слали, но ни один канал не доставил, None — сообщать было некому.

    Каждому — своё: тренер и время одинаковы для всех, а сумма к оплате — у
    каждого своя (и есть не у всех). Если человеку из всего списка сообщать
    нечего (поменялась только цена, а он по абонементу), он ничего не получит.
    """
    visible = [change for change in changes if change["field"] in CLIENT_FIELDS]
    client_ids = list(dict.fromkeys((await db.execute(
        select(Reservation.client_id).where(
            Reservation.lesson_id == lesson.id, Reservation.status != "cancelled")
        .order_by(Reservation.id)
    )).scalars().all()))
    if not client_ids or not (visible or dues):
        return None
    context = await lesson_context(db, lesson)
    delivered = None
    for client_id in client_ids:
        own = list(visible)
        if client_id in dues:
            old, new = dues[client_id]
            own.append({"field": "due", "old": old, "new": new})
        if not own:
            continue
        if {change["field"] for change in own} <= MOVE_FIELDS:
            sent = await notify(db, studio_id, "client", "c11", {**context, "client_id": client_id})
        else:
            sent = await notify(db, studio_id, "client", "c14", {
                **context, "client_id": client_id, "changes": own,
            })
        delivered = bool(delivered) or sent
    return delivered


async def log_change(
    db: AsyncSession, studio_id: int, lesson: Lesson, changes: list[dict], *,
    actor_name: str, finished: bool,
) -> None:
    """Строка в ленте событий студии: кто и что поменял. Не коммитит.

    Править занятие может и тренер — лента делает это видимым владельцу: цена
    прошедшего занятия входит в зарплату, и её правка не должна быть тихой.
    Строки ленты пишутся по-русски, как и все её события; подписи полей — тем
    же словарём, что и уведомления.
    """
    if not changes:
        return
    studio = await db.get(Studio, studio_id)
    currency = getattr(studio, "currency", None) or "RUB"
    when = lesson.start_time.strftime("%d.%m %H:%M")
    suffix = " (после занятия)" if finished else ""
    details = "; ".join(change_lines(changes, "ru", currency))
    title = f"изменил(а) занятие «{lesson.name}» {when}{suffix}: {details}"
    log_activity(
        db, studio_id, "lesson", title=title[:200], actor_name=actor_name or None,
        entity_type="lesson", entity_id=lesson.id,
    )

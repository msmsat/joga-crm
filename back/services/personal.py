"""Личные данные клиента — только по доказанной личности (P2).

Границы этого файла узкие намеренно:

  * сюда попадают ТОЛЬКО те выборки, право на которые уже проверено
    (`services/identity.require`). Функции ниже не спрашивают право сами — не
    потому, что оно не нужно, а потому что двух мест, решающих «можно ли»,
    быть не должно. Каждая из них требует `client_id`, а получить его больше
    неоткуда, кроме как из разрешения;
  * НИЧЕГО НЕ МЕНЯЕТСЯ. Ни одной записи, ни одного списания, ни одной отмены:
    мутации — предмет следующего этапа, и в этом файле их нет;
  * факты типизированы, как и весь остальной ответ (P1.5): свободного текста
    здесь не появляется, и модель к ним не прикасается.

Занятия читаются КАТАЛОГОМ (P1.3), а не своим запросом: время, тренер, зал и
филиал у клиента в чате обязаны совпадать с тем, что он видит в расписании.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Client, ClientSubscription, Lesson, Reservation
from services import catalog

# Сколько ближайших записей показываем. Больше человек в мессенджере не читает,
# а «покажите все» — это уже кабинет мини-приложения.
MAX_BOOKINGS = 5

# Бронь ЗАНИМАЕТ место, пока не отменена, — то же выражение, что у витрины
# (`catalog.OCCUPIES_SPOT`). Второй формулировки быть не должно: разойдясь, они
# покажут человеку запись, которой он в расписании не видит.
_MINE = Reservation.status != "cancelled"


@dataclass(frozen=True)
class BookingFact:
    """Одна запись клиента — фактами каталога, а не строками."""
    local_start: datetime
    service_name: str
    trainer_name: str
    branch_name: Optional[str]
    duration_min: int
    # Ждёт подтверждения тренером. Молчать об этом нельзя: человек считает,
    # что записан, а студия ещё не решила.
    pending: bool


@dataclass(frozen=True)
class BookingsFacts:
    items: tuple[BookingFact, ...]


@dataclass(frozen=True)
class SubscriptionFact:
    kind: str
    left: int
    total: int
    expires_at: date
    # Заморожен: срок стоит, занятия не сгорают.
    frozen: bool


@dataclass(frozen=True)
class SubscriptionFacts:
    items: tuple[SubscriptionFact, ...]


Facts = BookingsFacts | SubscriptionFacts


async def bookings(db: AsyncSession, *, studio_id: int, client_id: int,
                   now: datetime) -> BookingsFacts:
    """Ближайшие записи клиента. Только этой студии и только этого клиента.

    Студия стоит в УСЛОВИИ запроса, а не проверяется после: карточка клиента
    принадлежит студии, но занятие связано с бронью, а не со студией напрямую,
    и без явного условия чужое занятие пришло бы через бронь.
    """
    rows = (await db.execute(
        select(Reservation.id, Reservation.status, Lesson.id)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .join(Client, Client.id == Reservation.client_id)
        .where(
            Reservation.client_id == client_id,
            Client.studio_id == studio_id,
            Lesson.studio_id == studio_id,
            Lesson.status != "cancelled",
            Lesson.start_time >= now,
            _MINE,
        )
        .order_by(Lesson.start_time)
        .limit(MAX_BOOKINGS)
    )).all()
    if not rows:
        return BookingsFacts(())

    found = []
    for _reservation_id, status, lesson_id in rows:
        facts = await catalog.lesson(db, studio_id, lesson_id)
        if facts is not None:
            found.append(_booking(facts, status))
    return BookingsFacts(tuple(found))


def _booking(facts: catalog.LessonFacts, status: str) -> BookingFact:
    return BookingFact(
        local_start=facts.local_start,
        service_name=facts.display_name,
        trainer_name=facts.trainer_name,
        branch_name=facts.branch_name,
        duration_min=facts.duration_min,
        pending=status == "pending",
    )


async def subscription(db: AsyncSession, *, studio_id: int, client_id: int,
                       today: date) -> SubscriptionFacts:
    """Действующие абонементы клиента.

    Показываем ОСТАТОК, а не «сколько было»: человек спрашивает, на сколько
    занятий ему хватит. Просроченные и законченные не показываем вовсе —
    ответ «0 из 8, истёк в марте» это не ответ, а недоразумение.

    Только `active`. Купленный впрок абонемент (`pending`) сюда не попадает
    осознанно: до активации его `expires_at` — провизорная дата, которую сам
    продукт нигде не читает для решений (см. models/client.py), и назвать её
    человеку значило бы пообещать срок, который потом окажется другим.
    """
    rows = (await db.execute(
        select(ClientSubscription)
        .join(Client, Client.id == ClientSubscription.client_id)
        .where(
            ClientSubscription.client_id == client_id,
            Client.studio_id == studio_id,
            ClientSubscription.status == "active",
            ClientSubscription.expires_at >= today,
        )
        .order_by(ClientSubscription.expires_at)
    )).scalars().all()
    return SubscriptionFacts(tuple(
        SubscriptionFact(
            kind=row.type,
            left=max(0, (row.total_classes or 0) - (row.used_classes or 0)),
            total=row.total_classes or 0,
            expires_at=row.expires_at,
            frozen=bool(row.is_frozen),
        )
        for row in rows
    ))

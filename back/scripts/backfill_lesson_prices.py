"""Починка занятий, созданных с ценой 0, и долгов, которых из-за неё не завели.

Квик-форма Журнала цену не собирает, а `LessonCreateRequest.price` до правки
подставлял 0 вместо цены услуги. Последствий два, и второе дороже первого:

  1. в мини-приложении все занятия стоили 0 — витрина врала;
  2. `open_debt` молчит при `price <= 0`, поэтому за запись «оплата на месте»
     студия не видела долга вообще: ни в карточке клиента, ни у самого клиента.

Скрипт правит ТОЛЬКО будущие занятия. Прошедшие не трогаем сознательно:
проставить им цену задним числом — это переписать выручку в отчётах, а
выставить долг за визит, который уже мог быть оплачен наличными, — придумать
клиенту задолженность. Что там было на самом деле, знает только студия.

    python -m scripts.backfill_lesson_prices          # показать, что изменится
    python -m scripts.backfill_lesson_prices --apply  # записать
"""
import asyncio
import sys
from datetime import datetime

from sqlalchemy import select

from database import async_session_maker
from models import Client, Lesson, Reservation, Service
from services.subscription_charge import open_debt


async def main(apply: bool) -> int:
    async with async_session_maker() as db:
        now = datetime.now()

        # ─── 1. Цена занятия из его услуги ──────────────────────────────────
        rows = (await db.execute(
            select(Lesson, Service)
            .join(Service, Service.id == Lesson.service_id)
            .where(
                Lesson.price <= 0,
                Service.price > 0,
                Lesson.start_time > now,
                Lesson.status != "cancelled",
            )
            .order_by(Lesson.start_time)
        )).all()

        print(f"занятий с нулевой ценой (будущих): {len(rows)}")
        for lesson, service in rows[:15]:
            # Стрелка ASCII: консоль Windows под cp1251 на '→' падает целиком.
            print(f"  #{lesson.id:<6} {lesson.start_time:%d.%m %H:%M} {lesson.name:<28}"
                  f" 0 -> {service.price}")
        if len(rows) > 15:
            print(f"  ... и ещё {len(rows) - 15}")

        for lesson, service in rows:
            lesson.price = service.price
        await db.flush()

        # ─── 2. Долги за брони, которым теперь есть чем быть ────────────────
        # Только будущие занятия и только брони без покрытия: с абонементом,
        # подаренные и уже имеющие долг open_debt пропустит сам.
        reservations = (await db.execute(
            select(Reservation, Lesson)
            .join(Lesson, Lesson.id == Reservation.lesson_id)
            .where(
                Reservation.status != "cancelled",
                Reservation.debt_payment_id.is_(None),
                Reservation.subscription_id.is_(None),
                Reservation.is_trial.is_(False),
                Lesson.price > 0,
                Lesson.start_time > now,
                Lesson.status != "cancelled",
            )
            .order_by(Lesson.start_time)
        )).all()

        opened = 0
        for reservation, lesson in reservations:
            client = await db.get(Client, reservation.client_id)
            debt = await open_debt(db, reservation, lesson)
            if debt is not None:
                opened += 1
                if opened <= 15:
                    print(f"  долг {lesson.price:>6} — {client.name if client else '?'}"
                          f" · {lesson.name} {lesson.start_time:%d.%m %H:%M}")

        print(f"броней без долга (будущих): {opened}")

        if not apply:
            await db.rollback()
            print("\nэто предпросмотр — запустить с --apply, чтобы записать")
            return 0

        await db.commit()
        print(f"\nзаписано: занятий {len(rows)}, долгов {opened}")
        return len(rows) + opened


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))

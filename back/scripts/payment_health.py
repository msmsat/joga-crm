"""Состояние оплат записи: что держит места и что осталось без ответа Stripe.

ЗАЧЕМ. Оплата занятия — сага между тремя участниками (мы, Stripe, человек), и у
неё есть законное состояние «мы ещё не знаем». Оно durable, оно не ошибка, но
оно не должно жить вечно: место занято, деньги, возможно, списаны. Оператору
нужен ОДИН ответ на вопрос «что требует внимания», и ответ этот обязан
собираться без ручного SQL по боевой базе.

Что показывает:

    брони, держащие место (hold)      и возраст самой старой
    открытые заявки на занятие        сколько и с какого времени
    заявки в разборе                  оплата признана недействительной
    списано, но не проведено          `failed` — нужен возврат
    возвраты и споры                  refunded / disputed / chargeback
    заявки без сессии                 форма могла не создаться

Что умеет чинить: ничего своего. `--sweep` запускает ТОТ ЖЕ проход, что и
воркер (`services.booking_payment.sweep`) — он спрашивает Stripe и по ответу
освобождает место, проводит оплату либо оставляет в разборе. Второй логики
восстановления в продукте нет и заводить её нельзя: она разойдётся с первой.

Запуск из back/:
    python -m scripts.payment_health            # только отчёт
    python -m scripts.payment_health --sweep    # отчёт и один проход разбора
    python -m scripts.payment_health --studio 7 # по одной студии
"""
import argparse
import asyncio
from datetime import datetime

from sqlalchemy import func, select

from database import async_session_maker
from models import Lesson, Reservation, StripeCheckout
from services import booking_payment


def _age(moment) -> str:
    if moment is None:
        return "—"
    delta = datetime.utcnow() - moment
    hours = delta.total_seconds() / 3600
    return f"{hours:.1f} ч" if hours >= 1 else f"{delta.total_seconds() / 60:.0f} мин"


async def report(studio_id: int | None) -> dict:
    async with async_session_maker() as db:
        holds = select(func.count(Reservation.id), func.min(Reservation.created_at)) \
            .select_from(Reservation).join(Lesson, Lesson.id == Reservation.lesson_id) \
            .where(Reservation.status == "hold")
        if studio_id:
            holds = holds.where(Lesson.studio_id == studio_id)
        held, oldest = (await db.execute(holds)).one()

        rows = select(StripeCheckout)
        if studio_id:
            rows = rows.where(StripeCheckout.studio_id == studio_id)
        checkouts = [row for row in (await db.execute(rows)).scalars().all()
                     if booking_payment.is_booking(row)]

    by_status: dict[str, int] = {}
    for row in checkouts:
        by_status[row.status] = by_status.get(row.status, 0) + 1
    open_rows = [r for r in checkouts if r.status == "pending"]
    void_rows = [r for r in open_rows if booking_payment.voided(r)]
    headless = [r for r in open_rows if not r.session_id]

    # Псевдографику здесь не рисуем: консоль Windows по умолчанию в cp1251, и
    # рамка из U+2500 роняет скрипт UnicodeEncodeError вместо отчёта.
    print("== Оплата записи ==")
    print(f"мест держится (hold)      {held}   самое старое: {_age(oldest)}")
    print(f"открытых заявок           {len(open_rows)}"
          f"   старейшая: {_age(min((r.created_at for r in open_rows), default=None))}")
    print(f"в разборе (недействительны) {len(void_rows)}")
    print(f"без формы у Stripe        {len(headless)}")
    for status in ("paid", "failed", "cancelled", "refunded", "disputed", "chargeback"):
        print(f"{status:<25} {by_status.get(status, 0)}")
    if by_status.get("failed"):
        print("\nВНИМАНИЕ: `failed` — деньги списаны, а провести не удалось.")
        print("Это возврат через Stripe по конкретной заявке; список ниже.")
        for row in checkouts:
            if row.status == "failed":
                print(f"  заявка {row.id} студия {row.studio_id} сумма {row.amount} "
                      f"бронь {(row.payload or {}).get('reservation_id')} "
                      f"сессия {row.session_id}")
    return {"holds": held, "open": len(open_rows), "void": len(void_rows),
            "headless": len(headless), **by_status}


async def sweep_once() -> None:
    async with async_session_maker() as db:
        counts = await booking_payment.sweep(db)
        await db.commit()
    print(f"\nразбор: {counts}")


async def _main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio", type=int, default=None)
    parser.add_argument("--sweep", action="store_true",
                        help="запустить проход разбора (ходит в Stripe)")
    args = parser.parse_args()
    await report(args.studio)
    if args.sweep:
        await sweep_once()
        await report(args.studio)


if __name__ == "__main__":
    asyncio.run(_main())

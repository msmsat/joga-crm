"""Отчёт качества ассистента (эпик AI-6, задача 18).

Отвечает на один вопрос: где ассистент плох — цифрами, а не по личному
сообщению владельца. Набор из 50 вопросов (задача 19) — это лаборатория; здесь
видно, что происходит в проде.

Текста диалогов в отчёте нет и не будет: это ПДн клиентов чужого бизнеса.
Отчёт говорит «где плохо», а разбирать конкретный разговор владелец идёт в свой
чат, где тот и лежит.

Запуск из back/:
    python -m scripts.ai_report          # за 30 дней
    python -m scripts.ai_report 7        # за неделю

Что смотреть в первую очередь:
  - доля 👎 по поверхностям: в CRM и в мессенджерах ломается разное;
  - вопросы, упёршиеся в потолок итераций, — это и есть «ассистент тупит»;
  - доля эскалаций: каждая в 6 раз дороже обычного вопроса.
"""
import asyncio
import sys
from datetime import datetime, timedelta

from sqlalchemy import Integer, func, select

from database import async_session_maker
from models import AIChatMessage, AIUsage

# Потолок итераций агентного цикла. Держим копией, а не импортом из assistant:
# отчёту незачем поднимать весь ассистент с картой интерфейса и реестром.
_MAX_ITERATIONS = 6
_TOP = 10


def _pct(part: int, whole: int) -> str:
    return f"{(100 * part / whole):.1f}%" if whole else "—"


def _money(micro: int) -> str:
    return f"${micro / 1_000_000:.2f}"


async def _ratings(db, since: datetime) -> None:
    rows = (await db.execute(
        select(AIChatMessage.rating, func.count())
        .where(
            AIChatMessage.created_at >= since,
            AIChatMessage.role == "assistant",
        )
        .group_by(AIChatMessage.rating)
    )).all()
    counts = {rating: n for rating, n in rows}
    answers = sum(counts.values())
    up, down = counts.get(1, 0), counts.get(-1, 0)
    rated = up + down

    print("\nОЦЕНКИ ОТВЕТОВ")
    print(f"  ответов ассистента      {answers}")
    print(f"  оценено                 {rated} ({_pct(rated, answers)} ответов)")
    print(f"  👍 / 👎                  {up} / {down}")
    print(f"  доля отрицательных      {_pct(down, rated)} от оценённых")
    if down:
        print("  ↳ разбирать эти диалоги идти в чат: текста ответов в отчёте нет намеренно")


async def _by_surface(db, since: datetime) -> None:
    """Разрез по поверхностям обязателен: в CRM спрашивает сотрудник про свою
    студию, в мессенджерах — посторонний человек про расписание. Сценарии
    разные, и проблемы у них тоже разные."""
    rows = (await db.execute(
        select(
            AIUsage.surface,
            func.count(),
            func.sum(AIUsage.cost_micro),
            func.avg(AIUsage.iterations),
            func.sum(func.cast(AIUsage.escalated, Integer)),
        )
        .where(AIUsage.created_at >= since, AIUsage.billable.is_(True))
        .group_by(AIUsage.surface)
        .order_by(func.count().desc())
    )).all()

    print("\nВОПРОСЫ ПО ПОВЕРХНОСТЯМ (billable — один вопрос человека)")
    if not rows:
        print("  за период вопросов не было")
        return
    print(f"  {'поверхность':<12} {'вопросов':>9} {'расход':>10} {'ср. цена':>10} "
          f"{'ср. итераций':>13} {'эскалаций':>10}")
    for surface, count, cost, avg_iter, escalated in rows:
        cost = int(cost or 0)
        print(
            f"  {surface:<12} {count:>9} {_money(cost):>10} {_money(cost // max(count, 1)):>10} "
            f"{(avg_iter or 0):>13.1f} {_pct(int(escalated or 0), count):>10}"
        )


async def _stuck(db, since: datetime) -> None:
    total = (await db.execute(
        select(func.count()).select_from(AIUsage)
        .where(AIUsage.created_at >= since, AIUsage.billable.is_(True))
    )).scalar_one()
    stuck = (await db.execute(
        select(func.count()).select_from(AIUsage)
        .where(AIUsage.created_at >= since, AIUsage.iterations >= _MAX_ITERATIONS)
    )).scalar_one()
    print(f"\n  вопросов, упёршихся в потолок {_MAX_ITERATIONS} итераций: "
          f"{stuck} ({_pct(stuck, total)})")
    if stuck:
        print("  ↳ это места, где ассистент «тупит»: добавьте такие вопросы в набор задачи 19")


async def _tools(db, since: datetime) -> None:
    rows = (await db.execute(
        select(AIUsage.tools)
        .where(AIUsage.created_at >= since, AIUsage.tools.isnot(None))
    )).scalars().all()
    counter: dict[str, int] = {}
    for row in rows:
        for name in row.split(","):
            name = name.strip()
            if name:
                counter[name] = counter.get(name, 0) + 1

    print("\nЧАЩЕ ВСЕГО ВЫЗЫВАЛИСЬ")
    if not counter:
        print("  инструменты не вызывались (или строки от версии до задачи 18)")
        return
    for name, n in sorted(counter.items(), key=lambda kv: -kv[1])[:_TOP]:
        print(f"  {name:<28} {n}")


async def _studios(db, since: datetime) -> None:
    rows = (await db.execute(
        select(AIUsage.studio_id, func.count(), func.sum(AIUsage.cost_micro))
        .where(AIUsage.created_at >= since)
        .group_by(AIUsage.studio_id)
        .order_by(func.sum(AIUsage.cost_micro).desc())
        .limit(_TOP)
    )).all()
    print("\nТОП СТУДИЙ ПО РАСХОДУ")
    if not rows:
        print("  расхода за период нет")
        return
    for studio_id, calls, cost in rows:
        print(f"  студия {studio_id:<8} вызовов модели {calls:<6} {_money(int(cost or 0))}")


async def _run(days: int) -> None:
    since = datetime.utcnow() - timedelta(days=days)
    print(f"Отчёт качества Velora AI за {days} дн. (с {since.date()})")
    print("=" * 72)
    async with async_session_maker() as db:
        await _ratings(db, since)
        await _by_surface(db, since)
        await _stuck(db, since)
        await _tools(db, since)
        await _studios(db, since)
    print("\nРегламент: раз в месяц смотреть 👎-ответы и добавлять из них случаи")
    print("в набор scripts/ai_eval.py — иначе набор навсегда останется августовским.")


def main() -> None:
    days = 30
    if len(sys.argv) > 1:
        try:
            days = int(sys.argv[1])
        except ValueError:
            print(f"Ожидалось число дней, пришло {sys.argv[1]!r}")
            raise SystemExit(2)
    asyncio.run(_run(days))


if __name__ == "__main__":
    main()

"""Общие определения метрик платформы.

Файл существует ради одного: чтобы «платящая студия» на экране обзора и на
экране аккаунтов означала одно и то же. Как только определение продублировано
в двух запросах, два экрана начинают показывать разные числа, и доверие к
обоим пропадает.
"""
from datetime import datetime, timedelta

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PlatformRevenueLedger


def period_bounds(days: int) -> tuple[datetime, datetime]:
    """Границы периода. `days` зажат в 1..365: запрос с days=100000 иначе
    превращается в полный скан, а с days=0 — в пустой ответ без объяснения."""
    safe = max(1, min(int(days or 30), 365))
    end = datetime.utcnow()
    return end - timedelta(days=safe), end


def paying_studio_ids_stmt():
    """Студии, реально заплатившие платформе.

    Источник — журнал поступлений, а НЕ статус счёта: журнал по определению
    пишется только по факту прихода денег, а счёт со статусом paid бывает
    выставлен и оплачен разными путями.
    """
    return select(distinct(PlatformRevenueLedger.studio_id))


async def paying_studio_ids(db: AsyncSession) -> set[int]:
    return set((await db.execute(paying_studio_ids_stmt())).scalars().all())


async def money_by_currency(
    db: AsyncSession, start: datetime, end: datetime
) -> list[dict]:
    """Поступления за период, РАЗБИВКОЙ по валютам.

    Одним числом эти суммы не выражаются: в журнале лежат и евроценты, и
    галержи, и сложить их — значит напечатать величину, которой не существует.
    """
    rows = (
        await db.execute(
            select(
                PlatformRevenueLedger.currency,
                func.sum(PlatformRevenueLedger.amount),
                func.count(PlatformRevenueLedger.id),
            )
            .where(
                PlatformRevenueLedger.occurred_at >= start,
                PlatformRevenueLedger.occurred_at <= end,
            )
            .group_by(PlatformRevenueLedger.currency)
            .order_by(func.sum(PlatformRevenueLedger.amount).desc())
        )
    ).all()
    return [
        {"currency": currency, "amount": int(total or 0), "payments": int(count or 0)}
        for currency, total, count in rows
    ]

"""EPIC R2 задача 1: GET /analytics/sales — сводка вкладки «Продажи».

Услуга — один из продуктов (абонементы/разовые/сертификаты/товары), всё
считается по in-операциям (Operation.type == 'in'), scoped через op_conds.
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role, StudioContext
from models import Operation, Product
from routers.loyalty.segments import compute_renewal_stats, fetch_subscription_rows
from schemas.analytics.reports import (
    BuyerTypeGroup,
    BuyerTypeSlice,
    CategorySlice,
    Insight,
    Kpi,
    MethodSlice,
    ProductRow,
    SalesKpi,
    SalesRead,
    SalesSeriesPoint,
)
from ._filters import ReportFilters, op_conds, pct, prev_range, report_filters

router = APIRouter()

TRIAL_NAME_PATTERN = "пробн|trial"  # Postgres ~* — уже case-insensitive
TRIAL_MAX_CONVERSION_PCT = 25.0
FASTEST_GROWING_MIN_SOLD = 5
RENEWALS_LOW_THRESHOLD_PCT = 50.0
RENEWALS_LOW_MIN_EXPIRED = 5


async def _revenue_count(f: ReportFilters, sid: int, db: AsyncSession) -> tuple[int, int]:
    row = (await db.execute(
        select(func.coalesce(func.sum(Operation.amount), 0), func.count(Operation.id))
        .where(*op_conds(f, sid), Operation.type == "in")
    )).one()
    return int(row[0]), int(row[1])


async def _repeat_share_pct(f: ReportFilters, sid: int, db: AsyncSession) -> float:
    """Доля клиентов с ≥2 in-операциями за период среди клиентов с ≥1."""
    rows = (await db.execute(
        select(Operation.client_id, func.count(Operation.id))
        .where(*op_conds(f, sid), Operation.type == "in", Operation.client_id.isnot(None))
        .group_by(Operation.client_id)
    )).all()
    if not rows:
        return 0.0
    repeat = sum(1 for _cid, cnt in rows if cnt >= 2)
    return round(repeat / len(rows) * 100, 1)


async def _renewals_pct_for_period(f: ReportFilters, sid: int, db: AsyncSession) -> tuple[float | None, int]:
    """renewals_pct за период: доля продливших среди клиентов, чей ПЕРВЫЙ
    абонемент истёк в date_from..date_to (т.е. окно принятия решения "продлить"
    пришлось на период). Ядро расчёта — общее с /loyalty/retention (не копия)."""
    rows = await fetch_subscription_rows(sid, db)
    if not rows:
        return None, 0
    stats = compute_renewal_stats(rows, today=f.date_to)
    expired_in_period = [
        c for c in stats.by_client.values()
        if c.eligible and f.date_from <= c.first_expires <= f.date_to
    ]
    expired_count = len(expired_in_period)
    if expired_count == 0:
        return None, 0
    renewed_in_period = sum(1 for c in expired_in_period if c.renewed)
    return round(renewed_in_period / expired_count * 100, 1), expired_count


async def _by_category(f: ReportFilters, sid: int, db: AsyncSession) -> list[CategorySlice]:
    rows = (await db.execute(
        select(Operation.category, func.coalesce(func.sum(Operation.amount), 0), func.count(Operation.id))
        .where(*op_conds(f, sid), Operation.type == "in")
        .group_by(Operation.category)
        .order_by(func.sum(Operation.amount).desc())
    )).all()
    total = sum(int(amount) for _cat, amount, _cnt in rows)
    return [
        CategorySlice(
            category=category, amount=int(amount), count=int(cnt),
            share_pct=round(int(amount) / total * 100, 1) if total else 0.0,
        )
        for category, amount, cnt in rows
    ]


async def _by_method(f: ReportFilters, sid: int, db: AsyncSession) -> list[MethodSlice]:
    rows = (await db.execute(
        select(Operation.method, func.coalesce(func.sum(Operation.amount), 0), func.count(Operation.id))
        .where(*op_conds(f, sid), Operation.type == "in")
        .group_by(Operation.method)
        .order_by(func.sum(Operation.amount).desc())
    )).all()
    total = sum(int(amount) for _method, amount, _cnt in rows)
    return [
        MethodSlice(
            method=method, amount=int(amount), count=int(cnt),
            share_pct=round(int(amount) / total * 100, 1) if total else 0.0,
        )
        for method, amount, cnt in rows
    ]


async def _by_buyer_type(f: ReportFilters, sid: int, db: AsyncSession) -> BuyerTypeSlice:
    """new = первая in-операция клиента (по всей истории) попадает в период."""
    rows = (await db.execute(
        select(Operation.client_id, Operation.amount)
        .where(*op_conds(f, sid), Operation.type == "in")
    )).all()

    no_client = [amount for cid, amount in rows if cid is None]
    client_ids = {cid for cid, _amount in rows if cid is not None}

    first_purchase: dict[int, date] = {}
    if client_ids:
        first_rows = (await db.execute(
            select(Operation.client_id, func.min(Operation.op_date))
            .where(
                Operation.studio_id == sid,
                Operation.type == "in",
                Operation.client_id.in_(client_ids),
            )
            .group_by(Operation.client_id)
        )).all()
        first_purchase = {cid: first_date for cid, first_date in first_rows}

    new_amounts: list[int] = []
    returning_amounts: list[int] = []
    for cid, amount in rows:
        if cid is None:
            continue
        if first_purchase[cid] >= f.date_from:
            new_amounts.append(amount)
        else:
            returning_amounts.append(amount)

    return BuyerTypeSlice(
        new=BuyerTypeGroup(amount=int(sum(new_amounts)), count=len(new_amounts)),
        returning=BuyerTypeGroup(amount=int(sum(returning_amounts)), count=len(returning_amounts)),
        no_client=BuyerTypeGroup(amount=int(sum(no_client)), count=len(no_client)),
    )


async def _product_rows(f: ReportFilters, sid: int, prev_from: date, prev_to: date, db: AsyncSession) -> list[ProductRow]:
    rows = (await db.execute(
        select(
            Operation.product_id, Product.name,
            func.count(Operation.id), func.coalesce(func.sum(Operation.amount), 0),
        )
        .select_from(Operation)
        .outerjoin(Product, Operation.product_id == Product.id)
        .where(*op_conds(f, sid), Operation.type == "in")
        .group_by(Operation.product_id, Product.name)
        .order_by(func.sum(Operation.amount).desc())
    )).all()

    prev_f = ReportFilters(
        date_from=prev_from, date_to=prev_to,
        branch_id=f.branch_id, hall_id=f.hall_id, trainer_id=f.trainer_id, service_id=f.service_id,
    )
    prev_revenue_rows = (await db.execute(
        select(Operation.product_id, func.coalesce(func.sum(Operation.amount), 0))
        .where(*op_conds(prev_f, sid), Operation.type == "in")
        .group_by(Operation.product_id)
    )).all()
    prev_revenue = {pid: int(amount) for pid, amount in prev_revenue_rows}

    repeat_rows = (await db.execute(
        select(Operation.product_id, Operation.client_id, func.count(Operation.id))
        .where(*op_conds(f, sid), Operation.type == "in", Operation.client_id.isnot(None))
        .group_by(Operation.product_id, Operation.client_id)
    )).all()
    buyers_by_product: dict[int | None, list[int]] = {}
    for pid, _cid, cnt in repeat_rows:
        buyers_by_product.setdefault(pid, []).append(int(cnt))

    result: list[ProductRow] = []
    for product_id, name, sold, revenue in rows:
        sold, revenue = int(sold), int(revenue)
        buyers = buyers_by_product.get(product_id, [])
        repeat_share = round(sum(1 for c in buyers if c >= 2) / len(buyers) * 100, 1) if buyers else 0.0
        prev_rev = prev_revenue.get(product_id, 0)
        result.append(ProductRow(
            product_id=product_id,
            name=name,
            sold=sold,
            revenue=revenue,
            avg_check=revenue // sold if sold else 0,
            repeat_share_pct=repeat_share,
            trend_pct=pct(revenue, prev_rev),
        ))
    return result


async def _insight_trial_low_conversion(f: ReportFilters, sid: int, db: AsyncSession) -> Insight | None:
    """Покупатели пробного продукта за период и доля тех, кто ЗАТЕМ (op_date
    подписки строго после покупки пробного) купил абонемент — тоже за период."""
    trial = (await db.execute(
        select(Product.id).where(Product.studio_id == sid, Product.name.op("~*")(TRIAL_NAME_PATTERN)).limit(1)
    )).scalar_one_or_none()
    if trial is None:
        return None

    buyer_rows = (await db.execute(
        select(Operation.client_id, func.min(Operation.op_date)).where(
            *op_conds(f, sid), Operation.type == "in",
            Operation.product_id == trial, Operation.client_id.isnot(None),
        ).group_by(Operation.client_id)
    )).all()
    if not buyer_rows:
        return None
    trial_date_by_client = {cid: trial_date for cid, trial_date in buyer_rows}

    sub_rows = (await db.execute(
        select(Operation.client_id, func.min(Operation.op_date)).where(
            Operation.studio_id == sid, Operation.type == "in",
            Operation.client_id.in_(trial_date_by_client.keys()),
            Operation.category == "subscriptions",
            Operation.op_date <= f.date_to,
        ).group_by(Operation.client_id)
    )).all()

    converted = sum(
        1 for cid, sub_date in sub_rows
        if sub_date > trial_date_by_client[cid]
    )

    conv_pct = round(converted / len(trial_date_by_client) * 100, 1)
    if conv_pct >= TRIAL_MAX_CONVERSION_PCT:
        return None
    return Insight(
        key="trial_low_conversion",
        severity="warning",
        params={"pct": conv_pct, "buyers": len(trial_date_by_client)},
        action="open_campaign",
        action_params={"segment": "trial_no_convert"},
    )


def _insight_fastest_growing_product(products: list[ProductRow]) -> Insight | None:
    candidates = [p for p in products if p.sold >= FASTEST_GROWING_MIN_SOLD and p.trend_pct is not None]
    if not candidates:
        return None
    best = max(candidates, key=lambda p: p.trend_pct)
    if best.trend_pct <= 0:
        return None
    return Insight(
        key="fastest_growing_product",
        severity="info",
        params={"name": best.name, "pct": best.trend_pct},
        action="open_booking",
        action_params={},
    )


def _insight_renewals_low(renewals_pct: float | None, expired_count: int) -> Insight | None:
    if renewals_pct is None or expired_count < RENEWALS_LOW_MIN_EXPIRED:
        return None
    if renewals_pct >= RENEWALS_LOW_THRESHOLD_PCT:
        return None
    return Insight(
        key="renewals_low",
        severity="warning",
        params={"pct": renewals_pct},
        action="open_campaign",
        action_params={"segment": "sub_ending"},
    )


@router.get("/sales", response_model=SalesRead)
async def analytics_sales(
    f: ReportFilters = Depends(report_filters),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    sid = ctx.studio_id
    prev_from, prev_to = prev_range(f)
    prev_f = ReportFilters(
        date_from=prev_from, date_to=prev_to,
        branch_id=f.branch_id, hall_id=f.hall_id, trainer_id=f.trainer_id, service_id=f.service_id,
    )

    revenue, sales_count = await _revenue_count(f, sid, db)
    prev_revenue, prev_sales_count = await _revenue_count(prev_f, sid, db)
    avg_check = revenue // sales_count if sales_count else 0
    prev_avg_check = prev_revenue // prev_sales_count if prev_sales_count else 0

    repeat_share = await _repeat_share_pct(f, sid, db)
    prev_repeat_share = await _repeat_share_pct(prev_f, sid, db)

    renewals_pct, expired_count = await _renewals_pct_for_period(f, sid, db)
    prev_renewals_pct, _prev_expired = await _renewals_pct_for_period(prev_f, sid, db)

    kpi = SalesKpi(
        revenue=Kpi(value=float(revenue), prev_pct=pct(revenue, prev_revenue)),
        sales_count=Kpi(value=float(sales_count), prev_pct=pct(sales_count, prev_sales_count)),
        avg_check=Kpi(value=float(avg_check), prev_pct=pct(avg_check, prev_avg_check)),
        repeat_share_pct=Kpi(value=repeat_share, prev_pct=pct(repeat_share, prev_repeat_share)),
        renewals_pct=Kpi(
            value=renewals_pct if renewals_pct is not None else 0.0,
            prev_pct=pct(renewals_pct, prev_renewals_pct) if renewals_pct is not None and prev_renewals_pct is not None else None,
        ),
    )

    by_category = await _by_category(f, sid, db)
    by_method = await _by_method(f, sid, db)
    by_buyer_type = await _by_buyer_type(f, sid, db)
    products = await _product_rows(f, sid, prev_from, prev_to, db)

    insights: list[Insight] = []
    for insight in (
        await _insight_trial_low_conversion(f, sid, db),
        _insight_fastest_growing_product(products),
        _insight_renewals_low(renewals_pct, expired_count),
    ):
        if insight is not None:
            insights.append(insight)

    return SalesRead(
        kpi=kpi,
        by_category=by_category,
        by_method=by_method,
        by_buyer_type=by_buyer_type,
        products=products,
        insights=insights[:3],
    )


@router.get("/sales/series", response_model=list[SalesSeriesPoint])
async def analytics_sales_series(
    group: Literal["day", "week"] = Query("day"),
    f: ReportFilters = Depends(report_filters),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    bucket = func.date_trunc(group, Operation.op_date)
    rows = (await db.execute(
        select(
            bucket.label("period"),
            func.coalesce(func.sum(Operation.amount), 0),
            func.count(Operation.id),
        )
        .where(*op_conds(f, ctx.studio_id), Operation.type == "in")
        .group_by("period")
        .order_by("period")
    )).all()
    return [
        SalesSeriesPoint(period=period.date().isoformat(), revenue=int(revenue), sales_count=int(count))
        for period, revenue, count in rows
    ]

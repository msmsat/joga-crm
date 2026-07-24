"""EPIC R2 задача 1: GET /analytics/sales. Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_analytics_sales
"""
import asyncio
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Client, ClientSubscription, Operation, Product, Studio
from routers.analytics.sales import analytics_sales, analytics_sales_series
from routers.analytics._filters import ReportFilters


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(name="TEST-SALES"); db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        sub_product = Product(studio_id=sid, name="Абонемент 8", product_type="subscription", price=8000)
        single_product = Product(studio_id=sid, name="Разовое", product_type="single", price=1500)
        db.add_all([sub_product, single_product]); await db.flush()

        cNew = Client(studio_id=sid, name="New"); cReturning = Client(studio_id=sid, name="Returning")
        db.add_all([cNew, cReturning]); await db.flush()

        # cReturning купил раньше периода — первая покупка вне окна теста
        db.add(Operation(
            studio_id=sid, client_id=cReturning.id, product_id=sub_product.id, trainer_id=None,
            type="in", title="Абонемент 8", amount=8000, op_date=today - timedelta(days=60),
            category="subscriptions", method="card",
        ))
        # обе покупки внутри периода теста (today-10..today)
        db.add(Operation(
            studio_id=sid, client_id=cNew.id, product_id=single_product.id, trainer_id=None,
            type="in", title="Разовое", amount=1500, op_date=today - timedelta(days=5),
            category="services", method="cash",
        ))
        db.add(Operation(
            studio_id=sid, client_id=cReturning.id, product_id=sub_product.id, trainer_id=None,
            type="in", title="Абонемент 8", amount=8000, op_date=today - timedelta(days=3),
            category="subscriptions", method="card",
        ))
        # операция без клиента — должна честно попасть в no_client, не сломать суммы
        db.add(Operation(
            studio_id=sid, client_id=None, product_id=None, trainer_id=None,
            type="in", title="Прочее", amount=500, op_date=today - timedelta(days=2),
            category="services", method="cash",
        ))
        await db.commit()
        return sid


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        cids = (await db.execute(
            select(Client.id).where(Client.studio_id == sid)
        )).scalars().all()
        await db.execute(delete(Operation).where(Operation.studio_id == sid))
        if cids:
            await db.execute(delete(ClientSubscription).where(ClientSubscription.client_id.in_(cids)))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Product).where(Product.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid = await _seed()
    try:
        today = date.today()
        f = ReportFilters(
            date_from=today - timedelta(days=10), date_to=today,
            branch_id=None, hall_id=None, trainer_id=None, service_id=None,
        )
        ctx = StudioContext(user=None, studio_id=sid, role="owner")
        async with async_session_maker() as db:
            r = await analytics_sales(f=f, ctx=ctx, db=db)

        # KPI выручка = 1500 + 8000 + 500 = 10000, 3 продажи
        assert r.kpi.revenue.value == 10000, r.kpi.revenue.value
        assert r.kpi.sales_count.value == 3, r.kpi.sales_count.value

        # products-таблица + "без продукта" должна сходиться с KPI-выручкой
        products_total = sum(p.revenue for p in r.products)
        assert products_total == r.kpi.revenue.value, (products_total, r.kpi.revenue.value)
        no_product_rows = [p for p in r.products if p.product_id is None]
        assert len(no_product_rows) == 1 and no_product_rows[0].name is None

        # by_buyer_type: cNew первая покупка в периоде → new; cReturning первая покупка
        # была раньше периода → returning; безымянная операция → no_client
        assert r.by_buyer_type.new.amount == 1500, r.by_buyer_type.new.amount
        assert r.by_buyer_type.returning.amount == 8000, r.by_buyer_type.returning.amount
        assert r.by_buyer_type.no_client.amount == 500, r.by_buyer_type.no_client.amount

        # by_category/by_method суммы сходятся с выручкой
        assert sum(c.amount for c in r.by_category) == 10000
        assert sum(m.amount for m in r.by_method) == 10000

        # renewals_pct: нет абонементов с created_at в фикстуре → None → KPI value 0.0, prev_pct None
        assert r.kpi.renewals_pct.value == 0.0
        assert r.kpi.renewals_pct.prev_pct is None

        async with async_session_maker() as db:
            series = await analytics_sales_series(group="day", f=f, ctx=ctx, db=db)
        assert sum(p.revenue for p in series) == 10000, sum(p.revenue for p in series)
        assert sum(p.sales_count for p in series) == 3
        assert len(series) == 11  # полная ось периода (today-10..today), не только 3 дня с данными
    finally:
        await _cleanup(sid)


def test_analytics_sales():
    asyncio.run(_run())


if __name__ == "__main__":
    test_analytics_sales()
    print("ALL PASS")

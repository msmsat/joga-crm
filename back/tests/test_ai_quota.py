"""Квота ИИ (эпик AI-5, задача 3): месячный запас обращений и денежный потолок.

Проверяем то, что ломается молча и стоит денег: студия без тарифа с безлимитным
ИИ, процентная студия с 429 на первом же вопросе, записи прошлого месяца в
текущем счётчике, резерв владельца, который не отсекает клиентского агента.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_quota
"""
import asyncio
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from models import AIUsage, Studio, StudioBillingPlan
from services.ai_quota import _limits_for, ai_quota_status, check_ai_quota

_STUDIO_NAME = "TEST-AI-QUOTA"


async def _seed(plan_name: str | None, billing_mode: str = "subscription") -> int:
    async with async_session_maker() as db:
        studio = Studio(name=_STUDIO_NAME)
        db.add(studio)
        await db.flush()
        if plan_name is not None:
            db.add(StudioBillingPlan(
                studio_id=studio.id,
                plan_name=plan_name,
                billing_mode=billing_mode,
                # У процентного тарифа срок навсегда в прошлом — проверка квоты
                # не имеет права на нём спотыкаться (plan_limits.py:50-54).
                expires_at=datetime.utcnow() - timedelta(days=365),
            ))
        await db.commit()
        return studio.id


async def _cleanup(studio_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(AIUsage).where(AIUsage.studio_id == studio_id))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id))
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.commit()


async def _add_usage(studio_id: int, count: int, *, billable=True, cost=0, days_ago=0) -> None:
    when = datetime.utcnow() - timedelta(days=days_ago)
    async with async_session_maker() as db:
        for _ in range(count):
            db.add(AIUsage(
                studio_id=studio_id, surface="crm", model="google/gemini-3-flash",
                prompt_tokens=0, cached_tokens=0, completion_tokens=0,
                cost_micro=cost, billable=billable, created_at=when,
            ))
        await db.commit()


async def _expect_429(studio_id: int, code: str, reserve_pct: int = 0) -> None:
    async with async_session_maker() as db:
        try:
            await check_ai_quota(db, studio_id, reserve_pct=reserve_pct)
        except HTTPException as exc:
            assert exc.status_code == 429, exc.status_code
            assert exc.detail["code"] == code, exc.detail
            return
    raise AssertionError(f"ожидали 429 {code}, запрос прошёл")


async def _expect_ok(studio_id: int, reserve_pct: int = 0) -> None:
    async with async_session_maker() as db:
        await check_ai_quota(db, studio_id, reserve_pct=reserve_pct)


async def _run_requests_limit():
    """Старт: 300 billable-записей -> 301-й запрос даёт 429; прошлый месяц не в счёт."""
    studio_id = await _seed("start")
    try:
        await _expect_ok(studio_id)
        await _add_usage(studio_id, 299)
        await _expect_ok(studio_id)
        await _add_usage(studio_id, 1)
        await _expect_429(studio_id, "ai_quota_exceeded")

        async with async_session_maker() as db:
            used, limit = await ai_quota_status(db, studio_id)
        assert (used, limit) == (300, 300), (used, limit)
    finally:
        await _cleanup(studio_id)


async def _run_ignores_other_rows():
    """Не-billable вызовы цикла и записи прошлого месяца квоту не жгут."""
    studio_id = await _seed("start")
    try:
        # 40 дней назад — гарантированно прошлый календарный месяц.
        await _add_usage(studio_id, 400, days_ago=40)
        await _add_usage(studio_id, 400, billable=False)
        async with async_session_maker() as db:
            used, _ = await ai_quota_status(db, studio_id)
        assert used == 0, used
        await _expect_ok(studio_id)
    finally:
        await _cleanup(studio_id)


async def _run_percent_plan():
    """Процентная студия не падает на проверке подписки и живёт по лимитам Старта."""
    studio_id = await _seed("pro", billing_mode="percent")
    try:
        await _expect_ok(studio_id)
        async with async_session_maker() as db:
            _, limit = await ai_quota_status(db, studio_id)
        assert limit == 300, limit   # Старт, а не Pro из plan_name
    finally:
        await _cleanup(studio_id)


async def _run_no_plan_row():
    """Студия без строки StudioBillingPlan получает отказ, а не безлимит."""
    studio_id = await _seed(None)
    try:
        await _expect_429(studio_id, "ai_quota_exceeded")
        async with async_session_maker() as db:
            used, limit = await ai_quota_status(db, studio_id)
        assert (used, limit) == (0, 0), (used, limit)
    finally:
        await _cleanup(studio_id)


async def _run_cost_cap():
    """Денежный потолок срабатывает до вызова модели и отличим по коду."""
    studio_id = await _seed("start")
    try:
        # Одна строка, но дорогая: вопросов мало, денег потрачено сверх потолка.
        await _add_usage(studio_id, 1, billable=False, cost=5_000_000)
        await _expect_429(studio_id, "ai_cost_cap")
    finally:
        await _cleanup(studio_id)


async def _run_reserve():
    """reserve_pct=20 отсекает клиентского агента раньше, чем владельца."""
    studio_id = await _seed("start")
    try:
        await _add_usage(studio_id, 240)          # ровно 80 % от 300
        await _expect_429(studio_id, "ai_quota_exceeded", reserve_pct=20)
        await _expect_ok(studio_id)               # владельцу запас ещё остался
    finally:
        await _cleanup(studio_id)


def test_ai_quota_plan_states():
    """Разбор состояний тарифа — без БД: в двух случаях из трёх первая редакция
    эпика давала безлимитный ИИ."""
    class _P:
        def __init__(self, mode, name):
            self.billing_mode, self.plan_name = mode, name

    assert _limits_for(None)["ai_requests"] == 0
    assert _limits_for(_P("subscription", "free_trial"))["ai_requests"] == 1500
    assert _limits_for(_P("percent", "pro"))["ai_requests"] == 300
    assert _limits_for(_P("combo", "business"))["ai_requests"] == 5000
    assert _limits_for(_P("subscription", "none"))["ai_requests"] == 300


def test_ai_quota_requests_limit():
    asyncio.run(_run_requests_limit())


def test_ai_quota_ignores_other_rows():
    asyncio.run(_run_ignores_other_rows())


def test_ai_quota_percent_plan():
    asyncio.run(_run_percent_plan())


def test_ai_quota_no_plan_row():
    asyncio.run(_run_no_plan_row())


def test_ai_quota_cost_cap():
    asyncio.run(_run_cost_cap())


def test_ai_quota_reserve():
    asyncio.run(_run_reserve())


if __name__ == "__main__":
    test_ai_quota_plan_states()
    for fn in (
        _run_requests_limit, _run_ignores_other_rows, _run_percent_plan,
        _run_no_plan_row, _run_cost_cap, _run_reserve,
    ):
        asyncio.run(fn())
    print("ALL PASS")

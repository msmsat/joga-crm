"""Квота CRM-ассистента, общая для студии. ИИ-админ ее не расходует.

Платные тарифы: календарный месяц UTC. Триал: весь пробный период.
Один принятый запрос = одна billable-строка, независимо от числа LLM-шагов.
Себестоимость учитывается, но не сокращает обещанное число запросов.
"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_maker
from models import AIUsage, StudioBillingPlan
from routers.billing.plans import AI_TRIAL_REQUESTS, AI_PERCENT_REQUESTS, PLANS, canon


def _month_start() -> datetime:
    return datetime.now(timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0, tzinfo=None)


def _is_trial(plan: StudioBillingPlan | None) -> bool:
    # trial_started_at остается и после оплаты; проверяем до canon(free_trial).
    # На проценте plan_name/status могут остаться от триала: режим применяется
    # без подписки и имеет приоритет, как в существующем subscription gate.
    return (plan is not None and plan.billing_mode != "percent"
            and (plan.plan_name == "free_trial" or plan.status == "trial"))


def _limits_for(plan: StudioBillingPlan | None) -> dict:
    if plan is None:
        return {"ai_requests": 0}
    if _is_trial(plan):
        return {"ai_requests": AI_TRIAL_REQUESTS}
    if plan.billing_mode == "percent":
        return {"ai_requests": AI_PERCENT_REQUESTS}
    limits = PLANS.get(canon(plan.plan_name))
    return {"ai_requests": limits["limits"]["ai_requests"] if limits else 0}


async def _plan(db: AsyncSession, studio_id: int):
    return (await db.execute(select(StudioBillingPlan).where(
        StudioBillingPlan.studio_id == studio_id
    ).execution_options(populate_existing=True))).scalar_one_or_none()


async def _quota_for(db: AsyncSession, studio_id: int, plan) -> dict:
    trial = _is_trial(plan)
    since = plan.trial_started_at if trial else _month_start()
    query = select(func.count()).select_from(AIUsage).where(
        AIUsage.studio_id == studio_id,
        AIUsage.surface == "crm",
        AIUsage.billable.is_(True),
    )
    if since is not None:
        query = query.where(AIUsage.created_at >= since)
    used = (await db.execute(query)).scalar_one()
    return {"used": used, "limit": _limits_for(plan)["ai_requests"], "trial": trial}


async def ai_quota_details(db: AsyncSession, studio_id: int) -> dict:
    return await _quota_for(db, studio_id, await _plan(db, studio_id))


async def ai_quota_status(db: AsyncSession, studio_id: int) -> tuple[int, int]:
    quota = await ai_quota_details(db, studio_id)
    return quota["used"], quota["limit"]


def _check(quota: dict) -> None:
    if quota["used"] >= quota["limit"]:
        raise HTTPException(status_code=429, detail={
            "code": "ai_trial_exhausted" if quota["trial"] else "ai_quota_exceeded",
            "message": "Лимит запросов к ИИ-ассистенту исчерпан.",
            "used": quota["used"], "limit": quota["limit"],
        })


async def check_ai_quota(db: AsyncSession, studio_id: int) -> None:
    """Read-only проверка. Для допуска платного вызова нужен admit_ai_request."""
    _check(await ai_quota_details(db, studio_id))


async def admit_ai_request(studio_id: int, user_id: int | None) -> tuple[int, str]:
    """Атомарно занять запрос ДО сети отдельной короткой транзакцией.

    Замок тарифа сериализует последние запросы между процессами. Первый ответ
    провайдера заполнит эту строку через record_usage. Сбой уже принятого
    запроса не позволяет обходить лимит повторами. Смена тарифа не стирает учет.
    """
    async with async_session_maker() as db:
        plan = (await db.execute(select(StudioBillingPlan).where(
            StudioBillingPlan.studio_id == studio_id
        ).with_for_update())).scalar_one_or_none()
        _check(await _quota_for(db, studio_id, plan))
        request_id = uuid.uuid4().hex
        row = AIUsage(studio_id=studio_id, user_id=user_id, surface="crm",
                      model="pending", billable=True, request_id=request_id,
                      created_at=datetime.now(timezone.utc).replace(tzinfo=None))
        db.add(row)
        await db.flush()
        row_id = row.id
        await db.commit()
        return row_id, request_id

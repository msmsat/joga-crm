"""Лимиты тарифа (задача 8): не дать превысить каталожный потолок сотрудников/клиентов.

Источник цифр — каталог plans.py (задача 2). Business (None) = безлимит.
free_trial даёт лимиты Pro. План none/отсутствует и истёкшая подписка — территория
глобального гейта 8b (require_active_subscription отдаёт 402 раньше, чем дойдёт сюда);
здесь на всякий случай тоже блокируем истёкшую, чтобы лимит не обходился при выключенном гейте.
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import Client, StudioBillingPlan, StudioMember
from routers.billing.plans import PLANS

# entity -> (модель, колонка studio_id, ключ лимита в каталоге, что показать юзеру)
_ENTITIES = {
    "staff":   (StudioMember, StudioMember.studio_id, "staff",   "сотрудников"),
    "clients": (Client,       Client.studio_id,       "clients", "клиентов"),
}


def _limit_for(plan_name: str, entity: str) -> int | None:
    """Потолок для плана и сущности. None = безлимит. free_trial → лимиты Pro."""
    plan_id = "pro" if plan_name == "free_trial" else plan_name
    plan = PLANS.get(plan_id)
    if plan is None:  # неизвестный план (none и пр.) — лимит не наш вопрос, пусть решает гейт 8b
        return None
    return plan["limits"][entity]


async def check_plan_limit(db: AsyncSession, studio_id: int, entity: str) -> None:
    """Кинуть 403 limit_exceeded, если создание превысит лимит тарифа. Иначе — тихо."""
    model, studio_col, limit_key, noun = _ENTITIES[entity]

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    if plan is None:
        return  # до онбординга строки нет — доступ закрывает гейт 8b, не лимиты

    if plan.expires_at is not None and plan.expires_at < datetime.utcnow():
        raise HTTPException(status_code=403, detail={
            "code": "subscription_expired",
            "message": "Подписка истекла — продлите тариф, чтобы добавлять записи.",
        })

    limit = _limit_for(plan.plan_name, entity)
    if limit is None:
        return  # безлимит (Business) или неизвестный план

    count = (await db.execute(
        select(func.count()).select_from(model).where(studio_col == studio_id)
    )).scalar() or 0

    if count >= limit:
        raise HTTPException(status_code=403, detail={
            "code": "limit_exceeded",
            "message": f"Достигнут лимит тарифа: не более {limit} {noun}. Улучшите тариф.",
        })

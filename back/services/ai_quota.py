"""Месячная квота ИИ (эпик AI-5, задача 3).

Два потолка, кончается тот, что раньше:
  * `ai_requests`   — число обращений (billable-строк AIUsage) за календарный месяц;
  * `ai_cost_micro` — себестоимость в микро-$ за тот же месяц (решение 9).

Второй нужен потому, что стоимость обращения различается в 6 раз: 5000 вопросов
на Business по FAST — это ~21 % MRR, а если каждый уйдёт в эскалацию — больше,
чем платит тариф. Это страховка от аномалии, а не рабочий лимит: в норме студия
упирается в число вопросов.

# ponytail: календарный месяц вместо периода подписки — на месяц-в-месяц оплате
# совпадает; привязать к expires_at, если появятся длинные периоды со сдвигом.
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import AIUsage, StudioBillingPlan
from routers.billing.plans import PLANS

# Студия без строки StudioBillingPlan (до онбординга) не получает ИИ вовсе.
# check_plan_limit в таком случае пускает — у лимитов сотрудников это безопасно,
# у денег нет: «нет тарифа = безлимитный ИИ» — дыра в деньгах.
_NO_PLAN = {"ai_requests": 0, "ai_cost_micro": 0}


def _month_start() -> datetime:
    now = datetime.utcnow()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _limits_for(plan: StudioBillingPlan | None) -> dict:
    """Лимиты ИИ по состоянию тарифа. Дату подписки здесь не проверяем: это
    territория гейта require_active_subscription, а у тарифа «только процент»
    expires_at навсегда в прошлом — своя проверка выдала бы ему 429 на первом
    же вопросе (та же ловушка, что в plan_limits.py:50-54)."""
    if plan is None:
        return _NO_PLAN
    if plan.billing_mode == "percent":
        # Подписки нет, платит оборотом — по нижней ступени.
        return PLANS["start"]["limits"]
    # combo — полноценный тариф с половинным фиксом, лимиты своего plan_name.
    name = "pro" if plan.plan_name == "free_trial" else plan.plan_name
    # Неизвестный план (none и пр.) — Старт, а НЕ безлимит: у денег безлимит опасен.
    return (PLANS.get(name) or PLANS["start"])["limits"]


async def _usage_this_month(db: AsyncSession, studio_id: int) -> tuple[int, int]:
    """(billable-обращений, потрачено микро-$) за календарный месяц.

    Один запрос по составному индексу (studio_id, created_at): считаем вопросы
    и деньги разом — вопросы только по billable, деньги по всем вызовам.
    """
    row = (await db.execute(
        select(
            func.count().filter(AIUsage.billable.is_(True)),
            func.coalesce(func.sum(AIUsage.cost_micro), 0),
        )
        .select_from(AIUsage)
        .where(AIUsage.studio_id == studio_id, AIUsage.created_at >= _month_start())
    )).one()
    return int(row[0] or 0), int(row[1] or 0)


async def ai_quota_status(db: AsyncSession, studio_id: int) -> tuple[int, int]:
    """(использовано, лимит) обращений за календарный месяц — для UI (задача 11)."""
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    used, _ = await _usage_this_month(db, studio_id)
    return used, _limits_for(plan)["ai_requests"]


async def check_ai_quota(db: AsyncSession, studio_id: int, reserve_pct: int = 0) -> None:
    """429, если запас кончился. Тихо — если есть.

    reserve_pct — сколько процентов запаса НЕ отдавать вызывающему. Клиентский
    агент (задача 12) зовёт с reserve_pct=20: последние 20 % месячного запаса
    остаются владельцу, чтобы толпа в директе не выключила ИИ внутри CRM.

    # ponytail: проверка и запись не в одной транзакции — два одновременных
    # вопроса на границе лимита могут пройти оба; перерасход на единицы запросов
    # дешевле блокировки на каждом вопросе.
    """
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    limits = _limits_for(plan)
    share = (100 - max(0, min(reserve_pct, 100))) / 100

    used, spent = await _usage_this_month(db, studio_id)

    limit = limits["ai_requests"]
    if used >= limit * share:
        raise HTTPException(status_code=429, detail={
            "code": "ai_quota_exceeded",
            "message": "Лимит обращений к ИИ на этом тарифе исчерпан. Улучшите тариф.",
            "used": used,
            "limit": limit,
        })

    cap = limits["ai_cost_micro"]
    if spent >= cap * share:
        # Отдельный код, чтобы в логе было видно: упёрлись в деньги, а не в
        # счётчик вопросов. Первое — аномалия для разбора, второе — норма тарифа.
        raise HTTPException(status_code=429, detail={
            "code": "ai_cost_cap",
            "message": "Лимит обращений к ИИ на этом тарифе исчерпан. Улучшите тариф.",
            "used": used,
            "limit": limit,
        })


if __name__ == "__main__":
    # Самопроверка без БД: разбор состояний тарифа — ровно то место, где в первой
    # редакции эпика студия получала безлимитный ИИ в двух случаях из трёх.
    class _P:
        def __init__(self, mode, name):
            self.billing_mode, self.plan_name = mode, name

    assert _limits_for(None)["ai_requests"] == 0                              # нет тарифа — не безлимит
    assert _limits_for(_P("subscription", "free_trial"))["ai_requests"] == 1500   # триал — по Pro
    assert _limits_for(_P("percent", "pro"))["ai_requests"] == 300             # процент — по Старту
    assert _limits_for(_P("combo", "business"))["ai_requests"] == 5000         # комбо — свой план
    assert _limits_for(_P("subscription", "none"))["ai_requests"] == 300       # неизвестный — Старт
    assert _limits_for(_P("subscription", "business"))["ai_cost_micro"] == 31_000_000

    assert _month_start().day == 1 and _month_start().hour == 0
    print("ai_quota self-check ok")

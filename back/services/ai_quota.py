"""Квота ИИ (эпик AI-5, задача 3).

Поверх месячных тарифных лимитов лежит пробный потолок TRIAL_LIMIT — обращения
студии за всё время (см. ниже). Пока он включён, до тарифных потолков дело не
доходит: 150 меньше самой нижней ступени.

Два тарифных потолка, кончается тот, что раньше:
  * `ai_requests`   — число обращений (billable-строк AIUsage) за календарный месяц;
  * `ai_cost_micro` — себестоимость в микро-$ за тот же месяц (решение 9).

Второй нужен потому, что стоимость обращения различается в 6 раз: 5000 вопросов
на Business по FAST — это ~21 % MRR, а если каждый уйдёт в эскалацию — больше,
чем платит тариф. Это страховка от аномалии, а не рабочий лимит: в норме студия
упирается в число вопросов.

# ponytail: календарный месяц вместо периода подписки — на месяц-в-месяц оплате
# совпадает; привязать к expires_at, если появятся длинные периоды со сдвигом.
"""
import os
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import AIUsage, StudioBillingPlan
from routers.billing.plans import PLANS, UNLIMITED, canon

# Пробный потолок поверх тарифного: N обращений на студию ЗА ВСЁ ВРЕМЯ, а не в
# месяц. Пока ассистент не обкатан, тарифные 300–5000 вопросов в месяц — это счёт
# провайдеру за качество, в котором мы сами не уверены. Кончается первым: 150 < 300.
# AI_TRIAL_LIMIT=0 в окружении снимает потолок и возвращает чистые тарифные лимиты.
TRIAL_LIMIT = int(os.getenv("AI_TRIAL_LIMIT") or 150)   # пустая переменная = дефолт, а не падение на старте

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
        # Верхняя ступень: на проценте ступени у студии НЕТ (её не показывает
        # шапка биллинга, карточки тарифов на этой модели не рендерятся, апгрейда
        # нет), а плата идёт долей с оборота — и студия на проценте платит от
        # 39 €/мес до сумм выше Business. Нижняя ступень тут была ошибкой того же
        # рода, что и потолок сотрудников по невидимому plan_name (см.
        # services/plan_limits): «Улучшите тариф» на 300-м вопросе, а улучшать
        # нечего. Числа Business, а не безлимит: потолок себестоимости — страховка
        # от аномалии на деньгах провайдера, её нет НИ У ОДНОГО тарифа (решения
        # 6 и 9 эпика AI-5), и снимать её тарифу с минимальным платежом в 39 €
        # значит разрешить месячный счёт провайдеру больше выручки со студии.
        return PLANS[UNLIMITED]["limits"]
    # combo — полноценный тариф с половинным фиксом, лимиты своего plan_name.
    # Неизвестный план (none и пр.) — нижняя ступень, а НЕ безлимит: у денег
    # безлимит опасен.
    return (PLANS.get(canon(plan.plan_name)) or next(iter(PLANS.values())))["limits"]


async def _usage(db: AsyncSession, studio_id: int, since: datetime | None) -> tuple[int, int]:
    """(billable-обращений, потрачено микро-$) с момента `since`; None — за всё время.

    Один запрос по составному индексу (studio_id, created_at): считаем вопросы
    и деньги разом — вопросы только по billable, деньги по всем вызовам.
    """
    q = (
        select(
            func.count().filter(AIUsage.billable.is_(True)),
            func.coalesce(func.sum(AIUsage.cost_micro), 0),
        )
        .select_from(AIUsage)
        .where(AIUsage.studio_id == studio_id)
    )
    if since is not None:
        q = q.where(AIUsage.created_at >= since)
    row = (await db.execute(q)).one()
    return int(row[0] or 0), int(row[1] or 0)


async def ai_quota_status(db: AsyncSession, studio_id: int) -> tuple[int, int]:
    """(использовано, лимит) обращений — для UI (задача 11).

    Пока включён пробный потолок, показываем именно его: он кончается первым, и
    «12 из 1500» рядом с отказом на 150-м вопросе — прямая ложь в интерфейсе.
    """
    if TRIAL_LIMIT:
        used, _ = await _usage(db, studio_id, None)
        return used, TRIAL_LIMIT
    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    used, _ = await _usage(db, studio_id, _month_start())
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
    share = (100 - max(0, min(reserve_pct, 100))) / 100

    if TRIAL_LIMIT:
        total, _ = await _usage(db, studio_id, None)
        if total >= TRIAL_LIMIT * share:
            raise HTTPException(status_code=429, detail={
                "code": "ai_trial_exhausted",
                "message": f"Пробные {TRIAL_LIMIT} обращений к ИИ израсходованы.",
                "used": total,
                "limit": TRIAL_LIMIT,
            })

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    limits = _limits_for(plan)

    used, spent = await _usage(db, studio_id, _month_start())

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

    from routers.billing.plans import PLANS, TRIAL_PLAN

    assert _limits_for(None)["ai_requests"] == 0                              # нет тарифа — не безлимит
    # Триал и прежние имена каталога читаются через canon: в БД они лежат до сих пор.
    assert _limits_for(_P("subscription", "free_trial"))["ai_requests"] == PLANS[TRIAL_PLAN]["limits"]["ai_requests"]
    assert _limits_for(_P("subscription", "pro"))["ai_requests"] == PLANS[TRIAL_PLAN]["limits"]["ai_requests"]
    assert _limits_for(_P("percent", "s3"))["ai_requests"] == 5000             # процент — по верхней ступени
    assert _limits_for(_P("combo", "unlimited"))["ai_requests"] == 5000        # комбо — свой план
    assert _limits_for(_P("subscription", "s7"))["ai_requests"] == 7 * 150     # ступень платит за свои места
    # Неизвестный план — НИЖНЯЯ ступень, а не безлимит: у денег безлимит опасен.
    assert _limits_for(_P("subscription", "none"))["ai_requests"] == PLANS["s2"]["limits"]["ai_requests"]
    assert _limits_for(_P("subscription", "unlimited"))["ai_cost_micro"] == 12000 * 1200

    assert _month_start().day == 1 and _month_start().hour == 0
    print("ai_quota self-check ok")

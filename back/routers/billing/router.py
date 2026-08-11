"""Биллинг: каталог тарифов (источник истины о ценах) + чтение подписки студии.

Всё — только owner (ТЗ: раздел «Тариф и оплата» доступен владельцу).
Оплата/вебхуки/возвраты — отдельные задачи эпика 5; здесь только read + каталог.
"""
import logging
from datetime import date, datetime, timedelta
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ratelimit import limiter
from database import get_db
from dependencies import require_role, StudioContext
from models import StudioBillingPlan, BillingInvoice, PaymentCard
from schemas.common import Page
from schemas.settings.billing import (
    OfflineFeeStatus,
    PlansCatalogRead, PlanRead, PlanLimits,
    BillingPlanRead, InvoiceRead, PaymentCardRead, BillingStatsRead,
    ActivateModelRequest, AutopaySettingsUpdate,
)
from .plans import (
    PLANS, PERIOD_DISCOUNTS, PERCENT_ONLY_RATE, COMBO_PERCENT_RATE, COMBO_FIXED,
    MIN_MONTHLY_FEE, amount_for,
)
from services import offline_fee_billing, platform_fee, stripe_billing, stripe_catalog
from activity import log_activity
from services.exporter import csv_stream
from services.notifier import _studio_prefs, _CURRENCY_SIGNS
from .checkout import router as checkout_router, _metadata, _has_live_subscription
from .webhook import router as webhook_router, apply_status, mirror_invoice
from .refunds import router as refunds_router

logger = logging.getLogger(__name__)

_NOT_CONFIGURED = {
    "code": "billing.stripe_not_configured",
    "message": "Приём оплат не настроен на сервере",
}

# Условия постоплаты, которые владелец подтверждает в модалке. Версия хранится
# вместе с согласием (StudioBillingPlan.percent_terms_version) — поменяли текст,
# подняли версию, и старое согласие больше не покрывает новые правила.
# `grace_days` обязан совпадать с offline_fee_billing.GRACE_DAYS: студия
# соглашается на конкретный срок, и он же применяется при блокировке.
# `min_monthly` — минимальный месячный платёж процентного тарифа. Это НОВОЕ
# денежное обязательство, поэтому версия поднята: согласия, данные до его введения,
# на него не распространяются, и владелец обязан подтвердить условия заново.
OFFLINE_TERMS = {
    "version": "2026-08-2",
    "grace_days": offline_fee_billing.GRACE_DAYS,
    "percent_rate": PERCENT_ONLY_RATE,
    "combo_rate": COMBO_PERCENT_RATE,
    # Только для mode="percent": у комбо фиксированная часть уже берётся подпиской.
    "min_monthly": MIN_MONTHLY_FEE,
    "currency": stripe_billing.CURRENCY.upper(),
}
router = APIRouter()
router.include_router(checkout_router)
router.include_router(webhook_router)
router.include_router(refunds_router)


@router.get("/plans", response_model=PlansCatalogRead)
async def get_plans_catalog(
    ctx: StudioContext = Depends(require_role("owner")),
):
    """Каталог тарифов со скидками периодов. Статичен, но за require_role — как вся страница."""
    return PlansCatalogRead(
        plans=[
            PlanRead(id=pid, name=p["name"], price=p["price"], limits=PlanLimits(**p["limits"]))
            for pid, p in PLANS.items()
        ],
        period_discounts=PERIOD_DISCOUNTS,
        currency=stripe_billing.CURRENCY.upper(),
        min_monthly=MIN_MONTHLY_FEE,
        # Цены в каталоге — БЕЗ налога. Ставку отдаём отдельным полем, чтобы фронт
        # подписал итог на шаге оплаты («включая НДС N%») и не зашивал число у себя:
        # настоящую сумму всё равно считает Stripe Tax по стране покупателя.
        vat_rate=stripe_billing.VAT_RATE_DISPLAY,
    )


def _upgrade_target(row: StudioBillingPlan) -> str | None:
    """Кнопка «Улучшить тариф» (задача 2): только фиксированная часть тарифа
    (subscription = чистый fix, combo = %+fix), активная подписка, и это не
    максимальная ступень. Чистый % от оборота (percent) — апгрейда нет.
    Порядок ступеней берём из PLANS (plans.py) — второго списка не заводим,
    иначе четвёртый тариф придётся дописывать в двух местах.
    """
    if row.billing_mode not in ("subscription", "combo") or row.status != "active":
        return None
    plan_ids = list(PLANS)
    if row.plan_name not in plan_ids:
        return None
    idx = plan_ids.index(row.plan_name)
    return plan_ids[idx + 1] if idx + 1 < len(plan_ids) else None


def _tier(plan_name: str) -> int:
    """Ступень тарифа для сравнения. free_trial даёт лимиты Pro (services/plan_limits),
    поэтому и здесь считается его ступенью; неизвестный план (none) — ниже всех."""
    plan_id = "pro" if plan_name == "free_trial" else plan_name
    plan_ids = list(PLANS)
    return plan_ids.index(plan_id) if plan_id in plan_ids else -1


def _to_plan_read(row: StudioBillingPlan) -> BillingPlanRead:
    next_plan = _upgrade_target(row)
    return BillingPlanRead(
        plan_name=row.plan_name,
        billing_cycle=row.billing_cycle,
        status=row.status,
        expires_at=row.expires_at.isoformat() if row.expires_at else None,
        max_staff=row.max_staff,
        auto_renewal=row.auto_renewal,
        billing_mode=row.billing_mode,
        percent_rate=row.percent_rate,
        fixed_base_amount=row.fixed_base_amount,
        notify_before_days=row.notify_before_days,
        notify_before_autocharge=row.notify_before_autocharge,
        email_receipt_enabled=row.email_receipt_enabled,
        sms_notification_enabled=row.sms_notification_enabled,
        can_upgrade=next_plan is not None,
        next_plan=next_plan,
        scheduled_plan=row.scheduled_plan,
        scheduled_at=row.scheduled_at.isoformat() if row.scheduled_at else None,
        # Ровно та же функция, по которой ветвится оформление — не копия правила.
        has_live_subscription=_has_live_subscription(row),
    )


@router.get("/plan", response_model=BillingPlanRead)
async def get_current_plan(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Текущая подписка студии. Нет строки (до онбординга) → plan_name=none, без даты (задача 8b)."""
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if row is None:
        return BillingPlanRead(
            plan_name="none", billing_cycle="monthly", status="none",
            expires_at=None, max_staff=0, auto_renewal=False,
        )
    return _to_plan_read(row)


def _period_saving(plan_name: str, period_months: int) -> int:
    """Сколько скидка за длинный период сберегла на этом счёте, копейки.

    ОБЕ стороны берутся из каталога, и это принципиально. Раньше уплаченное
    сравнивалось с каталожной ценой напрямую, а `BillingInvoice.amount` зеркалит
    `amount_due` — сумму С НАЛОГОМ. На месячном тарифе разность (39 € против 39 € +
    НДС) уходила в минус, её обрезал `max(0, …)`, и владелец видел «сэкономлено 0»
    там, где скидки и правда нет, но по неверной причине; на годовом экономия
    выходила заниженной ровно на ставку НДС покупателя.

    Незнакомый тариф или период (легаси-счёт, счёт за комиссию) — 0, а не исключение:
    плашка не должна падать из-за строки истории.
    """
    if plan_name not in PLANS or period_months not in PERIOD_DISCOUNTS:
        return 0
    return amount_for(plan_name, 1) * period_months - amount_for(plan_name, period_months)


def _months_between(start: datetime, end: datetime) -> int:
    """Полных месяцев между датами (неполный месяц не считаем). Без dateutil."""
    months = (end.year - start.year) * 12 + end.month - start.month
    if end.day < start.day:
        months -= 1
    return max(0, months)


@router.get("/stats", response_model=BillingStatsRead)
async def get_billing_stats(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Четыре плашки шапки. Всё из оплаченных счетов студии — до первой оплаты нули."""
    paid = (await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.studio_id == ctx.studio_id, BillingInvoice.status == "paid")
        .order_by(BillingInvoice.paid_at)
    )).scalars().all()

    total_spent = sum(inv.amount for inv in paid)
    saved = sum(_period_saving(inv.plan_name, inv.period_months) for inv in paid if inv.kind == "subscription")
    months = _months_between(paid[0].paid_at, datetime.utcnow()) if paid else 0

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()

    # Следующее списание: срок и сумму знает Stripe, но для плашки хватает каталога —
    # налог и прорейтинг в неё не входят, это ориентир, а не счёт.
    next_charge = 0
    if plan and plan.status in ("active", "past_due"):
        if plan.billing_mode == "combo":
            next_charge = plan.fixed_base_amount or 0
        elif plan.billing_mode == "subscription" and plan.plan_name in PLANS:
            # Период берём у последнего счёта ЗА ТАРИФ, а не у последнего вообще:
            # счёт за комиссию всегда месячный (period_months=1), и студия,
            # перешедшая с «процента» на подписку, видела бы в плашке месячную
            # цену вместо годовой — ровно за тот период, который сама и оплатила.
            months = next(
                (inv.period_months for inv in reversed(paid) if inv.kind == "subscription"), 1,
            )
            next_charge = amount_for(plan.plan_name, months)
        # percent: фикса нет, списывать по расписанию нечего — остаётся 0

    return BillingStatsRead(
        total_spent=total_spent,
        months_with_us=months,
        saved=saved,
        next_charge=next_charge,
        next_charge_at=plan.expires_at.isoformat() if plan and plan.expires_at else None,
    )


async def _reconcile_subscription(
    row: StudioBillingPlan, body: ActivateModelRequest, ctx: StudioContext,
) -> None:
    """Привести подписку Stripe в соответствие с только что выбранным режимом.

    Раньше смена режима меняла ТОЛЬКО нашу БД, а Stripe продолжал списывать по
    прежнему Price — в обе стороны с потерей денег:

    * → «только процент»: подписки на этом тарифе нет по определению, но карта
      продолжала платить фикс каждый месяц. Студия платила и подписку, и 3% с
      оборота — за тариф, с которого ушла. Модалка подтверждения на фронте при
      этом обещает ей ровно обратное («теряете остаток оплаченного периода»);
    * подписка ⇄ комбо: у комбо ПОЛОВИННЫЙ Price (plans.COMBO_FIXED). Без смены
      Price комбо-студия платила полную цену, а ушедшая с комбо на чистый фикс
      получала полный тариф за половину — недобор уже у платформы.

    Переход происходит СРАЗУ и БЕЗ возврата денег за неиспользованный остаток
    (`proration_behavior="none"`) — правило продукта, о котором модалка на фронте
    предупреждает заранее. С прорацией Stripe вернул бы остаток кредитом на баланс
    клиента, и следующий счёт пришёл бы уменьшенным.

    Сбой Stripe поднимает 502, и режим в БД не меняется: рассинхрон опаснее отказа.
    """
    if not row.stripe_subscription_id or row.status not in ("active", "past_due"):
        return

    if body.mode == "percent":
        await stripe_billing.cancel_subscription(row.stripe_subscription_id)
        # Ссылку снимаем сразу, не дожидаясь customer.subscription.deleted: до его
        # прихода повторный вызов пытался бы отменить уже отменённый объект и падал
        # бы 502 на ровном месте. Статус подвинет само событие.
        row.stripe_subscription_id = None
        return

    # Тариф и период берём у самой подписки, когда их не прислали: они уже записаны
    # в её Price (lookup_key), и второй копии у себя мы не держим.
    current = stripe_catalog.parse_lookup_key(
        await stripe_billing.subscription_price_key(row.stripe_subscription_id)
    )
    plan_id = body.plan or (current[0] if current else row.plan_name)
    period_months = body.period_months or (current[1] if current else 1)
    if plan_id not in PLANS or period_months not in PERIOD_DISCOUNTS:
        logger.error(
            "Смена режима: тариф/период подписки %s не определить (%s, %s) — Price не меняем",
            row.stripe_subscription_id, plan_id, period_months,
        )
        return

    price_id = await stripe_catalog.price_id(plan_id, period_months, body.mode == "combo")
    # Метаданные обязаны ехать вместе с новым Price: ступень тарифа на продлении
    # поднимает webhook._activate по ним (см. change_subscription_price).
    await stripe_billing.change_subscription_price(
        row.stripe_subscription_id, price_id,
        _metadata(ctx, plan_id, period_months, body.mode),
        proration_behavior="none",
    )


@router.post("/model", response_model=BillingPlanRead)
async def activate_model(
    body: ActivateModelRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Переключение тарифной модели (подписка / % / фикс+%). Оплата подписки — отдельно, через /checkout."""
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    # Ступень «до» считаем ДО создания строки: иначе новый план сравнивался бы сам с
    # собой и проверка ниже пропускала бы любой тариф.
    current_plan = row.plan_name if row is not None else "pro"
    if row is None:
        row = StudioBillingPlan(studio_id=ctx.studio_id, plan_name=current_plan)
        db.add(row)

    # Ступень тарифа поднимает ТОЛЬКО оплаченный счёт (webhook._activate). Без этой
    # проверки владелец переключал бы себе plan_name на business одним запросом сюда —
    # а его читает check_plan_limit (services/plan_limits.py), то есть лимиты
    # сотрудников и клиентов снимались бы бесплатно, мимо Stripe.
    if body.plan and _tier(body.plan) > _tier(current_plan):
        raise HTTPException(status_code=402, detail={
            "code": "billing.plan_not_paid",
            "message": "Тариф выше текущего активируется только оплатой",
        })

    # Юридическое основание постоплаты: на «проценте» и «комбо» платформа
    # выставляет счёт за комиссию с наличных и блокирует доступ за неоплату —
    # значит владелец обязан явно на это согласиться. Модалку подтверждения
    # обойти прямым запросом нельзя: без флага 422.
    if body.mode in ("percent", "combo") and not body.accept_offline_terms:
        raise HTTPException(status_code=422, detail={
            "code": "billing.offline_terms_required",
            "message": "Подтвердите условия постоплаты комиссии с офлайн-продаж",
            "terms": OFFLINE_TERMS,
        })

    row.billing_mode = body.mode
    if body.mode == "percent":
        row.percent_rate, row.fixed_base_amount = PERCENT_ONLY_RATE, None
    elif body.mode == "combo":
        disc = PERIOD_DISCOUNTS[body.period_months or 1]
        row.percent_rate = COMBO_PERCENT_RATE
        row.fixed_base_amount = round(COMBO_FIXED[body.plan or "pro"] * (1 - disc))
        row.plan_name = body.plan or row.plan_name
    else:
        row.percent_rate = None
        row.fixed_base_amount = None
        row.plan_name = body.plan or row.plan_name

    if body.mode in ("percent", "combo"):
        # Фиксируем ЧТО именно приняли и когда: ставку и версию текста. Сменим
        # условия — старое согласие не должно молча распространиться на новые.
        row.percent_terms_accepted_at = datetime.utcnow()
        row.percent_terms_rate = row.percent_rate
        row.percent_terms_version = OFFLINE_TERMS["version"]
        log_activity(
            db, ctx.studio_id, "billing",
            title=f"Приняты условия постоплаты комиссии {row.percent_rate}% (ред. {OFFLINE_TERMS['version']})",
            actor_name=f"{ctx.user.name} {ctx.user.last_name or ''}".strip(),
            entity_type="billing_plan", entity_id=row.id,
        )

    # Stripe правим ПОСЛЕДНИМ и до коммита: упадёт — get_db не коммитит, и режим в
    # БД останется прежним. Обратный порядок оставлял бы БД и Stripe разошедшимися.
    try:
        await _reconcile_subscription(row, body, ctx)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Смена режима: подписка студии %s не перенастроена", ctx.studio_id)
        raise HTTPException(status_code=502, detail={
            "code": "billing.stripe_error",
            "message": "Не удалось перенастроить подписку — режим не изменён, попробуйте ещё раз",
        }) from exc

    await db.commit()
    await db.refresh(row)
    return _to_plan_read(row)


@router.get("/offline-fees", response_model=OfflineFeeStatus)
async def get_offline_fee_status(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Виджет «Комиссия с офлайн-продаж»: сколько накопилось и сколько должны.

    Гейта подписки на /billing нет — заблокированная студия обязана видеть свой
    долг и иметь возможность его закрыть, иначе блокировка стала бы тупиком.
    """
    accrued, accrued_currency = await offline_fee_billing.accrued_total(db, ctx.studio_id)

    # Оба вида постоплаты: комиссия и минимальный месячный платёж. Показать только
    # комиссию значило бы, что заблокированная за минимум студия видит долг 0 и не
    # находит, что ей вообще оплачивать.
    unpaid = (await db.execute(
        select(BillingInvoice)
        .where(
            BillingInvoice.studio_id == ctx.studio_id,
            BillingInvoice.kind.in_(platform_fee.SUSPENDING_KINDS),
            BillingInvoice.status.notin_(("paid", "refunded")),
        )
        .order_by(BillingInvoice.due_at.asc().nulls_last())
    )).scalars().all()

    outstanding = sum(inv.amount for inv in unpaid)
    earliest = next((inv for inv in unpaid if inv.due_at is not None), None)
    days_left = None
    if earliest is not None:
        # Округляем ВВЕРХ по календарю: «остался 1 день» честнее, чем «0», пока
        # срок ещё не наступил.
        delta = earliest.due_at - datetime.utcnow()
        days_left = -((-delta.total_seconds()) // 86400) if delta.total_seconds() > 0 else int(delta.total_seconds() // 86400)
        days_left = int(days_left)

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()

    reason = await platform_fee.suspension_reason(db, ctx.studio_id)
    return OfflineFeeStatus(
        accrued=accrued,
        accrued_currency=accrued_currency,
        outstanding=outstanding,
        currency=stripe_billing.CURRENCY.upper(),
        due_at=earliest.due_at.isoformat() if earliest is not None else None,
        days_left=days_left,
        suspended=reason is not None,
        suspended_reason=reason,
        hosted_invoice_url=next((i.hosted_invoice_url for i in unpaid if i.hosted_invoice_url), None),
        rate=plan.percent_rate if plan is not None else None,
        grace_days=offline_fee_billing.GRACE_DAYS,
        # Минимум показываем только тем, к кому он применяется, — на комбо и
        # подписке фикс уже берётся подпиской, и вторая цифра там только путает.
        min_monthly=MIN_MONTHLY_FEE if plan is not None and plan.billing_mode == "percent" else None,
    )


@router.post("/offline-fees/pay", response_model=OfflineFeeStatus)
# Каждый вызов выставляет счёт у Stripe и шлёт студии письмо с фактурой.
@limiter.limit("10/minute")
async def pay_offline_fees(
    request: Request,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """«Оплатить сейчас»: выставить счёт на всё накопленное, не дожидаясь месяца.

    Уже выставленный неоплаченный счёт новым не дублируем — сначала пусть
    закроют его (ссылка на оплату возвращается в том же ответе).
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)
    try:
        await offline_fee_billing.bill_now(db, ctx.studio_id)
    except Exception as exc:
        logger.exception("Офлайн-комиссии: досрочный счёт студии %s не выставлен", ctx.studio_id)
        raise HTTPException(status_code=502, detail={
            "code": "billing.stripe_error", "message": "Stripe отклонил запрос",
        }) from exc
    return await get_offline_fee_status(ctx, db)


@router.patch("/autopay", response_model=BillingPlanRead)
async def update_autopay(
    body: AutopaySettingsUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Тумблеры вкладки «Способ оплаты» (частичный апдейт).

    `auto_renewal` — не настройка уведомлений, а ОТМЕНА ПОДПИСКИ, и уезжает в Stripe
    как `cancel_at_period_end`. Ровно это обещают Условия (§7): «You may cancel at any
    time from the Billing page. Cancellation takes effect at the end of the current
    paid period». Пока флаг жил только в нашей БД, тумблер был враньём: владелец
    выключал автопродление, получал зелёный тост — и очередное списание. Оспоренный
    платёж в такой ситуации выигрывает плательщик, и он прав.

    Обратное включение снимает отмену: Stripe принимает `cancel_at_period_end=False`,
    пока период не кончился, — поэтому передумавшему не нужно оформлять подписку заново.

    Карту требуем только при отсутствии живой подписки. У живой способ оплаты уже
    выбран, и продление студии на IBAN идёт счётом, а не списанием: старая проверка
    «только при оплате картой» заперла бы её в выключенном автопродлении навсегда.
    """
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=400, detail="Нет активной подписки")

    live = _has_live_subscription(row)
    if body.auto_renewal and not live:
        card = (await db.execute(select(PaymentCard).where(
            PaymentCard.user_id == ctx.user.id, PaymentCard.method_type == "card"
        ))).scalar_one_or_none()
        if card is None:
            raise HTTPException(status_code=400, detail="Автосписание доступно только при оплате картой")

    for field in ("auto_renewal", "email_receipt_enabled", "notify_before_autocharge", "sms_notification_enabled"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)

    # Stripe правим ДО коммита и последним — как в activate_model: упадёт, и get_db
    # не закоммитит, то есть тумблер останется в прежнем положении. Обратный порядок
    # оставил бы БД и Stripe разошедшимися, а это как раз то, что чинит эта правка.
    if body.auto_renewal is not None and live:
        try:
            await stripe_billing.set_cancel_at_period_end(
                row.stripe_subscription_id, not body.auto_renewal,
            )
        except Exception as exc:
            logger.exception("Автопродление: подписка студии %s не перенастроена", ctx.studio_id)
            raise HTTPException(status_code=502, detail={
                "code": "billing.stripe_error",
                "message": "Не удалось изменить автопродление — попробуйте ещё раз",
            }) from exc

    await db.commit()
    await db.refresh(row)
    return _to_plan_read(row)


def _to_invoice_read(inv: BillingInvoice) -> InvoiceRead:
    return InvoiceRead(
        id=inv.id,
        plan_name=inv.plan_name,
        period_months=inv.period_months,
        amount=inv.amount,
        payment_method=inv.payment_method,
        paid_at=inv.paid_at.isoformat() if inv.paid_at else None,
        status=inv.status,
        pdf_url=inv.pdf_url,
    )


def _invoice_date_filters(date_from: date | None, date_to: date | None) -> list:
    """paid_at — datetime (не date), поэтому верхняя граница исключающая: иначе
    выпадают счета, оплаченные позже полуночи date_to. Общее для списка (задача 6)
    и CSV-экспорта (задача 4) — фильтр по датам не должен разъезжаться между ними.
    """
    filters = []
    if date_from is not None:
        filters.append(BillingInvoice.paid_at >= date_from)
    if date_to is not None:
        filters.append(BillingInvoice.paid_at < date_to + timedelta(days=1))
    return filters


@router.get("/invoices", response_model=Page[InvoiceRead])
async def get_invoices(
    limit: int = Query(12, ge=1, le=100),
    offset: int = Query(0, ge=0),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """История счетов студии, новые сверху, с пагинацией (задача 3) и опциональным
    фильтром по дате оплаты (задача 6, страница полной истории). До первой оплаты — пусто.

    Верхняя граница limit обязательна — иначе ?limit=999999 превращается в способ
    положить БД (аудит §3).
    """
    filters = [BillingInvoice.studio_id == ctx.studio_id, *_invoice_date_filters(date_from, date_to)]
    total = (await db.execute(
        select(func.count()).select_from(BillingInvoice).where(*filters)
    )).scalar_one()
    rows = (await db.execute(
        select(BillingInvoice)
        .where(*filters)
        .order_by(BillingInvoice.id.desc())
        .offset(offset).limit(limit)
    )).scalars().all()
    return Page(items=[_to_invoice_read(inv) for inv in rows], total=total, offset=offset, limit=limit)


@router.post("/invoices/{invoice_id}/sync", response_model=InvoiceRead)
# Каждый вызов — запрос к Stripe. Ручная сверка нужна единицы раз, а не потоком.
@limiter.limit("20/minute")
async def sync_invoice(
    request: Request,
    invoice_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Сверка статуса счёта со Stripe — когда вебхук не дошёл.

    Истина о платеже по-прежнему у Stripe: тянем счёт по stripe_invoice_id и
    применяем тем же переходом, что и вебхук (apply_status). Счёт без счёта Stripe
    (legacy, до перехода на подписки) остаётся как был.
    """
    inv = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.id == invoice_id,
        BillingInvoice.studio_id == ctx.studio_id,
    ))).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=404, detail="Счёт не найден")
    if not inv.stripe_invoice_id:
        raise HTTPException(status_code=409, detail="У счёта нет платёжного заказа")

    try:
        stripe_invoice = await stripe_billing.fetch_invoice(inv.stripe_invoice_id)
    except Exception:
        logger.exception("Сверка статуса не удалась, счёт %s", inv.id)
        raise HTTPException(status_code=502, detail="Платёжный сервис недоступен")

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if plan is not None:
        # Ссылки на PDF и хостед-страницу могли появиться после финализации.
        await mirror_invoice(db, plan, stripe_invoice)

    status = getattr(stripe_invoice, "status", None)
    if status == "paid":
        await apply_status(db, inv, "paid")
    elif status in ("uncollectible", "void"):
        await apply_status(db, inv, "failed")
    else:
        await db.commit()

    await db.refresh(inv)
    return _to_invoice_read(inv)


# Локализация CSV-экспорта (задача 4) — {cur} подставляется символом валюты студии,
# сумма без символа в каждой ячейке, иначе колонка перестаёт быть числовой для Excel.
_EXPORT_HEADERS = {
    "ru": ["Дата", "Тариф", "Период", "Сумма, {cur}", "Метод", "Статус"],
    "en": ["Date", "Plan", "Period", "Amount, {cur}", "Method", "Status"],
}
_EXPORT_METHOD = {
    # `stripe` — онлайн-комиссия: денег студия не переводила, их удержал Stripe из
    # платежа клиента. Без своей подписи она уехала бы в CSV сырым ключом.
    "ru": {"card": "Карта", "iban": "IBAN", "invoice": "Счёт", "stripe": "Удержано"},
    "en": {"card": "Card", "iban": "IBAN", "invoice": "Invoice", "stripe": "Withheld"},
}
_EXPORT_STATUS = {
    "ru": {"paid": "Оплачено", "pending": "Ожидает", "failed": "Ошибка", "refunded": "Возврат"},
    "en": {"paid": "Paid", "pending": "Pending", "failed": "Failed", "refunded": "Refunded"},
}


@router.get("/invoices/export.csv")
async def export_invoices_csv(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Серверный CSV всех счетов студии (не только загруженной страницы, как на фронте).

    Заголовки — на языке студии (задача 4, требование тотальной локализации).
    date_from/date_to — опциональный фильтр по дате оплаты для страницы полной
    истории (задача 6); без них — вся история, как раньше.
    """
    lang, _studio_currency = await _studio_prefs(db, ctx.studio_id)
    # Суммы счетов — в валюте биллинга (EUR), а не в валюте кассы студии.
    # Подписывать евро кроной нельзя: колонка станет враньём.
    sign = _CURRENCY_SIGNS.get(stripe_billing.CURRENCY.upper(), stripe_billing.CURRENCY.upper())

    filters = [BillingInvoice.studio_id == ctx.studio_id, *_invoice_date_filters(date_from, date_to)]
    rows = (await db.execute(
        select(BillingInvoice).where(*filters).order_by(BillingInvoice.id.desc())
    )).scalars().all()

    header = [h.format(cur=sign) for h in _EXPORT_HEADERS[lang]]

    def _rows():
        for inv in rows:
            yield [
                inv.paid_at.strftime("%d.%m.%Y") if inv.paid_at else "",
                inv.plan_name,
                inv.period_months,
                f"{inv.amount / 100:.2f}",
                _EXPORT_METHOD[lang].get(inv.payment_method, inv.payment_method or ""),
                _EXPORT_STATUS[lang].get(inv.status, inv.status),
            ]

    fname = f"velora-invoices-{datetime.utcnow().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        csv_stream(header, _rows()), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/invoices/{invoice_id}/receipt.pdf")
async def get_receipt(
    invoice_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Фактура по оплаченному счёту своей студии — редирект на документ Stripe.

    Раньше здесь рисовался собственный PDF: «Amount: 39.00» без валюты, без НДС, без
    продавца, без номера — латиницей, потому что base-14 Helvetica не несёт кириллицы.
    Выглядел он как документ, но им не был, и всплывал ровно там, где фактуры Stripe
    ещё нет: студия принимала эрзац за налоговый документ и клала его в учёт.

    Налоговый документ в этой схеме РОВНО ОДИН — фактура Stripe: у неё есть номер из
    сквозной нумерации, НДС, реквизиты обеих сторон и IČO студии. Второй, слабее,
    только путает, поэтому мы его больше не выпускаем, а ведём к настоящему.

    Фактуры ещё нет (легаси-счёт разовой оплаты, усечённое событие) — 409 с внятной
    причиной, а не выдуманный PDF. 404 остаётся на чужой/несуществующий/неоплаченный:
    состояние чужой студии не палим.
    """
    inv = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.id == invoice_id,
        BillingInvoice.studio_id == ctx.studio_id,
    ))).scalar_one_or_none()
    if inv is None or inv.status != "paid":
        raise HTTPException(status_code=404, detail="Чек доступен только для оплаченных счетов")

    url = inv.pdf_url or inv.hosted_invoice_url
    if not url:
        raise HTTPException(status_code=409, detail={
            "code": "billing.invoice_not_ready",
            "message": "Фактура ещё формируется — обновите страницу через минуту",
        })
    # 307, а не 302: метод и тело сохраняются, а кэш промежуточных прокси не
    # приклеивает ссылку навсегда — ссылки Stripe на PDF ограничены по времени.
    return RedirectResponse(url, status_code=307)


@router.get("/cards", response_model=list[PaymentCardRead])
async def get_payment_cards(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Сохранённые карты владельца (из rectoken после первой оплаты, задача 5)."""
    rows = (await db.execute(
        select(PaymentCard).where(PaymentCard.user_id == ctx.user.id)
    )).scalars().all()
    return rows


if __name__ == "__main__":
    # Плашка «месяцев с нами»: неполный месяц не засчитывается, переход года считается.
    assert _months_between(datetime(2026, 1, 15), datetime(2026, 7, 14)) == 5
    assert _months_between(datetime(2026, 1, 15), datetime(2026, 7, 15)) == 6
    assert _months_between(datetime(2025, 11, 30), datetime(2026, 7, 27)) == 7
    assert _months_between(datetime(2026, 7, 27), datetime(2026, 7, 27)) == 0

    # Кнопка «Улучшить тариф» (задача 2): fix/combo + активна + не максимальный тариф → апгрейд есть.
    _row = lambda **kw: SimpleNamespace(**{"billing_mode": "subscription", "status": "active", "plan_name": "pro", **kw})
    assert _upgrade_target(_row()) == "business"
    assert _upgrade_target(_row(billing_mode="combo")) == "business"
    assert _upgrade_target(_row(billing_mode="percent")) is None       # % от оборота — апгрейда нет
    assert _upgrade_target(_row(plan_name="business")) is None         # максимальный тариф
    assert _upgrade_target(_row(status="past_due")) is None            # неоплаченный не апгрейдим

    # Ступени тарифа: их сравнивает activate_model, чтобы не отдать лимиты Business
    # бесплатно. free_trial равен Pro (так же его читает services/plan_limits).
    assert _tier("start") < _tier("pro") < _tier("business")
    assert _tier("free_trial") == _tier("pro")
    assert _tier("none") == -1 and _tier("") == -1
    assert _tier("business") > _tier("none")   # без строки плана апгрейд невозможен

    # Экономия за период считается по каталогу с ОБЕИХ сторон и не зависит от НДС,
    # который Stripe накинул сверху (из-за него прежняя формула показывала ноль).
    assert _period_saving("pro", 1) == 0                       # помесячно скидки нет
    assert _period_saving("pro", 12) == 9900 * 12 - 83160      # 30% за год
    assert _period_saving("start", 6) == 3900 * 6 - 18720      # 20% за полгода
    assert _period_saving("business", 24) > _period_saving("business", 12)
    # Счёт за комиссию и легаси-строки не роняют плашку и ничего не «экономят».
    assert _period_saving("offline_fee", 1) == 0
    assert _period_saving("pro", 3) == 0

    # CSV-экранирование/BOM теперь проверяет services/exporter.py (задача 4) — не дублируем тут.
    print("billing router self-check ok")

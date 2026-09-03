"""Биллинг: каталог тарифов (источник истины о ценах) + чтение подписки студии.

Всё — только owner (ТЗ: раздел «Тариф и оплата» доступен владельцу).
Оплата/вебхуки/возвраты — отдельные задачи эпика 5; здесь только read + каталог.
"""
import logging
import time
from datetime import date, datetime, timedelta
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ratelimit import limiter
from database import get_db
from dependencies import get_current_user, require_role, StudioContext
from models import StudioBillingPlan, BillingInvoice, PaymentCard, User
from schemas.common import Page
from schemas.settings.billing import (
    OfflineFeeStatus,
    PlansCatalogRead, PlanRead, PlanLimits,
    BillingPlanRead, InvoiceRead, PaymentCardRead, BillingStatsRead,
    ActivateModelRequest, AutopaySettingsUpdate,
    BillingProfileRead, BillingProfileUpdate,
)
from .plans import (
    PLANS, PERIOD_DISCOUNTS, PERCENT_ONLY_RATE, COMBO_PERCENT_RATE, COMBO_FIXED,
    MIN_MONTHLY_FEE, TRIAL_DAYS, TRIAL_PLAN, amount_for, canon, tier,
)
from services.tax_rates import TaxRateMissing, TaxReviewRequired
from services import billing_tax, offline_fee_billing, platform_fee, stripe_billing, stripe_catalog, vies
from activity import log_activity
from services.exporter import csv_stream
from services.i18n import pick
from services.notifier import _studio_prefs, _CURRENCY_SIGNS
from .checkout import (
    router as checkout_router, _metadata, _has_live_subscription, _live_plan_name,
    billing_profile, COMMISSION_UNSETTLED,
)
from .webhook import router as webhook_router, apply_status, mirror_invoice, _renew_months
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
#
# Редакция 2026-08-3: сами условия переехали в Условия использования (static/
# terms.html, §5.1) и теперь версионируются вместе с ними. До этого текст жил
# только в переводах фронта и правился без подъёма версии — доказать, с чем именно
# согласилась студия, было нечем. Совпадение цифр в документе с этим словарём
# сторожит preflight (check_legal_docs).
OFFLINE_TERMS = {
    "version": "2026-08-4",
    "grace_days": offline_fee_billing.GRACE_DAYS,
    "percent_rate": PERCENT_ONLY_RATE,
    "combo_rate": COMBO_PERCENT_RATE,
    # Только для mode="percent": у комбо фиксированная часть уже берётся подпиской.
    "min_monthly": MIN_MONTHLY_FEE,
    "currency": stripe_billing.CURRENCY.upper(),
}
# Отказ переключить комбо на фиксированный тариф даром. Смена модели здесь —
# настройка, а этот переход стоит денег: у комбо половинный Price, и без оплаты
# студия получила бы полный тариф за уже уплаченную половину. Адрес кнопки в
# тексте не случаен — рассчитаться можно тут же, на той же странице.
COMBO_SWITCH_REQUIRES_PAYMENT = {
    "code": "billing.combo_switch_requires_payment",
    "message": (
        "Переход с тарифа «фикс + процент» на фиксированный оплачивается: "
        "нажмите «Оплатить», выберите фиксированный тариф и оплатите период"
    ),
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
        # Те же три числа, что уезжают в `terms` при 422, — но доступные ДО запроса:
        # модалку согласия фронт рисует раньше, чем что-либо отправит, и брать их
        # там было неоткуда, кроме литералов в разметке.
        percent_rate=OFFLINE_TERMS["percent_rate"],
        combo_rate=OFFLINE_TERMS["combo_rate"],
        grace_days=OFFLINE_TERMS["grace_days"],
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
    if canon(row.plan_name) not in plan_ids:
        return None
    idx = plan_ids.index(canon(row.plan_name))
    return plan_ids[idx + 1] if idx + 1 < len(plan_ids) else None


async def _studio_has_paid(db: AsyncSession, studio_id: int) -> bool:
    """Была ли у студии хоть одна ПРОШЕДШАЯ оплата.

    Именно оплаченный счёт, а не статус подписки: `status` — зеркало Stripe, и
    он бывает `pending`/`expired` у студии, которая ничего не платила (бросила
    3-D Secure, закрыла страницу оформления). Вид счёта не важен: комиссия с
    офлайн-продаж и минимальный платёж — такие же деньги, как подписка.

    `refunded` считается оплатой наравне с `paid`: деньги приходили, и то, что
    их вернули, не делает студию снова новой. Иначе «оплатить → вернуть →
    забрать бесплатные две недели» становится рабочей схемой.
    """
    paid = (await db.execute(
        select(BillingInvoice.id).where(
            BillingInvoice.studio_id == studio_id,
            BillingInvoice.status.in_(("paid", "refunded")),
        ).limit(1)
    )).scalar_one_or_none()
    return paid is not None


async def _trial_available(db: AsyncSession, row: StudioBillingPlan | None) -> bool:
    """Можно ли включить пробный период — ЕДИНОЕ правило для всех.

    По нему и решает `activate_trial`, и рисуется кнопка: флаг уезжает на фронт
    в `BillingPlanRead.trial_available`, чтобы интерфейс не считал доступность
    сам и не разошёлся с сервером.

    Два условия, оба обязательны:
      1. Триал ещё не брали (`trial_started_at IS NULL`);
      2. У студии не было ни одной оплаты — после первой акция закрыта навсегда.
    Живая подписка Stripe закрывает её тоже: деньги за неё уже идут, даже если
    счёт до нас ещё не доехал.
    """
    if row is not None and (row.trial_started_at is not None or _has_live_subscription(row)):
        return False
    studio_id = row.studio_id if row is not None else None
    if studio_id is None:
        return True
    return not await _studio_has_paid(db, studio_id)


def _to_plan_read(row: StudioBillingPlan, trial_available: bool = False) -> BillingPlanRead:
    next_plan = _upgrade_target(row)
    return BillingPlanRead(
        trial_available=trial_available,
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


async def _plan_response(db: AsyncSession, row: StudioBillingPlan) -> BillingPlanRead:
    """`_to_plan_read` + доступность триала. Отдельной обёрткой, потому что за
    доступностью надо в базу, а `_to_plan_read` синхронный и зовётся из мест,
    где строку уже держат в руках."""
    return _to_plan_read(row, trial_available=await _trial_available(db, row))


# Когда по студии последний раз сверяли тариф с подпиской Stripe (unix-время).
# Сверка ходит в сеть, а `/billing/plan` дёргает не только страница тарифа, но и
# каркас кабинета на КАЖДОЙ странице (пейволл) — без этого дросселя один заход
# стоил бы четырёх запросов в Stripe. Память процесса, а не БД: это кэш, потеря
# которого при рестарте ничего не ломает, максимум лишняя сверка.
_PLAN_CHECKED_AT: dict[int, float] = {}
_PLAN_CHECK_EVERY = 300.0


async def _reconcile_plan_name(db: AsyncSession, row: StudioBillingPlan) -> None:
    """Ступень тарифа в БД ← Price живой подписки Stripe. ТОЛЬКО ВНИЗ.

    `plan_name` у нас — зеркало, которое поднимает вебхук по оплаченному счёту.
    Не дошло событие (сеть, разъехавшийся секрет, события уходят на другой стенд) —
    и зеркало врёт СТРАНИЦЕ ТАРИФА: владелец видит «Business» и цены Business, хотя
    Stripe уже месяц списывает Pro. Своими глазами 13.08.2026.

    ПОВЫШАТЬ ступень сверка не имеет права, и это не осторожность, а разбор живого
    инцидента 14.08.2026. `change_subscription_price` переводит подписку на новый
    Price СРАЗУ, а счёт-прорация в этот момент ещё не оплачен (`open`). Сверка «по
    Price подписки» увидела business и выдала тариф за неоплаченный счёт: студия
    получила Business, не заплатив 169,41 €. Ступень вверх двигает ТОЛЬКО оплата —
    webhook._activate по счёту в статусе paid (он же ручная сверка счёта).

    Вниз — безопасно и нужно: там мы не дарим, а перестаём отдавать лишнее. Именно
    этот случай и был исходной жалобой (в БД business, в Stripe давно pro).

    `expires_at` и `status` НЕ трогаем, хотя подписка рядом. Срок у нас законно
    уходит ВПЕРЁД её `current_period_end`: продление — это отдельный счёт, который
    двигает дату через `_extend_paid_period`, а цикл подписки о нём не знает.
    Подтянуть дату «как в Stripe» значило бы отобрать уже оплаченные месяцы.
    """
    if not _has_live_subscription(row):
        return
    now = time.time()
    if now - _PLAN_CHECKED_AT.get(row.studio_id, 0.0) < _PLAN_CHECK_EVERY:
        return
    _PLAN_CHECKED_AT[row.studio_id] = now

    live = await _live_plan_name(row)
    if live == row.plan_name or live not in PLANS:
        return

    # Цену берём из каталога — того же, по которому выставляются счета. Тариф,
    # которого в каталоге нет (free_trial, легаси-имя), сравнивать не с чем:
    # любой переход с него был бы повышением, поэтому просто уходим.
    mirrored = PLANS.get(canon(row.plan_name))
    if mirrored is None or PLANS[live]["price"] > mirrored["price"]:
        logger.info(
            "Stripe billing: подписка студии %s стоит на %s, у нас %s — ступень вверх "
            "не поднимаем, ждём оплаченный счёт",
            row.studio_id, live, row.plan_name,
        )
        return

    logger.warning(
        "Stripe billing: тариф студии %s разошёлся с подпиской (%s у нас, %s в Stripe) — "
        "выравниваем по Stripe",
        row.studio_id, row.plan_name, live,
    )
    row.plan_name = live
    # Лимиты идут за ступенью — иначе студия платит Pro, а нанимает как Business.
    row.max_staff = PLANS[live]["limits"]["staff"] or 9999
    await db.commit()


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
        # Строки нет — студия точно ничего не платила, акция открыта.
        return BillingPlanRead(
            plan_name="none", billing_cycle="monthly", status="none",
            expires_at=None, max_staff=0, auto_renewal=False, trial_available=True,
        )
    # Вся страница тарифа (карточка, «текущий» в списке, баннер, предвыбор в
    # калькуляторе) читает ступень отсюда — выравниваем в одном месте, а не в
    # шести компонентах.
    await _reconcile_plan_name(db, row)
    return await _plan_response(db, row)


@router.post("/trial", response_model=BillingPlanRead)
async def activate_trial(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Активация пробного периода по явному согласию владельца.

    До этого триал начислял онбординг молча, и окно «активируйте 14 дней»
    было бы витриной: обе кнопки в нём не меняли бы ничего. Теперь новая
    студия приходит вообще без строки в StudioBillingPlan (status=none),
    отсюда она и появляется — из окна с акцией или с самой страницы тарифа,
    куда владельца привёл пейволл, если он окно закрыл.

    Окно открыто ДО ПЕРВОЙ ОПЛАТЫ и закрывается ею навсегда — правило целиком
    в `_trial_available`, второй копии условия здесь нет. Один раз: `trial_started_at`
    ставится при выдаче, и повторный вызов упирается в него, иначе бесплатный
    период перезапускали бы бесконечно, дожидаясь конца предыдущего.

    Проверять статус плана вместо этой отметки было ошибкой: `status` — зеркало
    подписки Stripe, и он уходит в `pending`/`expired` ещё до денег (брошенный
    3-D Secure, закрытая страница оформления). Акция сгорала у того, кто просто
    заглянул в оплату и передумал. Заглушку `status="none"` от
    `checkout._get_or_create_plan` не отвергаем, а дописываем на месте.
    """
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if not await _trial_available(db, row):
        raise HTTPException(status_code=409, detail={
            "code": "trial_already_used",
            "message": "Пробный период для этой студии больше недоступен.",
        })

    now = datetime.utcnow()
    expires_at = now + timedelta(days=TRIAL_DAYS)
    # Лимиты триала — как у Pro (services/plan_limits читает free_trial так же).
    max_staff = PLANS[TRIAL_PLAN]["limits"]["staff"]
    if row is None:
        row = StudioBillingPlan(
            studio_id=ctx.studio_id, plan_name="free_trial", status="trial",
            expires_at=expires_at, max_staff=max_staff, trial_started_at=now,
        )
        db.add(row)
    else:
        row.plan_name, row.status = "free_trial", "trial"
        row.expires_at, row.max_staff = expires_at, max_staff
        row.trial_started_at = now
    log_activity(
        db, ctx.studio_id, "billing",
        title=f"Активирован пробный период на {TRIAL_DAYS} дней",
        actor_name=f"{ctx.user.name} {ctx.user.last_name or ''}".strip(),
        entity_type="billing_plan",
    )
    try:
        await db.commit()
    except IntegrityError:
        # studio_id в StudioBillingPlan уникален. Две вкладки, нажавшие
        # «Активировать» одновременно, проходят проверку выше обе — вторую
        # ловит база, и это тот же самый «уже активирован», а не 500.
        await db.rollback()
        raise HTTPException(status_code=409, detail={
            "code": "trial_already_used",
            "message": "Пробный период для этой студии больше недоступен.",
        })
    await db.refresh(row)
    # trial_available здесь заведомо False — только что выданный триал повторно
    # не выдаётся; считаем его тем же правилом, а не константой.
    return await _plan_response(db, row)


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
        elif plan.billing_mode == "subscription" and canon(plan.plan_name) in PLANS:
            # Период берём у последнего счёта ЗА ТАРИФ, а не у последнего вообще:
            # счёт за комиссию всегда месячный (period_months=1), и студия,
            # перешедшая с «процента» на подписку, видела бы в плашке месячную
            # цену вместо годовой — ровно за тот период, который сама и оплатила.
            months = next(
                (inv.period_months for inv in reversed(paid) if inv.kind == "subscription"), 1,
            )
            next_charge = amount_for(canon(plan.plan_name), months)
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
    db: AsyncSession | None = None,
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
    plan_id = canon(body.plan or (current[0] if current else row.plan_name))
    period_months = body.period_months or (current[1] if current else 1)
    if plan_id not in PLANS or period_months not in PERIOD_DISCOUNTS:
        logger.error(
            "Смена режима: тариф/период подписки %s не определить (%s, %s) — Price не меняем",
            row.stripe_subscription_id, plan_id, period_months,
        )
        return

    price_id = await stripe_catalog.price_id(plan_id, period_months, body.mode == "combo")
    # Налог едет ТЕМ ЖЕ запросом, что и новый Price: смена режима может породить
    # счёт прорации немедленно, и отдельный вызов оставил бы окно, в котором он
    # считается по прежним правилам.
    tax = await billing_tax.application(db, ctx.studio_id, "subscription") if db is not None else None
    # Метаданные обязаны ехать вместе с новым Price: ступень тарифа на продлении
    # поднимает webhook._activate по ним (см. change_subscription_price).
    await stripe_billing.change_subscription_price(
        row.stripe_subscription_id, price_id,
        _metadata(ctx, plan_id, period_months, body.mode),
        proration_behavior="none",
        tax=tax,
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
    current_plan = row.plan_name if row is not None else TRIAL_PLAN
    # Режим «до» — по той же причине: ниже он перезаписывается телом запроса, а
    # отметка о согласии обязана знать, ВХОДИТ студия в режим или уже в нём сидит.
    previous_mode = row.billing_mode if row is not None else None
    if row is None:
        row = StudioBillingPlan(studio_id=ctx.studio_id, plan_name=current_plan)
        db.add(row)

    # Каталог сверяем здесь: в схеме списка ступеней больше нет (их два десятка),
    # а `body.plan` уходит в `row.plan_name` — то есть в лимиты студии.
    if (body.plan is not None and body.plan not in PLANS) or (
        body.period_months is not None and body.period_months not in PERIOD_DISCOUNTS
    ):
        raise HTTPException(status_code=422, detail={
            "code": "billing.unknown_plan",
            "message": "Неизвестный тариф или период оплаты",
        })

    # Ступень тарифа поднимает ТОЛЬКО оплаченный счёт (webhook._activate). Без этой
    # проверки владелец переключал бы себе plan_name на business одним запросом сюда —
    # а его читает check_plan_limit (services/plan_limits.py), то есть лимиты
    # сотрудников и клиентов снимались бы бесплатно, мимо Stripe.
    if body.plan and tier(body.plan) > tier(current_plan):
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

    # Реквизиты плательщика — условие ВКЛЮЧЕНИЯ постоплаты, а не только оплаты
    # картой. Счёт за комиссию и минимальный платёж выставляем МЫ сами, с
    # automatic_tax; клиент Stripe без страны роняет такой счёт целиком
    # (`customer_tax_location_invalid`), и percent-студия молча оставалась бы
    # неоплачиваемой — а с ноября 2026 ещё и заблокированной за невыданный счёт.
    # Онбординг адрес не спрашивает (только свободную строку), поэтому единственное
    # место, где он гарантированно есть, — профиль владельца; из него же его берёт
    # offline_fee_billing._ensure_studio_customer.
    #
    # Гейт на сервере, а не только в форме: тот же принцип, что у accept_offline_terms.
    if body.mode in ("percent", "combo") and not billing_profile(ctx.user).filled:
        raise HTTPException(status_code=422, detail={
            "code": "billing.billing_profile_required",
            "message": "Заполните реквизиты плательщика — по ним выставляется счёт за комиссию",
        })

    # Уйти с постоплаты, не рассчитавшись, нельзя. Комиссия с наличных копится весь
    # месяц, а счёт по ней выставляется уже после его конца — то есть в любой день
    # за студией висит долг без документа, и переход на фиксированный тариф стирал
    # его молча: минимальный месячный платёж берёт только тех, кто на проценте в
    # момент прохода, и месяц, отработанный на проценте и брошенный 30-го числа,
    # не добирался вовсе. Отдаём 409 с адресом кнопки — рассчитаться можно тут же,
    # `POST /billing/offline-fees/pay` выставляет счёт немедленно.
    if previous_mode in ("percent", "combo") and body.mode == "subscription":
        if await offline_fee_billing.has_unsettled_commission(db, ctx.studio_id):
            raise HTTPException(status_code=409, detail=COMMISSION_UNSETTLED)

    # Уход с комбо на ЧИСТУЮ подписку — тоже ПОКУПКА, а не настройка. Зеркало
    # жалобы 14.08.2026, закрытой ниже с другой стороны: у комбо ПОЛОВИННЫЙ Price
    # (plans.COMBO_FIXED), и студия, оплатившая период комбо, этим запросом
    # получала полный тариф за половину денег — оплаченный период не
    # перевыставляется (`proration_behavior="none"` без якоря), а обязательство
    # платить процент с оборота снимается тут же (`percent_rate = None`). Год
    # безлимита стоил 756 €, а по этой схеме — 378 € и ни цента комиссии.
    #
    # Расчёт по комиссии (гейт выше) дыру НЕ закрывал: у студии без офлайн-продаж
    # долга нет вовсе, а минимальный месячный платёж на комбо не выставляется
    # никогда (offline_fee_billing._bill_minimum берёт только «процент»).
    #
    # Переход идёт обычной оплатой — `POST /billing/checkout` с `combo=false`: там
    # он стоит полной цены периода (checkout._switch_now), а режим поднимает уже
    # ОПЛАТА (webhook._apply_paid_mode), ровно как ступень тарифа в `_activate`.
    # Живой подписки нет — переходить не с чего и дарить нечего, пускаем как есть.
    if previous_mode == "combo" and body.mode == "subscription" and _has_live_subscription(row):
        raise HTTPException(status_code=409, detail=COMBO_SWITCH_REQUIRES_PAYMENT)

    # Комбо — ПОКУПКА, а не настройка, и здесь она НЕ происходит НИКОГДА. Прежний
    # код включал режим прямо тут: нажал «соглашаюсь» — и подписка переехала на
    # половинный Price, а надпись в шапке сменилась на «Комбо», хотя не заплачено
    # ничего (жалоба 14.08.2026). Этот запрос теперь только записывает согласие на
    # постоплату; сама покупка идёт обычным путём оплаты (`POST /billing/checkout`
    # с `combo=true`) — с расчётом в модалке и чеком, — а режим поднимает ОПЛАТА
    # (webhook._apply_paid_mode), ровно как ступень тарифа поднимает `_activate`.
    #
    # Цену при оформлении это не ломает: `checkout._is_combo` берёт выбор из тела
    # запроса, а не из этого поля. «Процент» же применяется сразу — подписки у него
    # нет, фикс не уменьшается, а появляется обязательство платить комиссию и минимум.
    combo_purchase = body.mode == "combo"

    if not combo_purchase:
        row.billing_mode = body.mode
        if body.mode == "percent":
            row.percent_rate, row.fixed_base_amount = PERCENT_ONLY_RATE, None
        elif body.mode == "combo":
            disc = PERIOD_DISCOUNTS[body.period_months or 1]
            row.percent_rate = COMBO_PERCENT_RATE
            row.fixed_base_amount = round(COMBO_FIXED[body.plan or TRIAL_PLAN] * (1 - disc))
            row.plan_name = body.plan or row.plan_name
        else:
            row.percent_rate = None
            row.fixed_base_amount = None
            row.plan_name = body.plan or row.plan_name

    if body.mode in ("percent", "combo"):
        # Фиксируем ЧТО именно приняли и когда: ставку и версию текста. Сменим
        # условия — старое согласие не должно молча распространиться на новые.
        #
        # Ставку берём у ПОДТВЕРЖДАЕМОЙ модели, а не из `row.percent_rate`: у
        # комбо-покупки это поле здесь не заполняется вовсе (его поднимет оплата),
        # и согласие записалось бы с пустой ставкой — а по ней `create_checkout`
        # как раз и проверяет, что условия комбо приняты. Оформление отвечало бы
        # 422 навсегда, сразу после успешного подтверждения.
        accepted_rate = PERCENT_ONLY_RATE if body.mode == "percent" else COMBO_PERCENT_RATE
        row.percent_terms_rate = accepted_rate
        row.percent_terms_version = OFFLINE_TERMS["version"]
        # Отметку ВРЕМЕНИ двигает только ВХОД в режим, а не любое подтверждение.
        # По ней `_bill_minimum` решает, прожила ли студия расчётный месяц на
        # проценте: месяц, в котором она на него перешла, минимумом не облагается.
        # Пока отметка обновлялась на каждый вызов, повторное нажатие «процент»
        # раз в месяц (запрос проходит: режим тот же, флаг согласия стоит) сдвигало
        # её в текущий месяц — и 39 € не выставлялись НИКОГДА.
        #
        # Смена редакции условий отметку тоже не двигает намеренно: иначе правка
        # текста дарила бы всем percent-студиям бесплатный месяц. Что именно принято
        # и в какой редакции, видно из полей выше и из ленты событий.
        if previous_mode != body.mode or row.percent_terms_accepted_at is None:
            row.percent_terms_accepted_at = datetime.utcnow()
        log_activity(
            db, ctx.studio_id, "billing",
            title=f"Приняты условия постоплаты комиссии {accepted_rate}% (ред. {OFFLINE_TERMS['version']})",
            actor_name=f"{ctx.user.name} {ctx.user.last_name or ''}".strip(),
            entity_type="billing_plan", entity_id=row.id,
        )

    # Stripe правим ПОСЛЕДНИМ и до коммита: упадёт — get_db не коммитит, и режим в
    # БД останется прежним. Обратный порядок оставлял бы БД и Stripe разошедшимися.
    try:
        # Комбо-покупка подписку не трогает: её переставит оплата. Всё остальное —
        # настройка, и Stripe обязан узнать о ней сразу.
        if not combo_purchase:
            await _reconcile_subscription(row, body, ctx, db)
    except HTTPException:
        raise
    except (TaxReviewRequired, TaxRateMissing) as exc:
        # Налоговое решение не принято — это НЕ отказ Stripe. Отдать здесь 502
        # значило бы отправить владельца искать поломку у платёжного провайдера,
        # которой там нет: чинится это реквизитами плательщика или подтверждением
        # налоговой политики. Тот же код и тот же текст, что в оформлении оплаты
        # (routers/billing/checkout._tax_http_error).
        from .checkout import _tax_http_error

        raise _tax_http_error(exc) from exc
    except Exception as exc:
        logger.exception("Смена режима: подписка студии %s не перенастроена", ctx.studio_id)
        raise HTTPException(status_code=502, detail={
            "code": "billing.stripe_error",
            "message": "Не удалось перенастроить подписку — режим не изменён, попробуйте ещё раз",
        }) from exc

    await db.commit()
    await db.refresh(row)
    return await _plan_response(db, row)


@router.get("/offline-fees", response_model=OfflineFeeStatus)
async def get_offline_fee_status(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Виджет «Комиссия с офлайн-продаж»: сколько накопилось и сколько должны.

    Гейта подписки на /billing нет — заблокированная студия обязана видеть свой
    долг и иметь возможность его закрыть, иначе блокировка стала бы тупиком.
    """
    # В валюте БИЛЛИНГА, а не студии: на карточке рядом стоят минимальный месячный
    # платёж и выставленный счёт — оба в евро, и гривны накопленного не с чем было
    # сложить. Курс — тот же, что уедет в счёт (см. accrued_in_billing_currency).
    accrued, accrued_currency = await offline_fee_billing.accrued_in_billing_currency(
        db, ctx.studio_id,
    )

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
    return await _plan_response(db, row)


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

    ТЕМ ЖЕ переходом — значит и с теми же аргументами. `renew_months` читается из
    метаданных счёта Stripe ровно там же, где их читает вебхук (`_renew_months`):
    без него ручная сверка счёта ПРОДЛЕНИЯ отмечала счёт оплаченным, писала доход
    в леджер и слала чек — но срок подписки не двигала вовсе. То есть студия
    платила за 12 месяцев и не получала ни одного, причём именно в том сценарии,
    ради которого эта кнопка и существует: событие не доехало. Автосверка
    (`reconcile_subscriptions`) это не подберёт — она зеркалит подписку у Stripe, а
    Stripe о нашем продлении узнаёт только из этого вызова.
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
        await apply_status(db, inv, "paid", renew_months=_renew_months(stripe_invoice))
    elif status in ("uncollectible", "void"):
        await apply_status(db, inv, "failed")
    else:
        await db.commit()

    await db.refresh(inv)
    return _to_invoice_read(inv)


# Локализация CSV-экспорта (задача 4) — {cur} подставляется символом валюты студии,
# сумма без символа в каждой ячейке, иначе колонка перестаёт быть числовой для Excel.
# Колонки налога добавлены вместе с ручным расчётом: бухгалтеру нужна не только
# сумма счёта, но и налоговая база, налог и ОСНОВАНИЕ его отсутствия. Ноль в колонке
# налога сам по себе не отвечает на вопрос «почему ноль» — у reverse charge и у
# продажи за пределы ЕС он одинаковый, а в декларации это разные строки.
#
# Это дополнение к штатным выгрузкам Stripe (Tax Rates → экспорт по позициям и по
# счетам), а не замена им: параллельную налоговую систему мы не строим.
_EXPORT_HEADERS = {
    "ru": ["Дата", "Тариф", "Период", "Сумма без налога, {cur}", "Метод", "Статус",
           "Ставка, %", "Налог, {cur}", "Итого, {cur}", "Основание", "Юрисдикция"],
    "en": ["Date", "Plan", "Period", "Net amount, {cur}", "Method", "Status",
           "Rate, %", "Tax, {cur}", "Total, {cur}", "Tax basis", "Jurisdiction"],
    "uk": ["Дата", "Тариф", "Період", "Сума без податку, {cur}", "Метод", "Статус",
           "Ставка, %", "Податок, {cur}", "Разом, {cur}", "Підстава", "Юрисдикція"],
    "cs": ["Datum", "Tarif", "Období", "Částka bez daně, {cur}", "Metoda", "Stav",
           "Sazba, %", "Daň, {cur}", "Celkem, {cur}", "Důvod", "Jurisdikce"],
    "de": ["Datum", "Tarif", "Zeitraum", "Nettobetrag, {cur}", "Methode", "Status",
           "Satz, %", "Steuer, {cur}", "Gesamt, {cur}", "Grundlage", "Jurisdiktion"],
}

# Исход налогового решения → подпись для бухгалтера. Ключи — services/tax_policy.
_EXPORT_TAX_OUTCOME = {
    "ru": {"taxable": "Облагается", "reverse_charge": "Reverse charge",
           "exempt": "Освобождено", "out_of_scope": "Вне сферы НДС ЕС"},
    "en": {"taxable": "Taxable", "reverse_charge": "Reverse charge",
           "exempt": "Exempt", "out_of_scope": "Outside EU VAT scope"},
    "uk": {"taxable": "Оподатковується", "reverse_charge": "Reverse charge",
           "exempt": "Звільнено", "out_of_scope": "Поза сферою ПДВ ЄС"},
    "cs": {"taxable": "Zdanitelné", "reverse_charge": "Reverse charge",
           "exempt": "Osvobozeno", "out_of_scope": "Mimo DPH EU"},
    "de": {"taxable": "Steuerpflichtig", "reverse_charge": "Reverse charge",
           "exempt": "Befreit", "out_of_scope": "Außerhalb der EU-USt"},
}
_EXPORT_METHOD = {
    # `stripe` — онлайн-комиссия: денег студия не переводила, их удержал Stripe из
    # платежа клиента. Без своей подписи она уехала бы в CSV сырым ключом.
    "ru": {"card": "Карта", "iban": "IBAN", "invoice": "Счёт", "stripe": "Удержано"},
    "en": {"card": "Card", "iban": "IBAN", "invoice": "Invoice", "stripe": "Withheld"},
    "uk": {"card": "Картка", "iban": "IBAN", "invoice": "Рахунок", "stripe": "Утримано"},
    "cs": {"card": "Karta", "iban": "IBAN", "invoice": "Faktura", "stripe": "Strženo"},
    "de": {"card": "Karte", "iban": "IBAN", "invoice": "Rechnung", "stripe": "Einbehalten"},
}
_EXPORT_STATUS = {
    "ru": {"paid": "Оплачено", "pending": "Ожидает", "failed": "Ошибка", "refunded": "Возврат"},
    "en": {"paid": "Paid", "pending": "Pending", "failed": "Failed", "refunded": "Refunded"},
    "uk": {"paid": "Оплачено", "pending": "Очікує", "failed": "Помилка", "refunded": "Повернення"},
    "cs": {"paid": "Zaplaceno", "pending": "Čeká", "failed": "Chyba", "refunded": "Vráceno"},
    "de": {"paid": "Bezahlt", "pending": "Ausstehend", "failed": "Fehler", "refunded": "Erstattet"},
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

    header = [h.format(cur=sign) for h in pick(_EXPORT_HEADERS, lang)]

    def _rows():
        for inv in rows:
            # Пустые налоговые колонки означают «снимка нет»: счёт выставлен, когда
            # налог считал Stripe. Подставлять туда сегодняшнее правило нельзя —
            # это переписывание истории, а не заполнение пробела.
            tax_amount = inv.tax_amount
            yield [
                inv.paid_at.strftime("%d.%m.%Y") if inv.paid_at else "",
                inv.plan_name,
                inv.period_months,
                f"{inv.amount / 100:.2f}",
                pick(_EXPORT_METHOD, lang).get(inv.payment_method, inv.payment_method or ""),
                pick(_EXPORT_STATUS, lang).get(inv.status, inv.status),
                f"{inv.tax_rate_percent:g}" if inv.tax_rate_percent is not None else "",
                f"{tax_amount / 100:.2f}" if tax_amount is not None else "",
                f"{(inv.amount + tax_amount) / 100:.2f}" if tax_amount is not None else "",
                pick(_EXPORT_TAX_OUTCOME, lang).get(inv.tax_outcome, inv.tax_outcome or ""),
                inv.tax_jurisdiction or "",
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


def _vat_for_country(vat_id: str | None, country: str) -> str | None:
    """Номер, который вообще допустимо хранить для этой страны.

    Снаружи ЕС — никакой: там номер не спрашивается (форма его и не показывает),
    сверить его нечем, а на налог он не влияет. Пришёл всё равно — молча роняем,
    а не отказываем: это не ошибка ввода, а поле, которого для этой страны нет.

    Внутри ЕС префикс номера ОБЯЗАН совпадать со страной. Без этой проверки
    остаётся дыра: VIES доказывает, что номер существует, а не что он принадлежит
    плательщику, — и любой мог бы вписать реальный чужой немецкий номер, пройти
    сверку и получить reverse charge. Совпадение со страной закрывает хотя бы
    «плательщик из одной страны платит по номеру другой».
    """
    if not vat_id:
        return None
    if country not in vies.EU_VAT_COUNTRIES:
        return None
    prefix = vies.vat_prefix(country)
    if not vat_id.startswith(prefix):
        raise HTTPException(status_code=422, detail={
            "code": "billing.vat_country_mismatch",
            "message": f"Номер НДС выбранной страны начинается с {prefix}",
        })
    return vat_id


def _needs_vies_check(new_vat: str | None, stored_vat: str | None) -> bool:
    """Идти ли в VIES за этим номером прямо сейчас.

    Сюда доезжает только европейский номер (см. `_vat_for_country`), поэтому
    условий два: номер есть и номер ИЗМЕНИЛСЯ. Перепроверять неизменившийся
    нельзя — правка адреса в день, когда реестр лежит, упиралась бы в 422 из-за
    номера, который мы сами уже проверили.
    """
    return bool(new_vat) and new_vat != stored_vat


@router.get("/profile", response_model=BillingProfileRead)
async def get_billing_profile(user: User = Depends(get_current_user)):
    """Реквизиты плательщика. Гейт — АККАУНТ, а не студия.

    `get_current_user`, а не `require_role("owner")`: адрес принадлежит человеку и
    переезжает с ним в любую его студию. Привяжи мы его к роли в текущей студии —
    владелец второй студии увидел бы пустую форму и заполнял её заново, ровно то,
    ради чего реквизиты и вынесены на аккаунт.
    """
    return billing_profile(user)


@router.put("/profile", response_model=BillingProfileRead)
async def save_billing_profile(
    body: BillingProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Сохранить/поправить реквизиты. Один и тот же эндпоинт для формы перед первой
    оплатой и для кнопки «Редактировать» во вкладке «Способ оплаты» — форма там одна.

    Номер НДС проходит здесь два рубежа, и это единственное место, где он попадает
    в продукт:

    1. ФОРМАТ. Не похож на номер этой страны — 422, в реестр не ходим вовсе.
    2. РЕЕСТР (VIES). «Такого нет» — 422. «Не отвечает» — номер СОХРАНЯЕМ, но
       помечаем неподтверждённым (`billing_vat_verified=False`).

    Третьего исхода «отказать из-за молчащего реестра» больше нет намеренно: узел
    отдельной страны ЕС лежит регулярно, и терять из-за этого покупателя нельзя.
    Цена компромисса известна и берётся на себя платформой в правильную сторону —
    неподтверждённый номер В STRIPE НЕ УЕЗЖАЕТ (checkout._ensure_customer), значит
    плательщику выставляется ПОЛНЫЙ НДС вместо reverse charge. Ошибиться в сторону
    переплаты налога можно (её возвращает поддержка), в сторону недобора — нет:
    его снимут с платформы. Сверку повторяет фоновый проход
    (webhook.recheck_vat_numbers), и по её успеху номер начинает работать сам.

    В Stripe отсюда НЕ пишем: у аккаунта без студии клиента Stripe ещё нет, а у
    аккаунта с двумя студиями их два. Синхронизацию делает оформление оплаты
    (checkout._ensure_customer) — там известно, какой именно студии платят.
    """
    # Страна решает, есть ли поле НДС вообще: вне ЕС номер не хранится.
    vat_id = _vat_for_country(body.vat_id, body.country)
    verified = user.billing_vat_verified

    if _needs_vies_check(vat_id, user.billing_vat_id):
        if not vies.format_ok(body.country, vat_id):
            raise HTTPException(status_code=422, detail={
                "code": "billing.vat_bad_format",
                "message": "Номер НДС не похож на номер выбранной страны — проверьте его",
            })
        valid = await vies.verify(vat_id)
        if valid is False:
            raise HTTPException(status_code=422, detail={
                "code": "billing.vat_invalid",
                "message": "VIES не знает такого номера НДС — проверьте его или сохраните без номера",
            })
        # None (реестр молчит) → verified=False: номер сохранён, но не работает.
        verified = valid is True

    user.billing_country = body.country
    user.billing_line1 = body.line1
    user.billing_line2 = body.line2
    user.billing_postal_code = body.postal_code
    user.billing_city = body.city
    user.billing_vat_id = vat_id
    # Номер убрали — подтверждение вместе с ним: иначе следующий, вписанный на
    # день молчащего реестра, унаследовал бы галку от прежнего и уехал в Stripe.
    user.billing_vat_verified = bool(vat_id) and verified
    await db.commit()
    return billing_profile(user)


if __name__ == "__main__":
    # Плашка «месяцев с нами»: неполный месяц не засчитывается, переход года считается.
    assert _months_between(datetime(2026, 1, 15), datetime(2026, 7, 14)) == 5
    assert _months_between(datetime(2026, 1, 15), datetime(2026, 7, 15)) == 6
    assert _months_between(datetime(2025, 11, 30), datetime(2026, 7, 27)) == 7
    assert _months_between(datetime(2026, 7, 27), datetime(2026, 7, 27)) == 0

    # Кнопка «Улучшить тариф» (задача 2): fix/combo + активна + не максимальный тариф → апгрейд есть.
    _row = lambda **kw: SimpleNamespace(**{"billing_mode": "subscription", "status": "active", "plan_name": "s7", **kw})
    assert _upgrade_target(_row()) == "s8"                             # следующая ступень — плюс место
    assert _upgrade_target(_row(billing_mode="combo")) == "s8"
    assert _upgrade_target(_row(billing_mode="percent")) is None       # % от оборота — апгрейда нет
    assert _upgrade_target(_row(plan_name="unlimited")) is None        # максимальная ступень
    # Легаси-имя читается каноническим: студия на «pro» видит апгрейд, а не пустоту.
    assert _upgrade_target(_row(plan_name="pro")) == _upgrade_target(_row(plan_name=TRIAL_PLAN))
    assert _upgrade_target(_row(status="past_due")) is None            # неоплаченный не апгрейдим

    # Ступени тарифа переехали в plans.tier — их сравнивает не только activate_model,
    # но и checkout._live_plan_name; самопроверка живёт там же, рядом с каталогом.

    # Экономия за период считается по каталогу с ОБЕИХ сторон и не зависит от НДС,
    # который Stripe накинул сверху (из-за него прежняя формула показывала ноль).
    assert _period_saving("s2", 1) == 0                        # помесячно скидки нет
    assert _period_saving("s2", 12) == 1500 * 12 - 10800       # 40% за год
    assert _period_saving("s2", 6) == 1500 * 6 - 6750          # 25% за полгода
    assert _period_saving("unlimited", 12) > _period_saving("unlimited", 6)
    # Счёт за комиссию и легаси-строки не роняют плашку и ничего не «экономят».
    assert _period_saving("offline_fee", 1) == 0
    assert _period_saving("s2", 24) == 0                       # периода 24 в каталоге нет

    # CSV-экранирование/BOM теперь проверяет services/exporter.py (задача 4) — не дублируем тут.
    print("billing router self-check ok")

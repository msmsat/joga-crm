"""Биллинг: каталог тарифов (источник истины о ценах) + чтение подписки студии.

Всё — только owner (ТЗ: раздел «Тариф и оплата» доступен владельцу).
Оплата/вебхуки/возвраты — отдельные задачи эпика 5; здесь только read + каталог.
"""
import logging
from datetime import date, datetime, timedelta
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

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
    PLANS, PERIOD_DISCOUNTS, PERCENT_ONLY_RATE, COMBO_PERCENT_RATE, COMBO_FIXED, amount_for,
)
from services import offline_fee_billing, platform_fee, stripe_billing
from activity import log_activity
from services.exporter import csv_stream
from services.notifier import _studio_prefs, _CURRENCY_SIGNS
from .checkout import router as checkout_router
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
OFFLINE_TERMS = {
    "version": "2026-08-1",
    "grace_days": offline_fee_billing.GRACE_DAYS,
    "percent_rate": PERCENT_ONLY_RATE,
    "combo_rate": COMBO_PERCENT_RATE,
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
    # Экономия: во сколько тот же период обошёлся бы помесячно минус фактически оплаченное.
    saved = sum(
        max(0, PLANS[inv.plan_name]["price"] * inv.period_months - inv.amount)
        for inv in paid if inv.plan_name in PLANS
    )
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
            next_charge = amount_for(plan.plan_name, paid[-1].period_months if paid else 1)
        # percent: фикса нет, списывать по расписанию нечего — остаётся 0

    return BillingStatsRead(
        total_spent=total_spent,
        months_with_us=months,
        saved=saved,
        next_charge=next_charge,
        next_charge_at=plan.expires_at.isoformat() if plan and plan.expires_at else None,
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

    unpaid = (await db.execute(
        select(BillingInvoice)
        .where(
            BillingInvoice.studio_id == ctx.studio_id,
            BillingInvoice.kind == "offline_fee",
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

    return OfflineFeeStatus(
        accrued=accrued,
        accrued_currency=accrued_currency,
        outstanding=outstanding,
        currency=stripe_billing.CURRENCY.upper(),
        due_at=earliest.due_at.isoformat() if earliest is not None else None,
        days_left=days_left,
        suspended=await platform_fee.studio_suspended(db, ctx.studio_id),
        hosted_invoice_url=next((i.hosted_invoice_url for i in unpaid if i.hosted_invoice_url), None),
        rate=plan.percent_rate if plan is not None else None,
        grace_days=offline_fee_billing.GRACE_DAYS,
    )


@router.post("/offline-fees/pay", response_model=OfflineFeeStatus)
async def pay_offline_fees(
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
    """Тумблеры вкладки «Способ оплаты» (частичный апдейт). Автосписание — только по карте (аудит §4)."""
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=400, detail="Нет активной подписки")

    if body.auto_renewal:
        card = (await db.execute(select(PaymentCard).where(
            PaymentCard.user_id == ctx.user.id, PaymentCard.method_type == "card"
        ))).scalar_one_or_none()
        if card is None:
            raise HTTPException(status_code=400, detail="Автосписание доступно только при оплате картой")

    for field in ("auto_renewal", "email_receipt_enabled", "notify_before_autocharge", "sms_notification_enabled"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)

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
async def sync_invoice(
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
    "ru": {"card": "Карта", "iban": "IBAN"},
    "en": {"card": "Card", "iban": "IBAN"},
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


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _render_receipt_pdf(inv: BillingInvoice) -> bytes:
    """Минимальный PDF-чек без внешних либ (reportlab не в requirements — не тащим).

    ponytail: base-14 Helvetica не несёт кириллицы без embed-шрифта (тяжёлый PDF-движок,
    именно то, что эпик просит не тащить) — лейблы латиницей. Апгрейд: локализовать
    при появлении полноценного PDF-рендера с кастомным шрифтом.
    """
    lines = [
        f"Receipt #{inv.id}",
        f"Plan: {inv.plan_name}",
        f"Amount: {inv.amount / 100:.2f}",
        f"Payment method: {inv.payment_method or '-'}",
        f"Paid at: {inv.paid_at.strftime('%Y-%m-%d %H:%M') if inv.paid_at else '-'}",
        f"Status: {inv.status}",
    ]
    ops = ["BT", "/F1 14 Tf", "50 760 Td", "18 TL"]
    for i, line in enumerate(lines):
        if i > 0:
            ops.append("T*")
        ops.append(f"({_pdf_escape(line)}) Tj")
    ops.append("ET")
    stream_bytes = "\n".join(ops).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> "
        b"/MediaBox [0 0 612 792] /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream_bytes)} >>\nstream\n".encode("latin-1") + stream_bytes + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode("latin-1") + body + b"\nendobj\n"

    xref_offset = len(out)
    n = len(objects) + 1
    out += f"xref\n0 {n}\n".encode("latin-1")
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode("latin-1")
    out += f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode("latin-1")
    return bytes(out)


@router.get("/invoices/{invoice_id}/receipt.pdf")
async def get_receipt(
    invoice_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Чек по оплаченному счёту своей студии. 404 — чужой/несуществующий/не-paid (не палим состояние)."""
    inv = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.id == invoice_id,
        BillingInvoice.studio_id == ctx.studio_id,
    ))).scalar_one_or_none()
    if inv is None or inv.status != "paid":
        raise HTTPException(status_code=404, detail="Чек доступен только для оплаченных счетов")

    return StreamingResponse(
        iter([_render_receipt_pdf(inv)]), media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="receipt-{inv.id}.pdf"'},
    )


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

    # CSV-экранирование/BOM теперь проверяет services/exporter.py (задача 4) — не дублируем тут.
    print("billing router self-check ok")

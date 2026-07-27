"""Биллинг: каталог тарифов (источник истины о ценах) + чтение подписки студии.

Всё — только owner (ТЗ: раздел «Тариф и оплата» доступен владельцу).
Оплата/вебхуки/возвраты — отдельные задачи эпика 5; здесь только read + каталог.
"""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioBillingPlan, BillingInvoice, PaymentCard
from schemas.settings.billing import (
    PlansCatalogRead, PlanRead, PlanLimits,
    BillingPlanRead, InvoiceRead, PaymentCardRead, BillingStatsRead,
    ActivateModelRequest, AutopaySettingsUpdate,
)
from .plans import (
    PLANS, PERIOD_DISCOUNTS, PERCENT_ONLY_RATE, COMBO_PERCENT_RATE, COMBO_FIXED, amount_for,
)
from .checkout import router as checkout_router
from .webhook import router as webhook_router
from .refunds import router as refunds_router

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
    )


def _to_plan_read(row: StudioBillingPlan) -> BillingPlanRead:
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

    # Следующее списание = то же, что спишет /renew: план из подписки, период — из последней оплаты.
    next_charge = 0
    if plan and plan.status == "active":
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
    if row is None:
        row = StudioBillingPlan(studio_id=ctx.studio_id, plan_name=body.plan or "pro")
        db.add(row)
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
    await db.commit()
    await db.refresh(row)
    return _to_plan_read(row)


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


@router.get("/invoices", response_model=list[InvoiceRead])
async def get_invoices(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """История счетов студии, новые сверху. До первой оплаты — пусто."""
    rows = (await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.studio_id == ctx.studio_id)
        .order_by(BillingInvoice.id.desc())
    )).scalars().all()
    return [
        InvoiceRead(
            id=inv.id,
            plan_name=inv.plan_name,
            amount=inv.amount,
            payment_method=inv.payment_method,
            paid_at=inv.paid_at.isoformat() if inv.paid_at else None,
            status=inv.status,
            pdf_url=inv.pdf_url,
        )
        for inv in rows
    ]


@router.get("/invoices/export.csv")
async def export_invoices_csv(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Серверный CSV всех счетов студии (не только загруженной страницы, как на фронте)."""
    rows = (await db.execute(
        select(BillingInvoice)
        .where(BillingInvoice.studio_id == ctx.studio_id)
        .order_by(BillingInvoice.id.desc())
    )).scalars().all()

    buf = io.StringIO()
    buf.write("﻿")  # BOM — Excel корректно читает кириллицу
    w = csv.writer(buf, delimiter=";")  # ; — RU-Excel разделитель
    w.writerow(["Дата", "Описание", "Сумма", "Метод", "Статус", "Чек"])
    for inv in rows:
        w.writerow([
            inv.paid_at.strftime("%d.%m.%Y") if inv.paid_at else "",
            inv.plan_name,
            f"{inv.amount / 100:.2f}",
            inv.payment_method or "",
            inv.status,
            inv.pdf_url or "",
        ])

    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="velora_invoices.csv"'},
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

    # CSV self-check (задача B5): экранирование `;`/кавычек и BOM для Excel-кириллицы.
    _buf = io.StringIO()
    _buf.write("﻿")
    csv.writer(_buf, delimiter=";").writerow(["a;b", 'c"d'])
    _out = _buf.getvalue()
    assert _out.startswith("﻿") and '"a;b"' in _out and '"c""d"' in _out
    print("billing router self-check ok")

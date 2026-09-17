"""Две ленты: откуда приходят деньги и кто входит в продукт."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import BillingInvoice, PlatformRevenueLedger, Studio, User, UserSession
from services.admin_auth import require_admin
from services.platform_stats import period_bounds

router = APIRouter()

# Статусы счёта, означающие «деньги ещё не пришли». Словарь целиком:
# paid, pending, failed, refunded.
UNPAID = ("pending", "failed")


@router.get("/payments")
async def admin_payments(
    days: int = Query(90, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    start, _end = period_bounds(days)

    received = (
        await db.execute(
            select(PlatformRevenueLedger, Studio.name)
            .outerjoin(Studio, Studio.id == PlatformRevenueLedger.studio_id)
            .where(PlatformRevenueLedger.occurred_at >= start)
            .order_by(PlatformRevenueLedger.occurred_at.desc())
            .limit(limit)
        )
    ).all()

    outstanding = (
        await db.execute(
            select(BillingInvoice, Studio.name)
            .outerjoin(Studio, Studio.id == BillingInvoice.studio_id)
            .where(BillingInvoice.status.in_(UNPAID))
            .order_by(BillingInvoice.due_at.asc().nullslast())
            .limit(limit)
        )
    ).all()

    return {
        "received": [
            {
                "studio_id": row.studio_id,
                "studio": name,
                "source": row.source,
                "amount": row.amount,
                "currency": row.currency,
                "occurred_at": row.occurred_at.isoformat() if row.occurred_at else None,
            }
            for row, name in received
        ],
        "outstanding": [
            {
                "studio_id": inv.studio_id,
                "studio": name,
                "kind": inv.kind,
                "plan": inv.plan_name,
                "amount": inv.amount,
                "status": inv.status,
                "period": inv.period,
                "due_at": inv.due_at.isoformat() if inv.due_at else None,
            }
            for inv, name in outstanding
        ],
    }


@router.get("/logins")
async def admin_logins(
    days: int = Query(7, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    start, _end = period_bounds(days)

    rows = (
        await db.execute(
            select(UserSession, User.name, User.email)
            .join(User, User.id == UserSession.user_id)
            .where(UserSession.created_at >= start)
            .order_by(UserSession.created_at.desc())
            .limit(limit)
        )
    ).all()

    return {
        "items": [
            {
                "user_id": session.user_id,
                "name": name,
                "email": email,
                "at": session.created_at.isoformat() if session.created_at else None,
                "device": session.device,
                "platform": session.platform,
                "browser": session.browser,
                "country": session.location_country,
                "city": session.location_city,
                "revoked": session.revoked_at is not None,
            }
            for session, name, email in rows
        ]
    }

"""Список студий: кто это, что у них с тарифом и сколько они заплатили."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    PlatformRevenueLedger,
    Studio,
    StudioBillingPlan,
    StudioMember,
    User,
    UserSession,
)
from services.admin_auth import require_admin

router = APIRouter()


@router.get("/accounts")
async def admin_accounts(
    q: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    # Владелец — активный участник с ролью owner. Роль проверяется вместе со
    # статусом: приглашённый, но не принявший приглашение человек владельцем
    # ещё не является.
    owner_join = (
        select(
            StudioMember.studio_id.label("studio_id"),
            User.id.label("uid"),
            User.name.label("owner_name"),
            User.email.label("owner_email"),
        )
        .join(User, User.id == StudioMember.user_id)
        .where(StudioMember.role == "owner", StudioMember.status == "active")
        .subquery()
    )

    base = select(
        Studio, owner_join.c.uid, owner_join.c.owner_name, owner_join.c.owner_email
    ).outerjoin(owner_join, owner_join.c.studio_id == Studio.id)

    if q and q.strip():
        pattern = f"%{q.strip()}%"
        base = base.where(
            or_(
                Studio.name.ilike(pattern),
                owner_join.c.owner_email.ilike(pattern),
                owner_join.c.owner_name.ilike(pattern),
            )
        )

    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()

    rows = (
        await db.execute(
            base.order_by(Studio.created_at.desc().nullslast(), Studio.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    studio_ids = [row[0].id for row in rows] or [0]
    owner_ids = [row[1] for row in rows if row[1] is not None] or [0]

    plans = {
        plan.studio_id: plan
        for plan in (
            await db.execute(
                select(StudioBillingPlan).where(StudioBillingPlan.studio_id.in_(studio_ids))
            )
        ).scalars()
    }

    # Деньги — разбивкой по валютам, одним запросом на всю страницу списка.
    paid: dict[int, list[dict]] = {}
    money_rows = (
        await db.execute(
            select(
                PlatformRevenueLedger.studio_id,
                PlatformRevenueLedger.currency,
                func.sum(PlatformRevenueLedger.amount),
            )
            .where(PlatformRevenueLedger.studio_id.in_(studio_ids))
            .group_by(PlatformRevenueLedger.studio_id, PlatformRevenueLedger.currency)
            .order_by(PlatformRevenueLedger.currency)
        )
    ).all()
    for sid, currency, amount in money_rows:
        paid.setdefault(sid, []).append({"currency": currency, "amount": int(amount or 0)})

    last_login = dict(
        (
            await db.execute(
                select(UserSession.user_id, func.max(UserSession.created_at))
                .where(UserSession.user_id.in_(owner_ids))
                .group_by(UserSession.user_id)
            )
        ).all()
    )

    items = []
    for studio, uid, owner_name, owner_email in rows:
        plan = plans.get(studio.id)
        seen = last_login.get(uid) if uid is not None else None
        items.append(
            {
                "studio_id": studio.id,
                "name": studio.name,
                # None означает «неизвестно»: у студий, заведённых до появления
                # колонки, даты нет, и подставлять сюда что-либо нельзя.
                "created_at": studio.created_at.isoformat() if studio.created_at else None,
                "owner": {"name": owner_name, "email": owner_email},
                "plan": {
                    "name": plan.plan_name if plan else None,
                    "status": plan.status if plan else None,
                    "cycle": plan.billing_cycle if plan else None,
                    "mode": plan.billing_mode if plan else None,
                },
                "trial_started_at": (
                    plan.trial_started_at.isoformat()
                    if plan and plan.trial_started_at else None
                ),
                "expires_at": (
                    plan.expires_at.isoformat() if plan and plan.expires_at else None
                ),
                "last_login_at": seen.isoformat() if seen else None,
                "paid": paid.get(studio.id, []),
                "is_paying": studio.id in paid,
            }
        )

    return {"total": int(total or 0), "items": items}

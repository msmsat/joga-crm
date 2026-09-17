"""Три ленты: откуда приходят деньги, кто входит в продукт и кто заходит на лендинг."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    BillingInvoice,
    LandingVisit,
    PlatformRevenueLedger,
    Studio,
    User,
    UserSession,
)
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


@router.get("/visits")
async def admin_visits(
    days: int = Query(7, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    before_id: int | None = Query(None, ge=1),
    only_new: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    """Поимённая лента заходов на лендинг: адрес, идентификатор браузера,
    страна, устройство, откуда пришёл и во сколько.

    Листается курсором по `id`, а не смещением: лента живая, наверх постоянно
    добавляются строки, и `offset=50` на следующей странице показывал бы те же
    записи, что уже прочитаны. `id` растёт монотонно, поэтому «всё, что старше
    вот этой строки» остаётся верным и через минуту, и через час.
    """
    start, _end = period_bounds(days)

    query = select(LandingVisit).where(LandingVisit.created_at >= start)
    if before_id is not None:
        query = query.where(LandingVisit.id < before_id)
    if only_new:
        # Первый в жизни заход этого браузера: раньше него по этому же anon_id
        # ничего нет. Считает СУБД, а не выдача, — иначе страница из пятидесяти
        # строк давала бы три новых, и листать пришлось бы вслепую.
        earlier = aliased(LandingVisit)
        query = query.where(
            ~select(earlier.id)
            .where(
                earlier.anon_id == LandingVisit.anon_id,
                or_(
                    earlier.created_at < LandingVisit.created_at,
                    and_(
                        earlier.created_at == LandingVisit.created_at,
                        earlier.id < LandingVisit.id,
                    ),
                ),
            )
            .exists()
        )

    rows = (
        await db.execute(query.order_by(LandingVisit.id.desc()).limit(limit))
    ).scalars().all()

    # История каждого браузера из выдачи: первый заход и сколько всего было.
    # Один запрос по попавшим в страницу anon_id, а не по одному на строку —
    # иначе двести строк превращаются в двести запросов.
    history: dict[str, tuple[object, int]] = {}
    if rows:
        seen_ids = {row.anon_id for row in rows}
        history = {
            anon: (first_at, int(total or 0))
            for anon, first_at, total in (
                await db.execute(
                    select(
                        LandingVisit.anon_id,
                        func.min(LandingVisit.created_at),
                        func.count(LandingVisit.id),
                    )
                    .where(LandingVisit.anon_id.in_(seen_ids))
                    .group_by(LandingVisit.anon_id)
                )
            ).all()
        }

    items = []
    for row in rows:
        first_at, total = history.get(row.anon_id, (row.created_at, 1))
        items.append(
            {
                "id": row.id,
                "anon_id": row.anon_id,
                # Адрес показывается только здесь и только владельцу продукта.
                # Пусто — заход случился до того, как адреса начали собирать.
                "ip": row.ip,
                "path": row.path,
                "referrer": row.referrer,
                "utm_source": row.utm_source,
                "utm_medium": row.utm_medium,
                "utm_campaign": row.utm_campaign,
                "country": row.country,
                "region": row.region,
                "city": row.city,
                "device": row.device,
                "lang": row.lang,
                "at": row.created_at.isoformat() if row.created_at else None,
                # Первый заход этого браузера за всю историю, а не за период:
                # иначе вернувшийся через месяц человек снова звался бы новым.
                "is_new": first_at == row.created_at,
                "first_at": first_at.isoformat() if first_at else None,
                "visits_total": total,
            }
        )

    # Курсор следующей страницы. None — дальше ничего нет, и лента должна
    # перестать просить добавку, а не крутить пустые запросы до конца времён.
    return {
        "items": items,
        "next_before_id": items[-1]["id"] if len(rows) == limit else None,
    }

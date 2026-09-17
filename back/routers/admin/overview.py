"""Обзор платформы и трафик лендинга."""
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import LandingVisit, Studio, StudioBillingPlan, User
from services import presence
from services.admin_auth import require_admin
from services.platform_stats import money_by_currency, paying_studio_ids, period_bounds

router = APIRouter()


@router.get("/live")
async def admin_live(_claims: dict = Depends(require_admin)):
    """Кто на сайте прямо сейчас. Базу не трогает вовсе — эту ручку опрашивают
    раз в пять секунд, и каждый опрос не должен стоить запроса в Postgres."""
    return presence.counts()


@router.get("/overview")
async def admin_overview(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    start, end = period_bounds(days)
    now = datetime.utcnow()

    visits = (
        await db.execute(
            select(func.count(LandingVisit.id)).where(LandingVisit.created_at >= start)
        )
    ).scalar_one()
    uniques = (
        await db.execute(
            select(func.count(distinct(LandingVisit.anon_id))).where(
                LandingVisit.created_at >= start
            )
        )
    ).scalar_one()
    # Впервые пришедшие: браузеры, у которых САМЫЙ ПЕРВЫЙ визит попал в период.
    # Это не то же самое, что уникальные: человек, заходивший месяц назад и
    # вернувшийся вчера, уникален в обоих периодах, но новый только в том.
    first_seen = (
        select(
            LandingVisit.anon_id.label("anon"),
            func.min(LandingVisit.created_at).label("first_at"),
        )
        .group_by(LandingVisit.anon_id)
        .subquery()
    )
    new_visitors = (
        await db.execute(
            select(func.count()).select_from(first_seen).where(first_seen.c.first_at >= start)
        )
    ).scalar_one()
    registrations = (
        await db.execute(select(func.count(User.id)).where(User.created_at >= start))
    ).scalar_one()
    # Из тех, кто пришёл с лендинга: у аккаунта есть идентификатор браузера,
    # и по нему в таблице визитов есть хотя бы один заход.
    registrations_from_landing = (
        await db.execute(
            select(func.count(User.id)).where(
                User.created_at >= start,
                User.signup_anon_id.isnot(None),
                User.signup_anon_id.in_(select(distinct(LandingVisit.anon_id))),
            )
        )
    ).scalar_one()
    studios_created = (
        await db.execute(select(func.count(Studio.id)).where(Studio.created_at >= start))
    ).scalar_one()

    paying = await paying_studio_ids(db)

    trial_rows = (
        await db.execute(
            select(StudioBillingPlan.studio_id, StudioBillingPlan.expires_at).where(
                StudioBillingPlan.trial_started_at.isnot(None),
                StudioBillingPlan.expires_at.isnot(None),
                StudioBillingPlan.expires_at > now,
            )
        )
    ).all()
    # Пробный считается активным, только пока студия не заплатила: иначе одна и
    # та же студия попадала бы и в «на пробном», и в «платящие».
    active_trials = [(sid, exp) for sid, exp in trial_rows if sid not in paying]
    expiring_7d = [sid for sid, exp in active_trials if (exp - now).days <= 7]

    trials_started = (
        await db.execute(
            select(func.count(StudioBillingPlan.id)).where(
                StudioBillingPlan.trial_started_at >= start
            )
        )
    ).scalar_one()

    return {
        "days": days,
        "visits": int(visits or 0),
        "unique_visitors": int(uniques or 0),
        "new_visitors": int(new_visitors or 0),
        # Вернувшиеся считаются вычитанием намеренно: обе части посчитаны по
        # одному и тому же множеству anon_id за один период, и третий запрос
        # дал бы ровно это же число.
        "returning_visitors": int(uniques or 0) - int(new_visitors or 0),
        "registrations": int(registrations or 0),
        "studios_created": int(studios_created or 0),
        "trials_active": len(active_trials),
        "trials_expiring_7d": len(expiring_7d),
        "paying_studios": len(paying),
        "revenue": await money_by_currency(db, start, end),
        # Воронка за период. Каждая ступень — независимый счётчик, а не доля
        # предыдущей: человек мог зайти в прошлом месяце, а зарегистрироваться
        # в этом, и вычитать одно из другого было бы неверно.
        "funnel": {
            "visits": int(uniques or 0),
            "registrations": int(registrations or 0),
            "registrations_from_landing": int(registrations_from_landing or 0),
            "trials_started": int(trials_started or 0),
            "paying_studios": len(paying),
        },
    }


def _source_of(referrer: str | None, utm_source: str | None) -> str:
    if utm_source:
        return utm_source
    if not referrer:
        return "direct"
    host = urlparse(referrer).netloc.lower()
    return host.removeprefix("www.") or "direct"


@router.get("/traffic")
async def admin_traffic(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_admin),
):
    start, _end = period_bounds(days)

    by_day = (
        await db.execute(
            select(
                func.date(LandingVisit.created_at).label("d"),
                func.count(LandingVisit.id),
                func.count(distinct(LandingVisit.anon_id)),
            )
            .where(LandingVisit.created_at >= start)
            .group_by("d")
            .order_by("d")
        )
    ).all()

    # Источник считается в Python, а не в SQL: правило «utm_source, иначе домен
    # referrer, иначе direct» на SQL разворачивается в нечитаемый CASE с
    # разбором строки, а строк тут столько, что выигрыш не окупает цену.
    raw = (
        await db.execute(
            select(LandingVisit.referrer, LandingVisit.utm_source).where(
                LandingVisit.created_at >= start
            )
        )
    ).all()
    sources: dict[str, int] = {}
    for referrer, utm_source in raw:
        key = _source_of(referrer, utm_source)
        sources[key] = sources.get(key, 0) + 1

    countries = (
        await db.execute(
            select(LandingVisit.country, func.count(LandingVisit.id))
            .where(LandingVisit.created_at >= start, LandingVisit.country.isnot(None))
            .group_by(LandingVisit.country)
            .order_by(func.count(LandingVisit.id).desc())
            .limit(12)
        )
    ).all()

    return {
        "by_day": [
            {"date": str(day), "visits": int(v or 0), "uniques": int(u or 0)}
            for day, v, u in by_day
        ],
        "sources": sorted(
            ({"key": k, "visits": v} for k, v in sources.items()),
            key=lambda row: row["visits"],
            reverse=True,
        )[:12],
        "countries": [
            {"code": code, "visits": int(count or 0)} for code, count in countries
        ],
    }

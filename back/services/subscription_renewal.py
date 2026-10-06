"""A product-scoped renewal benefit, consumed only by a committed sale."""
from dataclasses import dataclass
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select, update
from models import Client, ClientSubscription, Studio, StudioSubscriptionProgramConfig, SubscriptionPackage
from services import studio_time
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class RenewalCandidate:
    studio_id: int
    client_id: int
    previous_id: int
    package_id: int
    percent: int
    eligible_day: str
    zone: str


async def renewal_candidate(db, studio_id, client_id, package_id, *, now, previous_id=None):
    if now.tzinfo is None:
        raise ValueError('Renewal requires an aware instant')
    config = await db.scalar(select(StudioSubscriptionProgramConfig).where(
        StudioSubscriptionProgramConfig.studio_id == studio_id))
    if not config or not config.is_enabled or not config.renewal_discount_percent:
        return None
    studio = await db.get(Studio, studio_id)
    if not studio or not studio_time.clock(studio).verified:
        return None
    target = await db.get(SubscriptionPackage, package_id)
    if not target or target.studio_id != studio_id or not target.is_active or not target.sold_as_subscription:
        return None
    day = studio_time.to_local(now, studio).date()
    rows = (await db.execute(select(ClientSubscription, SubscriptionPackage)
        .join(Client, Client.id == ClientSubscription.client_id)
        .join(SubscriptionPackage, SubscriptionPackage.id == ClientSubscription.package_id)
        .where(Client.studio_id == studio_id, Client.id == client_id,
            SubscriptionPackage.studio_id == studio_id,
            ClientSubscription.status.in_(('active', 'finished')),
            ClientSubscription.is_frozen.is_(False), ClientSubscription.expires_at == day,
            ClientSubscription.renewal_discount_used.is_(False))
        .order_by(ClientSubscription.id.desc()))).all()
    for sub, previous in rows:
        if previous_id is not None and sub.id != previous_id:
            continue
        # Explicit service sets distinguish group and individual products; no price/name guessing.
        if target.service_ids and set(target.service_ids) == set(previous.service_ids or []):
            return RenewalCandidate(studio_id, client_id, sub.id, package_id,
                                    config.renewal_discount_percent, day.isoformat(), studio.tz_iana)
    return None


def renewal_payload(quote):
    candidate = quote.resolved.renewal
    if candidate is None:
        return {}
    # Stable per eligibility day: retried sessions reuse the same business attempt ID.
    return {'_renewal_quote': {'previous_id':candidate.previous_id,
                              'day':candidate.eligible_day, 'zone':candidate.zone}}


def checkout_renewal_options(checkout):
    snapshot = checkout.payload.get('_renewal_quote')
    if not snapshot:
        return {}
    moment = datetime.fromisoformat(snapshot['day']+'T12:00:00').replace(tzinfo=ZoneInfo(snapshot['zone']))
    return {'quote_at':moment.astimezone(timezone.utc), 'renewal_previous_id':snapshot['previous_id']}


async def consume_renewal(db, candidate):
    if candidate is None:
        return
    client_exists = select(Client.id).where(Client.id == candidate.client_id,
                                            Client.studio_id == candidate.studio_id)
    # Conditional UPDATE is atomic on PostgreSQL and prevents two successful redemptions.
    result = await db.execute(update(ClientSubscription).where(
        ClientSubscription.id == candidate.previous_id,
        ClientSubscription.client_id == candidate.client_id,
        ClientSubscription.client_id.in_(client_exists),
        ClientSubscription.renewal_discount_used.is_(False))
        .values(renewal_discount_used=True).returning(ClientSubscription.id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(409, 'Знижку на продовження вже використано. Оновіть розрахунок.')

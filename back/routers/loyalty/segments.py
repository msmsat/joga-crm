"""Живые сегменты клиентов (V5-4, задача 5).

Сегменты не хранятся в БД — это SQL на лету (общий модуль `loyalty_matching`,
тот же, что питает сценарии). GET отдаёт 5 сегментов с count и превью первых
клиентов. Кампании по сегменту (bulk-бонус / рассылка) — задача 6.
Всё — только owner, скоуп по ctx.studio_id.
"""
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role, StudioContext
from models import Client, ClientSubscription
from routers.clients.loyalty import apply_points_change
from schemas.loyalty import (
    CampaignCreate, CampaignResult, RetentionMonth, RetentionRead, SegmentClientPreview, SegmentRead,
)
from services.loyalty_matching import SEGMENT_MATCHERS, match_segment
from services.mailer import send_email

_RENEWAL_WINDOW_DAYS = 30

router = APIRouter()
logger = logging.getLogger(__name__)

_PREVIEW_LIMIT = 3


@router.get("/segments", response_model=List[SegmentRead])
async def list_segments(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    result: list[SegmentRead] = []
    for key in SEGMENT_MATCHERS:
        matches = await match_segment(db, ctx.studio_id, key)
        preview = [
            SegmentClientPreview(
                client_id=m.client_id,
                name=m.context.get("name", ""),
                days_inactive=m.context.get("days_inactive"),
            )
            for m in matches[:_PREVIEW_LIMIT]
        ]
        result.append(SegmentRead(key=key, count=len(matches), preview=preview))
    return result


@router.post("/segments/{key}/campaign", response_model=CampaignResult)
async def run_campaign(
    key: str,
    body: CampaignCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Кампания по сегменту: начислить баллы и/или разослать письмо каждому
    клиенту сегмента. Клиентов без email письмо пропускает молча. Ответ —
    сколько обработано и сколько писем ушло."""
    if key not in SEGMENT_MATCHERS:
        raise HTTPException(status_code=404, detail="Сегмент не найден")
    if body.action == "points" and not body.points:
        raise HTTPException(status_code=400, detail="Укажите количество баллов")
    if body.action == "email" and not (body.message and body.message.strip()):
        raise HTTPException(status_code=400, detail="Укажите текст письма")

    matches = await match_segment(db, ctx.studio_id, key)
    if not matches:
        return CampaignResult(processed=0, emails_sent=0)

    # email клиентов одним запросом (для рассылки), чтобы не дёргать БД в цикле.
    ids = [m.client_id for m in matches]
    emails = dict((await db.execute(
        select(Client.id, Client.email).where(Client.id.in_(ids), Client.studio_id == ctx.studio_id)
    )).all())

    processed = 0
    emails_sent = 0
    for m in matches:
        try:
            if body.action == "points":
                await apply_points_change(
                    m.client_id, ctx.studio_id, int(body.points),
                    "Бонус по кампании сегмента", db,
                )
            processed += 1
        except Exception:
            logger.exception("campaign points failed for client %s", m.client_id)
            continue

        if body.action == "email":
            to = emails.get(m.client_id)
            if not to:
                continue  # нет email — пропускаем молча
            try:
                await send_email(to, "Сообщение от студии", f"<p>{body.message}</p>")
                emails_sent += 1
            except Exception:
                logger.exception("campaign email failed for client %s", m.client_id)

    await db.commit()  # баллы копятся в транзакции, коммитим один раз
    return CampaignResult(processed=processed, emails_sent=emails_sent)


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _last_six_months(today: date) -> list[str]:
    keys: list[str] = []
    y, m = today.year, today.month
    for _ in range(6):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(keys))


async def fetch_subscription_rows(sid: int, db: AsyncSession) -> list[tuple[int, datetime, date]]:
    """(client_id, created_at, expires_at) абонементов студии с датой покупки,
    отсортированные по клиенту+дате — общий источник для /retention и /analytics/sales."""
    return (await db.execute(
        select(
            ClientSubscription.client_id,
            ClientSubscription.created_at,
            ClientSubscription.expires_at,
        )
        .join(Client, Client.id == ClientSubscription.client_id)
        .where(
            Client.studio_id == sid,
            ClientSubscription.created_at.is_not(None),
        )
        .order_by(ClientSubscription.client_id, ClientSubscription.created_at)
    )).all()


@dataclass
class ClientRenewal:
    eligible: bool          # первый абонемент клиента уже истёк — мог продлить
    renewed: bool           # из eligible — реально продлил (в любой момент после)
    first_expires: date     # дата истечения первого абонемента клиента


@dataclass
class RenewalStats:
    eligible_clients: int  # абонемент истёк — клиент мог продлить
    renewed_clients: int   # из них реально продлившие (в любой момент после)
    sold_by_month: dict[str, int]
    renewed_by_month: dict[str, int]
    total_subs: int
    distinct_clients: int
    by_client: dict[int, ClientRenewal]


def compute_renewal_stats(
    rows: list[tuple[int, datetime, date]], today: date, six_months: set[str] | None = None,
) -> RenewalStats:
    """Продление = покупка в течение 30 дней после окончания предыдущего абонемента
    клиента. Ядро расчёта, общее для /loyalty/retention и /analytics/sales (renewals_pct)."""
    subs_by_client: dict[int, list[tuple[datetime, date]]] = defaultdict(list)
    for cid, created, expires in rows:
        subs_by_client[cid].append((created, expires))

    sold_by_month: dict[str, int] = defaultdict(int)
    renewed_by_month: dict[str, int] = defaultdict(int)
    eligible_clients = 0
    renewed_clients = 0
    by_client: dict[int, ClientRenewal] = {}

    for cid, subs in subs_by_client.items():
        client_renewed = False
        for i, (created, expires) in enumerate(subs):
            mkey = _month_key(created.date())
            if six_months is not None and mkey in six_months:
                sold_by_month[mkey] += 1
            if i > 0:
                prev_expires = subs[i - 1][1]
                if created.date() <= prev_expires + timedelta(days=_RENEWAL_WINDOW_DAYS):
                    client_renewed = True
                    if six_months is not None and mkey in six_months:
                        renewed_by_month[mkey] += 1
        client_eligible = subs[0][1] < today
        if client_eligible:
            eligible_clients += 1
            if client_renewed:
                renewed_clients += 1
        by_client[cid] = ClientRenewal(
            eligible=client_eligible, renewed=client_renewed, first_expires=subs[0][1],
        )

    return RenewalStats(
        eligible_clients=eligible_clients,
        renewed_clients=renewed_clients,
        sold_by_month=sold_by_month,
        renewed_by_month=renewed_by_month,
        total_subs=len(rows),
        distinct_clients=len(subs_by_client),
        by_client=by_client,
    )


@router.get("/retention", response_model=RetentionRead)
async def get_retention(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Аналитика продлений. Считаем ТОЛЬКО по абонементам с датой покупки
    (created_at) — старые строки до миграции честно игнорируем."""
    today = date.today()
    rows = await fetch_subscription_rows(ctx.studio_id, db)

    if not rows:
        return RetentionRead(
            renewal_rate=0, avg_packages_per_client=0.0, has_data=False,
            months=[RetentionMonth(month=k, sold=0, renewed=0) for k in _last_six_months(today)],
        )

    six_months = _last_six_months(today)
    stats = compute_renewal_stats(rows, today, six_months=set(six_months))

    avg_packages = round(stats.total_subs / stats.distinct_clients, 1) if stats.distinct_clients else 0.0
    renewal_rate = (
        round(stats.renewed_clients / stats.eligible_clients * 100) if stats.eligible_clients else 0
    )

    return RetentionRead(
        renewal_rate=renewal_rate,
        avg_packages_per_client=avg_packages,
        has_data=True,
        months=[
            RetentionMonth(
                month=k,
                sold=stats.sold_by_month.get(k, 0),
                renewed=stats.renewed_by_month.get(k, 0),
            )
            for k in six_months
        ],
    )

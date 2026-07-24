"""Матчинг клиентов по условиям (V5-4) — единый источник правды.

Один и тот же SQL питает и исполнитель сценариев (задача 2), и сегменты
(задача 5). Каждая функция триггера возвращает список `Match`: id клиента,
`dedup_key` (кодирует «выход из условия» для идемпотентности — см. модель
`ScenarioFire`) и `context` (данные для действия/письма).

Даты считаем от `date.today()` на стороне питона: SQLite в тестах не умеет
`current_date - interval`, а объём клиентов на MVP небольшой — фильтр по
порогу дней делаем выражением над колонкой, не интервалом.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Callable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Client, ClientSubscription, Lesson, Reservation


@dataclass
class Match:
    client_id: int
    dedup_key: str
    context: dict[str, Any] = field(default_factory=dict)


def _cutoff(days: int) -> date:
    return date.today() - timedelta(days=days)


async def match_inactive(db: AsyncSession, studio_id: int, days: int) -> list[Match]:
    """Активные клиенты, которые ходили, но замолчали на `days`+ дней.
    Никогда не приходившие (last_visit_date is null) сюда НЕ попадают — им не
    место в «мы соскучились», это lost_newcomers (сегменты). dedup_key завязан
    на дату последнего визита — новый визит меняет ключ и сбрасывает дедуп."""
    cutoff = _cutoff(days)
    rows = (await db.execute(
        select(Client.id, Client.name, Client.last_visit_date).where(
            Client.studio_id == studio_id,
            Client.is_active.is_(True),
            Client.last_visit_date.is_not(None),
            Client.last_visit_date <= cutoff,
        )
    )).all()
    return [
        Match(cid, f"lv:{lv.isoformat()}", {"name": name, "days_inactive": (date.today() - lv).days})
        for cid, name, lv in rows
    ]


async def match_low_subscription(db: AsyncSession, studio_id: int, classes_left: int) -> list[Match]:
    """Клиенты с активным абонементом, где осталось `classes_left` занятий или
    меньше (и он не заморожен, не просрочен). dedup_key — id абонемента."""
    today = date.today()
    rows = (await db.execute(
        select(
            ClientSubscription.id,
            ClientSubscription.client_id,
            Client.name,
            (ClientSubscription.total_classes - ClientSubscription.used_classes).label("remaining"),
        )
        .join(Client, Client.id == ClientSubscription.client_id)
        .where(
            Client.studio_id == studio_id,
            ClientSubscription.status == "active",
            ClientSubscription.is_frozen.is_(False),
            ClientSubscription.expires_at >= today,
            (ClientSubscription.total_classes - ClientSubscription.used_classes) <= classes_left,
            (ClientSubscription.total_classes - ClientSubscription.used_classes) > 0,
        )
    )).all()
    return [
        Match(cid, f"sub:{sub_id}", {"name": name, "remaining": remaining})
        for sub_id, cid, name, remaining in rows
    ]


async def match_birthday(db: AsyncSession, studio_id: int) -> list[Match]:
    """Клиенты, у кого сегодня день рождения (по дню и месяцу). dedup_key — год."""
    today = date.today()
    rows = (await db.execute(
        select(Client.id, Client.name, Client.birth_date).where(
            Client.studio_id == studio_id,
            Client.is_active.is_(True),
            Client.birth_date.is_not(None),
        )
    )).all()
    out: list[Match] = []
    for cid, name, bd in rows:
        if bd and bd.month == today.month and bd.day == today.day:
            out.append(Match(cid, str(today.year), {"name": name}))
    return out


async def match_nth_visit(db: AsyncSession, studio_id: int, n: int) -> list[Match]:
    """Клиенты, у которых ровно `n`+ посещений (attended). dedup_key — номер n:
    срабатывает один раз при достижении n-го визита."""
    rows = (await db.execute(
        select(Reservation.client_id, Client.name, func.count(Reservation.id).label("visits"))
        .join(Client, Client.id == Reservation.client_id)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(
            Client.studio_id == studio_id,
            Reservation.status == "attended",
        )
        .group_by(Reservation.client_id, Client.name)
        .having(func.count(Reservation.id) >= n)
    )).all()
    return [Match(cid, str(n), {"name": name, "visits": visits}) for cid, name, visits in rows]


async def match_referral(db: AsyncSession, studio_id: int) -> list[Match]:
    """Реферер завершённого реферала, за которого бонус ещё не выплачен.
    dedup_key — id реферальной записи (по каждому рефералу свой)."""
    from models import ReferralRecord

    rows = (await db.execute(
        select(ReferralRecord.id, ReferralRecord.referrer_client_id, Client.name)
        .join(Client, Client.id == ReferralRecord.referrer_client_id)
        .where(
            ReferralRecord.studio_id == studio_id,
            ReferralRecord.status == "completed",
            ReferralRecord.bonus_paid.is_(False),
        )
    )).all()
    return [Match(cid, f"ref:{rec_id}", {"name": name, "referral_id": rec_id}) for rec_id, cid, name in rows]


# trigger_type → (функция, имена параметров из trigger_params)
TRIGGER_MATCHERS: dict[str, Callable] = {
    "inactive_days": lambda db, sid, p: match_inactive(db, sid, int(p.get("days", 21))),
    "low_subscription": lambda db, sid, p: match_low_subscription(db, sid, int(p.get("classes_left", 2))),
    "birthday": lambda db, sid, p: match_birthday(db, sid),
    "nth_visit": lambda db, sid, p: match_nth_visit(db, sid, int(p.get("n", 5))),
    "referral": lambda db, sid, p: match_referral(db, sid),
}


async def match_clients(db: AsyncSession, studio_id: int, trigger_type: str, params: dict) -> list[Match]:
    """Диспетчер: trigger_type + params → список подходящих клиентов."""
    matcher = TRIGGER_MATCHERS.get(trigger_type)
    if matcher is None:
        return []
    return await matcher(db, studio_id, params or {})


# ─── Сегменты (задача 5) ────────────────────────────────────────────────────
# Тот же источник SQL, что и сценарии. Сегменты не хранятся — считаются на лету.
# Каждая функция отдаёт список Match с context={name, days_inactive|reason} для
# превью; dedup_key не используется (не идемпотентность), пусть будет ключ клиента.


def _days_since(lv: date | None) -> int | None:
    return (date.today() - lv).days if lv else None


async def seg_vip_idle(db: AsyncSession, studio_id: int, days: int = 14) -> list[Match]:
    """VIP, не приходившие `days`+ дней (ходили, но замолчали)."""
    cutoff = _cutoff(days)
    rows = (await db.execute(
        select(Client.id, Client.name, Client.last_visit_date).where(
            Client.studio_id == studio_id,
            Client.status == "vip",
            Client.last_visit_date.is_not(None),
            Client.last_visit_date <= cutoff,
        )
    )).all()
    return [Match(cid, f"c:{cid}", {"name": name, "days_inactive": _days_since(lv)}) for cid, name, lv in rows]


async def seg_expiring_subscription(db: AsyncSession, studio_id: int,
                                    classes_left: int = 2, days_left: int = 7) -> list[Match]:
    """Активный абонемент, где мало занятий (≤classes_left) ИЛИ скоро истекает
    (≤days_left дней). Один клиент — один раз, даже если абонементов несколько."""
    today = date.today()
    expiry_cutoff = today + timedelta(days=days_left)
    rows = (await db.execute(
        select(
            ClientSubscription.client_id, Client.name,
            (ClientSubscription.total_classes - ClientSubscription.used_classes).label("remaining"),
            ClientSubscription.expires_at,
        )
        .join(Client, Client.id == ClientSubscription.client_id)
        .where(
            Client.studio_id == studio_id,
            ClientSubscription.status == "active",
            ClientSubscription.is_frozen.is_(False),
            ClientSubscription.expires_at >= today,
            (ClientSubscription.total_classes - ClientSubscription.used_classes) > 0,
            (
                ((ClientSubscription.total_classes - ClientSubscription.used_classes) <= classes_left)
                | (ClientSubscription.expires_at <= expiry_cutoff)
            ),
        )
    )).all()
    seen: set[int] = set()
    out: list[Match] = []
    for cid, name, remaining, expires in rows:
        if cid in seen:
            continue
        seen.add(cid)
        out.append(Match(cid, f"c:{cid}", {
            "name": name, "remaining": remaining, "days_left": (expires - today).days,
        }))
    return out


async def seg_lost_newcomers(db: AsyncSession, studio_id: int, days: int = 14) -> list[Match]:
    """Пришли ровно один раз и `days`+ дней не возвращались (нет второго визита)."""
    cutoff = _cutoff(days)
    rows = (await db.execute(
        select(Client.id, Client.name, Client.last_visit_date, func.count(Reservation.id).label("visits"))
        .join(Reservation, Reservation.client_id == Client.id)
        .where(
            Client.studio_id == studio_id,
            Reservation.status == "attended",
        )
        .group_by(Client.id, Client.name, Client.last_visit_date)
        .having(func.count(Reservation.id) == 1)
    )).all()
    return [
        Match(cid, f"c:{cid}", {"name": name, "days_inactive": _days_since(lv)})
        for cid, name, lv, _visits in rows
        if lv is None or lv <= cutoff
    ]


async def seg_upsell_candidates(db: AsyncSession, studio_id: int,
                                min_visits: int = 8, window_days: int = 30) -> list[Match]:
    """8+ визитов за последние `window_days` дней, но без активного абонемента —
    ходят активно и платят порознь, пора предложить пакет."""
    since = _cutoff(window_days)
    active_sub = (
        select(ClientSubscription.client_id)
        .where(ClientSubscription.status == "active", ClientSubscription.expires_at >= date.today())
    )
    rows = (await db.execute(
        select(Client.id, Client.name, func.count(Reservation.id).label("visits"))
        .join(Reservation, Reservation.client_id == Client.id)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(
            Client.studio_id == studio_id,
            Reservation.status == "attended",
            Lesson.start_time >= datetime.combine(since, datetime.min.time()),
            Client.id.not_in(active_sub),
        )
        .group_by(Client.id, Client.name)
        .having(func.count(Reservation.id) >= min_visits)
    )).all()
    return [Match(cid, f"c:{cid}", {"name": name, "visits": visits}) for cid, name, visits in rows]


# ключ сегмента → функция матчинга. at_risk переиспользует триггер сценариев.
SEGMENT_MATCHERS: dict[str, Callable] = {
    "at_risk": lambda db, sid: match_inactive(db, sid, 21),
    "vip_idle": lambda db, sid: seg_vip_idle(db, sid, 14),
    "expiring_subscription": lambda db, sid: seg_expiring_subscription(db, sid, 2, 7),
    "lost_newcomers": lambda db, sid: seg_lost_newcomers(db, sid, 14),
    "upsell_candidates": lambda db, sid: seg_upsell_candidates(db, sid, 8, 30),
}


async def match_segment(db: AsyncSession, studio_id: int, key: str) -> list[Match]:
    matcher = SEGMENT_MATCHERS.get(key)
    if matcher is None:
        return []
    return await matcher(db, studio_id)


# ─── Сегменты «лояльные» (EPIC_R3, задача 1) ───────────────────────────────
# В отличие от SEGMENT_MATCHERS выше (точка во времени, для сценариев/кампаний
# Лояльности) — эти скоуплены периодом отчёта (date_from..date_to), поэтому не
# участвуют в SEGMENT_MATCHERS/match_segment, а вызываются напрямую из
# analytics/retention.py.


async def seg_frequent(db: AsyncSession, studio_id: int, date_from: date, date_to: date,
                        min_visits: int = 8) -> list[Match]:
    """≥ min_visits посещений (attended) за период отчёта."""
    rows = (await db.execute(
        select(Client.id, Client.name, func.count(Reservation.id).label("visits"))
        .join(Reservation, Reservation.client_id == Client.id)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(
            Client.studio_id == studio_id,
            Reservation.status == "attended",
            Lesson.start_time >= datetime.combine(date_from, datetime.min.time()),
            Lesson.start_time <= datetime.combine(date_to, datetime.max.time()),
        )
        .group_by(Client.id, Client.name)
        .having(func.count(Reservation.id) >= min_visits)
    )).all()
    return [Match(cid, f"c:{cid}", {"name": name, "visits": visits}) for cid, name, visits in rows]


async def seg_high_ltv(db: AsyncSession, studio_id: int, top_pct: float = 10.0) -> list[Match]:
    """Топ top_pct% клиентов по Σ доходных операций за всё время (LTV, не период)."""
    from models import Operation

    rows = (await db.execute(
        select(Operation.client_id, Client.name, func.sum(Operation.amount).label("spent"))
        .join(Client, Client.id == Operation.client_id)
        .where(
            Client.studio_id == studio_id,
            Operation.type == "in",
            Operation.client_id.is_not(None),
        )
        .group_by(Operation.client_id, Client.name)
        .order_by(func.sum(Operation.amount).desc())
    )).all()
    if not rows:
        return []
    top_n = max(1, round(len(rows) * top_pct / 100))
    return [Match(cid, f"c:{cid}", {"name": name, "spent": int(spent)}) for cid, name, spent in rows[:top_n]]


async def seg_referrers(db: AsyncSession, studio_id: int, date_from: date, date_to: date) -> list[Match]:
    """Клиенты с завершённым рефералом за период (created_at в периоде)."""
    from models import ReferralRecord

    rows = (await db.execute(
        select(ReferralRecord.referrer_client_id, Client.name)
        .join(Client, Client.id == ReferralRecord.referrer_client_id)
        .where(
            ReferralRecord.studio_id == studio_id,
            ReferralRecord.status == "completed",
            ReferralRecord.created_at >= datetime.combine(date_from, datetime.min.time()),
            ReferralRecord.created_at <= datetime.combine(date_to, datetime.max.time()),
        )
        .distinct()
    )).all()
    return [Match(cid, f"c:{cid}", {"name": name}) for cid, name in rows]

"""Именованные скидки студии (`DiscountCampaign`): какая положена этой продаже.

Один ответ на вопрос «действует ли скидка здесь» — для движка цены
(services/pricing.resolve_price), для списка скидок в Лояльности (статус) и для
счётчика охвата в редакторе. Второй копии правил быть не должно: разъехавшись,
они покажут владельцу «действует», а касса возьмёт полную цену.

Кто попадает в группу — та же категория, что фильтр страницы Клиентов
(services/client_segments.category_condition), чтобы «Новички» здесь и там были
одними и теми же людьми. Исключение — именинники: фильтр Клиентов показывает
день рождения сегодня, а скидке нужно окно «за N дней до и N после».
"""
from datetime import date, timedelta
from typing import Iterable, Optional

from sqlalchemy import and_, extract, false, func, or_
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Client, DiscountCampaign, Studio
from services import studio_time
from services.client_segments import SegmentRules, category_condition, get_segment_rules
from services.discounts import apply_discount

SEGMENT_KEYS = ("new", "vip", "active", "inactive", "has_subscription", "birthday")
BIRTHDAY_WINDOW_MAX = 30


def _birthday_window(on: date, days: int):
    """День рождения в окне `on ± days` — набором пар (месяц, день), а не
    арифметикой по году: окно в конце декабря переходит через Новый год.
    Родившиеся 29 февраля в невисокосный год празднуют 28-го."""
    pairs: set[tuple[int, int]] = set()
    for shift in range(-days, days + 1):
        day = on + timedelta(days=shift)
        pairs.add((day.month, day.day))
        leap = day.year % 4 == 0 and (day.year % 100 != 0 or day.year % 400 == 0)
        if (day.month, day.day) == (2, 28) and not leap:
            pairs.add((2, 29))
    return or_(*(
        and_(extract("month", Client.birth_date) == month, extract("day", Client.birth_date) == dom)
        for month, dom in sorted(pairs)
    ))


def segment_condition(key: str, *, today: date, on: date, rules: SegmentRules, birthday_days: int):
    """SQL-условие группы клиентов. `today` — кто клиент СЕЙЧАС (новичок,
    VIP), `on` — дата, к которой примеряют день рождения (день занятия)."""
    if key == "birthday":
        return _birthday_window(on, max(0, min(birthday_days, BIRTHDAY_WINDOW_MAX)))
    cond = category_condition(key, today, rules)
    return cond if cond is not None else false()


def in_period(campaign: DiscountCampaign, on: date) -> bool:
    return ((campaign.valid_from is None or campaign.valid_from <= on)
            and (campaign.valid_until is None or campaign.valid_until >= on))


def covers_item(campaign: DiscountCampaign, *, service_id: Optional[int], package_id: Optional[int]) -> bool:
    """На что действует. Продажа, про которую неизвестно, что продают, получает
    только скидку «на всё»: скидку на йогу нельзя отдать неизвестно чему."""
    if campaign.applies_to == "all":
        return True
    if package_id is not None:
        return package_id in (campaign.package_ids or [])
    if service_id is not None:
        return service_id in (campaign.service_ids or [])
    return False


def status(campaign: DiscountCampaign, today: date) -> str:
    """paused — выключена руками; scheduled — период ещё не начался; ended —
    кончился; active — действует сегодня."""
    if not campaign.is_active:
        return "paused"
    if campaign.valid_from is not None and campaign.valid_from > today:
        return "scheduled"
    if campaign.valid_until is not None and campaign.valid_until < today:
        return "ended"
    return "active"


async def studio_today(db: AsyncSession, studio_id: int) -> date:
    return studio_time.today(await db.get(Studio, studio_id))


async def _client_groups(db: AsyncSession, studio_id: int, client_id: int, keys: Iterable[str],
                         *, today: date, on: date, birthday_days: Iterable[int]) -> dict[str, bool]:
    """В каких группах клиент — одним запросом на все группы всех скидок.
    Именинники с разными окнами — разные столбцы (`birthday:3`, `birthday:7`)."""
    rules = await get_segment_rules(db, studio_id)
    columns = {}
    for key in set(keys):
        if key == "birthday":
            for days in set(birthday_days):
                columns[f"birthday:{days}"] = segment_condition(
                    key, today=today, on=on, rules=rules, birthday_days=days)
        else:
            columns[key] = segment_condition(key, today=today, on=on, rules=rules, birthday_days=0)
    if not columns:
        return {}
    row = (await db.execute(
        select(*(cond.label(name.replace(":", "_")) for name, cond in columns.items()))
        .select_from(Client)
        .where(Client.id == client_id, Client.studio_id == studio_id)
    )).one_or_none()
    if row is None:
        return {name: False for name in columns}
    return {name: bool(value) for name, value in zip(columns, row)}


async def best_campaign(
    db: AsyncSession, studio_id: int, client_id: int, base_price: int, *,
    service_id: Optional[int] = None, package_id: Optional[int] = None, on: Optional[date] = None,
) -> Optional[tuple[DiscountCampaign, int]]:
    """Самая выгодная клиенту скидка студии для этой продажи и её сумма.

    `on` — дата, по которой сверяют период (для занятия — день занятия);
    не названа — сегодня по часам студии. Включена ли программа целиком,
    решает вызывающий (resolve_price смотрит на StudioDiscountConfig).
    """
    campaigns = (await db.execute(
        select(DiscountCampaign)
        .where(DiscountCampaign.studio_id == studio_id, DiscountCampaign.is_active.is_(True))
        .order_by(DiscountCampaign.id)
    )).scalars().all()
    if not campaigns:
        return None
    today = await studio_today(db, studio_id)
    on = on or today

    fitting = [
        c for c in campaigns
        if in_period(c, on)
        and covers_item(c, service_id=service_id, package_id=package_id)
        and (c.min_purchase_amount is None or base_price >= c.min_purchase_amount)
        and (c.audience != "clients" or client_id in (c.client_ids or []))
    ]
    grouped = [c for c in fitting if c.audience == "segments"]
    groups = await _client_groups(
        db, studio_id, client_id, (k for c in grouped for k in c.segments or []),
        today=today, on=on, birthday_days=(c.birthday_window_days for c in grouped),
    ) if grouped else {}

    def reaches(c: DiscountCampaign) -> bool:
        if c.audience != "segments":
            return True
        return any(groups.get(f"birthday:{c.birthday_window_days}" if key == "birthday" else key, False)
                   for key in c.segments or [])

    best: Optional[tuple[DiscountCampaign, int]] = None
    for campaign in fitting:
        if not reaches(campaign):
            continue
        amount = apply_discount(campaign, base_price)
        if amount > 0 and (best is None or amount > best[1]):
            best = (campaign, amount)
    return best


async def reach(db: AsyncSession, studio_id: int, segments: list[str], birthday_days: int) -> dict:
    """Сколько клиентов в каждой группе сейчас и сколько во всех вместе (без
    двойного счёта) — одним запросом. Подпись под плитками групп в редакторе."""
    today = await studio_today(db, studio_id)
    rules = await get_segment_rules(db, studio_id)
    # Счётчик стоит на КАЖДОЙ плитке, а не только на выбранных: по нему и выбирают.
    keys = list(SEGMENT_KEYS)
    conds = {k: segment_condition(k, today=today, on=today, rules=rules, birthday_days=birthday_days)
             for k in keys}
    chosen = [conds[k] for k in keys if k in set(segments)]
    row = (await db.execute(
        select(
            func.count(Client.id).label("all_clients"),
            func.count(Client.id).filter(or_(*chosen) if chosen else false()).label("total"),
            *(func.count(Client.id).filter(cond).label(k) for k, cond in conds.items()),
        ).where(Client.studio_id == studio_id)
    )).one()
    return {
        "clients": row.all_clients,
        "total": row.total,
        "segments": {k: getattr(row, k) for k in keys},
    }

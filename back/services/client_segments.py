"""Категории клиентов на странице «Клиенты» — считаются из данных, а не из
ручного `Client.status`.

Колонка `Client.status` остаётся, но теперь «пиннит» только два случая:
  * ``'frozen'`` — заморозка, явное действие владельца (PATCH /clients/{id}/freeze);
  * ``'vip'``    — VIP вручную, поверх автоматического порога.

Значения ``'new'``/``'active'``/``'inactive'`` в колонке больше ничего не
означают: эти статусы выводятся из даты регистрации, последнего визита и суммы
оплат. Поэтому старые строки мигрировать не нужно — они просто перестают быть
пином и попадают под автоматическое правило (а разморозка, которая ставит
``'active'``, продолжает работать как «снять пин»).

Пять статусов взаимоисключающие, приоритет: frozen > vip > new > active >
inactive. Благодаря этому бейдж в карточке клиента и таб-фильтр всегда
показывают одно и то же, а сумма пяти счётчиков равна общему числу клиентов.
`has_subscription` и `birthday` — независимые срезы, они пересекаются со
статусами (клиент может быть одновременно VIP и с абонементом).
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import and_, extract, func, not_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import Client, ClientPayment, ClientSubscription, Reservation, StudioClientSegmentConfig

# Дефолты — они же значения server_default в таблице studio_client_segment_configs.
# VIP_MIN_SPENT — в валюте студии: ClientPayment.amount хранится в основных
# единицах (цена пакета), поэтому дефолт разумен для рубля; студия правит порог
# под себя в панели «О фильтрах» на странице Клиентов.
NEW_CLIENT_DAYS = 15
ACTIVE_WITHIN_DAYS = 60
VIP_MIN_SPENT = 50_000
VIP_MIN_VISITS = 30

STATUS_KEYS = ("frozen", "vip", "new", "active", "inactive")
OVERLAY_KEYS = ("has_subscription", "birthday")
CATEGORY_KEYS = ("all",) + STATUS_KEYS + OVERLAY_KEYS


@dataclass(frozen=True)
class SegmentRules:
    """Пороги категорий. Дефолты действуют, пока студия не сохранила свои."""
    new_client_days: int = NEW_CLIENT_DAYS
    active_within_days: int = ACTIVE_WITHIN_DAYS
    vip_min_spent: int = VIP_MIN_SPENT
    vip_min_visits: int = VIP_MIN_VISITS


DEFAULT_RULES = SegmentRules()


async def get_segment_rules(db: AsyncSession, studio_id: int) -> SegmentRules:
    """Правила студии; строки нет (настройку не открывали) — отдаём дефолты."""
    cfg = (await db.execute(
        select(StudioClientSegmentConfig).where(StudioClientSegmentConfig.studio_id == studio_id)
    )).scalar_one_or_none()
    if cfg is None:
        return DEFAULT_RULES
    return SegmentRules(
        new_client_days=cfg.new_client_days,
        active_within_days=cfg.active_within_days,
        vip_min_spent=cfg.vip_min_spent,
        vip_min_visits=cfg.vip_min_visits,
    )


# ─── Элементарные предикаты ───────────────────────────────────────────────────

def _frozen_cond():
    return Client.status == "frozen"


def vip_cond(rules: SegmentRules = DEFAULT_RULES):
    """VIP: ручной пин ИЛИ порог по сумме успешных оплат ИЛИ по числу визитов.

    Публичная — retention-инсайты и сегменты лояльности спрашивают «кто VIP»
    и должны видеть тех же людей, что и фильтр на странице клиентов.
    """
    spent = (
        select(ClientPayment.client_id)
        .where(ClientPayment.status == "success")
        .group_by(ClientPayment.client_id)
        .having(func.sum(ClientPayment.amount) >= rules.vip_min_spent)
    )
    visits = (
        select(Reservation.client_id)
        .where(Reservation.status == "attended")
        .group_by(Reservation.client_id)
        .having(func.count(Reservation.id) >= rules.vip_min_visits)
    )
    return or_(
        Client.status == "vip",
        Client.id.in_(spent),
        Client.id.in_(visits),
    )


def _new_cond(today: date, rules: SegmentRules):
    cutoff = datetime.combine(today - timedelta(days=rules.new_client_days), datetime.min.time())
    return Client.registration_date >= cutoff


def _active_cond(today: date, rules: SegmentRules):
    # is_not(None) обязателен: без него NOT (NULL >= cutoff) даёт NULL, и клиенты
    # без единого визита выпали бы и из «активных», и из «неактивных».
    return and_(
        Client.last_visit_date.is_not(None),
        Client.last_visit_date >= today - timedelta(days=rules.active_within_days),
    )


def _has_subscription_cond(today: date):
    """Живой абонемент: не истёк, не заморожен и остались занятия."""
    return Client.id.in_(
        select(ClientSubscription.client_id).where(
            ClientSubscription.status == "active",
            ClientSubscription.is_frozen.is_(False),
            ClientSubscription.expires_at >= today,
            ClientSubscription.used_classes < ClientSubscription.total_classes,
        )
    )


def _birthday_cond(today: date):
    return and_(
        extract("month", Client.birth_date) == today.month,
        extract("day", Client.birth_date) == today.day,
    )


# ─── Условие категории ────────────────────────────────────────────────────────

def category_condition(key: str, today: date | None = None,
                       rules: SegmentRules = DEFAULT_RULES):
    """SQL-условие для таба-фильтра. None — фильтровать не нужно («Все»/неизвестный)."""
    today = today or date.today()
    frozen = _frozen_cond()

    if key == "frozen":
        return frozen
    if key == "vip":
        return and_(not_(frozen), vip_cond(rules))
    if key == "new":
        return and_(not_(frozen), not_(vip_cond(rules)), _new_cond(today, rules))
    if key == "active":
        return and_(
            not_(frozen), not_(vip_cond(rules)), not_(_new_cond(today, rules)),
            _active_cond(today, rules),
        )
    if key == "inactive":
        return and_(
            not_(frozen), not_(vip_cond(rules)), not_(_new_cond(today, rules)),
            not_(_active_cond(today, rules)),
        )
    if key == "has_subscription":
        return _has_subscription_cond(today)
    if key == "birthday":
        return _birthday_cond(today)
    return None


# ─── Статус для карточки ──────────────────────────────────────────────────────

def resolve_status(client: Client, *, visit_count: int, total_spent: int,
                   today: date | None = None, rules: SegmentRules = DEFAULT_RULES) -> str:
    """Тот же приоритет, что и в category_condition — бейдж совпадает с фильтром."""
    today = today or date.today()

    if client.status == "frozen":
        return "frozen"
    if client.status == "vip" or total_spent >= rules.vip_min_spent or visit_count >= rules.vip_min_visits:
        return "vip"
    if client.registration_date and client.registration_date.date() >= today - timedelta(days=rules.new_client_days):
        return "new"
    if client.last_visit_date and client.last_visit_date >= today - timedelta(days=rules.active_within_days):
        return "active"
    return "inactive"

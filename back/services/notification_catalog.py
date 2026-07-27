"""Каталог событий уведомлений (EPIC 3) — источник правды для tier/default_channels
по каждому event_id. В коде, не в БД: событие существует ровно постольку, поскольку
существует шаблон в notifier.TEMPLATES (см. notifier.KNOWN_EVENT_IDS) и вызов notify()
в роутере. Ассерт ниже гарантирует, что каталог не разъедется со списком шаблонов.

tier определяет, что можно отключить (см. docs/ROADMAP_SETTINGS/EPIC_03_NOTIFICATIONS.md):
  - critical    — событие всегда отправляется по default_channels, настройки игнорируются;
  - operational — канал можно выключить, но не последний включённый;
  - optional    — можно выключить событие целиком, любые каналы.
"""
from dataclasses import dataclass
from typing import Literal

from services.notifier import KNOWN_EVENT_IDS


@dataclass(frozen=True)
class EventSpec:
    role: Literal["client", "trainer", "admin", "owner"]
    tier: Literal["critical", "operational", "optional"]
    default_channels: tuple[str, ...]   # что включено у новой студии
    fallback: str = "email"             # гарантированный канал (Задача 2)


CATALOG: dict[str, EventSpec] = {
    # ─── Клиент ───────────────────────────────────────────────────────────
    "c1":  EventSpec("client",  "operational", ("email", "telegram")),  # запись подтверждена
    "c2":  EventSpec("client",  "operational", ("email", "telegram")),  # напоминание о занятии
    "c3":  EventSpec("client",  "critical",    ("email", "telegram")),  # занятие отменено
    "c11": EventSpec("client",  "critical",    ("email", "telegram")),  # занятие перенесено
    "c4":  EventSpec("client",  "critical",    ("email",)),             # оплата получена (чек)
    "c9":  EventSpec("client",  "critical",    ("email",)),             # возврат средств
    "c6":  EventSpec("client",  "operational", ("email",)),             # абонемент закончился
    "c5":  EventSpec("client",  "optional",    ("email",)),             # осталось 1-2 занятия
    "c8":  EventSpec("client",  "optional",    ("email",)),             # запрос отзыва
    "c7":  EventSpec("client",  "optional",    ()),                     # день рождения (маркетинг)
    "c12": EventSpec("client",  "optional",    ()),                     # начислены баллы лояльности
    # ─── Тренер ───────────────────────────────────────────────────────────
    "t1":  EventSpec("trainer", "operational", ("email",)),             # новая запись на занятие
    "t2":  EventSpec("trainer", "operational", ("email",)),             # клиент отменил запись <2ч
    "t3":  EventSpec("trainer", "operational", ("email",)),             # занятие через час
    "t4":  EventSpec("trainer", "operational", ("email",)),             # занятие через 30 мин
    "t5":  EventSpec("trainer", "critical",    ("email",)),             # занятие перенесено
    "t6":  EventSpec("trainer", "critical",    ("email",)),             # зарплата выплачена
    "t7":  EventSpec("trainer", "optional",    ()),                     # новый отзыв (задел N-9)
    "t8":  EventSpec("trainer", "optional",    ()),                     # дни рождения клиентов
    "t9":  EventSpec("trainer", "critical",    ("email",)),             # твоё занятие отменено
    # ─── Администратор ──────────────────────────────────────────────────
    "a1":  EventSpec("admin",   "operational", ("email",)),             # новая онлайн-запись
    "a2":  EventSpec("admin",   "critical",    ("email",)),             # отмена менее чем за час
    "a3":  EventSpec("admin",   "optional",    ("email",)),             # новый клиент
    "a4":  EventSpec("admin",   "operational", ("email",)),             # оплата получена
    "a6":  EventSpec("admin",   "optional",    ()),                     # абонемент клиента на исходе
    "a7":  EventSpec("admin",   "operational", ("email",)),             # конфликт расписания
    "a8":  EventSpec("admin",   "optional",    ()),                     # отчёт за день
    "a9":  EventSpec("admin",   "critical",    ("email",)),             # вход с нового устройства
    "a10": EventSpec("admin",   "critical",    ("email",)),             # оформлен возврат
    # ─── Владелец ────────────────────────────────────────────────────────
    "o1":  EventSpec("owner",   "optional",    ()),                     # ежедневная сводка
    "o2":  EventSpec("owner",   "optional",    ()),                     # еженедельный отчёт
    "o3":  EventSpec("owner",   "optional",    ("email",)),             # крупный платёж
    "o4":  EventSpec("owner",   "optional",    ("email",)),             # падение выручки
    "o5":  EventSpec("owner",   "operational", ("email",)),             # добавлен сотрудник
    "o6":  EventSpec("owner",   "critical",    ("email",)),             # тариф истекает
    "o7":  EventSpec("owner",   "critical",    ("email",)),             # изменены права доступа
    "o8":  EventSpec("owner",   "optional",    ("email",)),             # цель достигнута
    "o9":  EventSpec("owner",   "critical",    ("email",)),             # выполнен экспорт данных
}

assert CATALOG.keys() == KNOWN_EVENT_IDS, (
    "notification_catalog.CATALOG разошёлся с notifier.KNOWN_EVENT_IDS — "
    "у каждого event_id из TEMPLATES должна быть запись в CATALOG и наоборот"
)


def events_for_role(role: str) -> dict[str, EventSpec]:
    """Все события каталога, адресованные роли (client/trainer/admin/owner)."""
    return {event_id: spec for event_id, spec in CATALOG.items() if spec.role == role}


def is_locked(event_id: str) -> bool:
    """True — событие нельзя отключить и его каналы нельзя менять (tier=critical)."""
    spec = CATALOG.get(event_id)
    return spec is not None and spec.tier == "critical"

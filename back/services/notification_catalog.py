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

from services.notifier import KNOWN_EVENT_IDS, NOTIFY_CHANNELS

# Какие каналы вообще имеют смысл для роли — структурное ограничение, а не
# настройка (применяется в notification_resolver.resolve_channels, независимо
# от матрицы и глобальных тумблеров). Telegram — диалоговый канал: писать в
# него можно только тому, кто сам начал диалог (клиент — через мини-приложение
# при записи, Bot API не даёт написать первым). У сотрудника такого пути нет —
# открывать клиентское мини-приложение тренеру или администратору незачем, а
# вручную вписанный chat_id не делает канал осмысленным каналом уведомлений.
# WhatsApp телефон — не диалог, а обычный реквизит из профиля, поэтому доступен
# и персоналу наравне с email. Instagram каналом уведомлений быть перестал
# вовсе — ни у одной роли (см. докстринг services/notifier.py).
ROLE_CHANNELS: dict[str, frozenset[str]] = {
    "client": frozenset(NOTIFY_CHANNELS),
    "trainer": frozenset({"email", "whatsapp"}),
    "admin": frozenset({"email", "whatsapp"}),
    "owner": frozenset({"email", "whatsapp"}),
}


@dataclass(frozen=True)
class EventSpec:
    role: Literal["client", "trainer", "admin", "owner"]
    tier: Literal["critical", "operational", "optional"]
    default_channels: tuple[str, ...]   # что включено у новой студии
    # Гарантированный канал: должен входить в default_channels и быть доступен
    # роли, иначе у новой студии событие некуда отправить. Форс-фолбэком БОЛЬШЕ
    # НЕ ЯВЛЯЕТСЯ — выключенную владельцем галку он не обходит (06.08.2026,
    # см. services/notification_resolver.py); остаётся проверяемым инвариантом
    # дефолтов, который держат ассерты ниже.
    fallback: str = "email"


# Какие галочки стоят у новой студии. Правило одно, и оно про смысл канала,
# а не про «включить побольше»:
#
#   email (E)    — база у всех 38 событий. Гарантия доставки: почта есть у всех,
#                  Telegram может быть не подключён, а у получателя может не быть
#                  tg_id. Ни одно событие не остаётся совсем без канала.
#   telegram (T) — там, где сообщение (а) требует реакции в ближайшие часы или
#                  (б) короткое и личное. НЕ ставим у чеков и финансовых
#                  документов, отчётов и событий безопасности — им место в почте,
#                  где есть история и поиск; и у высокочастотного фона
#                  администратора (каждая запись, каждая оплата, каждый новый
#                  клиент) — иначе мессенджер превращается в ленту, и человек
#                  перестаёт читать в нём вообще всё.
#
# Галочка ≠ отправка: telegram всё равно отсекается resolve_channels'ом, пока у
# студии не подключён бот (StudioIntegration/tg_notify). Поэтому проставленные
# заранее галочки безопасны — они срабатывают ровно в момент подключения канала,
# и владельцу не надо обходить матрицу из 38 строк руками.
#
# У персонала (trainer/admin/owner) вместо telegram — whatsapp: та же логика
# «срочное/личное → мессенджер», но единственный мессенджер, доступный роли
# (ROLE_CHANNELS выше). Смешивать в одном событии оба нельзя — telegram у
# персонала всё равно отфильтруется, а держать его в default_channels для
# несуществующего у роли канала бессмысленно (см. self-check ниже).
_E = ("email",)
_ET = ("email", "telegram")
_EW = ("email", "whatsapp")

CATALOG: dict[str, EventSpec] = {
    # ─── Клиент: мессенджер — его главный канал, почту читают не все ──────
    "c1":  EventSpec("client",  "operational", _ET),   # запись подтверждена — ждёт сразу
    "c2":  EventSpec("client",  "operational", _ET),   # напоминание за 24ч/2ч — срочное
    "c3":  EventSpec("client",  "critical",    _ET),   # занятие отменено — срочное
    "c11": EventSpec("client",  "critical",    _ET),   # занятие перенесено — срочное
    "c5":  EventSpec("client",  "optional",    _ET),   # осталось 1-2 занятия — действие: продлить
    "c6":  EventSpec("client",  "operational", _ET),   # абонемент закончился — действие: продлить
    "c7":  EventSpec("client",  "optional",    _ET),   # день рождения — личное
    "c8":  EventSpec("client",  "optional",    _ET),   # запрос отзыва — в чате отвечают, в почте нет
    "c12": EventSpec("client",  "optional",    _ET),   # начислены баллы — короткое и приятное
    "c13": EventSpec("client",  "optional",    _ET),   # кофе после занятия — социальное, не операционное
    "c4":  EventSpec("client",  "critical",    _E),    # оплата получена — чек, место в почте
    "c9":  EventSpec("client",  "critical",    _E),    # возврат средств — финансовый документ
    # ─── Тренер: в зале, телефон в кармане — расписание в мессенджер ──────
    "t1":  EventSpec("trainer", "operational", _EW),   # новая запись на занятие
    "t2":  EventSpec("trainer", "operational", _EW),   # клиент отменил запись <2ч — срочное
    "t3":  EventSpec("trainer", "operational", _EW),   # занятие через час — письмо бесполезно
    "t4":  EventSpec("trainer", "operational", _EW),   # занятие через 30 мин + состав группы
    "t5":  EventSpec("trainer", "critical",    _EW),   # занятие перенесено — срочное
    "t9":  EventSpec("trainer", "critical",    _EW),   # твоё занятие отменено — срочное
    "t7":  EventSpec("trainer", "optional",    _EW),   # новый отзыв — короткое и приятное
    "t8":  EventSpec("trainer", "optional",    _EW),   # дни рождения клиентов — короткое, с утра
    "t6":  EventSpec("trainer", "critical",    _E),    # зарплата — финансовый документ
    # ─── Администратор: живёт в CRM, поток видит в журнале ────────────────
    "a2":  EventSpec("admin",   "critical",    _EW),   # отмена <1ч — надо срочно среагировать
    "a7":  EventSpec("admin",   "operational", _EW),   # конфликт расписания — надо разрулить
    "a6":  EventSpec("admin",   "optional",    _EW),   # абонемент клиента на исходе — повод позвонить
    "a1":  EventSpec("admin",   "operational", _E),    # новая онлайн-запись — фоновый поток
    "a3":  EventSpec("admin",   "optional",    _E),    # новый клиент — фоновый поток
    "a4":  EventSpec("admin",   "operational", _E),    # оплата получена — фоновый поток
    "a8":  EventSpec("admin",   "optional",    _E),    # отчёт за день — отчёт
    "a9":  EventSpec("admin",   "critical",    _E),    # вход с нового устройства — безопасность
    "a10": EventSpec("admin",   "critical",    _E),    # оформлен возврат — финансовый документ
    # ─── Владелец: в мессенджер — пульс бизнеса, в почту — документы ──────
    "o1":  EventSpec("owner",   "optional",    _EW),   # ежедневная сводка — 3 строки утром
    "o3":  EventSpec("owner",   "optional",    _EW),   # крупный платёж — редкое и приятное
    "o4":  EventSpec("owner",   "optional",    _EW),   # падение выручки — надо среагировать
    "o6":  EventSpec("owner",   "critical",    _EW),   # тариф истекает — действие: оплатить
    "o8":  EventSpec("owner",   "optional",    _EW),   # цель достигнута — короткое и приятное
    "o2":  EventSpec("owner",   "optional",    _E),    # еженедельный отчёт — длинный отчёт
    "o5":  EventSpec("owner",   "operational", _E),    # добавлен сотрудник
    "o7":  EventSpec("owner",   "critical",    _E),    # изменены права доступа — безопасность
    "o9":  EventSpec("owner",   "critical",    _E),    # выполнен экспорт данных — аудит
}

assert CATALOG.keys() == KNOWN_EVENT_IDS, (
    "notification_catalog.CATALOG разошёлся с notifier.KNOWN_EVENT_IDS — "
    "у каждого event_id из TEMPLATES должна быть запись в CATALOG и наоборот"
)

for _eid, _spec in CATALOG.items():
    assert set(_spec.default_channels) <= ROLE_CHANNELS[_spec.role], (
        f"{_eid}: default_channels {_spec.default_channels} содержит канал, "
        f"недоступный роли {_spec.role} (см. ROLE_CHANNELS) — галка в матрице "
        f"стояла бы на канале, который для этой роли никогда не отправится"
    )
    assert _spec.fallback in ROLE_CHANNELS[_spec.role], (
        f"{_eid}: fallback={_spec.fallback} недоступен роли {_spec.role}"
    )
    assert _spec.fallback in _spec.default_channels, (
        f"{_eid}: fallback={_spec.fallback} не входит в default_channels — у новой "
        f"студии событие не уйдёт никуда, а страховать это форс-фолбэком мы больше не будем"
    )
del _eid, _spec


def events_for_role(role: str) -> dict[str, EventSpec]:
    """Все события каталога, адресованные роли (client/trainer/admin/owner)."""
    return {event_id: spec for event_id, spec in CATALOG.items() if spec.role == role}


def is_locked(event_id: str) -> bool:
    """True — событие нельзя отключить и его каналы нельзя менять (tier=critical)."""
    spec = CATALOG.get(event_id)
    return spec is not None and spec.tier == "critical"

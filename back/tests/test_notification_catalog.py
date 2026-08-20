"""Самопроверка каталога событий (EPIC 3, Задача 1) — чистый Python, без БД.

Запуск из back/:  python -m tests.test_notification_catalog
"""
import json
import pathlib
import re

from services import notifier
from services.notification_catalog import CATALOG, events_for_role, is_locked


def test_catalog_matches_templates():
    assert CATALOG.keys() == notifier.KNOWN_EVENT_IDS


def test_events_for_role_filters_by_role():
    trainer_events = events_for_role("trainer")
    assert trainer_events, "у тренера должны быть события"
    assert all(spec.role == "trainer" for spec in trainer_events.values())
    assert "c1" not in trainer_events  # событие клиента не должно попасть


def test_events_for_role_unknown_role_is_empty():
    assert events_for_role("nobody") == {}


def test_is_locked_true_only_for_critical():
    critical_ids = [eid for eid, spec in CATALOG.items() if spec.tier == "critical"]
    non_critical_ids = [eid for eid, spec in CATALOG.items() if spec.tier != "critical"]
    assert critical_ids and non_critical_ids
    assert all(is_locked(eid) for eid in critical_ids)
    assert not any(is_locked(eid) for eid in non_critical_ids)


def test_is_locked_unknown_event_is_false():
    assert is_locked("__unknown__") is False


def test_every_spec_has_valid_shape():
    for event_id, spec in CATALOG.items():
        assert spec.role in ("client", "trainer", "admin", "owner"), event_id
        assert spec.tier in ("critical", "operational", "optional"), event_id
        assert isinstance(spec.default_channels, tuple), event_id
        assert spec.fallback == "email", event_id
        # critical/operational не должны стартовать с пустых каналов —
        # иначе новая студия не отправляет обязательные уведомления вовсе.
        if spec.tier != "optional":
            assert spec.default_channels, f"{event_id}: tier={spec.tier} без default_channels"


def test_every_event_has_a_trigger():
    """Событие без вызова notify() — мёртвая строка в матрице: владелец ставит
    галку, а прислать нечего. Ищем event_id по роутерам и сервисам."""
    root = pathlib.Path(__file__).resolve().parent.parent
    found: set[str] = set()
    for folder in ("routers", "services"):
        for path in (root / folder).rglob("*.py"):
            if path.name in ("notification_catalog.py", "notifier.py"):
                continue  # сам каталог и шаблоны — не триггеры
            found |= set(re.findall(r'"(c\d+|t\d+|a\d+|o\d+)"', path.read_text(encoding="utf-8")))
    missing = sorted(set(CATALOG) - found)
    assert not missing, f"события без врезки notify(): {missing}"


def test_every_event_can_reach_someone():
    """У каждого события есть хотя бы один канал по умолчанию, и это email:
    Telegram может быть не подключён, почта есть всегда (см. правило в каталоге)."""
    for event_id, spec in CATALOG.items():
        assert "email" in spec.default_channels, f"{event_id}: нет гарантированного канала"


def test_every_event_has_labels_in_both_locales():
    """Событие без строки в locales/*/notifications.json показывается в матрице
    сырым ключом («events.c10.title») — так в интерфейсе год прожили c10 и c13."""
    root = pathlib.Path(__file__).resolve().parent.parent.parent / "front/src/locales"
    for loc in ("ru", "en"):
        events = json.loads((root / loc / "notifications.json").read_text(encoding="utf-8"))["events"]
        missing = sorted(set(CATALOG) - set(events))
        assert not missing, f"{loc}: события без подписи: {missing}"
        assert not [e for e in events.values() if not e.get("title") or not e.get("desc")]


if __name__ == "__main__":
    test_catalog_matches_templates()
    test_every_event_has_labels_in_both_locales()
    test_every_event_has_a_trigger()
    test_every_event_can_reach_someone()
    test_events_for_role_filters_by_role()
    test_events_for_role_unknown_role_is_empty()
    test_is_locked_true_only_for_critical()
    test_is_locked_unknown_event_is_false()
    test_every_spec_has_valid_shape()
    print("ALL PASS — EPIC 3 Задача 1: notification_catalog")

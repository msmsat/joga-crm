"""Самопроверка каталога событий (EPIC 3, Задача 1) — чистый Python, без БД.

Запуск из back/:  python -m tests.test_notification_catalog
"""
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


if __name__ == "__main__":
    test_catalog_matches_templates()
    test_events_for_role_filters_by_role()
    test_events_for_role_unknown_role_is_empty()
    test_is_locked_true_only_for_critical()
    test_is_locked_unknown_event_is_false()
    test_every_spec_has_valid_shape()
    print("ALL PASS — EPIC 3 Задача 1: notification_catalog")

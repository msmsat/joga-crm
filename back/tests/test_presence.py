"""Счётчик «онлайн»: что живо, что протухло и почему total не сумма.

Запуск из back/:  pytest tests/test_presence.py -v
"""
import time

import pytest

from services import presence


@pytest.fixture(autouse=True)
def clean():
    presence._seen.clear()
    yield
    presence._seen.clear()


def test_counts_by_surface():
    presence.touch("landing", "a")
    presence.touch("landing", "b")
    presence.touch("crm", "c")
    counts = presence.counts()
    assert counts["landing"] == 2
    assert counts["crm"] == 1
    assert counts["miniapp"] == 0


def test_same_person_on_two_surfaces_counts_once():
    # Ради этого total и считается по различным идентификаторам: владелец,
    # открывший кабинет и мини-приложение, не должен выглядеть как два клиента.
    presence.touch("crm", "same")
    presence.touch("miniapp", "same")
    counts = presence.counts()
    assert counts["crm"] == 1 and counts["miniapp"] == 1
    assert counts["total"] == 1


def test_stale_beat_drops_out():
    presence._seen[("landing", "ghost")] = time.monotonic() - presence.TTL_SECONDS - 1
    assert presence.counts()["landing"] == 0


def test_unknown_surface_and_empty_key_ignored():
    presence.touch("wordpress", "a")
    presence.touch("landing", "")
    assert presence.counts()["total"] == 0

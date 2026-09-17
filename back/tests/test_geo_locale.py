"""Язык сайта: из аккаунта, если человек вошёл, иначе по стране IP.

Ломается молча: не та страна или протухший токен, превращённый в 401, —
и лендинг просто открывается не на том языке или уводит гостя на /login.

БД не нужна: заголовок Cloudflare и подмена поиска аккаунта закрывают всё,
кроме чтения самой базы; оно проверяется, только если база скачана.
"""
import asyncio

import pytest
from fastapi import Response

from routers.auth import locale as locale_router
from services import geo_locale


class _Request:
    def __init__(self, headers=None, host="127.0.0.1"):
        self.headers = headers or {}
        self.client = type("C", (), {"host": host})()


def _locale(request, token=None):
    response = Response()
    result = asyncio.run(locale_router.get_locale(request, response, token=token, db=None))
    assert response.headers["cache-control"] == "private, no-store"
    return result


def test_country_maps_to_translated_language():
    assert geo_locale.language_for_country("CZ") == "cs"
    assert geo_locale.language_for_country("sk") == "cs"
    assert geo_locale.language_for_country("AT") == "de"
    assert geo_locale.language_for_country("UA") == "uk"
    # Russian is opt-in. Unknown/unsupported countries use English explicitly.
    assert geo_locale.language_for_country("KZ") == "en"
    assert geo_locale.language_for_country("RU") == "en"
    assert geo_locale.language_for_country("FR") == "en"
    assert geo_locale.language_for_country(None) == "en"


def test_cloudflare_header_wins_and_unknown_is_ignored():
    assert geo_locale.visitor_country("de", "8.8.8.8") == "DE"
    # XX — страна неизвестна, T1 — Tor: это не страны.
    assert geo_locale.visitor_country("XX", "10.0.0.1") is None
    assert geo_locale.visitor_country("T1", None) is None


def test_private_and_broken_addresses_are_not_looked_up():
    for ip in ("127.0.0.1", "10.1.2.3", "172.18.0.5", "::1", "not-an-ip", "", None):
        assert geo_locale.country_for_ip(ip) is None, ip


@pytest.mark.skipif(not geo_locale.DB_PATH.exists(), reason="база GeoIP не скачана: python -m scripts.fetch_geoip")
def test_database_lookup():
    assert geo_locale.country_for_ip("8.8.8.8") == "US"
    # Seznam.cz — чешский адрес.
    assert geo_locale.country_for_ip("77.75.77.222") == "CZ"


def test_guest_gets_language_of_country():
    result = _locale(_Request({"cf-ipcountry": "CZ"}))
    assert (result.language, result.source, result.country) == ("cs", "ip", "CZ")


def test_account_language_beats_country(monkeypatch):
    async def _from_db(token, db):
        return "ru"

    monkeypatch.setattr(locale_router, "_account_language", _from_db)
    result = _locale(_Request({"cf-ipcountry": "CZ"}), token="session")
    assert (result.language, result.source) == ("ru", "account")


def test_account_without_language_falls_back_to_country(monkeypatch):
    # Зарегистрировался, но студии ещё нет: язык даёт страна, и онбординг
    # предложит именно его.
    async def _nothing(token, db):
        return None

    monkeypatch.setattr(locale_router, "_account_language", _nothing)
    result = _locale(_Request({"cf-ipcountry": "DE"}), token="session")
    assert (result.language, result.source) == ("de", "ip")


def test_dead_token_is_a_guest_not_401():
    # Кривой токен падает в get_current_user ещё до базы — ручка обязана
    # проглотить это и ответить по стране, а не 401.
    result = _locale(_Request({"cf-ipcountry": "UA"}), token="garbage")
    assert (result.language, result.source) == ("uk", "ip")


def test_unknown_country_returns_english():
    result = _locale(_Request())
    assert (result.language, result.source) == ("en", "ip")


def test_ip_is_taken_from_proxy_forwarded_visitor(monkeypatch):
    seen = []
    def lookup(ip):
        seen.append(ip)
        return "DE"
    monkeypatch.setattr(geo_locale, "country_for_ip", lookup)
    result = _locale(_Request({"x-forwarded-for": "8.8.8.8, 172.18.0.1"}))
    assert seen == ["8.8.8.8"]
    assert result.language == "de"


def test_no_personal_choice_does_not_inherit_studio_russian(monkeypatch):
    from types import SimpleNamespace
    async def user(**kwargs):
        return SimpleNamespace(language=None)
    async def context(**kwargs):
        return SimpleNamespace(studio_id=1)
    class Database:
        async def get(self, *args):
            return SimpleNamespace(language="ru")
    monkeypatch.setattr(locale_router, "get_current_user", user)
    monkeypatch.setattr(locale_router, "get_studio_context", context, raising=False)
    assert asyncio.run(locale_router._account_language("session", Database())) is None


def test_server_default_is_english_and_russian_remains_available():
    from services.i18n import resolve
    assert resolve(None) == "en"
    assert resolve("") == "en"
    assert resolve("ru") == "ru"


def test_interface_locale_keeps_completed_ui_languages_separate_from_outbound():
    from services.ui_locale import INTERFACE_LANGS, resolve_ui_locale

    assert len(INTERFACE_LANGS) == 22
    assert resolve_ui_locale("fr") == "fr"
    assert resolve_ui_locale("pl") == "pl"
    assert resolve_ui_locale("cz") == "cs"
    assert resolve_ui_locale("unsupported") == "en"

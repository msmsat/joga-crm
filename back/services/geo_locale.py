"""Язык сайта по стране посетителя — пока о человеке в БД ничего нет.

Страну даёт офлайн-база DB-IP «IP to Country Lite» (CC BY 4.0: ссылка на
db-ip.com стоит в подвале лендинга — это условие лицензии, убирать её нельзя).
Внешний API не годится: IP каждого посетителя уходил бы третьей стороне. База
лежит у нас, сеть на запрос не нужна.

Файл кладёт `scripts/fetch_geoip.py` (в Docker — при сборке образа). Нет файла —
страна неизвестна и сайт остаётся на языке по умолчанию. Это штатный исход,
а не ошибка: язык по IP — удобство, от него ничего не зависит.

Если домен уйдёт за Cloudflare, его заголовок CF-IPCountry главнее базы.

Self-check:  python -m services.geo_locale
"""
import ipaddress
import logging
import os
from functools import cache
from pathlib import Path

import maxminddb

logger = logging.getLogger(__name__)

DB_PATH = Path(
    os.getenv("GEOIP_DB_PATH")
    or Path(__file__).resolve().parent.parent / "geoip" / "dbip-country-lite.mmdb"
)

# Страна → язык интерфейса. Только языки, на которые переведён фронт
# (services/i18n.LANGS). Страны вне списка получают None, и фронт остаётся на
# английском. Словакия → чешский: словацкого перевода нет, а чешский словаку
# понятнее английского.
COUNTRY_LANGUAGE: dict[str, str] = {
    "CZ": "cs", "SK": "cs",
    "DE": "de", "AT": "de", "CH": "de", "LI": "de",
    "UA": "uk",
    "RU": "ru", "BY": "ru", "KZ": "ru", "KG": "ru", "UZ": "ru", "TJ": "ru", "TM": "ru",
}

# Cloudflare так помечает неизвестную страну и выход Tor.
_CF_UNKNOWN = frozenset({"XX", "T1"})


@cache
def _reader() -> maxminddb.Reader | None:
    """Базу открываем один раз на процесс: чтение потокобезопасно."""
    try:
        return maxminddb.open_database(str(DB_PATH))
    except (OSError, maxminddb.InvalidDatabaseError) as exc:
        logger.warning("GeoIP: база %s не открылась (%s), язык по IP не определяется", DB_PATH, exc)
        return None


def country_for_ip(ip: str | None) -> str | None:
    """ISO-код страны по адресу. Локальные и служебные адреса — None."""
    if not ip:
        return None
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return None
    # localhost, LAN, сеть Docker: в базе их нет, и искать незачем.
    if not address.is_global:
        return None
    reader = _reader()
    if reader is None:
        return None
    record = reader.get(address)
    country = record.get("country") if isinstance(record, dict) else None
    code = country.get("iso_code") if isinstance(country, dict) else None
    return code.upper() if isinstance(code, str) else None


def visitor_country(cf_country: str | None, ip: str | None) -> str | None:
    """Страна посетителя: заголовок Cloudflare, если он есть, иначе база."""
    code = (cf_country or "").strip().upper()
    if len(code) == 2 and code.isascii() and code.isalpha() and code not in _CF_UNKNOWN:
        return code
    return country_for_ip(ip)


def language_for_country(country: str | None) -> str | None:
    return COUNTRY_LANGUAGE.get((country or "").upper())


if __name__ == "__main__":
    from services.i18n import LANGS

    assert set(COUNTRY_LANGUAGE.values()) <= set(LANGS), "язык без перевода интерфейса"
    assert visitor_country("cz", None) == "CZ"
    assert visitor_country("XX", "127.0.0.1") is None
    assert country_for_ip("192.168.1.10") is None and country_for_ip("мусор") is None
    assert language_for_country("AT") == "de" and language_for_country("FR") is None
    print(f"geo_locale self-check ok — база: {DB_PATH} ({'есть' if _reader() else 'нет'})")

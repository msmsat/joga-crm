"""Откуда пришёл посетитель: язык сайта по стране и место для панели платформы.

Страну, регион и город даёт офлайн-база DB-IP «City Lite» (CC BY 4.0: ссылка на
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
from typing import NamedTuple

import maxminddb
from services.ui_locale import DEFAULT_UI_LANG, INTERFACE_LANGS

logger = logging.getLogger(__name__)

# База DB-IP City Lite: одна на все три вопроса — страна, регион, город.
# Отдельной «страновой» базы больше нет: городская содержит и страну, а две
# базы значили бы два файла, две загрузки и два повода разойтись.
# Старый файл dbip-country-lite.mmdb, если он остался на сервере от прежней
# сборки, продолжает работать — просто без города и региона.
DB_PATH = Path(
    os.getenv("GEOIP_DB_PATH")
    or Path(__file__).resolve().parent.parent / "geoip" / "dbip-city-lite.mmdb"
)

# Страна → язык интерфейса. Это отдельный набор 22 языков CRM-интерфейса;
# ``services.i18n`` по-прежнему обслуживает только исходящие сообщения.
# Страны вне списка получают en. Словакия → чешский: словацкого перевода нет,
# а чешский словаку понятнее английского. Российский IP намеренно не выбирает
# русский: русский остаётся только явным выбором пользователя.
COUNTRY_LANGUAGE: dict[str, str] = {
    "AL": "sq", "XK": "sq",
    "BG": "bg",
    "HR": "hr",
    "CZ": "cs", "SK": "cs",
    "DK": "da",
    "FI": "fi",
    "FR": "fr", "MC": "fr",
    "DE": "de", "AT": "de", "CH": "de", "LI": "de",
    "GR": "el", "CY": "el",
    "HU": "hu",
    "IT": "it", "SM": "it", "VA": "it",
    "NO": "no",
    "PL": "pl",
    "PT": "pt",
    "RO": "ro", "MD": "ro",
    "RS": "sr",
    "ES": "es", "AR": "es", "BO": "es", "CL": "es", "CO": "es",
    "CR": "es", "CU": "es", "DO": "es", "EC": "es", "GQ": "es",
    "GT": "es", "HN": "es", "MX": "es", "NI": "es", "PA": "es",
    "PE": "es", "PR": "es", "PY": "es", "SV": "es", "UY": "es", "VE": "es",
    "SE": "sv",
    "TR": "tr",
    "UA": "uk",
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


class Place(NamedTuple):
    """Откуда пришёл посетитель, насколько это вообще знает адрес.

    Точность тут не обсуждается, а измеряется: страна по адресу почти всегда
    верна, регион обычно, город — это город узла провайдера, и он может
    оказаться соседним. Отдельного поля «район» не существует ни в одной базе
    по IP; иногда район попадает в название города («Brno-Nový Lískovec»),
    потому что так его записал провайдер, а не потому, что адрес его знает.
    Пусто — значит неизвестно, и подставлять сюда догадку нельзя.
    """

    country: str | None = None
    region: str | None = None
    city: str | None = None


def locate_ip(ip: str | None) -> Place:
    """Страна, регион и город по адресу. Локальные и служебные адреса — пусто."""
    if not ip:
        return Place()
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return Place()
    # localhost, LAN, сеть Docker: в базе их нет, и искать незачем.
    if not address.is_global:
        return Place()
    reader = _reader()
    if reader is None:
        return Place()
    record = reader.get(address)
    if not isinstance(record, dict):
        return Place()

    country = record.get("country")
    code = country.get("iso_code") if isinstance(country, dict) else None

    # У DB-IP City Lite у региона нет кода — только английское название
    # (измерено: 'California', 'South Moravian'). Берём последний уровень:
    # там, где уровней два, второй — это область, а первый — федеральный округ.
    subs = record.get("subdivisions")
    region = _name(subs[-1]) if isinstance(subs, list) and subs else None

    return Place(
        country=code.upper() if isinstance(code, str) else None,
        region=region,
        city=_name(record.get("city")),
    )


def _name(node: object) -> str | None:
    """Название из узла базы. Языковых версий в Lite-издании одна — английская;
    берём её, а при её отсутствии первую попавшуюся, лишь бы не потерять город."""
    names = node.get("names") if isinstance(node, dict) else None
    if not isinstance(names, dict) or not names:
        return None
    value = names.get("en") or next(iter(names.values()), None)
    return value.strip()[:80] if isinstance(value, str) and value.strip() else None


def country_for_ip(ip: str | None) -> str | None:
    """ISO-код страны по адресу — то, на чём держится язык сайта."""
    return locate_ip(ip).country


def visitor_country(cf_country: str | None, ip: str | None) -> str | None:
    """Страна посетителя: заголовок Cloudflare, если он есть, иначе база."""
    code = (cf_country or "").strip().upper()
    if len(code) == 2 and code.isascii() and code.isalpha() and code not in _CF_UNKNOWN:
        return code
    return country_for_ip(ip)


def visitor_ip(
    cf_connecting_ip: str | None,
    forwarded_for: str | None,
    client_host: str | None,
) -> str | None:
    """Настоящий адрес посетителя, а не адрес прокси.

    Продукт стоит за двумя посредниками разом: Cloudflare (туннель на
    api.veloria.pro) и Caddy. Для `request.client.host` это значит адрес
    соседнего контейнера — один и тот же для всего интернета.

    Порядок именно такой: `CF-Connecting-IP` Cloudflare ставит сам и подделать
    его снаружи нельзя, а `X-Forwarded-For` приходит списком, где НАШ прокси
    дописывает адрес в конец, а клиент мог прислать свой выдуманный в начале —
    поэтому берётся первый, но только когда заголовка Cloudflare нет вовсе.
    """
    direct = (cf_connecting_ip or "").strip()
    if direct:
        return direct[:45]
    first_hop = (forwarded_for or "").split(",")[0].strip()
    if first_hop:
        return first_hop[:45]
    host = (client_host or "").strip()
    return host[:45] or None


def language_for_country(country: str | None) -> str:
    return COUNTRY_LANGUAGE.get((country or "").upper(), DEFAULT_UI_LANG)


if __name__ == "__main__":
    assert set(COUNTRY_LANGUAGE.values()) <= set(INTERFACE_LANGS), "язык без перевода интерфейса"
    assert visitor_country("cz", None) == "CZ"
    assert visitor_country("XX", "127.0.0.1") is None
    assert country_for_ip("192.168.1.10") is None and country_for_ip("мусор") is None
    assert language_for_country("AT") == "de" and language_for_country("FR") == "fr"
    assert locate_ip(None) == Place() and locate_ip("10.0.0.1") == Place()
    if _reader() is not None:
        # Замерено на живой базе: у Google свой адрес в Маунтин-Вью.
        google = locate_ip("8.8.8.8")
        assert google.country == "US", google
        assert (google.city or "").startswith("Mountain"), google
        assert google.region == "California", google
    assert visitor_ip("203.0.113.9", "198.51.100.1, 10.0.0.1", "172.18.0.5") == "203.0.113.9"
    assert visitor_ip(None, "198.51.100.1, 10.0.0.1", "172.18.0.5") == "198.51.100.1"
    assert visitor_ip(None, None, "172.18.0.5") == "172.18.0.5"
    assert visitor_ip(None, " ", None) is None
    print(f"geo_locale self-check ok — база: {DB_PATH} ({'есть' if _reader() else 'нет'})")

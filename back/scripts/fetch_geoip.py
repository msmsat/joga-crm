"""Скачать базу DB-IP «City Lite»: страна, регион и город по адресу (services/geo_locale.py).

Раньше качалась страновая база (4 МБ). Городская весит 121 МБ и отвечает на все
три вопроса разом — держать обе значило бы две загрузки и два повода разойтись
в данных.

База бесплатная (CC BY 4.0, ссылка на db-ip.com стоит в подвале лендинга) и
выходит раз в месяц, в имени файла стоит месяц. В первые дни месяца свежего файла
может ещё не быть — тогда берём прошлый.

Файл сначала пишется рядом и проверяется поиском по известному адресу, и только
потом заменяет рабочий. Битая загрузка не должна оставить сервер без базы,
которая у него уже была.

Запуск из back/:  python -m scripts.fetch_geoip
В Docker — при сборке образа (Dockerfile). Выход 1 = база не обновлена.
"""
import gzip
import os
import shutil
import sys
import urllib.request
from datetime import date

import maxminddb

from services.geo_locale import DB_PATH

URL = "https://download.db-ip.com/free/dbip-city-lite-{month}.mmdb.gz"
# Публичный резолвер Google: адрес стабилен и в любой версии базы лежит в США,
# в Маунтин-Вью. Город проверяем наравне со страной — иначе страновая база,
# случайно оказавшаяся по этой ссылке, прошла бы проверку и молча лишила
# панель городов.
PROBE_IP, PROBE_COUNTRY, PROBE_CITY = "8.8.8.8", "US", "Mountain View"


def _months() -> list[str]:
    today = date.today()
    previous = date(today.year - (today.month == 1), (today.month - 2) % 12 + 1, 1)
    return [f"{today:%Y-%m}", f"{previous:%Y-%m}"]


def _download(month: str, target: str) -> None:
    request = urllib.request.Request(URL.format(month=month), headers={"User-Agent": "Velora/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response, gzip.GzipFile(fileobj=response) as src, \
            open(target, "wb") as dst:
        shutil.copyfileobj(src, dst)


def _valid(path: str) -> bool:
    try:
        with maxminddb.open_database(path) as reader:
            record = reader.get(PROBE_IP) or {}
    except (OSError, maxminddb.InvalidDatabaseError):
        return False
    if (record.get("country") or {}).get("iso_code") != PROBE_COUNTRY:
        return False
    return ((record.get("city") or {}).get("names") or {}).get("en") == PROBE_CITY


def main() -> int:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    partial = f"{DB_PATH}.part"
    for month in _months():
        try:
            _download(month, partial)
        except OSError as exc:
            print(f"GeoIP {month}: не скачалась ({exc})")
            continue
        if not _valid(partial):
            print(f"GeoIP {month}: файл не читается как база городов")
            continue
        os.replace(partial, DB_PATH)
        print(f"GeoIP {month}: {DB_PATH} ({DB_PATH.stat().st_size // 1024} КБ)")
        return 0
    if os.path.exists(partial):
        os.remove(partial)
    return 1


if __name__ == "__main__":
    sys.exit(main())

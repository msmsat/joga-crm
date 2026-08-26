"""Аудит часовых поясов студий (P1.1).

    python -m scripts.timezones audit          # что известно и что подтверждено
    python -m scripts.timezones set 42 Europe/Prague

ПОЧЕМУ НЕТ КОМАНДЫ «ПРОСТАВИТЬ ВСЕМ». Из офсета зона не выводится: «UTC+2» —
это и Прага летом, и Хельсинки зимой, и Кейптаун круглый год, и у всех трёх
разные правила перевода стрелок. Автоматическая догадка дала бы правильное
время до ближайшего перехода и неправильное после — то есть ошибку, которая
проявится через месяцы и не у всех сразу. Поэтому здесь только два действия:
показать и записать явно названную зону.

Кандидат подсказывается ТОЛЬКО по стране студии (ISO-3166-1 alpha-2) и только
для стран с ровно одной зоной. Для России, США, Казахстана кандидата не будет —
и это правильный ответ, а не пробел.
"""
import asyncio
import sys
from collections import Counter

from sqlalchemy import select, update

from database import async_session_maker
from models import Studio
from services.studio_time import parse

# Страны с ровно одной зоной IANA. Список намеренно короткий — только то, что
# встречается у нас: расширять его наугад значит наращивать поверхность
# догадки. Проверяется утверждением ниже: каждое значение обязано грузиться.
_SINGLE_ZONE_COUNTRY = {
    "CZ": "Europe/Prague",
    "SK": "Europe/Bratislava",
    "PL": "Europe/Warsaw",
    "AT": "Europe/Vienna",
    "HU": "Europe/Budapest",
    "DE": "Europe/Berlin",
    "NL": "Europe/Amsterdam",
    "BE": "Europe/Brussels",
    "IE": "Europe/Dublin",
    "SI": "Europe/Ljubljana",
    "HR": "Europe/Zagreb",
    "RS": "Europe/Belgrade",
    "BG": "Europe/Sofia",
    "RO": "Europe/Bucharest",
    "GR": "Europe/Athens",
    "SE": "Europe/Stockholm",
    "NO": "Europe/Oslo",
    "FI": "Europe/Helsinki",
    "DK": "Europe/Copenhagen",
    "EE": "Europe/Tallinn",
    "LV": "Europe/Riga",
    "LT": "Europe/Vilnius",
    "AE": "Asia/Dubai",
    "IL": "Asia/Jerusalem",
    "TR": "Europe/Istanbul",
    "GB": "Europe/London",
}


async def _audit() -> int:
    async with async_session_maker() as db:
        rows = (await db.execute(
            select(Studio.id, Studio.name, Studio.timezone, Studio.tz_iana, Studio.country)
        )).all()

    verified = [r for r in rows if parse(r.tz_iana)]
    broken = [r for r in rows if r.tz_iana and not parse(r.tz_iana)]
    rest = [r for r in rows if not r.tz_iana]
    candidates = [(r, _SINGLE_ZONE_COUNTRY[r.country]) for r in rest
                  if r.country in _SINGLE_ZONE_COUNTRY]
    unresolvable = [r for r in rest if r.country not in _SINGLE_ZONE_COUNTRY]

    print(f"Студий всего:              {len(rows)}")
    print(f"Зона подтверждена:         {len(verified)}")
    print(f"Есть кандидат по стране:   {len(candidates)}")
    print(f"Определить нечем:          {len(unresolvable)}")
    if broken:
        print(f"ЗАПИСАНА НЕВАЛИДНАЯ ЗОНА:  {len(broken)}  ← читается как «не подтверждена»")

    legacy = Counter(r.timezone for r in rest)
    if legacy:
        print("\nСтарые офсеты у неподтверждённых:")
        for value, count in legacy.most_common(10):
            print(f"  {str(value):<10} {count}")

    if candidates:
        print("\nКандидаты (страна даёт ровно одну зону) — применять по одному:")
        for row, zone in candidates[:50]:
            print(f"  python -m scripts.timezones set {row.id} {zone}    # {row.country}")
        if len(candidates) > 50:
            print(f"  ... и ещё {len(candidates) - 50}")

    if unresolvable:
        print(f"\n{len(unresolvable)} студий без страны или из страны с несколькими зонами.")
        print("Спросить владельца — единственный честный путь: офсет ответа не даёт.")
    return 0


async def _set(studio_id: int, value: str) -> int:
    if parse(value) is None:
        print(f"{value!r} — не зона IANA. Нужна форма «Область/Город», например Europe/Prague.")
        print("Офсеты («UTC+2»), города («Prague») и замороженные псевдонимы («EST») не подходят:")
        print("по ним нельзя узнать правила перехода на летнее время.")
        return 2

    async with async_session_maker() as db:
        studio = (await db.execute(
            select(Studio.id, Studio.name, Studio.tz_iana).where(Studio.id == studio_id)
        )).first()
        if studio is None:
            print(f"Студия {studio_id} не найдена")
            return 1
        await db.execute(update(Studio).where(Studio.id == studio_id).values(tz_iana=value))
        await db.commit()
    was = studio.tz_iana or "не задана"
    print(f"Студия {studio_id} — {studio.name}: {was} → {value}")
    print("Моменты уже сохранённых занятий в БД не изменились — поменялось то,")
    print("как считаются «сегодня», «завтра» и рабочие часы.")
    return 0


def main() -> None:
    args = sys.argv[1:]
    if args[:1] == ["audit"]:
        raise SystemExit(asyncio.run(_audit()))
    if args[:1] == ["set"] and len(args) == 3:
        raise SystemExit(asyncio.run(_set(int(args[1]), args[2])))
    print(__doc__)
    raise SystemExit(2)


if __name__ == "__main__":
    # Самопроверка справочника: строка, не грузящаяся как зона, — это опечатка,
    # которая молча превратила бы подсказку в мусор.
    for country, zone in _SINGLE_ZONE_COUNTRY.items():
        assert parse(zone) is not None, f"{country}: {zone} не грузится"
        assert len(country) == 2
    main()

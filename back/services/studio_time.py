"""Локальное время студии — единственный правильный ответ на «который час» (P1.1).

ЗАЧЕМ. `Studio.timezone` хранит строку вида «UTC+2» — фиксированный сдвиг. Он
не описывает место: у Праги зимой +1, летом +2, и «UTC+2» с равным успехом
означает Прагу летом, Хельсинки зимой или Кейптаун круглый год. Считать по
такому сдвигу «сегодня» и «в 19:00» можно только с точностью до часа два раза в
год — и ровно в те дни, когда клиент придёт не на то занятие. Правильный ответ
даёт только зона IANA (`Europe/Prague`) и её база правил.

ПОДТВЕРЖДЁННОСТЬ — ЧАСТЬ ОТВЕТА. `clock()` возвращает не только зону, но и
признак `verified`. Пока `Studio.tz_iana` не заполнен, зона выведена из
неоднозначного сдвига, и новая функциональность P1 не имеет права отвечать
человеку «завтра в 19:00» так, будто время известно точно. Старые пути
продолжают работать как раньше — это и есть обратная совместимость.

ЧТО КАК ХРАНИТСЯ (замерено по коду, а не предположено)
  - `Lesson.start_time` — naive **локальное стенное время студии**. Никакого
    перевода зон в расписании и записи нет вовсе (проверено: astimezone/ZoneInfo
    в routers/schedule и routers/booking не встречаются). Это ЗНАЧИМО: занятие,
    сохранённое как 02:30 в ночь перевода стрелок, соответствует несуществующему
    или двойному моменту, и §15 задания («занятие уже в UTC, конверсия
    однозначна») к этому репозиторию НЕ относится. Перевод колонки в UTC — не
    этот PR, но и делать вид, что она уже в UTC, нельзя;
  - инфраструктурные отметки (`created_at`, `claimed_at`, `run_after`, …) —
    naive по часам сервера БД (`func.now()`), нужны только для длительностей и
    порядка, человеку не показываются;
  - наружу, человеку — aware-время в зоне студии.

Смешивать naive-локальное с naive-UTC нельзя: сравнение молча даст неверный
ответ. Поэтому `to_utc`/`to_local` принимают и возвращают явно названные вещи, а
не «просто datetime».
"""
import logging
from datetime import date, datetime, timedelta, timezone, tzinfo
from typing import NamedTuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

UTC = timezone.utc


class NonexistentLocalTime(ValueError):
    """Такого локального времени не существует: весной стрелки перевели вперёд.

    Молча сдвинуть человека на час — худшее из возможных: он придёт не тогда.
    """


class AmbiguousLocalTime(ValueError):
    """Такое локальное время было дважды: осенью стрелки перевели назад.

    Выбрать за человека наугад значит с вероятностью 1/2 записать его не на то
    занятие. Спросить дешевле.
    """


class Clock(NamedTuple):
    """Часы студии.

    verified=False — зона выведена из неоднозначного сдвига `Studio.timezone`
    (или её нет вовсе). Считать по ней можно только то, что и раньше считалось;
    отвечать человеку точным временем — нельзя.
    """
    zone: tzinfo
    verified: bool


def parse(value: str | None) -> ZoneInfo | None:
    """Строка -> зона IANA. None, если это не подтверждённая зона.

    Требуем форму «Область/Город» (или ровно «UTC»). Отбрасываем этим не
    придирчивость, а ровно ту проблему, ради которой всё затеяно: `EST`, `MST`,
    `Etc/GMT+2` — валидные ключи с ЗАМОРОЖЕННЫМ сдвигом, и подставленные вместо
    места они вернут нас к «UTC+2» под другим именем. Администратор, которому
    действительно нужен фиксированный сдвиг, укажет его явно через Etc/… — но
    угадать его за него нельзя.
    """
    if not value:
        return None
    value = value.strip()
    if value != "UTC" and "/" not in value:
        return None
    try:
        return ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        return None


def _legacy_zone(value: str | None) -> tzinfo:
    """Сдвиг из старого поля «UTC+3». Только для путей, работавших до P1.1."""
    if value and value.upper().startswith("UTC"):
        try:
            return timezone(timedelta(hours=int(value[3:] or 0)))
        except ValueError:
            pass
    return UTC


def clock(studio) -> Clock:
    """Часы студии и признак того, можно ли им верить точно.

    studio может быть None или строкой отчёта об ошибке — тогда UTC и
    verified=False: молчаливое «сервер знает лучше» здесь недопустимо.
    """
    tz_iana = getattr(studio, "tz_iana", None)
    zone = parse(tz_iana)
    if zone is not None:
        return Clock(zone, True)
    return Clock(_legacy_zone(getattr(studio, "timezone", None)), False)


def now(studio) -> datetime:
    """Текущий момент в зоне студии, aware. От часов ОС не зависит: смена зоны
    сервера не меняет ответ, потому что момент берётся в UTC и переводится."""
    return datetime.now(UTC).astimezone(clock(studio).zone)


def today(studio) -> date:
    """Календарная дата ПО МЕСТУ студии.

    Не `date.today()`: в 23:30 UTC в Праге уже следующее число, и «расписание на
    сегодня» по серверной дате показало бы вчерашний день.
    """
    return now(studio).date()


def tomorrow(studio) -> date:
    """Следующий календарный день студии. Именно +1 день по календарю, а не
    +24 часа: в сутки перевода стрелок их 23 или 25."""
    return today(studio) + timedelta(days=1)


def to_local(instant: datetime, studio) -> datetime:
    """Момент -> локальное время студии, aware. Всегда однозначно.

    naive на входе считается UTC — так хранятся инфраструктурные отметки.
    Перевод «момент -> местное» неоднозначным не бывает никогда, в отличие от
    обратного: там и живут дыра и повтор.
    """
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=UTC)
    return instant.astimezone(clock(studio).zone)


def to_utc(local: datetime, studio) -> datetime:
    """Локальное стенное время студии -> момент в UTC (naive, как хранит БД).

    Поднимает NonexistentLocalTime и AmbiguousLocalTime вместо того, чтобы
    выбрать за человека. Оба случая бывают дважды в год и ровно в них ошибка
    стоит дороже всего.
    """
    if local.tzinfo is not None:
        raise ValueError("ожидается локальное стенное время без зоны")
    zone = clock(studio).zone
    first = local.replace(tzinfo=zone)
    second = local.replace(tzinfo=zone, fold=1)
    if first.utcoffset() != second.utcoffset():
        # Сдвиги разошлись — это либо дыра, либо повтор. Различаем по тому,
        # переживает ли стенное время круговой перевод: у дыры оно уезжает.
        if first.astimezone(UTC).astimezone(zone).replace(tzinfo=None) != local:
            raise NonexistentLocalTime(f"{local:%Y-%m-%d %H:%M} в {zone} не существует")
        raise AmbiguousLocalTime(f"{local:%Y-%m-%d %H:%M} в {zone} встречается дважды")
    return first.astimezone(UTC).replace(tzinfo=None)


if __name__ == "__main__":
    class _S:
        def __init__(self, tz_iana=None, timezone=None):
            self.tz_iana, self.timezone = tz_iana, timezone

    prague = _S(tz_iana="Europe/Prague")

    # Разбор: зона принимается, сдвиг и опечатка — нет.
    assert parse("Europe/Prague") is not None
    assert parse("UTC") is not None
    for bad in ("UTC+2", "Europe/Praha", "Prague", "GMT+17", "", None, "EST", "MST"):
        assert parse(bad) is None, bad

    # Прага: зимой +1, летом +2 — автоматически, без единой таблицы у нас.
    winter = datetime(2026, 1, 15, 19, 0)
    summer = datetime(2026, 7, 15, 19, 0)
    assert to_utc(winter, prague) == datetime(2026, 1, 15, 18, 0)
    assert to_utc(summer, prague) == datetime(2026, 7, 15, 17, 0)
    assert to_utc(winter, prague) != to_utc(summer, prague).replace(month=1, day=15)

    # Момент -> местное: однозначно всегда.
    assert to_local(datetime(2026, 1, 15, 18, 0), prague).hour == 19
    assert to_local(datetime(2026, 7, 15, 17, 0), prague).hour == 19

    # Весенняя дыра и осенний повтор 2026 года: 29 марта и 25 октября.
    try:
        to_utc(datetime(2026, 3, 29, 2, 30), prague)
        raise AssertionError("несуществующее время принято молча")
    except NonexistentLocalTime:
        pass
    try:
        to_utc(datetime(2026, 10, 25, 2, 30), prague)
        raise AssertionError("двойное время разрешено наугад")
    except AmbiguousLocalTime:
        pass
    # Соседние часы тех же суток — обычные.
    assert to_utc(datetime(2026, 3, 29, 4, 30), prague) == datetime(2026, 3, 29, 2, 30)

    # Подтверждённость: старый сдвиг работает, но точным не считается.
    assert clock(prague).verified is True
    legacy = _S(timezone="UTC+2")
    assert clock(legacy).verified is False
    assert clock(legacy).zone.utcoffset(None) == timedelta(hours=2)
    assert clock(None).verified is False
    assert clock(_S()).zone is UTC

    print("studio_time self-check ok")

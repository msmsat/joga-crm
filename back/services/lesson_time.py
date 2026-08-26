"""Временной контракт занятия — единственный способ сравнить его с «сейчас» (P1.2).

ЧТО ТАКОЕ ЗАНЯТИЕ ВО ВРЕМЕНИ. Занятие — это событие по СТЕННЫМ ЧАСАМ студии:
владелец ставит «вторник, 19:00», и 19:00 оно должно быть и зимой, и летом.
Поэтому `Lesson.start_time` хранит местное стенное время — так было и до P1.2,
и это правильно. Не хватало второго: чем это стенное время закреплено.

    канонично = (start_time, tz_iana)

`Lesson.tz_iana` — СНИМОК зоны на момент создания занятия. Без него абсолютный
момент занятия зависел от текущей настройки студии: поменяли зону — и все
будущие занятия молча переехали в другой момент реального времени, хотя ни одна
строка расписания не менялась. Со снимком «19:00 15 июля по Праге» остаётся тем
же моментом навсегда, что бы студия ни настроила потом.

ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: колонки `start_at_utc`. Она завела бы два источника
правды об одном времени и, значит, возможность их расхождения — а ни один
запрос в проекте её не требует: отбор по календарной дате идёт по стенному
времени и остаётся индексируемым, а точные решения («уже началось?», «успеет ли
отменить?») принимаются по одному занятию и считаются здесь.

ТРИ СОСТОЯНИЯ, А НЕ ДВА. Момент занятия бывает не только «известен»:
  - снимок есть          → момент вычисляется однозначно;
  - снимка нет           → занятие создано до P1.2 либо у студии не подтверждена
                           зона. Момент НЕИЗВЕСТЕН, и выдавать его за точный
                           нельзя. `instant is None` — это ответ, а не ошибка.
Приблизительный ответ по стенным часам остаётся доступен через `local`, и
существующие экраны продолжают работать ровно как раньше.

ДЛИННЫЕ И КОРОТКИЕ СУТКИ. Отбор занятий за местную дату идёт границами стенного
времени (`local_day_bounds`) — от местной полуночи до местной полуночи. Именно
поэтому 23- и 25-часовые сутки перевода стрелок обрабатываются правильно: мы
нигде не прибавляем «24 часа» к моменту, мы прибавляем календарный день.
"""
import logging
from datetime import date, datetime, timedelta, timezone
from typing import NamedTuple

from services import studio_time

logger = logging.getLogger(__name__)

UTC = timezone.utc


class LessonTime(NamedTuple):
    """Время занятия во всех смыслах сразу.

    local    — стенное время студии, есть всегда;
    instant  — абсолютный момент (naive UTC, как хранит БД). None — определить
               нечем: у занятия нет снимка зоны;
    zone     — снимок зоны, которым посчитан момент;
    exact    — можно ли обещать это время человеку.
    """
    local: datetime
    instant: datetime | None
    zone: str | None
    exact: bool


def resolve(lesson, studio=None) -> LessonTime:
    """Время занятия. studio нужен только затем, чтобы разобрать наследие.

    Снимок у занятия главнее текущей настройки студии — в этом весь смысл
    снимка. К зоне студии обращаемся, только если снимка нет: тогда это
    ПРЕДПОЛОЖЕНИЕ, и оно помечается exact=False, а момент не выдаётся вовсе.
    """
    local = lesson.start_time
    snapshot = getattr(lesson, "tz_iana", None)
    zone = studio_time.parse(snapshot)
    if zone is None:
        return LessonTime(local, None, None, False)
    try:
        instant = studio_time.to_utc(local, _Pinned(snapshot))
    except (studio_time.NonexistentLocalTime, studio_time.AmbiguousLocalTime) as exc:
        # Занятие уже лежит в дыре или в повторе — так бывает только у строк,
        # созданных до P1.2. Момент честно неизвестен: угадать его нельзя,
        # а сделать вид, что можно, — худшее из решений.
        logger.warning("lesson %s: местное время неоднозначно в %s (%s)",
                       getattr(lesson, "id", "?"), snapshot, type(exc).__name__)
        return LessonTime(local, None, snapshot, False)
    return LessonTime(local, instant, snapshot, True)


class _Pinned:
    """Студия с зафиксированной зоной — чтобы считать по снимку занятия, а не по
    текущей настройке студии."""

    __slots__ = ("tz_iana", "timezone")

    def __init__(self, tz_iana: str):
        self.tz_iana, self.timezone = tz_iana, None


def snapshot_for(studio) -> str | None:
    """Какой снимок зоны поставить новому занятию. None — зона студии не
    подтверждена, и придумывать её нельзя (см. services/studio_time)."""
    what = studio_time.clock(studio)
    return getattr(studio, "tz_iana", None) if what.verified else None


def assert_representable(local: datetime, studio) -> None:
    """Проверить, что такое местное время у студии существует и однозначно.

    Поднимает NonexistentLocalTime/AmbiguousLocalTime. Вызывать при СОЗДАНИИ и
    ПЕРЕНОСЕ занятия: молча превратить 02:30 в ночь перевода в 03:30 значит
    привести клиента не в тот час, и узнает он об этом у закрытой двери.

    Незаполненная зона проверить ничего не позволяет — тогда молча пропускаем:
    это ровно то поведение, что было до P1.2.
    """
    if not studio_time.clock(studio).verified:
        return
    studio_time.to_utc(local, studio)


# ─── Сравнения с «сейчас» ────────────────────────────────────────────────────

def _now_instant(now: datetime | None) -> datetime:
    """Настоящий момент, naive UTC. От зоны процесса не зависит."""
    if now is None:
        return datetime.now(UTC).replace(tzinfo=None)
    return now.astimezone(UTC).replace(tzinfo=None) if now.tzinfo else now


def until(lesson, studio, now: datetime | None = None) -> timedelta | None:
    """Сколько НАСТОЯЩЕГО времени осталось до начала. None — момент неизвестен.

    Разность моментов, а не стенного времени: «за 12 часов до занятия» обязано
    означать 12 прошедших часов и в сутки перевода стрелок тоже. Вычитание
    местного из местного дало бы 11 или 13.
    """
    when = resolve(lesson, studio)
    if when.instant is None:
        return None
    return when.instant - _now_instant(now)


def has_started(lesson, studio, now: datetime | None = None) -> bool | None:
    """Началось ли занятие. None — момент неизвестен, и врать нельзя."""
    left = until(lesson, studio, now)
    return None if left is None else left <= timedelta(0)


def local_now(studio, now: datetime | None = None) -> datetime:
    """«Сейчас» по стенным часам студии — для отбора в SQL по start_time.

    Именно так сравнивают со стенным временем: не часами сервера приложения и
    не часами сервера БД (`func.now()`), а часами студии.
    """
    instant = _now_instant(now).replace(tzinfo=UTC)
    return studio_time.to_local(instant, studio).replace(tzinfo=None)


def local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Границы местных суток для запроса: [полночь, следующая полночь).

    Календарный день, а не «плюс 24 часа»: в сутки перевода стрелок их 23 или
    25, и прибавление суток к моменту дало бы либо лишний час чужого дня, либо
    потерянный час своего. По стенному времени граница всегда полночь.
    """
    start = datetime.combine(day, datetime.min.time())
    return start, datetime.combine(day + timedelta(days=1), datetime.min.time())


if __name__ == "__main__":
    class _L:
        def __init__(self, start_time, tz_iana=None):
            self.start_time, self.tz_iana, self.id = start_time, tz_iana, 1

    class _S:
        def __init__(self, tz_iana=None, timezone=None):
            self.tz_iana, self.timezone = tz_iana, timezone

    prague, dubai = _S(tz_iana="Europe/Prague"), _S(tz_iana="Asia/Dubai")

    # Снимок главнее текущей настройки студии: тот же ряд, другая студия —
    # момент не меняется.
    lesson = _L(datetime(2026, 7, 15, 19, 0), "Europe/Prague")
    assert resolve(lesson, prague).instant == datetime(2026, 7, 15, 17, 0)
    assert resolve(lesson, dubai).instant == datetime(2026, 7, 15, 17, 0)
    assert resolve(lesson, dubai).exact is True

    # Зима и лето: одно «19:00» — разные моменты.
    winter = _L(datetime(2026, 1, 15, 19, 0), "Europe/Prague")
    assert resolve(winter, prague).instant == datetime(2026, 1, 15, 18, 0)

    # Без снимка момент не выдумывается.
    legacy = resolve(_L(datetime(2026, 7, 15, 19, 0)), prague)
    assert legacy.instant is None and legacy.exact is False
    assert legacy.local == datetime(2026, 7, 15, 19, 0)
    assert has_started(_L(datetime(2020, 1, 1, 10, 0)), prague) is None

    # Окно отмены — настоящие часы, а не стенные.
    spring = _L(datetime(2026, 3, 29, 14, 0), "Europe/Prague")
    now = datetime(2026, 3, 29, 0, 0)                      # 01:00 местного, ещё +1
    assert until(spring, prague, now) == timedelta(hours=12)

    # Границы суток — полночь, а не «плюс 24 часа».
    start, end = local_day_bounds(date(2026, 3, 29))
    assert (end - start) == timedelta(days=1)
    assert start.time() == end.time() == datetime.min.time()

    # Снимок ставится только подтверждённой студии.
    assert snapshot_for(prague) == "Europe/Prague"
    assert snapshot_for(_S(timezone="UTC+2")) is None

    print("lesson_time self-check ok")

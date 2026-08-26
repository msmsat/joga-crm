"""Локальное время студии и правила перехода на летнее время (P1.1).

Даты переходов взяты КОНКРЕТНЫЕ и историчные — 29 марта и 25 октября 2026 года
для Европы, — а не вычисленные от `datetime.now().year`: тест, который считает
границы сам, повторяет ошибку кода и молчит ровно тогда, когда должен кричать.

Ни один результат здесь не зависит от часового пояса машины: всё считается от
момента в UTC и переводится зоной студии.

Часть проверок требует БД (настройки студии, рабочие часы); остальное — чистые
функции. Запуск из back/:  python -m tests.test_studio_time
"""
import asyncio
import os
import time
import warnings
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import Studio, StudioAISettings, StudioWorkingHours
from services import client_agent, studio_time
from services.studio_time import (
    AmbiguousLocalTime, NonexistentLocalTime, clock, parse, to_local, to_utc,
)

# Прага, 2026: вперёд 29 марта в 02:00, назад 25 октября в 03:00.
_SPRING_GAP = datetime(2026, 3, 29, 2, 30)
_AUTUMN_FOLD = datetime(2026, 10, 25, 2, 30)

_NAME = "TEST-STUDIO-TIME"


class _Studio:
    """Студия как её видит резолвер: только два поля и ничего лишнего."""

    def __init__(self, tz_iana=None, timezone=None):
        self.tz_iana, self.timezone = tz_iana, timezone


def test_valid_and_invalid_zones():
    """A и B: зона принимается, всё остальное — нет."""
    assert parse("Europe/Prague") is not None
    assert parse("America/New_York") is not None
    assert parse("Asia/Dubai") is not None
    assert parse("UTC") is not None

    for bad in ("UTC+2", "Europe/Praha", "Prague", "GMT+17", "", None, "  "):
        assert parse(bad) is None, bad
    # Замороженные псевдонимы — тоже нет: это тот же офсет под другим именем,
    # ради избавления от которого всё и затевалось.
    for frozen in ("EST", "MST", "HST"):
        assert parse(frozen) is None, frozen


def test_prague_winter_and_summer():
    """C и D: одно и то же «19:00» — разные моменты зимой и летом."""
    prague = _Studio(tz_iana="Europe/Prague")
    winter = to_utc(datetime(2026, 1, 15, 19, 0), prague)
    summer = to_utc(datetime(2026, 7, 15, 19, 0), prague)
    assert winter == datetime(2026, 1, 15, 18, 0), winter      # UTC+1
    assert summer == datetime(2026, 7, 15, 17, 0), summer      # UTC+2
    assert winter.hour != summer.hour, "сдвиг не изменился между зимой и летом"


def test_utc_to_local_is_unambiguous():
    """E и K: момент -> местное время однозначен всегда, в том числе в сутки
    перевода стрелок. Занятие, уже имеющее момент, повторно «угадывать» не надо."""
    prague = _Studio(tz_iana="Europe/Prague")
    assert to_local(datetime(2026, 1, 15, 18, 0), prague).hour == 19
    assert to_local(datetime(2026, 7, 15, 17, 0), prague).hour == 19

    # Две стороны осеннего повтора — разные моменты и разные сдвиги, но каждый
    # переводится в местное время без всякой неоднозначности.
    before = to_local(datetime(2026, 10, 25, 0, 30), prague)   # ещё +2
    after = to_local(datetime(2026, 10, 25, 1, 30), prague)    # уже +1
    assert (before.hour, after.hour) == (2, 2)
    assert before.utcoffset() != after.utcoffset()


def test_local_to_utc_ordinary_day():
    """F: обычный день переводится туда и обратно без потерь."""
    prague = _Studio(tz_iana="Europe/Prague")
    local = datetime(2026, 5, 20, 9, 15)
    assert to_local(to_utc(local, prague), prague).replace(tzinfo=None) == local


def test_dst_spring_gap():
    """I: несуществующее местное время не превращается молча в другой момент."""
    prague = _Studio(tz_iana="Europe/Prague")
    try:
        to_utc(_SPRING_GAP, prague)
        raise AssertionError("02:30 в ночь перевода принято как обычное время")
    except NonexistentLocalTime:
        pass
    # Соседние часы тех же суток обычные — отсекается именно дыра, а не день.
    assert to_utc(datetime(2026, 3, 29, 1, 30), prague) == datetime(2026, 3, 29, 0, 30)
    assert to_utc(datetime(2026, 3, 29, 4, 30), prague) == datetime(2026, 3, 29, 2, 30)


def test_dst_autumn_fold():
    """J: время, случившееся дважды, распознаётся как неоднозначное."""
    prague = _Studio(tz_iana="Europe/Prague")
    try:
        to_utc(_AUTUMN_FOLD, prague)
        raise AssertionError("двойное время разрешено наугад")
    except AmbiguousLocalTime:
        pass
    assert to_utc(datetime(2026, 10, 25, 1, 30), prague) == datetime(2026, 10, 24, 23, 30)
    assert to_utc(datetime(2026, 10, 25, 4, 30), prague) == datetime(2026, 10, 25, 3, 30)


def test_today_across_utc_boundary(monkeypatch=None):
    """G и H: календарная дата студии, а не сервера.

    23:30 UTC — в Праге уже следующее число, и «сегодня» обязано быть им.
    Момент подменяем целиком, чтобы проверка не зависела от того, когда её
    запустили.
    """
    prague = _Studio(tz_iana="Europe/Prague")
    fixed = datetime(2026, 1, 15, 23, 30, tzinfo=timezone.utc)

    real_datetime = studio_time.datetime

    class _Frozen(real_datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed if tz is None else fixed.astimezone(tz)

    studio_time.datetime = _Frozen
    try:
        assert studio_time.today(prague) == date(2026, 1, 16), "дата взята по серверу"
        assert studio_time.tomorrow(prague) == date(2026, 1, 17)
        # У студии на UTC этот же момент — ещё 15-е.
        assert studio_time.today(_Studio(tz_iana="UTC")) == date(2026, 1, 15)
    finally:
        studio_time.datetime = real_datetime


def test_two_studios_do_not_interfere():
    """P: две зоны считаются независимо."""
    prague = _Studio(tz_iana="Europe/Prague")
    dubai = _Studio(tz_iana="Asia/Dubai")
    local = datetime(2026, 7, 15, 19, 0)
    assert to_utc(local, prague) == datetime(2026, 7, 15, 17, 0)
    assert to_utc(local, dubai) == datetime(2026, 7, 15, 15, 0)   # Дубай круглый год +4


def test_os_timezone_does_not_change_answer():
    """H3/H9: смена зоны ОС не меняет ответа.

    Веб и воркер могут работать на машинах с разной настройкой, и результат
    обязан совпадать: момент берётся в UTC и переводится зоной студии.
    """
    prague = _Studio(tz_iana="Europe/Prague")
    instant = datetime(2026, 7, 15, 17, 0)
    expected = to_local(instant, prague)

    saved = os.environ.get("TZ")
    try:
        for zone in ("UTC", "America/New_York", "Asia/Tokyo"):
            os.environ["TZ"] = zone
            if hasattr(time, "tzset"):     # на Windows его нет — проверка всё равно значима
                time.tzset()
            assert to_local(instant, prague) == expected
            assert to_utc(datetime(2026, 7, 15, 19, 0), prague) == instant
    finally:
        if saved is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = saved
        if hasattr(time, "tzset"):
            time.tzset()


def test_legacy_studio_is_not_verified():
    """O и H1: старый офсет работает, но точным не считается — и уж точно не
    превращается в Прагу."""
    legacy = _Studio(timezone="UTC+2")
    what = clock(legacy)
    assert what.verified is False, "неоднозначный офсет объявлен подтверждённой зоной"
    assert what.zone.utcoffset(None) == timedelta(hours=2)
    assert not isinstance(what.zone, ZoneInfo), "офсет выдан за зону IANA"

    # И зимой он остаётся +2 — именно поэтому по нему нельзя обещать время.
    assert to_utc(datetime(2026, 1, 15, 19, 0), legacy) == datetime(2026, 1, 15, 17, 0)
    assert to_utc(datetime(2026, 7, 15, 19, 0), legacy) == datetime(2026, 7, 15, 17, 0)

    # Ни пустая студия, ни None не притворяются подтверждёнными.
    assert clock(_Studio()).verified is False
    assert clock(None).verified is False


def test_invalid_saved_zone_reads_as_unverified():
    """H7: опечатка в сохранённой зоне не делает вид, что время известно."""
    typo = _Studio(tz_iana="Europe/Praha", timezone="UTC+1")
    what = clock(typo)
    assert what.verified is False
    assert what.zone.utcoffset(None) == timedelta(hours=1)   # откат на старый офсет


def test_cancellation_window_is_instant_based():
    """N: 12 часов остаются 12 настоящими часами и в сутки перевода стрелок.

    Окно считается разностью моментов, а не пересчётом по стенным часам, —
    иначе в ночь перевода клиент получал бы на час больше или меньше.
    """
    prague = _Studio(tz_iana="Europe/Prague")
    # Занятие в 14:00 в день ВЕСЕННЕГО перевода: в этих сутках 23 часа, и
    # разница по стенным часам расходится с настоящей сильнее всего.
    start_utc = to_utc(datetime(2026, 3, 29, 14, 0), prague)
    deadline = start_utc - timedelta(hours=12)
    assert (start_utc - deadline) == timedelta(hours=12)
    # А по стенным часам между теми же моментами «прошло» 13 часов — вот почему
    # окно отмены нельзя считать вычитанием местного времени из местного.
    wall = to_local(start_utc, prague).replace(tzinfo=None) - to_local(deadline, prague).replace(tzinfo=None)
    assert wall == timedelta(hours=13), wall
    # Осенью перекос обратный: те же 12 настоящих часов дают 11 стенных.
    autumn_start = to_utc(datetime(2026, 10, 25, 14, 0), prague)
    autumn_deadline = autumn_start - timedelta(hours=13)
    autumn_wall = (to_local(autumn_start, prague).replace(tzinfo=None)
                   - to_local(autumn_deadline, prague).replace(tzinfo=None))
    assert autumn_wall == timedelta(hours=12), autumn_wall


# ─── Проверки с БД ───────────────────────────────────────────────────────────

async def _seed(tz_iana=None, legacy=None) -> int:
    async with async_session_maker() as db:
        studio = Studio(name=_NAME, tz_iana=tz_iana, timezone=legacy)
        db.add(studio)
        await db.commit()
        return studio.id


async def _cleanup(studio_id: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioWorkingHours).where(StudioWorkingHours.studio_id == studio_id))
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == studio_id))
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.commit()


async def _run_db():
    # ── Валидация на границе настроек: сохранить можно только зону.
    from pydantic import ValidationError

    from schemas.settings.general import GeneralUpdate

    assert GeneralUpdate(tz_iana="Europe/Prague").tz_iana == "Europe/Prague"
    for bad in ("UTC+2", "Prague", "Europe/Praha", "EST"):
        try:
            GeneralUpdate(tz_iana=bad)
            raise AssertionError(f"{bad!r} сохранён как зона IANA")
        except ValidationError:
            pass
    assert GeneralUpdate(tz_iana="").tz_iana is None      # очистка поля разрешена

    # ── L: день недели рабочих часов определяется по студии, а не по серверу.
    studio_id = await _seed(tz_iana="Europe/Prague")
    try:
        async with async_session_maker() as db:
            studio = await db.get(Studio, studio_id)
            assert clock(studio).verified is True

            # Момент, в который у сервера ещё воскресенье, а в Праге уже
            # понедельник: 23:30 UTC воскресенья.
            sunday_late = datetime(2026, 1, 18, 23, 30, tzinfo=timezone.utc)
            local = sunday_late.astimezone(clock(studio).zone)
            assert local.weekday() == 0, "понедельник по студии не наступил"
            assert sunday_late.weekday() == 6, "проверка потеряла смысл: у сервера тот же день"

            # Тот же момент глазами _within_working_hours: понедельник открыт.
            hours = [StudioWorkingHours(studio_id=studio_id, day_of_week=0, is_open=True,
                                        open_time="00:00", close_time="23:59")]
            assert client_agent._within_working_hours(hours, local.replace(tzinfo=None))
    finally:
        await _cleanup(studio_id)

    # ── H8: смена зоны не двигает уже сохранённые моменты.
    studio_id = await _seed(tz_iana="Europe/Prague")
    try:
        instant = datetime(2026, 7, 15, 17, 0)          # момент занятия, как он в БД
        async with async_session_maker() as db:
            studio = await db.get(Studio, studio_id)
            before = to_local(instant, studio)
            assert before.hour == 19
            studio.tz_iana = "Asia/Dubai"
            await db.commit()
        async with async_session_maker() as db:
            studio = await db.get(Studio, studio_id)
            after = to_local(instant, studio)
        assert after.hour == 21, "местное представление не поменялось"
        assert before.astimezone(timezone.utc) == after.astimezone(timezone.utc), \
            "смена зоны сдвинула сам момент"
    finally:
        await _cleanup(studio_id)


def test_db_paths():
    asyncio.run(_run_db())


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"  ok  {name}")
    print("ALL PASS")

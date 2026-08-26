"""Временной контракт занятия (P1.2).

Главное, что здесь проверяется: у занятия есть один ответ на «когда оно», и
этот ответ не меняется от того, в какой зоне стоит сервер и что студия
настроила после. И отдельно — что там, где ответа нет, мы так и говорим, а не
выдаём догадку за факт.

Даты перевода стрелок вписаны константами (Прага, 2026: 29 марта и 25 октября),
а не вычисляются от текущего года: тест, считающий границы сам, повторил бы
ошибку кода.

Запуск из back/:  python -m tests.test_lesson_time
"""
import asyncio
import os
import time
import warnings
from datetime import date, datetime, timedelta, timezone

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from models import Lesson, Service, Studio, StudioBookingSettings
from services import booking_rules, lesson_time, studio_time
from services.booking_rules import BookingRules, assert_bookable

_NAME = "TEST-LESSON-TIME"


class _S:
    """Студия глазами временного слоя."""

    def __init__(self, tz_iana=None, timezone=None):
        self.tz_iana, self.timezone = tz_iana, timezone


class _L:
    """Занятие глазами временного слоя: стенное время и снимок зоны."""

    def __init__(self, start_time, tz_iana=None, lesson_id=1):
        self.start_time, self.tz_iana, self.id = start_time, tz_iana, lesson_id


PRAGUE = _S(tz_iana="Europe/Prague")
DUBAI = _S(tz_iana="Asia/Dubai")
LEGACY = _S(timezone="UTC+1")


# ─── Контракт ────────────────────────────────────────────────────────────────

def test_a_normal_lesson_has_exact_instant():
    """A: обычное занятие даёт однозначный момент."""
    when = lesson_time.resolve(_L(datetime(2026, 7, 15, 19, 0), "Europe/Prague"), PRAGUE)
    assert when.instant == datetime(2026, 7, 15, 17, 0)
    assert when.local == datetime(2026, 7, 15, 19, 0)
    assert when.exact is True and when.zone == "Europe/Prague"


def test_b_same_wall_time_winter_and_summer():
    """B: одно «19:00» зимой и летом — разные моменты, само собой."""
    winter = lesson_time.resolve(_L(datetime(2026, 1, 15, 19, 0), "Europe/Prague"), PRAGUE)
    summer = lesson_time.resolve(_L(datetime(2026, 7, 15, 19, 0), "Europe/Prague"), PRAGUE)
    assert winter.instant == datetime(2026, 1, 15, 18, 0)
    assert summer.instant == datetime(2026, 7, 15, 17, 0)
    assert winter.local.hour == summer.local.hour == 19


def test_c_zone_without_dst():
    """C: Дубай круглый год +4 — перевода стрелок нет вовсе."""
    for month in (1, 7):
        when = lesson_time.resolve(_L(datetime(2026, month, 15, 19, 0), "Asia/Dubai"), DUBAI)
        assert when.instant == datetime(2026, month, 15, 15, 0)


def test_k_two_zones_side_by_side():
    """K: две зоны считаются независимо и не мешают друг другу."""
    local = datetime(2026, 7, 15, 19, 0)
    assert lesson_time.resolve(_L(local, "Europe/Prague"), PRAGUE).instant == datetime(2026, 7, 15, 17, 0)
    assert lesson_time.resolve(_L(local, "Asia/Dubai"), DUBAI).instant == datetime(2026, 7, 15, 15, 0)


def test_l_legacy_lesson_is_not_passed_off_as_exact():
    """L: без снимка момент НЕИЗВЕСТЕН — и так и сообщается."""
    when = lesson_time.resolve(_L(datetime(2026, 7, 15, 19, 0)), PRAGUE)
    assert when.instant is None, "момент выдуман из текущей настройки студии"
    assert when.exact is False
    assert when.local == datetime(2026, 7, 15, 19, 0), "стенное время потеряно"
    # И решения по такому занятию тоже не притворяются точными.
    assert lesson_time.has_started(_L(datetime(2020, 1, 1, 10, 0)), PRAGUE) is None
    assert lesson_time.until(_L(datetime(2030, 1, 1, 10, 0)), PRAGUE) is None


def test_m_studio_timezone_change_does_not_move_the_lesson():
    """M и H1: снимок закрепляет момент. Смена зоны студии его не двигает.

    Это ровно то утверждение, которое в P1.1 было СФОРМУЛИРОВАНО НЕВЕРНО: без
    снимка тот же ряд при другой зоне студии означал другой момент.
    """
    lesson = _L(datetime(2026, 7, 15, 19, 0), "Europe/Prague")
    before = lesson_time.resolve(lesson, PRAGUE)
    after = lesson_time.resolve(lesson, DUBAI)          # студия переехала в Дубай
    assert before.instant == after.instant, "смена зоны студии сдвинула момент занятия"
    assert after.zone == "Europe/Prague"


def test_contradiction_of_p1_1_reproduced():
    """Прежняя модель (без снимка) действительно НЕ имела неизменного момента.

    Тест существует не ради кода, а ради доказательства: то, что P1.1 объявил
    инвариантом, инвариантом не было.
    """
    wall = datetime(2026, 7, 15, 19, 0)
    as_prague = studio_time.to_utc(wall, PRAGUE)
    as_dubai = studio_time.to_utc(wall, DUBAI)
    assert as_prague != as_dubai, "предпосылка исчезла"
    assert (as_prague - as_dubai) == timedelta(hours=2)
    # И вот чем это лечится: у занятия со снимком ответ один при обеих студиях.
    lesson = _L(wall, "Europe/Prague")
    assert lesson_time.resolve(lesson, PRAGUE).instant == \
           lesson_time.resolve(lesson, DUBAI).instant == as_prague


# ─── Перевод стрелок ─────────────────────────────────────────────────────────

def test_d_spring_gap_rejected_on_create():
    """D и H2: несуществующее местное время не принимается."""
    try:
        lesson_time.assert_representable(datetime(2026, 3, 29, 2, 30), PRAGUE)
        raise AssertionError("занятие в несуществующий час принято")
    except studio_time.NonexistentLocalTime:
        pass
    # Соседний час тех же суток — обычный.
    lesson_time.assert_representable(datetime(2026, 3, 29, 4, 30), PRAGUE)


def test_e_autumn_fold_rejected_on_create():
    """E и H3: время, наступающее дважды, тоже не принимается.

    Политика MVP — отказ: интерфейс не умеет показать два варианта, а выбрать
    за человека значит с вероятностью 1/2 записать его не на тот час.
    """
    try:
        lesson_time.assert_representable(datetime(2026, 10, 25, 2, 30), PRAGUE)
        raise AssertionError("занятие в двойной час принято")
    except studio_time.AmbiguousLocalTime:
        pass
    lesson_time.assert_representable(datetime(2026, 10, 25, 4, 30), PRAGUE)


def test_unverified_studio_cannot_be_validated():
    """H6: у студии без подтверждённой зоны проверять нечем — и мы не мешаем
    ей работать так же, как она работала до P1.2."""
    lesson_time.assert_representable(datetime(2026, 3, 29, 2, 30), LEGACY)   # не поднимает
    assert lesson_time.snapshot_for(LEGACY) is None


def test_existing_lesson_inside_dst_anomaly_is_unknowable():
    """Занятие, уже лежащее в аномалии, не получает выдуманный момент."""
    when = lesson_time.resolve(_L(datetime(2026, 3, 29, 2, 30), "Europe/Prague"), PRAGUE)
    assert when.instant is None and when.exact is False
    assert when.local == datetime(2026, 3, 29, 2, 30)


def test_n_recurring_wall_time_stays_put_across_dst():
    """N и H4: «каждый вторник 19:00» остаётся 19:00 и после перевода стрелок.

    Повторяющегося расписания в продукте нет — занятия заводятся по одному, —
    поэтому проверяем то, что реально происходит: два занятия, созданные на
    19:00 по разные стороны перехода, дают РАЗНЫЕ моменты и ОДИНАКОВОЕ местное
    время. Именно этого ждёт владелец.
    """
    before = _L(datetime(2026, 3, 24, 19, 0), "Europe/Prague")     # до перехода
    after = _L(datetime(2026, 3, 31, 19, 0), "Europe/Prague")      # после
    a, b = lesson_time.resolve(before, PRAGUE), lesson_time.resolve(after, PRAGUE)
    assert a.local.hour == b.local.hour == 19, "местное время съехало"
    assert a.instant.hour == 18 and b.instant.hour == 17, "момент не пересчитался"


# ─── Сравнения с «сейчас» ────────────────────────────────────────────────────

def test_h_booking_window_across_spring_dst():
    """H и H10: «за 2 часа до начала» — два ПРОШЕДШИХ часа, в том числе в ночь
    перевода стрелок."""
    lesson = _L(datetime(2026, 3, 29, 4, 0), "Europe/Prague")      # 02:00 UTC
    two_hours_before = datetime(2026, 3, 29, 0, 0)                 # 00:00 UTC
    assert lesson_time.until(lesson, PRAGUE, two_hours_before) == timedelta(hours=2)
    # По стенным часам между теми же моментами «прошло» три часа — вот почему
    # вычитать местное из местного нельзя.
    wall_gap = lesson.start_time - studio_time.to_local(two_hours_before, PRAGUE).replace(tzinfo=None)
    assert wall_gap == timedelta(hours=3), wall_gap


def test_i_cancellation_window_across_autumn_dst():
    """I: 12 часов остаются 12 настоящими часами и осенью."""
    # Занятие в 13:00 местного: рубеж «за 12 часов» приходится на время ДО
    # перевода стрелок, когда сдвиг ещё +2.
    lesson = _L(datetime(2026, 10, 25, 13, 0), "Europe/Prague")
    deadline = lesson_time.resolve(lesson, PRAGUE).instant - timedelta(hours=12)
    assert lesson_time.until(lesson, PRAGUE, deadline) == timedelta(hours=12)
    wall_gap = lesson.start_time - studio_time.to_local(deadline, PRAGUE).replace(tzinfo=None)
    assert wall_gap == timedelta(hours=11), wall_gap


def test_j_server_timezone_does_not_change_the_answer():
    """J, H5 и H9: зона процесса на результат не влияет."""
    lesson = _L(datetime(2026, 7, 15, 19, 0), "Europe/Prague")
    now = datetime(2026, 7, 15, 12, 0)
    expected = lesson_time.until(lesson, PRAGUE, now)

    saved = os.environ.get("TZ")
    try:
        for zone in ("UTC", "Europe/Budapest", "America/New_York"):
            os.environ["TZ"] = zone
            if hasattr(time, "tzset"):
                time.tzset()
            assert lesson_time.resolve(lesson, PRAGUE).instant == datetime(2026, 7, 15, 17, 0)
            assert lesson_time.until(lesson, PRAGUE, now) == expected
    finally:
        if saved is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = saved
        if hasattr(time, "tzset"):
            time.tzset()


def test_booking_rules_use_real_instants():
    """Правило «запись закрывается за N минут» считается моментами.

    Занятие начинается через 90 минут настоящего времени при пороге в 120 — на
    запись поздно, и решает это разность моментов, а не часы процесса.
    """
    rules = _rules(min_advance=120)
    lesson = _L(datetime(2026, 7, 15, 19, 0), "Europe/Prague")     # 17:00 UTC

    late = datetime(2026, 7, 15, 15, 30)                            # за 90 минут
    try:
        assert_bookable(rules, lesson, now=lesson_time.local_now(PRAGUE, late),
                        studio=PRAGUE, now_instant=late)
        raise AssertionError("поздняя запись прошла")
    except HTTPException as exc:
        assert exc.status_code == 400

    early = datetime(2026, 7, 15, 10, 0)                            # за 7 часов
    assert_bookable(rules, lesson, now=lesson_time.local_now(PRAGUE, early),
                    studio=PRAGUE, now_instant=early)


def _rules(min_advance: int) -> BookingRules:
    """Правила с нужным порогом; остальные поля — как их собирает load_rules."""
    import inspect

    defaults = {}
    for name, param in inspect.signature(BookingRules).parameters.items():
        defaults[name] = param.default if param.default is not inspect.Parameter.empty else None
    defaults.update(booking_active=True, min_booking_advance_min=min_advance,
                    booking_window_days=365, widget_work_start="00:00", widget_work_end="00:00")
    return BookingRules(**defaults)


# ─── Запросы по местной дате ─────────────────────────────────────────────────

def test_f_g_local_day_bounds_on_short_and_long_days():
    """F и G: местные сутки — от полуночи до полуночи, сколько бы часов в них
    ни было. H9: «плюс 24 часа» здесь не используется нигде."""
    for day in (date(2026, 3, 29), date(2026, 10, 25), date(2026, 5, 20)):
        start, end = lesson_time.local_day_bounds(day)
        assert start == datetime.combine(day, datetime.min.time())
        assert end == datetime.combine(day + timedelta(days=1), datetime.min.time())
        assert start.time() == end.time() == datetime.min.time()

    # Настоящая длительность этих суток разная — и именно поэтому границы
    # берутся по календарю, а не прибавлением суток к моменту.
    short = (studio_time.to_utc(datetime(2026, 3, 30, 0, 0), PRAGUE)
             - studio_time.to_utc(datetime(2026, 3, 29, 0, 0), PRAGUE))
    long = (studio_time.to_utc(datetime(2026, 10, 26, 0, 0), PRAGUE)
            - studio_time.to_utc(datetime(2026, 10, 25, 0, 0), PRAGUE))
    assert short == timedelta(hours=23), short
    assert long == timedelta(hours=25), long


def test_p_ordering_by_real_instants():
    """P: порядок «что ближе» строится по моментам, а не по стенным числам.

    Два занятия в разных зонах с одинаковым стенным временем: раньше начнётся
    то, что восточнее.
    """
    prague = _L(datetime(2026, 7, 15, 19, 0), "Europe/Prague", lesson_id=1)
    dubai = _L(datetime(2026, 7, 15, 19, 0), "Asia/Dubai", lesson_id=2)
    order = sorted([prague, dubai], key=lambda l: lesson_time.resolve(l, None).instant)
    assert [l.id for l in order] == [2, 1], "порядок построен по стенным часам"


# ─── С базой: создание, перенос, сквозная согласованность ────────────────────

async def _seed(tz_iana="Europe/Prague") -> dict:
    async with async_session_maker() as db:
        studio = Studio(name=_NAME, tz_iana=tz_iana)
        db.add(studio)
        await db.commit()
        service = Service(studio_id=studio.id, name="Хатха", duration_min=60, price=500)
        db.add(service)
        db.add(StudioBookingSettings(studio_id=studio.id))
        await db.commit()
        return {"studio": studio.id, "service": service.id}


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Lesson).where(Lesson.studio_id == ids["studio"]))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.commit()


async def _run_db():
    ids = await _seed()
    try:
        async with async_session_maker() as db:
            studio = await db.get(Studio, ids["studio"])
            # Новое занятие получает снимок зоны — иначе его момент был бы
            # неизвестен с самого рождения.
            assert lesson_time.snapshot_for(studio) == "Europe/Prague"

            lesson = Lesson(
                studio_id=ids["studio"], name="Хатха", teacher_name="Т",
                start_time=datetime(2026, 7, 15, 19, 0), tz_iana=lesson_time.snapshot_for(studio),
                duration_min=60, price=500, level="", equipment="", total_spots=8,
            )
            db.add(lesson)
            await db.commit()
            lesson_id = lesson.id

        # ── O: одно занятие — один момент во всех путях.
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, lesson_id)
            studio = await db.get(Studio, ids["studio"])
            when = lesson_time.resolve(lesson, studio)
            assert when.instant == datetime(2026, 7, 15, 17, 0)

            # То, что уходит в Google Calendar: местное время + зона IANA.
            # Ровно тот же момент, что видит мини-приложение (стенное время) и
            # что считает запись (момент). Расхождения «CRM 19:00 / Google 18:00»
            # быть не может — обе стороны берут одно и то же.
            assert lesson.start_time == when.local
            assert studio.tz_iana == "Europe/Prague"
            assert studio_time.to_utc(lesson.start_time, studio) == when.instant

        # ── H7: правка одного лишь стенного времени в обход слоя не оставляет
        # занятие с чужим снимком незамеченной — снимок обязан пойти следом.
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, lesson_id)
            studio = await db.get(Studio, ids["studio"])
            lesson.start_time = datetime(2026, 1, 15, 19, 0)      # переехали в зиму
            await db.commit()
            moved = lesson_time.resolve(lesson, studio)
        assert moved.instant == datetime(2026, 1, 15, 18, 0), \
            "момент не пересчитался после сдвига стенного времени"

        # ── H1: студия сменила зону — моменты будущих занятий не поехали.
        async with async_session_maker() as db:
            studio = await db.get(Studio, ids["studio"])
            studio.tz_iana = "Asia/Dubai"
            await db.commit()
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, lesson_id)
            studio = await db.get(Studio, ids["studio"])
            after = lesson_time.resolve(lesson, studio)
        assert after.instant == moved.instant, "смена зоны студии сдвинула занятие"
        assert after.zone == "Europe/Prague"
    finally:
        await _cleanup(ids)

    # ── Студия без подтверждённой зоны: снимок не ставится, поведение прежнее.
    ids = await _seed(tz_iana=None)
    try:
        async with async_session_maker() as db:
            studio = await db.get(Studio, ids["studio"])
            assert lesson_time.snapshot_for(studio) is None
            lesson = Lesson(
                studio_id=ids["studio"], name="Хатха", teacher_name="Т",
                start_time=datetime(2026, 7, 15, 19, 0), tz_iana=lesson_time.snapshot_for(studio),
                duration_min=60, price=500, level="", equipment="", total_spots=8,
            )
            db.add(lesson)
            await db.commit()
            assert lesson_time.resolve(lesson, studio).instant is None
    finally:
        await _cleanup(ids)


def test_db_paths():
    asyncio.run(_run_db())


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"  ok  {name}")
    print("ALL PASS")

"""Правила онлайн-записи студии (страница «Онлайн-запись») — один загрузчик и
одни проверки на все входы записи.

Настройки лежат в `StudioBookingSettings`, но применяют их четыре разных места:
каталог мини-приложения (`routers/booking/miniapp_studio.py`), сама запись из
мини-приложения (`miniapp_lessons.py`), публичный веб-виджет (`public.py`) и
рассыльщик напоминаний (`services/daily_notify.py`). Разъехавшись, они дадут
клиенту список занятий, на которые запись потом откажет, — поэтому и загрузка
дефолтов, и границы окна живут здесь, а не копируются по файлам.

Дефолты продублированы из `models/settings.py`: у студии, которая ни разу не
открывала страницу «Онлайн-запись», строки настроек ещё нет, а `default=` в
модели срабатывает только на INSERT.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import Lesson, StudioBookingSettings
from services import lesson_time


@dataclass(frozen=True)
class BookingRules:
    booking_active: bool = True
    prefill_on_booking: bool = True
    trainer_confirmation_required: bool = False
    repeat_booking_allowed: bool = False
    reminder_24h: bool = True
    reminder_2h: bool = True
    review_request: bool = True
    min_booking_advance_min: int = 120
    booking_window_days: int = 7
    cancellation_deadline_min: int = 240
    widget_work_start: str = "09:00"
    widget_work_end: str = "21:00"
    widget_accent_color: str = "#FCAE91"
    widget_logo_url: str | None = None
    widget_dark_mode: bool = False
    widget_language: str = "ru"
    # «Первое занятие бесплатно». Живёт здесь, потому что решение о подарке
    # принимают все четыре точки записи (services/booking_access.trial_applies),
    # а не только мини-приложение.
    trial_lesson_free: bool = False
    # «Кофе после занятия» (см. models/settings.py). Читают мини-приложение и
    # рассыльщик — поэтому живут здесь, рядом с остальными правилами записи.
    coffee_enabled: bool = True
    coffee_spots: tuple = ()


_FIELDS = tuple(BookingRules.__dataclass_fields__)


async def load_rules(db: AsyncSession, studio_id: int) -> BookingRules:
    row = (await db.execute(
        select(StudioBookingSettings).where(StudioBookingSettings.studio_id == studio_id)
    )).scalar_one_or_none()
    if row is None:
        return BookingRules()
    # widget_accent_color в БД nullable-по-факту (старые строки) — пустое
    # значение отдаём дефолтом, а не None: цвет уходит прямо в CSS клиента.
    values = {f: getattr(row, f) for f in _FIELDS}
    if not values["widget_accent_color"]:
        values["widget_accent_color"] = BookingRules.widget_accent_color
    # coffee_spots в БД nullable: у студии, которая мест не заводила, там NULL.
    # Наружу отдаём пустой кортеж — вызывающий код всегда итерируется, а не
    # проверяет каждый раз на None.
    values["coffee_spots"] = tuple(values["coffee_spots"] or ())
    return BookingRules(**values)


def _minutes(hhmm: str) -> int:
    hours, _, minutes = hhmm.partition(":")
    return int(hours) * 60 + int(minutes)


def booking_window(rules: BookingRules, now: datetime | None = None) -> tuple[datetime, datetime]:
    """Границы, между которыми занятие можно бронировать онлайн: раньше нижней
    — «поздно» (min_booking_advance_min), позже верхней — «рано» (окно записи).

    `now` — стенное время СТУДИИ, и передавать его обязательно: границы
    сравниваются с `Lesson.start_time`, который тоже стенной. Значение по
    умолчанию берёт часы процесса и потому верно лишь тогда, когда сервер стоит
    в зоне студии — оно оставлено для прямых вызовов из тестов, а боевые пути
    считают его через services/lesson_time.local_now (P1.2).
    """
    now = now or datetime.now()
    return (
        now + timedelta(minutes=rules.min_booking_advance_min),
        now + timedelta(days=rules.booking_window_days),
    )


def within_widget_hours(rules: BookingRules, start_time: datetime) -> bool:
    """Занятие попадает в часы работы виджета.

    Часы ограничивают, какие занятия студия отдаёт в онлайн-запись, а не когда
    клиенту можно нажать кнопку: закрывать кабинет ночью смысла нет, а вот не
    пускать онлайн на ранние/поздние занятия («только по звонку») — обычное
    правило студии. Пустой интервал (start == end) ничего не ограничивает.
    """
    start = _minutes(rules.widget_work_start)
    end = _minutes(rules.widget_work_end)
    if start == end:
        return True
    at = start_time.hour * 60 + start_time.minute
    if start < end:
        return start <= at < end
    return at >= start or at < end  # интервал через полночь (22:00–06:00)


def is_bookable(rules: BookingRules, lesson: Lesson, now: datetime | None = None) -> bool:
    """Те же правила окна, что проверяет `assert_bookable`, но флагом, а не
    исключением: карточка расписания рисуется и для занятия вне окна.

    Живёт здесь, а не в мини-приложении, по той же причине, что и всё в этом
    модуле: спрашивать «можно ли записаться» будет не одна поверхность, и
    второй список из четырёх правил разъедется с первым.

    `now` — стенное время СТУДИИ; про значение по умолчанию см. booking_window.
    """
    if not rules.booking_active:
        return False
    lower, upper = booking_window(rules, now)
    return lower <= lesson.start_time <= upper and within_widget_hours(rules, lesson.start_time)


def assert_bookable(rules: BookingRules, lesson: Lesson, now: datetime | None = None,
                    studio=None, now_instant: datetime | None = None) -> None:
    """Все правила окна записи разом. Бросает 400 с текстом для клиента.

    Два параметра времени, потому что сравниваются две разные вещи:
      now         — стенное время СТУДИИ, им проверяется горизонт записи в днях
                    (ему точность до часа не нужна);
      now_instant — настоящий момент, им проверяется «поздно записываться».
    «За 2 часа до начала» обязано означать два ПРОШЕДШИХ часа, а вычитание
    стенного из стенного в ночь перевода стрелок даёт час или три.

    Без studio (и без снимка зоны у занятия) обе границы считаются по стенному
    времени — ровно как до P1.2.
    """
    if not rules.booking_active:
        raise HTTPException(status_code=400, detail="Онлайн-запись закрыта")
    lower, upper = booking_window(rules, now)
    left = lesson_time.until(lesson, studio, now_instant) if studio is not None else None
    too_late = (left < timedelta(minutes=rules.min_booking_advance_min)
                if left is not None else lesson.start_time < lower)
    if too_late:
        raise HTTPException(status_code=400, detail="Запись на это занятие закрыта")
    if lesson.start_time > upper:
        raise HTTPException(
            status_code=400,
            detail=f"Запись открывается за {rules.booking_window_days} дней до занятия",
        )
    if not within_widget_hours(rules, lesson.start_time):
        raise HTTPException(status_code=400, detail="На это время онлайн-запись недоступна")

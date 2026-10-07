"""Когда занятие можно менять — одно правило на Журнал, ассистента и прямой HTTP.

ТРИ ФАЗЫ ЗАНЯТИЯ ВО ВРЕМЕНИ.

  open      до занятия ещё далеко. Меняется всё; записанные узнают об этом
            сразу (c11/c14) и успевают отменить запись без штрафа.
  frozen    от последнего момента для правки до конца занятия. То, что видит
            клиент (время, тренер, название, цена…), уже не меняется: человек
            не успеет отменить запись по правилам студии, а приходить не на то
            занятие, на которое записывался, он не обязан.
  finished  занятие закончилось. Правка — исправление записи о том, что было
            (провёл другой тренер, начали в 19:00, цена была другой): меняется
            всё, никому ничего не уходит, а время остаётся в прошлом —
            состоявшееся занятие в будущее не уезжает (брони уже закрыты,
            визиты и деньги проведены).

ПОСЛЕДНИЙ МОМЕНТ ДЛЯ ПРАВКИ — срок отмены записи из правил онлайн-записи
(`cancellation_deadline_min`) плюс два часа: уведомление обязано прийти раньше,
чем закроется бесплатная отмена, и у человека должно остаться время его
прочитать. На занятие без записанных предупреждать некого — у него прежний
предел в два часа.

ТИХИЕ ПОЛЯ — заметка, фото, причина отмены и число мест — записанных не
касаются (места не убрать ниже числа записанных) и правятся в любой фазе:
добавить коврик пришедшему за десять минут — обычная работа стойки.

Модуль чистый: ни БД, ни сети. Фронт держит ту же арифметику в
`Journal/components/lesson/editor/editorModel.ts` и показывает фазу заранее, но
последнее слово — здесь.
"""
from datetime import datetime, timedelta
from enum import Enum
from typing import NamedTuple

from fastapi import HTTPException

from services import lesson_time
from services.booking_rules import time_left

QUIET_FIELDS = frozenset({"cancel_reason", "notes", "photos", "total_spots"})
# Поля, меняющие время занятия: их проверяют на «новое время» отдельно от фазы.
TIME_FIELDS = frozenset({"start_time", "duration_min"})

EMPTY_LEAD = timedelta(hours=2)
NOTICE_MARGIN = timedelta(hours=2)


class Phase(str, Enum):
    OPEN = "open"
    FROZEN = "frozen"
    FINISHED = "finished"


def notice_lead(cancel_deadline_min: int | None, booked: int) -> timedelta:
    """За сколько до начала занятие перестают менять.

    Записанные есть — срок отмены записи и ещё два часа; нет — два часа, как
    было до появления этого правила.
    """
    if booked <= 0:
        return EMPTY_LEAD
    return timedelta(minutes=max(cancel_deadline_min or 0, 0)) + NOTICE_MARGIN


def phase_of(lesson, lead: timedelta, studio=None, *,
             now_instant: datetime | None = None, now: datetime | None = None) -> Phase:
    left = time_left(lesson, studio, now_instant, now)
    if left + timedelta(minutes=lesson.duration_min or 0) <= timedelta(0):
        return Phase.FINISHED
    return Phase.FROZEN if left < lead else Phase.OPEN


def _span(minutes: int) -> str:
    """«6 ч», «4 ч 30 мин», «45 мин» — для текста отказа."""
    hours, rest = divmod(max(int(minutes), 0), 60)
    if hours and rest:
        return f"{hours} ч {rest} мин"
    return f"{hours} ч" if hours else f"{rest} мин"


def _minutes(delta: timedelta) -> int:
    return int(delta.total_seconds() // 60)


def _frozen(lead: timedelta, booked: int, cancel_deadline_min: int | None) -> HTTPException:
    if booked <= 0:
        message = (f"Изменять занятие можно не позднее чем за {_span(_minutes(lead))} до начала. "
                   "После окончания его можно исправить.")
    else:
        message = (f"Занятие уже не меняют: записанные должны узнать об изменениях не позднее "
                   f"чем за {_span(_minutes(lead))} до начала — срок отмены записи "
                   f"({_span(cancel_deadline_min or 0)}) и ещё 2 ч, чтобы прочитать уведомление. "
                   "После окончания занятие можно исправить — без уведомлений.")
    return HTTPException(status_code=400, detail={
        "code": "lesson_edit_frozen",
        "message": message,
        "params": {"lead_min": _minutes(lead), "booked": booked},
    })


class _Interval(NamedTuple):
    """Занятие на новом месте — то, что получится после правки. Достаточно для
    `time_left`: тот читает только начало, длительность и снимок зоны."""
    id: int | None
    start_time: datetime
    duration_min: int
    tz_iana: str | None


def check(lesson, fields: dict, *, booked: int, cancel_deadline_min: int | None,
          studio=None, now_instant: datetime | None = None,
          now: datetime | None = None) -> Phase:
    """Можно ли применить правку `fields` к занятию. Возвращает фазу, в которой
    занятие было до правки, — по ней вызывающий решает, кого уведомлять.

    Отказы — 400 с машинным кодом (фронт переводит его, common:errors.<code>):
      lesson_edit_frozen    — занятие в заморозке, а правка не тихая;
      lesson_edit_too_soon  — новое время ближе последнего момента для правки;
      lesson_stays_in_past  — прошедшее занятие переносят в незакончившееся время.
    """
    lead = notice_lead(cancel_deadline_min, booked)
    phase = phase_of(lesson, lead, studio, now_instant=now_instant, now=now)
    if not set(fields) - QUIET_FIELDS:
        return phase
    if phase is Phase.FROZEN:
        raise _frozen(lead, booked, cancel_deadline_min)
    if not TIME_FIELDS & fields.keys():
        return phase

    moved_start = fields.get("start_time") or lesson.start_time
    moved = _Interval(
        getattr(lesson, "id", None), moved_start,
        fields.get("duration_min") or lesson.duration_min,
        # Перенесённое занятие роутер заново закрепляет зоной студии — так и
        # считаем, иначе «сколько до нового начала» мерилось бы старым снимком.
        lesson_time.snapshot_for(studio) if "start_time" in fields and studio is not None
        else getattr(lesson, "tz_iana", None),
    )
    left = time_left(moved, studio, now_instant, now)
    if phase is Phase.FINISHED:
        if left + timedelta(minutes=moved.duration_min) > timedelta(0):
            raise HTTPException(status_code=400, detail={
                "code": "lesson_stays_in_past",
                "message": "Прошедшее занятие остаётся в прошлом: новое время должно "
                           "закончиться раньше, чем сейчас.",
            })
        return phase
    if left < lead:
        raise HTTPException(status_code=400, detail={
            "code": "lesson_edit_too_soon",
            "message": (f"Новое время слишком близко: занятие с записанными переносят "
                        f"не позднее чем за {_span(_minutes(lead))} до нового начала."
                        if booked > 0 else
                        f"Изменять занятие можно не позднее чем за {_span(_minutes(lead))} "
                        "до начала — новое время ближе."),
            "params": {"lead_min": _minutes(lead)},
        })
    return phase

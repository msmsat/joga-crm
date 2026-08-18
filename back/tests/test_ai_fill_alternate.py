"""Чередование услуг в fill_schedule и разбор кривых аргументов до карточки.

Обе проверки — из одной живой жалобы. Человек попросил «заполни график Оли на
три недели, чередуй хатха/стретчинг»:
  * set_staff_schedule упал ПОСЛЕ подтверждения — «Неверные аргументы
    (schedule.0 … schedule.6)». Схему модель собрала не в том виде, а сборка
    плана эту жалобу глотала: до карточки шаг доезжал целым;
  * чередовать было нечем, и ассистент ответил «в Velora такого нет» — вместо
    расписания человек получил инструкцию кликать сто занятий руками.

Модель и роутер подменены: проверяется наша механика, а не их поведение.
Образец фейковой сессии — tests/test_lesson_cancel_reason.py.

Запуск из back/:  python -m tests.test_ai_fill_alternate
"""
import asyncio
from datetime import date, datetime, timedelta

from pydantic import ValidationError

import services.ai_tools as T
from dependencies import StudioContext
from services.ai_plan import _malformed


class _User:
    id = 1


class _R:
    def __init__(self, v):
        self._v = v

    def scalars(self):
        return self

    def all(self):
        return self._v if isinstance(self._v, list) else [self._v]

    def scalar_one_or_none(self):
        return self._v


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)
        self.added = []

    def add(self, x):
        self.added.append(x)

    async def flush(self):
        pass

    async def execute(self, _q):
        return _R(self._seq.pop(0))


class _Hours:
    def __init__(self, day, open_time="09:00", close_time="18:00", is_open=True):
        self.day_of_week, self.is_open = day, is_open
        self.open_time, self.close_time = open_time, close_time


class _Made:
    """То, что вернул бы роутер: fill_schedule читает только start_time."""

    def __init__(self, start_time):
        self.start_time = start_time
        self.id = 1


def _ctx():
    return StudioContext(user=_User(), studio_id=1, role="owner")


# ─── Услуги идут по кругу ────────────────────────────────────────────────────
def test_fill_schedule_cycles_the_services_in_order():
    day = date.today() + timedelta(days=3)
    args = T.FillScheduleArgs(
        teacher_id=1, service_id=10, alternate_with=[20], date_from=day, date_to=day,
        weekdays=[day.weekday()], time_from="09:00", time_to="14:00", duration_min=60,
    )
    db = _DB([[_Hours(day.weekday())], None, []])   # график, отгула нет, занятых часов нет
    seen = []
    original = T._r_create_lesson

    async def fake(body, ctx, db, background_tasks=None):
        seen.append((body.service_id, body.price))
        return _Made(body.start_time)

    T._r_create_lesson = fake
    try:
        result = asyncio.run(T.fill_schedule(_ctx(), db, args))
    finally:
        T._r_create_lesson = original

    assert result.get("created") == 5, result
    assert [s for s, _ in seen] == [10, 20, 10, 20, 10], seen
    # Цену не навязываем — её возьмёт карточка каждой услуги, иначе стретчинг
    # продавался бы по цене хатхи.
    assert {p for _, p in seen} == {None}, seen


def test_fill_schedule_without_alternation_is_untouched():
    day = date.today() + timedelta(days=3)
    args = T.FillScheduleArgs(
        teacher_id=1, service_id=10, date_from=day, date_to=day,
        weekdays=[day.weekday()], time_from="09:00", time_to="11:00", duration_min=60,
    )
    db = _DB([[_Hours(day.weekday())], None, []])
    seen = []
    original = T._r_create_lesson

    async def fake(body, ctx, db, background_tasks=None):
        seen.append(body.service_id)
        return _Made(body.start_time)

    T._r_create_lesson = fake
    try:
        asyncio.run(T.fill_schedule(_ctx(), db, args))
    finally:
        T._r_create_lesson = original
    assert seen == [10, 10], seen


def test_lesson_defaults_keeps_the_grid_but_frees_the_price():
    original_services, original_halls = T._r_list_services, T._branches_with_halls

    async def services(ctx, db):
        return [{"id": 10, "duration_min": 90, "price": 500, "max_clients": 12}]

    async def halls(ctx, db):
        return []

    T._r_list_services, T._branches_with_halls = services, halls
    try:
        alone = asyncio.run(T._lesson_defaults({"service_id": 10}, _ctx(), None))
        mixed = asyncio.run(T._lesson_defaults(
            {"service_id": 10, "alternate_with": [20]}, _ctx(), None))
    finally:
        T._r_list_services, T._branches_with_halls = original_services, original_halls

    assert alone["price"] == 500 and alone["duration_min"] == 90, alone
    # Сетка часов и мест общая, цена — нет.
    assert mixed["duration_min"] == 90 and mixed["total_spots"] == 12, mixed
    assert "price" not in mixed, mixed


# ─── График сотрудника: терпимость к тому, как это пишет модель ──────────────
def test_work_day_accepts_what_the_model_actually_sends():
    parsed = T.StaffScheduleArgs.model_validate({"staff_id": 1, "schedule": [
        {"day_of_week": 7, "open_time": 9, "close_time": "17:00:00"},   # ISO-воскресенье, час числом
        {"day_of_week": 4, "open_time": "9.30", "close_time": "17"},    # точка и голый час
    ]})
    assert [(d.day_of_week, d.open_time, d.close_time) for d in parsed.schedule] == [
        (0, "09:00", "17:00"), (4, "09:30", "17:00")], parsed
    # А мусор по-прежнему отказ, а не молчаливая полночь.
    try:
        T.StaffScheduleArgs.model_validate(
            {"staff_id": 1, "schedule": [{"day_of_week": 0, "open_time": "утром"}]})
    except ValidationError:
        pass
    else:
        raise AssertionError("«утром» прошло валидацию")


# ─── Кривые аргументы — модели, а не человеку после клика ────────────────────
def test_malformed_separates_form_questions_from_model_mistakes():
    # Пропущено обязательное поле верхнего уровня — это вопрос формы, шаг живёт.
    try:
        T.StaffScheduleArgs.model_validate({"schedule": []})
    except ValidationError as exc:
        assert _malformed(exc) is None, _malformed(exc)

    # А вот форма вложенного списка — промах модели: форма такое не спросит.
    try:
        T.StaffScheduleArgs.model_validate(
            {"staff_id": 1, "schedule": [{"day": 0, "from": "09:00", "to": "17:00"}]})
    except ValidationError as exc:
        said = _malformed(exc)
        assert said and "schedule.0.day_of_week" in said, said
        # Текст адресован модели: чинит она, человека это не касается.
        assert "у человека ничего не спрашивай" in said, said
    else:
        raise AssertionError("чужие ключи прошли валидацию")


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)

"""Отказы, которые ассистент обязан узнать ДО карточки подтверждения.

Смысл проверок precheck ровно один: человек нажал «Утверждаю» и не получил
ошибку. Всё, что сервер способен предсказать чтением базы, обязано уйти модели
в том же ходе — она уберёт шаг или заменит его правильным, — а не всплыть
отчётом «Готово: 1 из 4» после клика.

Образец фейковой сессии — tests/test_lesson_cancel_reason.py.

Запуск из back/:  python -m tests.test_ai_precheck
"""
import asyncio
from datetime import date, datetime, timedelta

import services.ai_tools as T
from dependencies import StudioContext
from services.ai_plan import make_step


class _User:
    id = 1


class _R:
    def __init__(self, v):
        self._v = v

    def scalars(self):
        return self

    def first(self):
        return self._v[0] if isinstance(self._v, list) else self._v

    def all(self):
        return self._v if isinstance(self._v, list) else [self._v]

    def scalar_one_or_none(self):
        return self._v


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)

    async def execute(self, _q):
        return _R(self._seq.pop(0))


class _Hours:
    def __init__(self, day, open_time="09:00", close_time="18:00", is_open=True):
        self.day_of_week, self.is_open = day, is_open
        self.open_time, self.close_time = open_time, close_time


class _Lesson:
    def __init__(self, start_time, name="Хатха"):
        self.start_time, self.name = start_time, name


def _ctx():
    return StudioContext(user=_User(), studio_id=1, role="owner")


def _run(coro):
    return asyncio.run(coro)


# ─── create_staff: «он уже в команде» видно до клика ─────────────────────────
def test_staff_precheck_refuses_existing_member():
    # аккаунт с таким email есть, и он уже состоит в этой студии
    db = _DB([7, 3])
    said = _run(T._staff_precheck({"email": "anya@example.com"}, _ctx(), db))
    assert said and "anya@example.com" in said, said
    # Текст читают двое — модель и человек, если исправить не вышло: имён
    # инструментов в нём быть не должно, а подсказка «он уже есть» — должна.
    assert "команды" in said and "_" not in said, said


def test_staff_precheck_silent_for_new_person():
    assert _run(T._staff_precheck({"email": "new@example.com"}, _ctx(), _DB([None]))) is None
    # Аккаунт есть, но в этой студии он не работает — это законное «завести».
    assert _run(T._staff_precheck({"email": "x@example.com"}, _ctx(), _DB([7, None]))) is None
    # Почты нет вовсе — проверять нечего, вопрос задаст форма.
    assert _run(T._staff_precheck({}, _ctx(), _DB([]))) is None


# ─── fill_schedule: «ставить некуда» видно до клика ──────────────────────────
def _fill_args(day: date) -> dict:
    return {
        "teacher_id": 1, "service_id": 2, "date_from": day.isoformat(),
        "date_to": day.isoformat(), "weekdays": [day.weekday()],
        "time_from": "09:00", "time_to": "10:00", "duration_min": 60,
    }


def test_fill_precheck_names_what_occupies_the_hours():
    day = date.today() + timedelta(days=3)
    taken = datetime(day.year, day.month, day.day, 9, 0)
    db = _DB([
        [_Hours(day.weekday())],        # _week_hours
        None,                           # отгула на этот день нет
        [(taken, 60)],                  # единственный слот занят
        [_Lesson(taken)],               # _busy_lessons — чем именно
    ])
    said = _run(T._fill_precheck(_fill_args(day), _ctx(), db))
    assert said and "Хатха" in said, said
    # Ради этой строки проверка и появилась: «поменяй хатху на стретчинг» не
    # должно превращаться во второе занятие поверх первого.
    assert "правка" in said and "поверх" in said, said


def test_fill_precheck_silent_when_a_slot_is_free():
    day = date.today() + timedelta(days=3)
    db = _DB([[_Hours(day.weekday())], None, []])
    assert _run(T._fill_precheck(_fill_args(day), _ctx(), db)) is None


def test_fill_precheck_silent_on_incomplete_args():
    # Недостающее спросит форма — проверять полшага бессмысленно.
    assert _run(T._fill_precheck({"teacher_id": 1}, _ctx(), _DB([]))) is None


# ─── create_lesson: поздно и вне рабочих часов ───────────────────────────────
def test_create_lesson_precheck_refuses_a_time_already_past_the_lead():
    late = datetime.now() + timedelta(hours=1)   # порог — 3 часа
    said = _run(T._create_lesson_precheck(
        {"service_id": 1, "teacher_id": 2, "start_time": late.isoformat()}, _ctx(), _DB([])))
    assert said and "3 часа" in said, said


def test_time_with_a_timezone_from_the_model_is_taken_as_local():
    """«10:00+03:00» — те же 10:00, а не падение сравнения.

    Модель дописывает к времени пояс, вся студия живёт в наивном локальном:
    без снятия ярлыка шаг доезжал до роутера и падал там TypeError'ом, а человек
    после клика «Утверждаю» читал «Не удалось выполнить запрос — попробуйте
    иначе». Стрелки при этом не двигаем — часы модель пишет местные.
    """
    args = T.CreateLessonArgs.model_validate({
        "service_id": 1, "teacher_id": 2, "start_time": "2026-09-10T10:00:00+03:00",
    })
    assert args.start_time == datetime(2026, 9, 10, 10, 0), args.start_time
    assert T.UpdateLessonArgs.model_validate({
        "lesson_id": 5, "start_time": "2026-09-10T10:00:00Z",
    }).start_time.tzinfo is None

    # И сама проверка теперь доходит до вердикта, а не до исключения.
    late = (datetime.now() + timedelta(hours=1)).isoformat() + "+03:00"
    said = _run(T._create_lesson_precheck(
        {"service_id": 1, "teacher_id": 2, "start_time": late}, _ctx(), _DB([])))
    assert said and "3 часа" in said, said


def test_create_lesson_precheck_repeats_the_routers_own_verdict():
    from fastapi import HTTPException

    original = T.assert_within_working_hours

    async def refuse(*_a, **_kw):
        raise HTTPException(status_code=400, detail="Тренер в этот день не работает")

    T.assert_within_working_hours = refuse
    try:
        said = _run(T._create_lesson_precheck({
            "service_id": 1, "teacher_id": 2,
            "start_time": (datetime.now() + timedelta(days=2)).isoformat(),
        }, _ctx(), _DB([])))
    finally:
        T.assert_within_working_hours = original
    assert said == "Тренер в этот день не работает", said


# ─── update_lesson: поздно и отменённое ──────────────────────────────────────
class _Got:
    def __init__(self, start_time, status="confirmed", name="Хатха"):
        self.start_time, self.status, self.name = start_time, status, name


def _with_lesson(lesson, args):
    original = T._r_get_lesson

    async def fake(lesson_id, ctx, db):
        return lesson

    T._r_get_lesson = fake
    try:
        return _run(T._update_lesson_precheck(args, _ctx(), _DB([])))
    finally:
        T._r_get_lesson = original


def test_update_lesson_precheck_refuses_cancelled_and_late():
    soon = datetime.now() + timedelta(minutes=30)
    later = datetime.now() + timedelta(days=2)
    assert "отменено" in _with_lesson(_Got(later, status="cancelled"), {"lesson_id": 1})
    assert "2 часа" in _with_lesson(_Got(soon), {"lesson_id": 1})
    # Занятие живое и не сегодня — молчим.
    assert _with_lesson(_Got(later), {"lesson_id": 1}) is None
    # Переносить в ближайшие два часа тоже нельзя.
    assert "2 часа" in _with_lesson(
        _Got(later), {"lesson_id": 1, "start_time": soon.isoformat()})


# ─── clear_schedule: сколько исчезнет — числом и до клика ────────────────────
class _Row:
    def __init__(self, id, start_time, name="Хатха"):
        self.id, self.start_time, self.name = id, start_time, name


def _clear_args(days=7):
    today = date.today()
    return {"teacher_id": 1, "date_from": today.isoformat(),
            "date_to": (today + timedelta(days=days)).isoformat()}


def _three(booked=()):
    when = datetime.now() + timedelta(days=1)
    rows = [_Row(i, when + timedelta(hours=i)) for i in (1, 2, 3)]
    return _DB([rows, list(booked)])


def test_clear_schedule_warns_with_the_count_before_the_click():
    said = _run(T._clear_warnings(_clear_args(), _ctx(), _three(booked=[2])))
    # Без числа «удалить расписание» подтверждают не глядя.
    assert said and "3 занятий" in said[0], said
    assert "1 из них с записанными клиентами" in said[0], said


def test_clear_schedule_refuses_when_there_is_nothing_to_take():
    assert _run(T._clear_precheck(_clear_args(), _ctx(), _DB([[]]))) is not None
    # Все занятия с людьми — снимать их ассистент не имеет права, и молчать об этом нельзя.
    said = _run(T._clear_precheck(_clear_args(), _ctx(), _three(booked=[1, 2, 3])))
    assert said and "записаны клиенты" in said, said
    # Часть свободна — работаем.
    assert _run(T._clear_precheck(_clear_args(), _ctx(), _three(booked=[2]))) is None


def test_clear_schedule_keeps_the_lessons_people_are_booked_on():
    from fastapi import HTTPException

    original = T._r_delete_lesson
    touched = []

    async def fake(lesson_id, ctx, db):
        touched.append(lesson_id)
        if lesson_id == 2:      # тот же отказ, что даёт роутер на занятии с записями
            raise HTTPException(status_code=409, detail="На занятие записаны клиенты")

    T._r_delete_lesson = fake
    try:
        result = _run(T.clear_schedule(
            _ctx(), _three(booked=[2]), T.ClearScheduleArgs.model_validate(_clear_args())))
    finally:
        T._r_delete_lesson = original
    assert touched == [1, 2, 3], touched
    assert result == {"deleted": 2, "kept_booked": 1}, result


# ─── make_step: отказ становится ошибкой шага, а не карточкой ───────────────
def test_make_step_drops_the_step_instead_of_showing_a_doomed_card():
    step = _run(make_step(1, "create_staff", {
        "name": "Аня", "email": "anya@example.com",
        "access_role": "trainer", "password": "Sup3r-pass",
    }, _ctx(), _DB([7, 3])))
    assert step["error"] and "anya@example.com" in step["error"], step
    # Карточки нет вовсе: ни аргументов, ни подписи — шаг не состоялся.
    assert "args" not in step and step["n"] == 1, step
    # Пароль в текст отказа не утёк.
    assert "Sup3r-pass" not in step["error"], step


# ─── set_staff_day: отметка одного дня ───────────────────────────────────────
def test_staff_day_precheck_refuses_the_past_and_a_day_with_bookings():
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    said = _run(T._staff_day_precheck(
        {"staff_id": 340, "day": yesterday, "is_working": True}, _ctx(), _DB([])))
    assert said and "Прошедшие" in said, said

    # Выходной поверх дня, куда уже записаны люди, роутер не поставит — и
    # человек обязан узнать это до клика, а не после.
    said = _run(T._staff_day_precheck(
        {"staff_id": 340, "day": (date.today() + timedelta(days=3)).isoformat(),
         "is_working": False}, _ctx(), _DB([1])))
    assert said and "записанные клиенты" in said, said


def test_staff_day_precheck_silent_for_an_ordinary_opening():
    # Открыть будущий день нечем помешать — база даже не спрашивается.
    assert _run(T._staff_day_precheck(
        {"staff_id": 340, "day": (date.today() + timedelta(days=3)).isoformat(),
         "is_working": True}, _ctx(), _DB([]))) is None


def test_lesson_survives_when_an_earlier_step_opens_that_very_day():
    """«Открой Валерии 29-е и поставь тренировку» — план из ДВУХ шагов.

    Проверка занятия читает базу, где выходной ещё стоит, и до этой правки
    выкидывала шаг с занятием, советуя сделать ровно то, что план делает шагом
    выше. Человек оставался с планом «открыть день» и без тренировки.
    """
    import dataclasses

    import services.ai_plan as P

    original, ran = T.TOOLS["create_lesson"], []

    async def spy(args, ctx, db):
        ran.append(args)
        return "У сотрудника в этот день выходной"

    async def no_defaults(args, ctx, db):
        return args

    async def no_resolve(args, ctx, db):
        return {}, None

    T.TOOLS["create_lesson"] = dataclasses.replace(
        original, precheck=spy, defaults=no_defaults)
    original_resolve, P.resolve_entities = P.resolve_entities, no_resolve
    try:
        args = {"service_id": 1, "teacher_id": 340,
                "start_time": "2026-09-10T10:00:00", "duration_min": 60, "total_spots": 8}
        opener = {"n": 1, "tool": "set_staff_day",
                  "args": {"staff_id": 340, "day": "2026-09-10", "is_working": True}}

        step = _run(make_step(2, "create_lesson", dict(args), _ctx(), _DB([]), [opener]))
        assert "error" not in step and not ran, step

        # Тому же тренеру день никто не открывал — проверка работает как раньше.
        other = {**opener, "args": {**opener["args"], "staff_id": 999}}
        blocked = _run(make_step(2, "create_lesson", dict(args), _ctx(), _DB([]), [other]))
        assert blocked["error"] == "У сотрудника в этот день выходной" and ran, blocked
    finally:
        T.TOOLS["create_lesson"] = original
        P.resolve_entities = original_resolve


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)

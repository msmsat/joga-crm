"""Событие «занятие изменено» (c11) + честный clients_notified (эпик V4-6, задача 3).

EPIC 3, Задача 2: notify() теперь резолвит каналы через
services.notification_resolver.resolve_channels вместо инлайновой проверки
матрицы. Тесты update_lesson/cancel_lesson патчат L.notify напрямую — их
дело проверить агрегацию clients_notified, а не резолвинг каналов (тот
покрыт tests/test_notification_resolver.py). Тесты notify() ниже патчат
resolve_channels — так же не завязаны на его внутренние запросы к БД.

Образец фейковой сессии — tests/test_loyalty_points.py.
Запуск из back/:  python -m tests.test_lesson_reschedule_notify
"""
import asyncio
from datetime import datetime, timedelta

import pytest

from fastapi import HTTPException

import routers.schedule.lessons as L
import services.lesson_changes as lesson_changes_module
import services.notifier as notifier_module
import services.notification_resolver as resolver_module
from dependencies import StudioContext
from schemas.schedule.lessons import LessonUpdateRequest
from services.notifier import notify

# Транспорт подменяется только на время каждого теста: подмена при импорте
# модуля меняла send_email для всех остальных файлов ещё при сборе pytest.
# Физическая сеть дополнительно закрыта в conftest.py.


async def _noop_send_email(*_args, **_kwargs) -> bool:
    return True


@pytest.fixture(autouse=True)
def isolated_delivery(monkeypatch):
    monkeypatch.setattr(notifier_module, "send_email", _noop_send_email)


class _User:
    # Правит владелец, а не сам тренер занятия (teacher_id=1): себе о своей же
    # правке t5 не уходит.
    id = 99


class _Studio:
    """HB-06: `schedule_guard.lock_studio` — первый SELECT в update_lesson."""
    strict_schedule_enabled = False


class _Lesson:
    def __init__(self, start_time, status="confirmed"):
        self.id = 1
        self.studio_id = 1
        self.status = status
        self.start_time = start_time
        self.teacher_id = 1
        self.teacher_name = "Анна Иванова"
        self.name = "Йога"
        self.hall_id = None
        self.duration_min = 60
        self.price = 0
        self.level = ""
        self.equipment = ""
        self.total_spots = 8
        self.service_id = None
        self.cancel_reason = None
        # Заметка студии о занятии и снимки к ней — как на реальной модели.
        self.notes = ""
        self.photos = []
        self.clients_notified = False
        # HB-04: новые поля Lesson (branch_id/booking_mode/tz_iana, HB-02) —
        # фейковый объект должен нести их, как реальная ORM-модель.
        self.branch_id = None
        self.booking_mode = "event"
        self.tz_iana = None
        # HB-22: версия интервала есть на модели и уходит в ответ
        # (expected_version при переносе) — фейк обязан её нести.
        self.version = 1
        # Статус записи-источника при переносе (Bumpix) — поле модели,
        # уходит в ответ _lesson_read, фейк обязан его нести.
        self.source_status = None
        self.source_details = None
        # Отменённое и убранное из сетки — поле модели, уходит в ответ.
        self.hidden_at = None


class _StudioPrefs:
    language = "ru"
    currency = "RUB"


class _Client:
    def __init__(self, email):
        self.id = 7
        self.email = email
        self.tg_id = None
        self.phone = None
        self.ig_id = None  # _recipient читает все четыре реквизита канала
        self.name = "Матвей"  # обращение в письме («Матвей, здравствуйте!»)


class _Reservation:
    """Фейк Reservation для cancel_lesson.

    Каскад отмены зовёт домен (services/booking.cancel) с
    `enforce_policy=False`: тот находит бронь одним запросом и зовёт
    `refund_reservation`, который сразу выходит при subscription_id=None и
    debt_payment_id=None — без похода в БД. Этим мок и остаётся коротким:
    здесь проверяются УВЕДОМЛЕНИЯ об отмене, а механика самой отмены — в
    tests/test_booking_domain.py на настоящей базе.
    """
    _next = [1]

    def __init__(self, client_id):
        self.id = _Reservation._next[0]
        _Reservation._next[0] += 1
        self.client_id = client_id
        self.lesson_id = 1
        self.status = "active"
        self.cancelled_at = None
        self.subscription_id = None
        self.debt_payment_id = None


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v if isinstance(self._v, list) else [self._v]

    def scalar(self):
        return self._v

    def first(self):
        return self._v


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)
        self.added = []
        self.committed = False

    def add(self, x):
        self.added.append(x)

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def refresh(self, _x):
        pass

    async def execute(self, _q):
        return _R(self._seq.pop(0))

    async def get(self, *_args, **_kwargs):
        return None


def _ctx(role="owner"):
    return StudioContext(user=_User(), studio_id=1, role=role)


# ─── notify(): резолвинг каналов патчится, здесь проверяем только оркестрацию
# рендер → получатели → resolve_channels → deliver (сам резолвинг — отдельный
# файл, tests/test_notification_resolver.py) ─────────────────────────────────
def test_notify_returns_false_when_resolver_finds_no_channels():
    """optional-событие (c5): resolve_channels вернул пустой набор без forced —
    единственный легальный «не слать» (§3 эпика)."""
    db = _DB([_StudioPrefs(), _Client("c@x.com")])

    async def fake_resolve(db_, studio_id, role, event_id, recipient_user_id):
        return set(), False

    orig = resolver_module.resolve_channels
    resolver_module.resolve_channels = fake_resolve
    try:
        result = asyncio.run(notify(db, 1, "client", "c5", {"client_id": 1}))
    finally:
        resolver_module.resolve_channels = orig
    assert result is False


def test_notify_sends_via_forced_fallback_channel():
    """critical-событие (c11): resolve_channels сообщил forced=True — notify
    всё равно доставляет через fallback-канал (Guaranteed Delivery, §3),
    а не молчит."""
    db = _DB([_StudioPrefs(), _Client("c@x.com")])

    async def fake_resolve(db_, studio_id, role, event_id, recipient_user_id):
        return {"email"}, True

    calls = []

    # **_kw, а не перечисление именованных: notifier.deliver дополняется новыми
    # keyword-only параметрами (event_id и context приехали в N-9), и фейк с жёсткой
    # сигнатурой падал TypeError'ом — тест «отправка не молчит» ловил не то, что
    # проверяет. Каналы здесь и так единственное, что важно.
    async def fake_deliver(db_, channel, recipient, subject, text, html, **_kw):
        calls.append(channel)
        return True

    orig_resolve = resolver_module.resolve_channels
    orig_deliver = notifier_module.deliver
    resolver_module.resolve_channels = fake_resolve
    notifier_module.deliver = fake_deliver
    try:
        result = asyncio.run(notify(db, 1, "client", "c11", {"client_id": 1}))
    finally:
        resolver_module.resolve_channels = orig_resolve
        notifier_module.deliver = orig_deliver
    assert result is True
    assert calls == ["email"], calls


def test_notify_returns_false_for_unknown_event_template():
    db = _DB([_StudioPrefs()])  # notify: _studio_prefs — рендер падает в None раньше recipients
    result = asyncio.run(notify(db, 1, "client", "c99-unknown", {"client_id": 1}))
    assert result is False


# ─── update_lesson: перенос уведомляет клиентов, clients_notified честный ───
def _with_notify(fake, run):
    """Клиентам пишет services/lesson_changes, тренеру (t5) — сам роутер:
    подменяем оба места на время вызова."""
    orig = L.notify, lesson_changes_module.notify
    L.notify = lesson_changes_module.notify = fake
    try:
        return run()
    finally:
        L.notify, lesson_changes_module.notify = orig


# Запросы переноса по порядку: lock_studio, get_scoped_lesson, число записанных,
# правила записи (нет строки — умолчания), гейт рабочих часов (студия / время
# студии / отметка даты / график тренера), студия для снимка зоны (P1.2: None —
# зона не подтверждена), автор правки для ленты событий, записанные для
# уведомления (только если они есть), a7: _find_schedule_conflict.
def _move_seq(lesson, booked, clients):
    recipients = [clients] if booked else []
    return [_Studio(), lesson, booked, None, None, None, None, None, None, [], *recipients, []]


def test_reschedule_with_client_sets_notified_true_when_email_enabled():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB(_move_seq(lesson, 1, [7]))
    calls = []

    async def fake_notify(db_, studio_id, role, event_id, context=None):
        calls.append((role, event_id))
        return True

    body = LessonUpdateRequest(start_time=new_start)
    result = _with_notify(fake_notify, lambda: asyncio.run(L.update_lesson(1, body, _ctx(), db)))
    assert lesson.clients_notified is True
    assert result.clients_notified is True
    assert ("client", "c11") in calls
    assert ("trainer", "t5") in calls  # тренер узнаёт о переносе — эпик 3, задача 4


def test_reschedule_with_client_notified_false_when_channel_disabled():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB(_move_seq(lesson, 1, [7]))

    async def fake_notify(db_, studio_id, role, event_id, context=None):
        return False  # ни один канал не доставил (например, все выключены)

    body = LessonUpdateRequest(start_time=new_start)
    result = _with_notify(fake_notify, lambda: asyncio.run(L.update_lesson(1, body, _ctx(), db)))
    assert lesson.clients_notified is False
    assert result.clients_notified is False


def test_reschedule_without_clients_stays_false_no_notify_call():
    """Перенос без записанных клиентов — клиентский notify (c11) не вызывается
    вовсе, clients_notified остаётся False (тренерский t5 всё равно уходит —
    он не зависит от записанных клиентов)."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB(_move_seq(lesson, 0, []))
    calls = []

    async def fake_notify(db_, studio_id, role, event_id, context=None):
        calls.append((role, event_id))
        return True

    body = LessonUpdateRequest(start_time=new_start)
    result = _with_notify(fake_notify, lambda: asyncio.run(L.update_lesson(1, body, _ctx(), db)))
    assert lesson.clients_notified is False
    assert ("client", "c11") not in calls
    assert ("trainer", "t5") in calls


def test_reschedule_cancelled_lesson_rejected():
    """Перенос ОТМЕНЁННОГО занятия теперь запрещён целиком (эпик V4-7, задача 6,
    сменяет прежнее поведение V4-6 задачи 3: раньше правка проходила молча, без
    уведомлений) — 400 раньше похода в БД за клиентами, правка не применяется."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10), status="cancelled")
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB([_Studio(), lesson])  # lock_studio, get_scoped_lesson — guard срабатывает раньше следующего execute
    body = LessonUpdateRequest(start_time=new_start)
    try:
        asyncio.run(L.update_lesson(1, body, _ctx(), db))
        raise AssertionError("ожидали HTTPException(400)")
    except HTTPException as e:
        assert e.status_code == 400
        assert "отменено" in e.detail
    assert lesson.clients_notified is False
    assert lesson.start_time != new_start  # правка не применена
    assert db.committed is False


def test_non_reschedule_field_does_not_trigger_notify():
    """Цена без записанных: пересчитывать некому, сообщать некому — клиенту
    ничего не уходит, clients_notified остаётся False."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    # lock_studio, get_scoped_lesson, записанные, правила, автор правки для ленты
    db = _DB([_Studio(), lesson, 0, None, []])
    body = LessonUpdateRequest(price=777)
    result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    assert result.price == 777
    assert lesson.clients_notified is False


# ─── cancel_lesson: результат notify c3 агрегируется в clients_notified ─────
def test_cancel_sets_notified_true_when_client_notified():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=5))
    booked = _Reservation(7)
    db = _DB([
        _Studio(),                   # cancel_lesson: lock_studio before child rows
        lesson,                      # get_scoped_lesson
        [booked],                    # select Reservation (booked, каскад отмены)
        _Studio(),                   # booking.cancel: lock_studio (HB-06)
        booked,                      # booking.cancel находит ту же бронь
        None,                        # conditional cancellation of the private resource interval
        None,                        # HB-25: INSERT намерения уведомить об отмене
    ])
    calls = []

    async def fake_notify(db_, studio_id, role, event_id, context=None):
        calls.append((role, event_id))
        return True

    orig = L.notify
    L.notify = fake_notify
    try:
        result = asyncio.run(L.cancel_lesson(1, ctx=_ctx(), db=db))
    finally:
        L.notify = orig
    assert lesson.clients_notified is True
    assert result.clients_notified is True
    assert ("client", "c3") in calls
    assert ("trainer", "t9") in calls  # тренер узнаёт об отмене своего занятия — эпик 3, задача 4


def test_cancel_no_clients_stays_false():
    """Без записанных клиентов клиентский c3 не зовётся, но тренер (t9) всё
    равно узнаёт об отмене своего занятия — не зависит от booked_client_ids."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=5))
    db = _DB([_Studio(), lesson, []])  # lock_studio, lesson, reservations
    calls = []

    async def fake_notify(db_, studio_id, role, event_id, context=None):
        calls.append((role, event_id))
        return True

    orig = L.notify
    L.notify = fake_notify
    try:
        result = asyncio.run(L.cancel_lesson(1, ctx=_ctx(), db=db))
    finally:
        L.notify = orig
    assert lesson.clients_notified is False
    assert result.clients_notified is False
    assert ("client", "c3") not in calls
    assert ("trainer", "t9") in calls


if __name__ == "__main__":
    with pytest.MonkeyPatch.context() as delivery_patch:
        delivery_patch.setattr(notifier_module, "send_email", _noop_send_email)
        test_notify_returns_false_when_resolver_finds_no_channels()
        test_notify_sends_via_forced_fallback_channel()
        test_notify_returns_false_for_unknown_event_template()
        test_reschedule_with_client_sets_notified_true_when_email_enabled()
        test_reschedule_with_client_notified_false_when_channel_disabled()
        test_reschedule_without_clients_stays_false_no_notify_call()
        test_reschedule_cancelled_lesson_rejected()
        test_non_reschedule_field_does_not_trigger_notify()
        test_cancel_sets_notified_true_when_client_notified()
        test_cancel_no_clients_stays_false()
    print("ALL PASS — событие c11 / честный clients_notified V4-6 задача 3 зелёные")

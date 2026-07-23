"""Событие «занятие изменено» (c11) + честный clients_notified (эпик V4-6, задача 3).
Образец фейковой сессии — tests/test_loyalty_points.py.

Запуск из back/:  python -m tests.test_lesson_reschedule_notify
"""
import asyncio
from datetime import datetime, timedelta

import routers.schedule.lessons as L
import services.notifier as notifier_module
from dependencies import StudioContext
from schemas.schedule.lessons import LessonUpdateRequest
from services.notifier import notify

# notify() реально шлёт email через SMTP (креды есть в .env этого проекта) —
# в тестах подменяем send_email на no-op, чтобы не улетали настоящие письма.
notifier_module.send_email = lambda *a, **kw: asyncio.sleep(0)


class _User:
    id = 1


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
        self.clients_notified = False


class _Settings:
    def __init__(self, enabled=True):
        self.email_notifications = enabled
        self.telegram_notifications = False
        self.whatsapp_notifications = False


class _StudioPrefs:
    language = "ru"
    currency = "RUB"


class _Client:
    def __init__(self, email):
        self.id = 7
        self.email = email
        self.tg_id = None


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


def _ctx(role="owner"):
    return StudioContext(user=_User(), studio_id=1, role=role)


# ─── notify(): bool-возврат ──────────────────────────────────────────────────
def test_notify_returns_false_when_channel_disabled():
    db = _DB([_Settings(enabled=False)])  # все каналы глобально выключены
    result = asyncio.run(notify(db, 1, "client", "c11", {"client_id": 1}))
    assert result is False


def test_notify_returns_false_when_event_not_enabled_in_matrix():
    db = _DB([_Settings(enabled=True), []])  # settings ok, matrix: ни один канал не включён
    result = asyncio.run(notify(db, 1, "client", "c11", {"client_id": 1}))
    assert result is False


def test_notify_returns_false_for_unknown_event_template():
    db = _DB([
        _Settings(enabled=True), ["email"],  # settings ok, matrix: email on
        _StudioPrefs(),                       # _studio_prefs
    ])  # но шаблона для события нет
    result = asyncio.run(notify(db, 1, "client", "c99-unknown", {"client_id": 1}))
    assert result is False


# ─── update_lesson: перенос уведомляет клиентов, clients_notified честный ───
def test_reschedule_with_client_sets_notified_true_when_email_enabled():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB([
        lesson,                      # get_scoped_lesson
        [7],                         # select client_id (reschedule notify)
        _Settings(enabled=True),     # notify: settings
        ["email"],                   # notify: matrix — email включён
        _StudioPrefs(),              # notify: _studio_prefs
        _Client("client@x.com"),     # notify: _recipient
        0,                           # финальный _booked_count для ответа
    ])
    body = LessonUpdateRequest(start_time=new_start)
    result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    assert lesson.clients_notified is True
    assert result.clients_notified is True


def test_reschedule_with_client_notified_false_when_channel_disabled():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB([
        lesson,
        [7],                         # select client_id
        _Settings(enabled=False),    # notify: все каналы выключены → False
        0,                           # финальный _booked_count
    ])
    body = LessonUpdateRequest(start_time=new_start)
    result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    assert lesson.clients_notified is False
    assert result.clients_notified is False


def test_reschedule_without_clients_stays_false_no_notify_call():
    """Перенос без записанных клиентов — notify не вызывается вовсе, clients_notified False."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB([lesson, [], 0])  # get_scoped_lesson, client_id-ы (пусто), финальный _booked_count
    body = LessonUpdateRequest(start_time=new_start)
    result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    assert lesson.clients_notified is False


def test_non_reschedule_field_does_not_trigger_notify():
    """price не входит в reschedule_fields — notify-блок вообще не заходит."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    db = _DB([lesson, 0])  # get_scoped_lesson, финальный _booked_count — и всё
    body = LessonUpdateRequest(price=777)
    result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    assert result.price == 777
    assert lesson.clients_notified is False


# ─── cancel_lesson: результат notify c3 агрегируется в clients_notified ─────
def test_cancel_sets_notified_true_when_client_notified():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=5))
    db = _DB([
        lesson,                      # get_scoped_lesson
        [7],                         # select client_id (booked)
        None,                        # UPDATE Reservation cascade
        _Settings(enabled=True),     # notify: settings
        ["email"],                   # notify: matrix — email включён
        _StudioPrefs(),              # notify: _studio_prefs
        _Client("client@x.com"),     # notify: _recipient
    ])
    result = asyncio.run(L.cancel_lesson(1, ctx=_ctx(), db=db))
    assert lesson.clients_notified is True
    assert result.clients_notified is True


def test_cancel_no_clients_stays_false():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=5))
    db = _DB([lesson, [], None])  # get_scoped_lesson, client_id-ы (пусто), UPDATE cascade
    result = asyncio.run(L.cancel_lesson(1, ctx=_ctx(), db=db))
    assert lesson.clients_notified is False


if __name__ == "__main__":
    test_notify_returns_false_when_channel_disabled()
    test_notify_returns_false_when_event_not_enabled_in_matrix()
    test_notify_returns_false_for_unknown_event_template()
    test_reschedule_with_client_sets_notified_true_when_email_enabled()
    test_reschedule_with_client_notified_false_when_channel_disabled()
    test_reschedule_without_clients_stays_false_no_notify_call()
    test_non_reschedule_field_does_not_trigger_notify()
    test_cancel_sets_notified_true_when_client_notified()
    test_cancel_no_clients_stays_false()
    print("ALL PASS — событие c11 / честный clients_notified V4-6 задача 3 зелёные")

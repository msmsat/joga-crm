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

from fastapi import HTTPException

import routers.schedule.lessons as L
import services.notifier as notifier_module
import services.notification_resolver as resolver_module
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


class _StudioPrefs:
    language = "ru"
    currency = "RUB"


class _Client:
    def __init__(self, email):
        self.id = 7
        self.email = email
        self.tg_id = None
        self.phone = None


class _Reservation:
    """Фейк Reservation для cancel_lesson: каскад отмены мутирует объект и
    зовёт refund_reservation, который сразу выходит при subscription_id=None
    (без похода в БД) — этим и упрощаем мок."""
    def __init__(self, client_id):
        self.client_id = client_id
        self.status = "active"
        self.cancelled_at = None
        self.subscription_id = None


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

    async def fake_deliver(db_, channel, recipient, subject, text, html, *, studio_id):
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
def test_reschedule_with_client_sets_notified_true_when_email_enabled():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB([
        lesson,                      # get_scoped_lesson
        [7],                         # select client_id (reschedule notify, c11)
        [],                          # a7: _find_schedule_conflict → нет пересечений
        0,                           # финальный _booked_count для ответа
    ])
    calls = []

    async def fake_notify(db_, studio_id, role, event_id, context=None):
        calls.append((role, event_id))
        return True

    orig = L.notify
    L.notify = fake_notify
    try:
        body = LessonUpdateRequest(start_time=new_start)
        result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    finally:
        L.notify = orig
    assert lesson.clients_notified is True
    assert result.clients_notified is True
    assert ("client", "c11") in calls
    assert ("trainer", "t5") in calls  # тренер узнаёт о переносе — эпик 3, задача 4


def test_reschedule_with_client_notified_false_when_channel_disabled():
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB([lesson, [7], [], 0])

    async def fake_notify(db_, studio_id, role, event_id, context=None):
        return False  # ни один канал не доставил (например, все выключены)

    orig = L.notify
    L.notify = fake_notify
    try:
        body = LessonUpdateRequest(start_time=new_start)
        result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    finally:
        L.notify = orig
    assert lesson.clients_notified is False
    assert result.clients_notified is False


def test_reschedule_without_clients_stays_false_no_notify_call():
    """Перенос без записанных клиентов — клиентский notify (c11) не вызывается
    вовсе, clients_notified остаётся False (тренерский t5 всё равно уходит —
    он не зависит от записанных клиентов)."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10))
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB([lesson, [], [], 0])
    calls = []

    async def fake_notify(db_, studio_id, role, event_id, context=None):
        calls.append((role, event_id))
        return True

    orig = L.notify
    L.notify = fake_notify
    try:
        body = LessonUpdateRequest(start_time=new_start)
        result = asyncio.run(L.update_lesson(1, body, _ctx(), db))
    finally:
        L.notify = orig
    assert lesson.clients_notified is False
    assert ("client", "c11") not in calls
    assert ("trainer", "t5") in calls


def test_reschedule_cancelled_lesson_rejected():
    """Перенос ОТМЕНЁННОГО занятия теперь запрещён целиком (эпик V4-7, задача 6,
    сменяет прежнее поведение V4-6 задачи 3: раньше правка проходила молча, без
    уведомлений) — 400 раньше похода в БД за клиентами, правка не применяется."""
    lesson = _Lesson(start_time=datetime.now() + timedelta(hours=10), status="cancelled")
    new_start = datetime.now() + timedelta(hours=20)
    db = _DB([lesson])  # get_scoped_lesson — guard срабатывает раньше следующего execute
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
        [_Reservation(7)],           # select Reservation (booked, каскад отмены)
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
    db = _DB([lesson, []])  # get_scoped_lesson, reservations (пусто)
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

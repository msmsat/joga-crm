"""Правка занятия: что можно менять, когда и кому об этом сообщать.

Правило — services/lesson_edit_policy, роутер — PATCH /schedule/lessons/{id}:
  * до последнего момента для правки (срок отмены записи + 2 ч, у занятия без
    записанных — 2 ч) меняется всё: название, цена, тренер, время, уровень,
    инвентарь; записанные получают c11 (только перенос) или c14 (остальное),
    каждый — своё: строка «К оплате» только у того, чей долг поменялся;
  * от него до конца занятия — только тихие поля (заметка, фото, места);
  * после окончания — снова всё, но без уведомлений и без пересчёта денег, а
    время остаётся в прошлом;
  * тренер правит своё занятие и не правит чужое; каждая правка — строка в
    ленте событий студии.

Студия без подтверждённой зоны: время сравнивается по стенным часам процесса —
так тесты не зависят от зоны контейнера. Реальная БД.
Запуск из back/:  python -m pytest tests/test_lesson_edit.py -q
"""
import asyncio
import os
import time as _time
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, select

import routers.schedule.lessons as L
import routers.schedule.reservations as RES
import services.lesson_changes as LC
from database import async_session_maker
from dependencies import StudioContext
from models import (
    ActivityLog, Client, ClientPayment, Lesson, Reservation, Service, Studio,
    StudioBookingSettings, StudioMember, User,
)
from schemas.schedule.lessons import LessonUpdateRequest
from schemas.schedule.reservations import ReservationCreate
from services import lesson_edit_policy as P


def _now() -> datetime:
    return datetime.now().replace(microsecond=0)


# ─── Правило без базы ────────────────────────────────────────────────────────

def _bare(start: datetime, duration: int = 60):
    return SimpleNamespace(id=1, start_time=start, duration_min=duration, tz_iana=None)


def _code(failure) -> str:
    return failure.value.detail["code"]


def test_notice_lead_is_cancel_deadline_plus_two_hours_only_with_bookings():
    assert P.notice_lead(240, booked=3) == timedelta(hours=6)
    assert P.notice_lead(0, booked=1) == timedelta(hours=2)
    # Предупреждать некого — прежние два часа.
    assert P.notice_lead(240, booked=0) == timedelta(hours=2)


def test_phases():
    lead = timedelta(hours=6)
    assert P.phase_of(_bare(_now() + timedelta(hours=7)), lead) is P.Phase.OPEN
    assert P.phase_of(_bare(_now() + timedelta(hours=5)), lead) is P.Phase.FROZEN
    # Идёт прямо сейчас — тоже заморожено, а не «прошло».
    assert P.phase_of(_bare(_now() - timedelta(minutes=30)), lead) is P.Phase.FROZEN
    assert P.phase_of(_bare(_now() - timedelta(hours=2)), lead) is P.Phase.FINISHED


def test_frozen_lesson_takes_only_quiet_fields():
    lesson = _bare(_now() + timedelta(hours=5))
    for fields in ({"price": 900}, {"name": "Другое"}, {"teacher_id": 2}):
        with pytest.raises(HTTPException) as failure:
            P.check(lesson, fields, booked=2, cancel_deadline_min=240)
        assert _code(failure) == "lesson_edit_frozen"
        assert "6 ч" in failure.value.detail["message"]
    for fields in ({"total_spots": 12}, {"notes": "коврики"}, {"photos": []}):
        assert P.check(lesson, fields, booked=2, cancel_deadline_min=240) is P.Phase.FROZEN


def test_open_lesson_cannot_move_into_the_notice_window():
    lesson = _bare(_now() + timedelta(days=2))
    with pytest.raises(HTTPException) as failure:
        P.check(lesson, {"start_time": _now() + timedelta(hours=4)}, booked=1, cancel_deadline_min=240)
    assert _code(failure) == "lesson_edit_too_soon"
    assert P.check(lesson, {"start_time": _now() + timedelta(hours=7)}, booked=1,
                   cancel_deadline_min=240) is P.Phase.OPEN
    # Пустое занятие подчиняется прежним двум часам.
    assert P.check(lesson, {"start_time": _now() + timedelta(hours=3)}, booked=0,
                   cancel_deadline_min=240) is P.Phase.OPEN


def test_finished_lesson_stays_in_the_past():
    lesson = _bare(_now() - timedelta(hours=3))
    assert P.check(lesson, {"start_time": _now() - timedelta(days=1), "price": 1},
                   booked=4, cancel_deadline_min=240) is P.Phase.FINISHED
    with pytest.raises(HTTPException) as failure:
        P.check(lesson, {"start_time": _now() + timedelta(days=1)}, booked=4, cancel_deadline_min=240)
    assert _code(failure) == "lesson_stays_in_past"
    # Растянуть так, что конец уедет в «сейчас», тоже нельзя.
    with pytest.raises(HTTPException):
        P.check(lesson, {"duration_min": 300}, booked=4, cancel_deadline_min=240)


def test_blank_name_is_rejected_and_texts_are_trimmed():
    with pytest.raises(ValidationError):
        LessonUpdateRequest(name="   ")
    body = LessonUpdateRequest(name="  Хатха ", level=" Начинающие ")
    assert body.model_dump(exclude_unset=True) == {"name": "Хатха", "level": "Начинающие"}


# ─── Роутер на настоящей базе ────────────────────────────────────────────────

async def _seed() -> dict:
    stamp = f"{int(_time.time() * 1000)}-{os.getpid()}"
    async with async_session_maker() as db:
        studio = Studio(name=f"TEST-LESSON-EDIT-{stamp}", currency="CZK")
        db.add(studio)
        await db.flush()
        db.add(StudioBookingSettings(studio_id=studio.id, cancellation_deadline_min=240))
        owner, anna, boris = (User(email=f"edit-{who}-{stamp}@test.local", hashed_password="x", name=who)
                              for who in ("owner", "anna", "boris"))
        db.add_all([owner, anna, boris])
        await db.flush()
        db.add_all([
            StudioMember(user_id=owner.id, studio_id=studio.id, role="owner", status="active", name="Ольга"),
            StudioMember(user_id=anna.id, studio_id=studio.id, role="trainer", status="active", name="Анна"),
            StudioMember(user_id=boris.id, studio_id=studio.id, role="trainer", status="active", name="Борис"),
        ])
        yoga = Service(studio_id=studio.id, name="Йога", duration_min=60, price=500)
        katya = Client(studio_id=studio.id, name="Катя", phone="+420777000111")
        lena = Client(studio_id=studio.id, name="Лена", phone="+420777000222")
        db.add_all([yoga, katya, lena])
        await db.commit()
        return {"studio": studio.id, "owner": owner.id, "anna": anna.id, "boris": boris.id,
                "yoga": yoga.id, "katya": katya.id, "lena": lena.id,
                "users": [owner.id, anna.id, boris.id]}


async def _cleanup(ids) -> None:
    async with async_session_maker() as db:
        lessons = select(Lesson.id).where(Lesson.studio_id == ids["studio"])
        await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lessons)))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id.in_(ids["users"])))
        await db.commit()


async def _lesson(ids, start: datetime, *, teacher="anna", debt_for=(), free_for=()) -> int:
    """Занятие и записанные: `debt_for` — с неоплаченным долгом по цене
    занятия, `free_for` — без долга (абонемент, подарок)."""
    async with async_session_maker() as db:
        lesson = Lesson(studio_id=ids["studio"], name="Йога", teacher_name="Анна",
                        teacher_id=ids[teacher], service_id=ids["yoga"], start_time=start,
                        duration_min=60, price=500, level="", equipment="", total_spots=8,
                        status="confirmed", booking_mode="event")
        db.add(lesson)
        await db.flush()
        for spot, key in enumerate((*debt_for, *free_for), start=1):
            reservation = Reservation(client_id=ids[key], lesson_id=lesson.id, spot_number=spot,
                                      status="active")
            db.add(reservation)
            if key in debt_for:
                debt = ClientPayment(client_id=ids[key], amount=500, status="pending",
                                     action_type="lesson", item_key=str(lesson.id),
                                     description="Йога")
                db.add(debt)
                await db.flush()
                reservation.debt_payment_id = debt.id
        await db.commit()
        return lesson.id


def _ctx(ids, who="owner", role="owner"):
    return StudioContext(user=SimpleNamespace(id=ids[who]), studio_id=ids["studio"], role=role)


async def _patch(ids, lesson_id, ctx=None, **fields):
    async with async_session_maker() as db:
        return await L.update_lesson(lesson_id, LessonUpdateRequest(**fields),
                                     ctx=ctx or _ctx(ids), db=db, background_tasks=None)


@pytest.fixture
def sent(monkeypatch):
    """Уведомления, которые ушли бы: (роль, событие, контекст)."""
    calls = []

    async def fake_notify(db, studio_id, role, event_id, context, **_kw):
        calls.append((role, event_id, context))
        return True

    monkeypatch.setattr(LC, "notify", fake_notify)
    monkeypatch.setattr(L, "notify", fake_notify)
    monkeypatch.setattr(RES, "notify", fake_notify)
    return calls


def _run(scenario):
    async def run():
        ids = await _seed()
        try:
            await scenario(ids)
        finally:
            await _cleanup(ids)
    asyncio.run(run())


def _fields(context) -> dict:
    return {change["field"]: (change["old"], change["new"]) for change in context["changes"]}


def test_change_before_the_lesson_reprices_debts_and_tells_each_client_their_part(sent):
    async def scenario(ids):
        lesson_id = await _lesson(ids, _now() + timedelta(days=3), debt_for=("katya",), free_for=("lena",))
        read = await _patch(ids, lesson_id, name="Хатха для начинающих", price=650,
                            teacher_id=ids["boris"], level="Начинающие", equipment="Коврик")
        assert (read.name, read.price, read.level, read.equipment, read.teacher_id) == \
            ("Хатха для начинающих", 650, "Начинающие", "Коврик", ids["boris"])

        async with async_session_maker() as db:
            debt = (await db.execute(select(ClientPayment).where(
                ClientPayment.client_id == ids["katya"]))).scalar_one()
            assert (debt.amount, debt.status) == (650, "pending")
            feed = (await db.execute(select(ActivityLog).where(
                ActivityLog.studio_id == ids["studio"]))).scalars().all()
        assert len(feed) == 1 and feed[0].event_type == "lesson"
        assert feed[0].actor_name == "Ольга"
        assert "Цена: 500 Kč → 650 Kč" in feed[0].title and "Тренер: Анна → Борис" in feed[0].title

        by_client = {ctx["client_id"]: (event, ctx) for role, event, ctx in sent if role == "client"}
        assert set(by_client) == {ids["katya"], ids["lena"]}
        katya_event, katya = by_client[ids["katya"]]
        lena_event, lena = by_client[ids["lena"]]
        assert katya_event == lena_event == "c14"
        assert _fields(katya)["due"] == (500, 650)
        # Лена не платит за это занятие — сумма к оплате ей ни о чём не скажет.
        assert "due" not in _fields(lena)
        assert _fields(lena)["teacher"] == ("Анна", "Борис")
        # Цену прайса клиентам не пишем — только их собственную сумму.
        assert "price" not in _fields(katya)
        # Тренер не двигался во времени — t5 «перенесено» не уходит.
        assert not [call for call in sent if call[1] == "t5"]
    _run(scenario)


def test_pure_move_is_still_c11(sent):
    async def scenario(ids):
        lesson_id = await _lesson(ids, _now() + timedelta(days=3), free_for=("lena",))
        await _patch(ids, lesson_id, start_time=_now() + timedelta(days=4))
        assert [event for role, event, _ in sent if role == "client"] == ["c11"]
        # Тренеру — t5, как и раньше.
        assert [ctx["trainer_id"] for role, event, ctx in sent if event == "t5"] == [ids["anna"]]
    _run(scenario)


def test_price_only_change_reaches_only_those_who_owe(sent):
    async def scenario(ids):
        lesson_id = await _lesson(ids, _now() + timedelta(days=3), debt_for=("katya",), free_for=("lena",))
        await _patch(ids, lesson_id, price=400)
        assert [(event, ctx["client_id"]) for role, event, ctx in sent] == [("c14", ids["katya"])]
    _run(scenario)


def test_frozen_lesson_with_bookings_refuses_changes_but_takes_a_mat(sent):
    async def scenario(ids):
        lesson_id = await _lesson(ids, _now() + timedelta(hours=5), debt_for=("katya",))
        with pytest.raises(HTTPException) as failure:
            await _patch(ids, lesson_id, price=900)
        assert _code(failure) == "lesson_edit_frozen"
        read = await _patch(ids, lesson_id, total_spots=9)
        assert read.total_spots == 9
        assert sent == []
        async with async_session_maker() as db:
            assert (await db.get(Lesson, lesson_id)).price == 500
    _run(scenario)


def test_empty_lesson_keeps_the_two_hour_rule(sent):
    async def scenario(ids):
        lesson_id = await _lesson(ids, _now() + timedelta(hours=5))
        read = await _patch(ids, lesson_id, name="Йога-нидра", price=300)
        assert (read.name, read.price) == ("Йога-нидра", 300)
        assert sent == []
    _run(scenario)


def test_finished_lesson_is_corrected_silently_and_money_stays(sent):
    async def scenario(ids):
        lesson_id = await _lesson(ids, _now() - timedelta(hours=3), debt_for=("katya",))
        earlier = _now() - timedelta(hours=4)
        read = await _patch(ids, lesson_id, teacher_id=ids["boris"], price=700,
                            start_time=earlier, name="Пилатес")
        assert (read.teacher_id, read.price, read.start_time, read.name) == \
            (ids["boris"], 700, earlier, "Пилатес")
        assert sent == []
        async with async_session_maker() as db:
            debt = (await db.execute(select(ClientPayment).where(
                ClientPayment.client_id == ids["katya"]))).scalar_one()
            feed = (await db.execute(select(ActivityLog.title).where(
                ActivityLog.studio_id == ids["studio"]))).scalars().all()
        # Деньги прошедшего занятия — факт: правка цены их не трогает.
        assert debt.amount == 500
        assert len(feed) == 1 and "(после занятия)" in feed[0]

        with pytest.raises(HTTPException) as failure:
            await _patch(ids, lesson_id, start_time=_now() + timedelta(days=1))
        assert _code(failure) == "lesson_stays_in_past"
    _run(scenario)


def test_trainer_edits_own_lesson_and_not_someone_elses(sent):
    async def scenario(ids):
        own = await _lesson(ids, _now() + timedelta(days=2), teacher="anna")
        foreign = await _lesson(ids, _now() + timedelta(days=2, hours=3), teacher="boris")
        anna = _ctx(ids, "anna", role="trainer")
        read = await _patch(ids, own, ctx=anna, name="Йога у Анны", price=550,
                            start_time=_now() + timedelta(days=2, hours=1))
        assert (read.name, read.price) == ("Йога у Анны", 550)
        with pytest.raises(HTTPException) as failure:
            await _patch(ids, foreign, ctx=anna, price=1)
        assert failure.value.status_code == 403
        async with async_session_maker() as db:
            feed = (await db.execute(select(ActivityLog.actor_name).where(
                ActivityLog.studio_id == ids["studio"]))).scalars().all()
        assert feed == ["Анна"]
    _run(scenario)


def test_explicit_null_does_not_erase_required_fields(sent):
    async def scenario(ids):
        lesson_id = await _lesson(ids, _now() + timedelta(days=2))
        async with async_session_maker() as db:
            read = await L.update_lesson(
                lesson_id, LessonUpdateRequest.model_validate({"name": None, "price": None, "notes": "ок"}),
                ctx=_ctx(ids), db=db, background_tasks=None)
        assert (read.name, read.price, read.notes) == ("Йога", 500, "ок")
    _run(scenario)


def test_trainer_books_and_removes_clients_only_on_own_lesson(sent):
    """Клиенты занятия — тоже его часть: тренер записывает и снимает их на
    своём занятии, как администратор, и не трогает чужие."""
    async def scenario(ids):
        own = await _lesson(ids, _now() + timedelta(days=2), teacher="anna")
        foreign = await _lesson(ids, _now() + timedelta(days=2, hours=3), teacher="boris")
        anna = _ctx(ids, "anna", role="trainer")
        async with async_session_maker() as db:
            booked = await RES.create_reservation(ReservationCreate(client_id=ids["katya"], lesson_id=own),
                                                  ctx=anna, db=db)
        assert booked.status == "active"
        # Себе о своей же записи тренер уведомления не получает.
        assert "t1" not in [event for _, event, _ in sent]
        async with async_session_maker() as db:
            with pytest.raises(HTTPException) as failure:
                await RES.create_reservation(ReservationCreate(client_id=ids["lena"], lesson_id=foreign),
                                             ctx=anna, db=db)
        assert failure.value.status_code == 403
        async with async_session_maker() as db:
            removed = await RES.cancel_reservation(booked.id, ctx=anna, db=db)
        assert removed.status == "cancelled"
    _run(scenario)

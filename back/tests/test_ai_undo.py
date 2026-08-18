"""Кнопка «Вернуть» у карточки действия ассистента.

Главное здесь — правило занятий: занятие, на которое КТО-ТО УЖЕ ЗАПИСАЛСЯ,
откатом не сносится, а все остальные занятия той же пачки возвращаются. Ради
этого кнопка и делалась; «вернуть всё или ничего» было бы либо потерей чужой
записи, либо отказом вернуть двадцать пустых занятий из-за одного занятого.

Своей проверки записей откат не содержит — он зовёт DELETE /schedule/lessons/
{id}, тот же роутер, что кнопка удаления в Журнале. Тест сторожит именно это:
разойдись они, занятие с клиентом исчезло бы молча.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_undo
"""
import asyncio
import warnings
from datetime import datetime, time, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, func, select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    AIChatMessage,
    AIChatSession,
    Client,
    ClientSubscription,
    Lesson,
    Reservation,
    Service,
    Studio,
    StudioBillingPlan,
    StudioMember,
    User,
)
from routers.ai.chat import undo_message
from services.ai_plan import run_plan, summarize_undo, undo_items
from services.ai_tools import TOOLS, UNDO

_OWNER_EMAIL = "ai-undo-owner@test.local"
_TRAINER_EMAIL = "ai-undo-trainer@test.local"
_EMAILS = [_OWNER_EMAIL, _TRAINER_EMAIL]


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-UNDO", timezone="UTC+0", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add(StudioBillingPlan(studio_id=sid, plan_name="pro"))

        owner = User(email=_OWNER_EMAIL, hashed_password="x", name="Ольга")
        trainer = User(email=_TRAINER_EMAIL, hashed_password="x", name="Тимур")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(studio_id=sid, user_id=owner.id, role="owner",
                         status="active", name="Ольга"),
            StudioMember(studio_id=sid, user_id=trainer.id, role="trainer",
                         status="active", name="Тимур"),
        ])
        service = Service(studio_id=sid, name="Хатха", duration_min=60, price=500, max_clients=8)
        client = Client(studio_id=sid, name="Анна", last_name="Петрова", phone="+420777000222")
        session = AIChatSession(studio_id=sid, user_id=owner.id, title="Новый чат")
        db.add_all([service, client, session])
        await db.flush()
        db.add(ClientSubscription(
            client_id=client.id, type="Тест", total_classes=10, used_classes=0,
            expires_at=datetime.utcnow().date() + timedelta(days=30), status="active",
        ))
        await db.commit()
        return {"sid": sid, "owner_id": owner.id, "trainer_id": trainer.id,
                "service_id": service.id, "client_id": client.id, "session_id": session.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        session_ids = (await db.execute(
            select(AIChatSession.id).where(AIChatSession.studio_id == sid)
        )).scalars().all()
        if session_ids:
            await db.execute(delete(AIChatMessage).where(AIChatMessage.session_id.in_(session_ids)))
        await db.execute(delete(AIChatSession).where(AIChatSession.studio_id == sid))
        lesson_ids = (await db.execute(
            select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lesson_ids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lesson_ids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        client_ids = (await db.execute(
            select(Client.id).where(Client.studio_id == sid))).scalars().all()
        if client_ids:
            await db.execute(
                delete(ClientSubscription).where(ClientSubscription.client_id.in_(client_ids)))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Service).where(Service.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(User).where(User.email.in_(_EMAILS)))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _ctx(db, user_id: int, sid: int, role: str) -> StudioContext:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
    return StudioContext(user=user, studio_id=sid, role=role)


async def _lesson_ids(sid: int) -> list[int]:
    async with async_session_maker() as db:
        return list((await db.execute(
            select(Lesson.id).where(Lesson.studio_id == sid).order_by(Lesson.start_time)
        )).scalars().all())


async def _save_message(session_id: int, text: str, undo: list | None) -> int:
    """Сообщение об исполненном действии — то самое, у которого рисуется кнопка."""
    async with async_session_maker() as db:
        message = AIChatMessage(session_id=session_id, role="assistant", text=text,
                                action_jti=f"jti-{datetime.utcnow().timestamp()}", undo=undo)
        db.add(message)
        await db.commit()
        return message.id


async def _run():
    ids = await _seed()
    sid = ids["sid"]
    try:
        start = datetime.combine(datetime.utcnow().date(), time(10, 0)) + timedelta(days=2)
        steps = [
            {"tool": "create_lesson", "args": {"service_id": ids["service_id"],
                                               "teacher_id": ids["trainer_id"],
                                               "start_time": start.isoformat()}},
            {"tool": "create_lesson", "args": {"service_id": ids["service_id"],
                                               "teacher_id": ids["trainer_id"],
                                               "start_time": (start + timedelta(days=1)).isoformat()}},
        ]

        # ── Исполнение пачки запоминает, чем её вернуть ───────────────────────
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            outcome = await run_plan(steps, ctx, db)
        assert len(outcome["created"]) == 2 and not outcome["failed"], outcome
        record = outcome["undo"]
        assert len(record) == 2, record
        assert all(e["tool"] == "create_lesson" and e["item"]["id"] for e in record), record

        lessons = await _lesson_ids(sid)
        assert len(lessons) == 2, lessons

        # ── На ПЕРВОЕ занятие записывается клиент ────────────────────────────
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            booked = await run_plan([{"tool": "book_client", "args": {
                "client_id": ids["client_id"], "lesson_id": lessons[0]}}], ctx, db)
        assert booked["created"], booked
        booking_record = booked["undo"]
        assert len(booking_record) == 1 and booking_record[0]["tool"] == "book_client"

        # ── Откат пачки: занятое остаётся, свободное уходит ──────────────────
        message_id = await _save_message(ids["session_id"], "Готово: 2 из 2.", record)
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            message = await undo_message.__wrapped__(message_id, ctx=ctx, db=db)
            text = message.text

        left = await _lesson_ids(sid)
        assert left == [lessons[0]], (left, lessons)
        # Занятие с клиентом на месте — и человек читает, ПОЧЕМУ оно осталось.
        assert "Вернул: 1 из 2" in text, text
        assert "записаны клиенты" in text, text
        # Кнопка гаснет вместе с записью, а «что было сделано» остаётся в тексте.
        assert "Готово: 2 из 2." in text, text
        async with async_session_maker() as db:
            stored = (await db.execute(
                select(AIChatMessage).where(AIChatMessage.id == message_id))).scalar_one()
            assert stored.undo is None and stored.can_undo is False, stored.undo

        # ── Повторный откат: возвращать больше нечего ────────────────────────
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            try:
                await undo_message.__wrapped__(message_id, ctx=ctx, db=db)
                raise AssertionError("повторный откат обязан отказать")
            except HTTPException as exc:
                assert exc.status_code == 409, exc.status_code

        # ── Чужой диалог не откатывается даже своим же id сообщения ──────────
        second = await _save_message(ids["session_id"], "Готово.", record)
        async with async_session_maker() as db:
            stranger = await _ctx(db, ids["trainer_id"], sid, "trainer")
            try:
                await undo_message.__wrapped__(second, ctx=stranger, db=db)
                raise AssertionError("чужой чат обязан быть 404")
            except HTTPException as exc:
                assert exc.status_code == 404, exc.status_code

        # ── Вернуть снятую запись: клиент записан заново ─────────────────────
        # «Возвращать то, что наделал» — это и про отмену тоже: снял человека с
        # занятия по ошибке, вернул кнопкой.
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            reservation_id = (await db.execute(select(Reservation.id).where(
                Reservation.lesson_id == lessons[0]))).scalars().first()
            cancelled = await run_plan([{"tool": "cancel_booking", "args": {
                "reservation_id": reservation_id}}], ctx, db)
        assert cancelled["created"], cancelled
        assert await _active_bookings(lessons[0]) == 0

        undo_id = await _save_message(ids["session_id"], "Готово.", cancelled["undo"])
        async with async_session_maker() as db:
            ctx = await _ctx(db, ids["owner_id"], sid, "owner")
            await undo_message.__wrapped__(undo_id, ctx=ctx, db=db)
        assert await _active_bookings(lessons[0]) == 1

        # ── Нечего возвращать — кнопки нет вовсе ─────────────────────────────
        # Правки и деньги в UNDO не входят: «Вернуть», которое молча ничего не
        # вернуло, хуже, чем его отсутствие.
        # Каждый обратный ход назван существующим инструментом: переименовали
        # инструмент, а таблицу не поправили — кнопка молча перестала бы
        # работать на всех прошлых карточках сразу.
        assert not (set(UNDO) - set(TOOLS)), set(UNDO) - set(TOOLS)

        assert undo_items("update_client", {"id": 5}) == []
        assert undo_items("pay_booking", {"reservation": {"id": 5}}) == []
        assert undo_items("fill_schedule", {"created": 2, "ids": [7, 8]}) == [{"id": 7}, {"id": 8}]

        # ── Итог одной фразой ────────────────────────────────────────────────
        assert summarize_undo({"reverted": [{}], "kept": []}) == "Вернул."
        assert summarize_undo({"reverted": [{}, {}], "kept": []}) == "Вернул: 2 из 2."
        partial = summarize_undo({
            "reverted": [{}], "kept": [{"description": "Занятие Хатха", "error": "Заняты"}]})
        assert partial == "Вернул: 1 из 2. Оставил: Занятие Хатха — заняты", partial

        print("test_ai_undo: OK")
    finally:
        await _cleanup(sid)


async def _active_bookings(lesson_id: int) -> int:
    async with async_session_maker() as db:
        return (await db.execute(
            select(func.count()).select_from(Reservation).where(
                Reservation.lesson_id == lesson_id, Reservation.status != "cancelled")
        )).scalar() or 0


def test_ai_undo():
    asyncio.run(_run())


if __name__ == "__main__":
    asyncio.run(_run())

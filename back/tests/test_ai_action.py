"""Подтверждение изменяющих действий (эпик AI-5, задача 6).

Ассистент ничего не создаёт сам: он возвращает подписанное предложение, человек
жмёт кнопку. Проверяем ровно границы этой схемы — предложение ничего не меняет,
исполнение меняет один раз, чужой токен не исполняется, тренер не исполняет
действие владельца.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_action
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
    Studio,
    StudioBillingPlan,
    StudioMember,
    User,
)
from routers.ai.chat import execute_action
from schemas.ai import ActionExecuteIn
from services.ai_tools import _sign_action, make_action_proposal, resolve_entities

_OWNER_EMAIL = "ai-action-owner@test.local"
_TRAINER_EMAIL = "ai-action-trainer@test.local"
_CLIENT_EMAIL = "ai-action-client@test.local"


async def _seed() -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-ACTION", timezone="UTC+0", currency="EUR")
        db.add(studio)
        await db.flush()
        sid = studio.id
        db.add(StudioBillingPlan(studio_id=sid, plan_name="pro"))

        owner = User(email=_OWNER_EMAIL, hashed_password="x", name="Ольга")
        trainer = User(email=_TRAINER_EMAIL, hashed_password="x", name="Тимур")
        db.add_all([owner, trainer])
        await db.flush()
        db.add_all([
            StudioMember(studio_id=sid, user_id=owner.id, role="owner", status="active", name="Ольга"),
            StudioMember(studio_id=sid, user_id=trainer.id, role="trainer", status="active", name="Тимур"),
        ])

        lesson = Lesson(
            studio_id=sid, name="Пилатес", teacher_name="Тимур", teacher_id=trainer.id,
            start_time=datetime.combine(datetime.utcnow().date(), time(10, 0)) + timedelta(days=2),
            price=0, level="", equipment="", total_spots=8,
        )
        client = Client(
            studio_id=sid, name="Анна", last_name="Петрова",
            phone="+420777000111", email=_CLIENT_EMAIL, city="Прага",
        )
        session = AIChatSession(studio_id=sid, user_id=owner.id, title="Новый чат")
        db.add_all([lesson, client, session])
        await db.flush()
        # Абонемент нужен по-настоящему: запись через ИИ идёт тем же путём, что
        # запись из Журнала, и без абонемента роутер отказывает — ровно это и
        # должно происходить (свой INSERT отказ обошёл бы молча).
        db.add(ClientSubscription(
            client_id=client.id, type="Тест", total_classes=10, used_classes=0,
            expires_at=datetime.utcnow().date() + timedelta(days=30), status="active",
        ))
        await db.commit()
        return {
            "sid": sid, "owner_id": owner.id, "trainer_id": trainer.id,
            "lesson_id": lesson.id, "client_id": client.id, "session_id": session.id,
        }


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        session_ids = (await db.execute(
            select(AIChatSession.id).where(AIChatSession.studio_id == sid)
        )).scalars().all()
        if session_ids:
            await db.execute(delete(AIChatMessage).where(AIChatMessage.session_id.in_(session_ids)))
        await db.execute(delete(AIChatSession).where(AIChatSession.studio_id == sid))
        lesson_ids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lesson_ids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lesson_ids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        client_ids = (await db.execute(select(Client.id).where(Client.studio_id == sid))).scalars().all()
        if client_ids:
            await db.execute(delete(ClientSubscription).where(ClientSubscription.client_id.in_(client_ids)))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(User).where(User.email.in_([_OWNER_EMAIL, _TRAINER_EMAIL])))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _reservations(lesson_id: int) -> int:
    async with async_session_maker() as db:
        return (await db.execute(
            select(func.count()).select_from(Reservation).where(Reservation.lesson_id == lesson_id)
        )).scalar() or 0


async def _run():
    ids = await _seed()
    try:
        async with async_session_maker() as db:
            owner = (await db.execute(select(User).where(User.id == ids["owner_id"]))).scalar_one()
            trainer = (await db.execute(select(User).where(User.id == ids["trainer_id"]))).scalar_one()
            as_owner = StudioContext(user=owner, studio_id=ids["sid"], role="owner")
            as_trainer = StudioContext(user=trainer, studio_id=ids["sid"], role="trainer")

            args = {"lesson_id": ids["lesson_id"], "client_id": ids["client_id"]}
            proposal = await make_action_proposal(
                "book_client", args, as_owner, db, ids["session_id"])
            assert proposal["token"] and proposal["description"]

            # ── Сущности человеческими словами (эпик AI-6, задача 14) ─────────
            # Человек подтверждает, глядя на карточку. Пока в ней «client_id: 44»,
            # он подтверждает не глядя — а списывается чужой абонемент.
            assert proposal["entities"]["client_id"] == "Анна Петрова", proposal["entities"]
            lesson_label = proposal["entities"]["lesson_id"]
            assert "Пилатес" in lesson_label and "свободно" in lesson_label, lesson_label
            assert "client_id" not in proposal["description"]
            # Последствие приезжает вместе с предложением — из карты интерфейса.
            assert "абонемента" in proposal["effect"], proposal["effect"]

            # Тренер в карточке — тоже именем. Роутер сотрудников отдаёт
            # {summary, staff: {items}}, и разрешение, перебиравшее ответ без
            # распаковки, падало на строках-ключах: в карточке оставался
            # «teacher_id: 340».
            named, err = await resolve_entities({"teacher_id": ids["trainer_id"]}, as_owner, db)
            assert named.get("teacher_id") == "Тимур", (named, err)

            # Зала с таким номером в студии нет (модель взяла номер филиала) —
            # текст вместо карточки. Раньше это была молчаливо пропущенная
            # строка: человек подтверждал карточку с голым номером и получал
            # «Зал не найден в студии» уже ПОСЛЕ клика.
            wrong_hall = await make_action_proposal(
                "create_lesson", {"teacher_id": ids["trainer_id"], "hall_id": 999_999_999},
                as_owner, db, ids["session_id"])
            assert wrong_hall.get("error") and "token" not in wrong_hall, wrong_hall

            # Выдуманный моделью id — текст вместо карточки: подтверждать нечего.
            ghost = await make_action_proposal(
                "book_client", {"lesson_id": 999_999_999, "client_id": ids["client_id"]},
                as_owner, db, ids["session_id"])
            assert ghost.get("error") and "token" not in ghost, ghost

            # Две Анны -> вопрос со списком, карточки нет вовсе. Решает сервер:
            # модель не переспрашивает ровно тогда, когда уверена.
            two_anns = {"field": "client_id", "options": [
                {"id": ids["client_id"], "label": "Анна Петрова, +420777000111"},
                {"id": ids["client_id"] + 1, "label": "Анна Сидорова, +420777000222"},
            ]}
            asked = await make_action_proposal(
                "book_client", args, as_owner, db, ids["session_id"], ambiguous=two_anns)
            assert asked["clarify"]["options"] == two_anns["options"], asked
            assert "token" not in asked, asked

            # Предложение само по себе ничего не создаёт.
            assert await _reservations(ids["lesson_id"]) == 0

            # Тренеру действие владельца недоступно — 403, а не «битый токен».
            # Токен подписываем напрямую: собрать предложение тренер и не смог бы
            # — book_client ему не выдаётся, а чужого клиента он не прочитает.
            trainer_token = _sign_action("book_client", args, as_trainer, ids["session_id"])
            try:
                await execute_action.__wrapped__(
                    None, ActionExecuteIn(token=trainer_token), ctx=as_trainer, db=db,
                )
                raise AssertionError("тренер исполнил действие владельца")
            except HTTPException as exc:
                assert exc.status_code == 403, exc.status_code

            # Токен владельца, предъявленный тренером, — чужой: 400.
            try:
                await execute_action.__wrapped__(
                    None, ActionExecuteIn(token=proposal["token"]), ctx=as_trainer, db=db,
                )
                raise AssertionError("чужой токен исполнился")
            except HTTPException as exc:
                assert exc.status_code == 400 and exc.detail == "action_token_invalid"

            assert await _reservations(ids["lesson_id"]) == 0

        # Исполнение — своей сессией: проксируемый роутер коммитит внутри себя.
        async with async_session_maker() as db:
            owner = (await db.execute(select(User).where(User.id == ids["owner_id"]))).scalar_one()
            as_owner = StudioContext(user=owner, studio_id=ids["sid"], role="owner")
            out = await execute_action.__wrapped__(
                None, ActionExecuteIn(token=proposal["token"]), ctx=as_owner, db=db,
            )
            assert out.message.role == "assistant" and out.message.text.startswith("Готово")
            assert out.result

        assert await _reservations(ids["lesson_id"]) == 1

        # Запись через ИИ обязана дать ТОТ ЖЕ результат, что запись из Журнала:
        # занятие списано с абонемента (charge_reservation), а статус посчитан
        # правилами студии. Это тест на самую дорогую ошибку эпика — свой INSERT
        # вместо проксирования роутера: данные выглядели бы правильными ровно до
        # конца месяца, а списания и уведомления молча не происходили бы.
        async with async_session_maker() as db:
            sub = (await db.execute(
                select(ClientSubscription).where(ClientSubscription.client_id == ids["client_id"])
            )).scalar_one()
            assert sub.used_classes == 1, sub.used_classes
            reservation = (await db.execute(
                select(Reservation).where(Reservation.lesson_id == ids["lesson_id"])
            )).scalar_one()
            # "active" — статус записи из Журнала (reservations.py:78). Приходит
            # он из роутера, а не из инструмента: правило подтверждения тренером
            # действует только на записи клиента из мини-приложения.
            assert reservation.status == "active", reservation.status
            assert reservation.client_id == ids["client_id"]

        # Повторный клик тем же токеном — 409 и никакой второй записи.
        async with async_session_maker() as db:
            owner = (await db.execute(select(User).where(User.id == ids["owner_id"]))).scalar_one()
            as_owner = StudioContext(user=owner, studio_id=ids["sid"], role="owner")
            try:
                await execute_action.__wrapped__(
                    None, ActionExecuteIn(token=proposal["token"]), ctx=as_owner, db=db,
                )
                raise AssertionError("токен исполнился дважды")
            except HTTPException as exc:
                assert exc.status_code == 409, exc.status_code

        assert await _reservations(ids["lesson_id"]) == 1

        # В ленте только роли user/assistant — служебных сообщений эпик не заводит.
        async with async_session_maker() as db:
            roles = (await db.execute(
                select(AIChatMessage.role).where(AIChatMessage.session_id == ids["session_id"])
            )).scalars().all()
            assert set(roles) <= {"user", "assistant"}, roles
    finally:
        await _cleanup(ids["sid"])


def test_ai_action_confirmation():
    asyncio.run(_run())


if __name__ == "__main__":
    test_ai_action_confirmation()
    print("ALL PASS")

"""EPIC AI-1 задача 2: /ai/sessions, /ai/sessions/{id}/messages.
Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_ai_chat
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import AIChatMessage, AIChatSession, StudioAISettings, Studio, User
from routers.ai.chat import (
    create_session,
    delete_session,
    list_messages,
    list_sessions,
    send_message,
)
from schemas.ai import ChatMessageCreate, ChatSessionCreate


async def _seed() -> tuple[int, int, int]:
    async with async_session_maker() as db:
        s = Studio(name="TEST-AI-CHAT")
        db.add(s)
        await db.flush()
        sid = s.id

        u1 = User(email="ai-owner@test.local", hashed_password="x", name="Owner")
        u2 = User(email="ai-other@test.local", hashed_password="x", name="Other")
        db.add_all([u1, u2])
        await db.flush()
        uid1, uid2 = u1.id, u2.id

        await db.commit()
        return sid, uid1, uid2


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        session_ids = (await db.execute(
            select(AIChatSession.id).where(AIChatSession.studio_id == sid)
        )).scalars().all()
        if session_ids:
            await db.execute(delete(AIChatMessage).where(AIChatMessage.session_id.in_(session_ids)))
        await db.execute(delete(AIChatSession).where(AIChatSession.studio_id == sid))
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
        await db.execute(delete(User).where(User.email.in_(["ai-owner@test.local", "ai-other@test.local"])))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid, uid1, uid2 = await _seed()
    try:
        async with async_session_maker() as db:
            user1 = (await db.execute(select(User).where(User.id == uid1))).scalar_one()
            ctx1 = StudioContext(user=user1, studio_id=sid, role="owner")

            created = await create_session(ChatSessionCreate(title=None), ctx=ctx1, db=db)
            assert created.message_count == 0
            assert created.title == "Новый чат"
            session_id = created.id

        # два сообщения подряд, каждое — своя транзакция роутера
        async with async_session_maker() as db:
            user1 = (await db.execute(select(User).where(User.id == uid1))).scalar_one()
            ctx1 = StudioContext(user=user1, studio_id=sid, role="owner")
            r1 = await send_message(session_id, ChatMessageCreate(text="Привет!"), ctx=ctx1, db=db)
            assert r1.user.role == "user" and r1.user.text == "Привет!"
            assert r1.assistant.role == "assistant" and r1.assistant.text

        async with async_session_maker() as db:
            user1 = (await db.execute(select(User).where(User.id == uid1))).scalar_one()
            ctx1 = StudioContext(user=user1, studio_id=sid, role="owner")
            r2 = await send_message(session_id, ChatMessageCreate(text="Как дела?"), ctx=ctx1, db=db)
            assert r2.assistant.text

        async with async_session_maker() as db:
            user1 = (await db.execute(select(User).where(User.id == uid1))).scalar_one()
            ctx1 = StudioContext(user=user1, studio_id=sid, role="owner")

            msgs = await list_messages(session_id, ctx=ctx1, db=db)
            assert len(msgs) == 4, msgs
            assert [m.role for m in msgs] == ["user", "assistant", "user", "assistant"]
            assert msgs[0].created_at <= msgs[1].created_at <= msgs[2].created_at <= msgs[3].created_at

            sessions = await list_sessions(ctx=ctx1, db=db)
            assert len(sessions) == 1
            assert sessions[0].message_count == 4
            assert sessions[0].preview == r2.assistant.text[:500]
            # первое сообщение переписало плейсхолдерный заголовок
            assert sessions[0].title == "Привет!"

            # пустой текст после .strip() -> 422, а не 500
            try:
                await send_message(session_id, ChatMessageCreate(text="   "), ctx=ctx1, db=db)
                assert False, "expected 422 for whitespace-only text"
            except HTTPException as e:
                assert e.status_code == 422

            await delete_session(session_id, ctx=ctx1, db=db)

        async with async_session_maker() as db:
            user1 = (await db.execute(select(User).where(User.id == uid1))).scalar_one()
            ctx1 = StudioContext(user=user1, studio_id=sid, role="owner")
            try:
                await list_messages(session_id, ctx=ctx1, db=db)
                assert False, "expected 404 after delete"
            except HTTPException as e:
                assert e.status_code == 404

            # второй пользователь той же студии не видит чужие сессии
            user2 = (await db.execute(select(User).where(User.id == uid2))).scalar_one()
            ctx2 = StudioContext(user=user2, studio_id=sid, role="owner")
            assert await list_sessions(ctx=ctx2, db=db) == []
    finally:
        await _cleanup(sid)


def test_ai_chat_cycle():
    asyncio.run(_run())


if __name__ == "__main__":
    test_ai_chat_cycle()
    print("ALL PASS")

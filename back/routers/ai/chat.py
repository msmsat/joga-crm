from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import StudioContext, get_studio_context
from models import AIChatMessage, AIChatSession, Studio
from schemas.ai import (
    ChatMessageCreate,
    ChatMessageRead,
    ChatSessionCreate,
    ChatSessionRead,
    SendMessageResponse,
)
from services.assistant import generate_reply, get_or_create_ai_settings

router = APIRouter()

_HISTORY_LIMIT = 20
_DEFAULT_TITLE = "Новый чат"


async def _get_session_or_404(session_id: int, ctx: StudioContext, db: AsyncSession) -> AIChatSession:
    """Сессия своей студии и своего пользователя — чужая или отсутствующая одинаково 404."""
    session = (await db.execute(
        select(AIChatSession).where(
            AIChatSession.id == session_id,
            AIChatSession.studio_id == ctx.studio_id,
            AIChatSession.user_id == ctx.user.id,
        )
    )).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Чат не найден")
    return session


@router.get("/sessions", response_model=list[ChatSessionRead])
async def list_sessions(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(AIChatSession, func.count(AIChatMessage.id))
        .outerjoin(AIChatMessage, AIChatMessage.session_id == AIChatSession.id)
        .where(
            AIChatSession.studio_id == ctx.studio_id,
            AIChatSession.user_id == ctx.user.id,
        )
        .group_by(AIChatSession.id)
        .order_by(AIChatSession.updated_at.desc())
    )).all()
    return [
        ChatSessionRead(
            id=session.id,
            title=session.title,
            preview=session.preview,
            message_count=count,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )
        for session, count in rows
    ]


@router.post("/sessions", status_code=201, response_model=ChatSessionRead)
async def create_session(
    body: ChatSessionCreate,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    title = (body.title or "").strip() or _DEFAULT_TITLE
    session = AIChatSession(studio_id=ctx.studio_id, user_id=ctx.user.id, title=title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return ChatSessionRead(
        id=session.id,
        title=session.title,
        preview=session.preview,
        message_count=0,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_session_or_404(session_id, ctx, db)
    await db.delete(session)
    await db.commit()


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageRead])
async def list_messages(
    session_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    await _get_session_or_404(session_id, ctx, db)
    messages = (await db.execute(
        select(AIChatMessage)
        .where(AIChatMessage.session_id == session_id)
        .order_by(AIChatMessage.created_at.asc())
    )).scalars().all()
    return messages


@router.post("/sessions/{session_id}/messages", response_model=SendMessageResponse)
async def send_message(
    session_id: int,
    body: ChatMessageCreate,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_session_or_404(session_id, ctx, db)

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Сообщение не может быть пустым")

    # Одна транзакция на пару сообщений: user-сообщение только flush (не commit),
    # чтобы при падении generate_reply откатилось целиком — без вопроса-сироты.
    user_message = AIChatMessage(session_id=session.id, role="user", text=text)
    db.add(user_message)
    await db.flush()

    history = list(reversed((await db.execute(
        select(AIChatMessage)
        .where(AIChatMessage.session_id == session.id)
        .order_by(AIChatMessage.created_at.desc())
        .limit(_HISTORY_LIMIT)
    )).scalars().all()))

    settings = await get_or_create_ai_settings(ctx.studio_id, db)
    studio = (await db.execute(
        select(Studio).where(Studio.id == ctx.studio_id)
    )).scalar_one()

    reply = await generate_reply(
        settings=settings,
        studio_name=studio.name,
        studio_language=studio.language,
        history=history,
    )

    assistant_message = AIChatMessage(session_id=session.id, role="assistant", text=reply)
    db.add(assistant_message)

    session.preview = reply[:500]
    if session.title == _DEFAULT_TITLE:
        session.title = text[:40]

    await db.commit()
    await db.refresh(user_message)
    await db.refresh(assistant_message)

    return SendMessageResponse(user=user_message, assistant=assistant_message)

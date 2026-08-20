import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_maker, get_db
from dependencies import StudioContext, get_studio_context
from models import AIChatMessage, AIChatSession, Studio, User
from ratelimit import limiter
from schemas.ai import (
    ActionExecuteIn,
    ActionExecuteOut,
    ChatMessageCreate,
    ChatMessageRead,
    ChatSessionCreate,
    ChatSessionRead,
    MessageRatingIn,
    PlanExecuteIn,
    SendMessageResponse,
)
from services.ai_quota import TRIAL_LIMIT, ai_quota_status, check_ai_quota
from services.ai_plan import (
    decode_plan_token, merge_answers, run_plan, run_undo, summarize, summarize_undo,
)
from services.ai_tools import call_tool, decode_action_token, describe_action, resolve_entities
from services.assistant import agent_events, get_or_create_ai_settings, run_agent

logger = logging.getLogger(__name__)

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
        # id вторым ключом обязателен: вопрос и ответ пишутся одной транзакцией,
        # и func.now() у них СОВПАДАЕТ — сортировка по одному created_at
        # выдавала пару в случайном порядке, то есть ответ перед вопросом.
        .order_by(AIChatMessage.created_at.asc(), AIChatMessage.id.asc())
    )).scalars().all()
    return messages


@router.patch("/messages/{message_id}/rating", response_model=ChatMessageRead)
async def rate_message(
    message_id: int,
    body: MessageRatingIn,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Оценка ответа ассистента (эпик AI-6, задача 18).

    Оценивает только автор сессии и только ответ ассистента: свой собственный
    вопрос оценивать бессмысленно, а чужой диалог человеку и так не виден.
    Строк в ленте не добавляется — оценка живёт колонкой существующего
    сообщения, и проверка последовательности ролей продолжает проходить.

    rating=null — снятие оценки: повторный клик по той же кнопке.
    """
    message = (await db.execute(
        select(AIChatMessage)
        .join(AIChatSession, AIChatSession.id == AIChatMessage.session_id)
        .where(
            AIChatMessage.id == message_id,
            AIChatSession.studio_id == ctx.studio_id,
            AIChatSession.user_id == ctx.user.id,
        )
    )).scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if message.role != "assistant":
        raise HTTPException(status_code=400, detail="Оценить можно только ответ ассистента")

    message.rating = body.rating
    await db.commit()
    await db.refresh(message)
    return message


@router.post("/messages/{message_id}/undo", response_model=ChatMessageRead)
@limiter.limit("10/minute")
async def undo_message(
    message_id: int,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Вернуть то, что наделало действие ассистента, — кнопкой «Вернуть» в чате.

    Откат делает СЕРВЕР напрямую: зовёт те же роутеры, что кнопки удаления в
    интерфейсе. Модель в этом не участвует вовсе — ни нового плана, ни второго
    подтверждения. Просить ассистента «отмени, что ты сделал» значило бы
    надеяться, что он вспомнит id-шники из истории чата; здесь они записаны.

    Возвращается ровно то, что откатывается честно (таблица UNDO в ai_tools).
    Занятие, на которое успели записаться, роутер не отдаёт (409) — оно
    остаётся, остальные шаги пачки возвращаются, и в тексте карточки написано,
    что именно осталось и почему.
    """
    message = (await db.execute(
        select(AIChatMessage)
        .join(AIChatSession, AIChatSession.id == AIChatMessage.session_id)
        .where(
            AIChatMessage.id == message_id,
            AIChatSession.studio_id == ctx.studio_id,
            AIChatSession.user_id == ctx.user.id,
        )
    )).scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if not message.undo:
        # Уже вернули, или возвращать в этом действии было нечего. 409, а не
        # 404: сообщение на месте, невозможен именно откат.
        raise HTTPException(status_code=409, detail="Это действие уже возвращено")

    outcome = await run_undo(message.undo, ctx, db)
    if not outcome["reverted"]:
        # Не вернулось НИЧЕГО — это отказ, а не «частично». Гасить кнопку здесь
        # нельзя: причина бывает временной (занятие вот-вот освободится).
        raise HTTPException(status_code=400, detail={
            "code": "undo_failed",
            "message": outcome["kept"][0]["error"] if outcome["kept"] else "Не удалось вернуть",
        })

    # Что вернулось — дописываем к тексту действия, а не заменяем его: карточка
    # обязана продолжать показывать, ЧТО было сделано, иначе история врёт.
    message.text = f"{message.text}\n\n{summarize_undo(outcome)}"
    message.undo = None                      # кнопка гаснет вместе с записью
    # preview сессии не трогаем: он показывает ПОСЛЕДНЕЕ сообщение диалога, а
    # возвращают часто не его — в списке чатов появилась бы фраза из середины.
    await db.commit()
    await db.refresh(message)
    logger.info("ai undo: message=%s reverted=%s kept=%s studio=%s",
                message_id, len(outcome["reverted"]), len(outcome["kept"]), ctx.studio_id)
    return message


@router.post("/sessions/{session_id}/messages", response_model=SendMessageResponse)
@limiter.limit("20/minute")
async def send_message(
    session_id: int,
    body: ChatMessageCreate,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
    # Параметр требует slowapi (он ищет его по имени). ПОСЛЕДНИМ и с дефолтом:
    # первым он сдвинул бы позиционные аргументы прямых вызовов из тестов
    # (test_ai_chat.py зовёт send_message(session_id, body, ...) как функцию),
    # а FastAPI подставляет Request по типу, не по позиции. Сами тесты идут
    # мимо декоратора через send_message.__wrapped__ — приём уже есть в
    # test_consent.py:77.
    request: Request = None,
):
    session = await _get_session_or_404(session_id, ctx, db)

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Сообщение не может быть пустым")

    # Квота — ДО обращения к модели: исчерпанный запас не должен стоить платформе
    # ни одного вызова провайдера.
    await check_ai_quota(db, ctx.studio_id)

    # Одна транзакция на пару сообщений: user-сообщение только flush (не commit),
    # чтобы при падении generate_reply откатилось целиком — без вопроса-сироты.
    user_message = AIChatMessage(session_id=session.id, role="user", text=text)
    db.add(user_message)
    await db.flush()

    history = list(reversed((await db.execute(
        select(AIChatMessage)
        .where(AIChatMessage.session_id == session.id)
        .order_by(AIChatMessage.created_at.desc(), AIChatMessage.id.desc())
        .limit(_HISTORY_LIMIT)
    )).scalars().all()))

    settings = await get_or_create_ai_settings(ctx.studio_id, db)
    studio = (await db.execute(
        select(Studio).where(Studio.id == ctx.studio_id)
    )).scalar_one()

    result = await run_agent(
        ctx, db, settings, history,
        session_id=session.id,
        studio_language=studio.language,
        current_page=body.current_page,
        viewport=body.viewport,
    )

    assistant_message = AIChatMessage(session_id=session.id, role="assistant", text=result.text)
    db.add(assistant_message)

    session.preview = result.text[:500]
    if session.title == _DEFAULT_TITLE:
        session.title = text[:40]

    await db.commit()
    await db.refresh(user_message)
    await db.refresh(assistant_message)

    return SendMessageResponse(
        user=user_message,
        assistant=assistant_message,
        plan_proposal=result.plan_proposal,
    )


def _sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


async def _agent_stream(
    session_id: int, text: str, current_page: str | None, user_id: int,
    studio_id: int, role: str, viewport: str | None = None,
):
    """Тело SSE-потока.

    Своя сессия БД обязательна: тело StreamingResponse выполняется ПОСЛЕ того,
    как обработчик вернул управление, а Depends(get_db) к этому моменту сессию
    уже закрыл. Все существующие StreamingResponse в проекте отдают готовые
    байты именно поэтому — у SSE так не выйдет, инструменты зовутся по ходу.
    # ponytail: соединение занято на всё время стрима (5-15 с) — при росте
    # одновременных чатов поднимать pool_size или отпускать сессию между
    # вызовами модели.
    """
    async with async_session_maker() as db:
        # Пользователя перегружаем своей сессией: объект из закрытой сессии
        # запроса в генераторе уже мёртв.
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
        ctx = StudioContext(user=user, studio_id=studio_id, role=role)
        session = await _get_session_or_404(session_id, ctx, db)

        user_message = AIChatMessage(session_id=session.id, role="user", text=text)
        db.add(user_message)
        await db.flush()

        history = list(reversed((await db.execute(
            select(AIChatMessage)
            .where(AIChatMessage.session_id == session.id)
            .order_by(AIChatMessage.created_at.desc(), AIChatMessage.id.desc())
            .limit(_HISTORY_LIMIT)
        )).scalars().all()))

        settings = await get_or_create_ai_settings(ctx.studio_id, db)
        studio = (await db.execute(select(Studio).where(Studio.id == ctx.studio_id))).scalar_one()

        result = None
        try:
            async for kind, data in agent_events(
                ctx, db, settings, history,
                session_id=session.id, studio_language=studio.language,
                current_page=current_page, viewport=viewport, stream=True,
            ):
                if kind == "result":
                    result = data
                else:
                    yield _sse(kind, data)
        except HTTPException as exc:
            # Провайдер настроен, но не отвечает — фронт уже знает этот код.
            yield _sse("error", {"code": exc.detail if isinstance(exc.detail, str) else "assistant_unavailable"})
            return
        except asyncio.CancelledError:
            # Вкладку закрыли на середине. Строки за уже завершённые итерации
            # записаны своей сессией и коммитом (services/ai_usage) — теряется
            # максимум незавершённый вызов, чей usage провайдер ещё не прислал.
            logger.warning("ai stream cancelled: studio=%s session=%s", studio_id, session_id)
            raise

        # Сообщения пишем ПО ЗАВЕРШЕНИИ потока целиком: частичный ответ в
        # истории хуже отсутствующего.
        assistant_message = AIChatMessage(session_id=session.id, role="assistant", text=result.text)
        db.add(assistant_message)
        session.preview = result.text[:500]
        if session.title == _DEFAULT_TITLE:
            session.title = text[:40]
        await db.commit()
        await db.refresh(user_message)
        await db.refresh(assistant_message)

        if result.plan_proposal:
            yield _sse("plan_proposal", result.plan_proposal)
        used, limit = await ai_quota_status(db, ctx.studio_id)
        yield _sse("quota", {"used": used, "limit": limit, "trial": bool(TRIAL_LIMIT)})
        yield _sse("done", {"user_id": user_message.id, "assistant_id": assistant_message.id})


@router.post("/sessions/{session_id}/stream")
@limiter.limit("20/minute")
async def stream_message(
    request: Request,
    session_id: int,
    body: ChatMessageCreate,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Ответ ассистента по мере генерации (эпик AI-5, задача 8).

    POST /messages остаётся как есть — на нём держатся фолбэк фронта и тесты.
    """
    await _get_session_or_404(session_id, ctx, db)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Сообщение не может быть пустым")
    # Квота и доступ — до старта потока: внутри генератора HTTP-статус уже не
    # поменять, там остаётся только событие error.
    await check_ai_quota(db, ctx.studio_id)

    return StreamingResponse(
        _agent_stream(
            session_id, text, body.current_page, ctx.user.id, ctx.studio_id, ctx.role,
            viewport=body.viewport,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Без этого nginx буферизует поток, и стрима не будет вовсе.
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/actions/execute", response_model=ActionExecuteOut)
@limiter.limit("10/minute")
async def execute_action(
    request: Request,
    body: ActionExecuteIn,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Исполнить предложенное ассистентом изменяющее действие (эпик AI-5, задача 6).

    Отдельный запрос — не только вопрос безопасности: проксируемые функции
    роутеров делают db.commit() внутри себя, и вызывать их из середины агентного
    цикла (где висит незакоммиченное пользовательское сообщение) значит
    коммитить чужую транзакцию наполовину.
    """
    payload = decode_action_token(body.token, ctx)
    args = payload.get("args") or {}
    session = await _get_session_or_404(payload["session_id"], ctx, db)

    # Однократность проверяем ДО исполнения: иначе повторный клик успел бы
    # завести вторую запись клиента, а 409 пришёл бы уже после этого.
    if (await db.execute(
        select(AIChatMessage.id).where(AIChatMessage.action_jti == payload["jti"])
    )).scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="action_already_executed")

    # Имена сущностей разрешаем ДО исполнения: после delete_client разрешать
    # уже нечего, а сообщение остаётся в ленте навсегда — и «client_id: 44» в
    # нём читается не лучше, чем в карточке подтверждения (эпик AI-6, задача 14).
    entities, _ = await resolve_entities(args, ctx, db)

    result = await call_tool(payload["tool"], args, ctx, db)
    if "error" in result:
        # Занятие переполнено, клиент удалён — это ответ человеку, а не 500:
        # пользователь должен понять, почему не получилось.
        # warning, а не info: причина отказа по кнопке «Подтвердить» — то
        # единственное, что видно в логе при разборе жалобы «пишет 400».
        logger.warning(
            "ai action failed: tool=%s studio=%s: %s",
            payload["tool"], ctx.studio_id, result["error"],
        )
        raise HTTPException(status_code=400, detail={
            "code": "action_failed",
            "message": result["error"],
        })

    message = AIChatMessage(
        session_id=session.id,
        role="assistant",
        text=f"Готово: {describe_action(payload['tool'], args, entities)}",
        action_jti=payload["jti"],
    )
    db.add(message)
    session.preview = message.text[:500]
    try:
        await db.commit()
    except IntegrityError:
        # Уникальный индекс на action_jti закрывает гонку двойного клика: два
        # запроса, прошедшие проверку выше одновременно, разойдутся здесь.
        await db.rollback()
        raise HTTPException(status_code=409, detail="action_already_executed")

    await db.refresh(message)
    logger.info("ai action executed: tool=%s studio=%s", payload["tool"], ctx.studio_id)
    return ActionExecuteOut(result=result, message=message)


@router.post("/actions/execute-plan", response_model=ActionExecuteOut)
@limiter.limit("10/minute")
async def execute_plan(
    request: Request,
    body: PlanExecuteIn,
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Исполнить пачку действий, собранную ассистентом (часть A).

    Отдельный запрос — по той же причине, что и у одиночного действия:
    проксируемые функции роутеров делают db.commit() внутри себя, и звать их из
    середины агентного цикла значит коммитить чужую транзакцию наполовину.

    Отказ шага не останавливает остальные — решение заказчика и единственное
    честное: откатить уже разосланные уведомления всё равно нечем.
    """
    payload = decode_plan_token(body.token, ctx)
    session = await _get_session_or_404(payload["session_id"], ctx, db)

    # Однократность — ДО исполнения, как и у одиночного действия: повторный
    # клик по «Создать» успел бы завести вторую пачку записей.
    if (await db.execute(
        select(AIChatMessage.id).where(AIChatMessage.action_jti == payload["jti"])
    )).scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="action_already_executed")

    steps = merge_answers(payload["steps"], body.answers)
    outcome = await run_plan(steps, ctx, db)
    if not outcome["created"]:
        # Не создалось НИЧЕГО — это отказ, а не «частичный успех»: сообщение в
        # ленте про «0 из 5» человек прочитает как выполненное действие.
        raise HTTPException(status_code=400, detail={
            "code": "action_failed",
            "message": (outcome["failed"][0]["error"] if outcome["failed"]
                        else "Не удалось выполнить ни один шаг"),
        })

    message = AIChatMessage(
        session_id=session.id, role="assistant",
        text=summarize(outcome), action_jti=payload["jti"],
        # Пусто — у карточки не будет кнопки «Вернуть»: в пачке не оказалось
        # ничего, что откатывается честно (правки, оплаты, удаления).
        undo=outcome["undo"] or None,
    )
    db.add(message)
    session.preview = message.text[:500]
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="action_already_executed")

    await db.refresh(message)
    logger.info("ai plan executed: steps=%s failed=%s studio=%s",
                len(outcome["created"]), len(outcome["failed"]), ctx.studio_id)
    return ActionExecuteOut(result=outcome, message=message)

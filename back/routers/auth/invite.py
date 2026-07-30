"""Приём приглашения сотрудником: страница /join на фронте.

Обе ручки публичные — человек по определению ещё не вошёл. Права даёт не
заголовок, а сам токен из письма (services/invites.py) вместе с паролем.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import Studio, StudioMember, User
from ratelimit import limiter
from schemas import InviteAcceptRequest, InviteInfoResponse, TokenResponse
from schemas.auth import validate_strong_password
from security import get_password_hash, verify_password
from services.invites import decode_invite
from .login import _finish_login

router = APIRouter()

_INVALID = "Ссылка-приглашение недействительна или истекла"


async def _resolve_invite(token: str, db: AsyncSession) -> tuple[User, Studio, StudioMember]:
    """Кого, куда и кем позвали. Единственная точка проверки ссылки.

    Членство обязано существовать — оно и есть «приглашение ещё в силе»: убрал
    владелец сотрудника из студии, и старая ссылка из письма перестаёт работать,
    хотя JWT формально ещё не протух.
    """
    try:
        email, studio_id = decode_invite(token)
    except ValueError:
        raise HTTPException(status_code=400, detail=_INVALID)

    row = (await db.execute(
        select(User, Studio, StudioMember)
        .join(StudioMember, StudioMember.user_id == User.id)
        .join(Studio, Studio.id == StudioMember.studio_id)
        .where(User.email == email, StudioMember.studio_id == studio_id)
    )).first()
    if row is None:
        raise HTTPException(status_code=400, detail=_INVALID)
    return row[0], row[1], row[2]


@router.get("/invite", response_model=InviteInfoResponse)
async def get_invite(token: str, db: AsyncSession = Depends(get_db)):
    user, studio, membership = await _resolve_invite(token, db)
    return InviteInfoResponse(
        email=user.email,
        name=user.name,
        studio_name=studio.name,
        studio_logo_url=studio.logo_url,
        role=membership.role,
        needs_password=not user.is_verified,
    )


@router.post("/invite/accept", response_model=TokenResponse)
@limiter.limit("10/minute")
async def accept_invite(
    request: Request,
    data: InviteAcceptRequest,
    db: AsyncSession = Depends(get_db),
):
    """Две ветки, и обе заканчиваются токеном именно ЭТОЙ студии с выданной ролью.

    Аккаунта не было (`is_verified=False` — его завёл владелец при добавлении
    сотрудника) → человек придумывает пароль, и почта считается подтверждённой:
    по ссылке из письма прошёл владелец адреса.

    Аккаунт уже есть → он вводит СВОЙ существующий пароль. Пускать по одной
    только ссылке здесь нельзя: пересланное письмо открывало бы чужой аккаунт со
    всеми его студиями. Проверка пароля — та же, что на /login, поэтому 2FA
    (через `_finish_login`) тоже соблюдается.
    """
    user, _studio, membership = await _resolve_invite(data.token, db)

    if not user.is_verified:
        try:
            validate_strong_password(data.password)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        user.hashed_password = get_password_hash(data.password)
        user.is_verified = True
        await db.commit()
    elif not verify_password(data.password, user.hashed_password):
        # 400, а не 401: 401 на фронте — глобальный сигнал «сессия истекла»,
        # клиент по нему стирает токен и уходит на /login (api/client.ts), и
        # опечатка в пароле выбрасывала бы человека со страницы приглашения.
        raise HTTPException(status_code=400, detail="Неверный пароль")

    return await _finish_login(user, request, db, studio_id=membership.studio_id)

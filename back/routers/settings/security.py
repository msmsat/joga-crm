from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import get_current_user, oauth2_scheme, require_otp
from models import User, UserSession
from schemas.settings.security import SessionRead, TwoFaStatus, TwoFaUpdate
from services.sessions import hash_token, revoke_sessions

router = APIRouter()


@router.get("/security/sessions", response_model=list[SessionRead])
async def list_sessions(
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_hash = hash_token(token)
    sessions = (await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_active.desc())
    )).scalars().all()
    return [
        SessionRead(
            id=s.id, device=s.device, platform=s.platform, browser=s.browser,
            ip_address=s.ip_address, location_city=s.location_city, location_country=s.location_country,
            last_active=s.last_active, is_current=(s.token_hash == current_hash),
        )
        for s in sessions
    ]


@router.delete("/security/sessions/{session_id}", status_code=204)
async def terminate_session(
    session_id: int,
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = (await db.execute(
        select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id)
    )).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if session.token_hash == hash_token(token):
        raise HTTPException(status_code=409, detail="Нельзя завершить текущую сессию — используйте выход")
    session.revoked_at = datetime.utcnow()
    await db.commit()


@router.delete("/security/sessions", status_code=204)
async def terminate_other_sessions(
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Завершить все сессии, кроме текущей."""
    await revoke_sessions(db, user.id, except_token_hash=hash_token(token))


@router.patch("/security/2fa", response_model=TwoFaStatus)
async def set_two_fa(
    body: TwoFaUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _otp: None = Depends(require_otp("enable_2fa")),
):
    """Включение/выключение 2FA (EPIC 5, задача 5) — обе стороны требуют
    X-OTP-Token: иначе включить 2FA чужой рукой и заблокировать владельцу
    вход тривиально."""
    user.two_fa_enabled = body.enabled
    await db.commit()
    return TwoFaStatus(enabled=user.two_fa_enabled)

"""Отзыв сессий (EPIC 5, задачи 2/4/7) — общая точка для «завершить остальные
сессии» (смена пароля, ручное завершение) и «завершить все» (удаление
аккаунта)."""
import hashlib
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import UserSession


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def revoke_sessions(db: AsyncSession, user_id: int, except_token_hash: str | None = None) -> None:
    """Отзывает активные сессии пользователя. except_token_hash — не трогать
    эту сессию (обычно текущую); None — отозвать все."""
    query = select(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    if except_token_hash is not None:
        query = query.where(UserSession.token_hash != except_token_hash)
    sessions = (await db.execute(query)).scalars().all()
    now = datetime.utcnow()
    for s in sessions:
        s.revoked_at = now
    await db.commit()

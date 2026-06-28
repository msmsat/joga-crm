from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import StudioMember
from security import create_access_token


async def _build_token_for_user(user, db: AsyncSession) -> str:
    memberships = (
        await db.execute(select(StudioMember).where(StudioMember.user_id == user.id))
    ).scalars().all()

    if len(memberships) == 1:
        m = memberships[0]
        data = {"sub": user.email, "studio_id": m.studio_id, "role": m.role}
    else:
        data = {"sub": user.email}

    return create_access_token(data=data)

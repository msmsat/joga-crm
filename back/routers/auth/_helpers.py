from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import StudioMember
from security import create_access_token


async def _build_token_for_user(user, db: AsyncSession, studio_id: int | None = None) -> str:
    """JWT сессии. `studio_id` — когда активная студия известна заранее (принятие
    приглашения): роль в токен кладём из членства в ЭТОЙ студии, а не гадаем по
    количеству членств. Без него поведение прежнее: одно членство — пишем его,
    несколько — токен без студии, и `get_studio_context` уводит на /select-crm.
    """
    # Только принятые членства: непринятое приглашение не должно ни попасть в
    # токен, ни считаться «единственной студией» (решение 10).
    memberships = (
        await db.execute(select(StudioMember).where(
            StudioMember.user_id == user.id,
            StudioMember.status == "active",
        ))
    ).scalars().all()

    if studio_id is not None:
        m = next((m for m in memberships if m.studio_id == studio_id), None)
        if m is not None:
            return create_access_token(
                data={"sub": user.email, "studio_id": m.studio_id, "role": m.role}
            )

    if len(memberships) == 1:
        m = memberships[0]
        data = {"sub": user.email, "studio_id": m.studio_id, "role": m.role}
    else:
        data = {"sub": user.email}

    return create_access_token(data=data)

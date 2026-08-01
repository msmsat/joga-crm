from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import StudioMember
from security import create_access_token


async def _build_token_for_user(user, db: AsyncSession, studio_id: int | None = None) -> str:
    """JWT сессии. Активную студию берём по порядку: явно переданная (принятие
    приглашения) → та, в которой человек работал в прошлый раз
    (`user.last_studio_id`) → единственная. Ничего не подошло — токен без студии,
    и `get_studio_context` уводит на /select-crm.

    Прошлая студия нужна, чтобы мультистудийного пользователя при каждом входе
    не встречал экран выбора: он сразу попадает туда, где закончил.
    """
    # Только принятые членства: непринятое приглашение не должно ни попасть в
    # токен, ни считаться «единственной студией» (решение 10).
    memberships = (
        await db.execute(select(StudioMember).where(
            StudioMember.user_id == user.id,
            StudioMember.status == "active",
        ))
    ).scalars().all()

    m = None
    for candidate_id in (studio_id, user.last_studio_id):
        if candidate_id is not None:
            m = next((x for x in memberships if x.studio_id == candidate_id), None)
            if m is not None:
                break
    if m is None and len(memberships) == 1:
        m = memberships[0]

    if m is None:
        return create_access_token(data={"sub": user.email})

    # Запоминаем выбор на следующий вход здесь, а не только в /select-studio:
    # через эту функцию проходит любая выдача сессионного токена.
    if user.last_studio_id != m.studio_id:
        user.last_studio_id = m.studio_id
        await db.commit()

    return create_access_token(
        data={"sub": user.email, "studio_id": m.studio_id, "role": m.role}
    )

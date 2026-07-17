from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from jose import jwt

from database import get_db
from models import User
from dependencies import get_current_user, oauth2_scheme, SECRET_KEY, ALGORITHM
from schemas.auth import ProfileUpdate

router = APIRouter()


def _me_payload(user: User, token: str) -> dict:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return {
        "email": user.email,
        "name": user.name,
        "last_name": user.last_name,
        "phone": user.phone,
        "is_onboarded": user.is_onboarded,
        "studio_id": payload.get("studio_id"),
        "role": payload.get("role"),
    }


@router.get("/me")
async def get_me(
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
):
    return _me_payload(current_user, token)


@router.patch("/me")
async def update_me(
    data: ProfileUpdate,
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return _me_payload(current_user, token)


@router.get("/check-phone")
async def check_phone(
    phone: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    taken = (
        await db.execute(select(User).where(User.phone == phone))
    ).scalars().first() is not None
    return {"taken": taken}

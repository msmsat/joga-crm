from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from jose import jwt

from database import get_db
from models import User
from dependencies import get_current_user, oauth2_scheme, SECRET_KEY, ALGORITHM

router = APIRouter()


@router.get("/me")
async def get_me(
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return {
        "email": current_user.email,
        "name": current_user.name,
        "is_onboarded": current_user.is_onboarded,
        "studio_id": payload.get("studio_id"),
        "role": payload.get("role"),
    }


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

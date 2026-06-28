import random
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User
from schemas import ForgotPasswordRequest, ResetPasswordRequest
from security import get_password_hash

router = APIRouter()


@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == request.email))
    ).scalar_one_or_none()

    if not user:
        return {"message": "Если email существует, код отправлен"}

    code = str(random.randint(1000, 9999))
    user.verification_code = code
    await db.commit()

    print("\n" + "=" * 40)
    print(f"ВОССТАНОВЛЕНИЕ ПАРОЛЯ ДЛЯ: {user.email}")
    print(f"КОД: {code}")
    print("=" * 40 + "\n")
    return {"message": "Если email существует, код отправлен"}


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == request.email))
    ).scalar_one_or_none()

    if not user or user.verification_code != request.code:
        raise HTTPException(status_code=400, detail="Неверный код или email")

    user.hashed_password = get_password_hash(request.new_password)
    user.verification_code = None
    user.is_verified = True
    await db.commit()
    return {"message": "Пароль успешно изменен"}

import random
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User
from schemas import RegisterRequest, TokenResponse, VerifyEmailRequest
from security import get_password_hash
from ._helpers import _build_token_for_user

router = APIRouter()


@router.post("/register")
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing_user = (
        await db.execute(select(User).where(User.email == request.email))
    ).scalar_one_or_none()

    hashed_pwd = get_password_hash(request.password)
    verification_code = str(random.randint(1000, 9999))

    if existing_user:
        if existing_user.is_verified:
            raise HTTPException(
                status_code=400,
                detail="Пользователь с таким email уже зарегистрирован",
            )
        existing_user.name = request.name
        existing_user.hashed_password = hashed_pwd
        existing_user.verification_code = verification_code
        await db.commit()

        print("\n" + "=" * 40)
        print(f"ПОВТОРНОЕ ПИСЬМО ДЛЯ: {existing_user.email}")
        print(f"КОД ПОДТВЕРЖДЕНИЯ: {verification_code}")
        print("=" * 40 + "\n")
        return {"message": "Новый код подтверждения отправлен на почту"}

    new_user = User(
        email=request.email,
        name=request.name,
        hashed_password=hashed_pwd,
        is_verified=False,
        verification_code=verification_code,
    )
    db.add(new_user)
    await db.commit()

    print("\n" + "=" * 40)
    print(f"ПИСЬМО ДЛЯ: {new_user.email}")
    print(f"КОД ПОДТВЕРЖДЕНИЯ: {verification_code}")
    print("=" * 40 + "\n")
    return {"message": "Код подтверждения отправлен на почту"}


@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(request: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == request.email))
    ).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Почта уже подтверждена")
    if user.verification_code != request.code:
        raise HTTPException(status_code=400, detail="Неверный код подтверждения")

    user.is_verified = True
    user.verification_code = None
    await db.commit()

    access_token = await _build_token_for_user(user, db)
    return TokenResponse(access_token=access_token, token_type="bearer")

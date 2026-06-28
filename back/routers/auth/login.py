import os
import uuid
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, StudioMember
from schemas import LoginRequest, TokenResponse, GoogleAuthRequest
from security import verify_password, get_password_hash
from ._helpers import _build_token_for_user

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
router = APIRouter()


@router.post("/google", response_model=TokenResponse)
async def google_auth(request: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    try:
        idinfo = id_token.verify_oauth2_token(
            request.token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
        email = idinfo["email"]
        google_name = idinfo.get("name", "Google User")
    except ValueError as e:
        print("\n" + "!" * 40)
        print(f"ОШИБКА GOOGLE AUTH: {e}")
        print("!" * 40 + "\n")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен Google",
        )

    user = (await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(User.email == email, StudioMember.role == 'owner')
    )).scalars().first()

    if not user:
        user = User(
            email=email,
            name=google_name,
            hashed_password=get_password_hash(str(uuid.uuid4())),
            is_verified=True,
            verification_code=None,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    access_token = await _build_token_for_user(user, db)
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(
            select(User)
            .join(StudioMember, StudioMember.user_id == User.id)
            .where(
                (User.email == request.identifier) | (User.phone == request.identifier),
                StudioMember.role == 'owner',
            )
        )
    ).scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email, телефон или пароль",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Ваш email не подтвержден. Пожалуйста, зарегистрируйтесь заново или введите код.",
        )

    if not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email, телефон или пароль",
        )

    access_token = await _build_token_for_user(user, db)
    return TokenResponse(access_token=access_token, token_type="bearer")

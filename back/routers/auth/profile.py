from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from jose import jwt

from database import get_db
from models import User
from dependencies import get_current_user, oauth2_scheme, SECRET_KEY, ALGORITHM
from schemas.auth import ProfileUpdate
from services.contacts import contact_taken, ensure_user_contacts_free

router = APIRouter()


def _me_payload(user: User, token: str) -> dict:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return {
        "email": user.email,
        "name": user.name,
        "last_name": user.last_name,
        "phone": user.phone,
        "tg_id": user.tg_id,
        "is_onboarded": user.is_onboarded,
        "studio_id": payload.get("studio_id"),
        "role": payload.get("role"),
        "two_fa_enabled": user.two_fa_enabled,
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
    patch = data.model_dump(exclude_unset=True)
    # Только изменённый телефон — прежнее значение своё же, конфликтом не считается.
    phone = patch.get("phone")
    await ensure_user_contacts_free(
        db,
        phone=phone if phone != current_user.phone else None,
        exclude_id=current_user.id,
    )

    # tg_id — тоже контакт: notifier ищет получателя по нему, и два аккаунта с
    # одним telegram означают уведомления не тому человеку. В БД стоит
    # uq_users_tg_id, но без этой проверки конфликт вернулся бы как 500.
    tg_id = patch.get("tg_id")
    if tg_id is not None and tg_id != current_user.tg_id:
        clash = (await db.execute(
            select(User.id).where(User.tg_id == tg_id, User.id != current_user.id).limit(1)
        )).first()
        if clash is not None:
            raise HTTPException(
                status_code=409,
                detail="Этот Telegram уже привязан к другому аккаунту",
            )

    for field, value in patch.items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return _me_payload(current_user, token)


@router.get("/check-contact")
async def check_contact(
    field: Literal["email", "phone"],
    value: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Подсказка фронту (онбординг, профиль): занят ли контакт другим аккаунтом.

    Свой же контакт не в счёт — иначе владелец, создающий вторую студию
    (EPIC 7, задача 5), увидит «уже занят» на собственном телефоне.
    Барьер — guard на записи, эта ручка только гасит кнопку заранее.
    """
    return {"taken": await contact_taken(db, User, field, value, exclude_id=current_user.id)}

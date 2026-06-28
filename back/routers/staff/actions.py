from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import oauth2_scheme, SECRET_KEY, ALGORITHM
from models import StudioMember, User
from schemas import StaffCallRequest, StaffMessageRequest, StaffMessageResponse, StaffCallResponse

router = APIRouter()


# ─── HELPER ───────────────────────────────────────────────────────────────────

def _studio_id_from_token(token: str) -> int:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    studio_id = payload.get("studio_id")
    if not studio_id:
        raise HTTPException(status_code=401, detail="studio_id не найден в токене")
    return int(studio_id)


async def _get_staff_user(staff_id: int, studio_id: int, db: AsyncSession) -> User:
    result = await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id, User.id == staff_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return user


# ─── POST /staff/{staff_id}/message ───────────────────────────────────────────

@router.post("/{staff_id}/message", response_model=StaffMessageResponse)
async def message_staff(
    staff_id: int,
    data: StaffMessageRequest,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)
    user = await _get_staff_user(staff_id, studio_id, db)

    if data.channel == "email" and not user.email:
        raise HTTPException(status_code=400, detail="У сотрудника не указан email")
    if data.channel in ("whatsapp", "phone") and not user.phone:
        raise HTTPException(status_code=400, detail="У сотрудника не указан номер телефона")

    recipient = user.email if data.channel == "email" else user.phone
    return {
        "ok": True,
        "channel": data.channel,
        "recipient": recipient,
        "staff_id": staff_id,
    }


# ─── POST /staff/{staff_id}/call ──────────────────────────────────────────────

@router.post("/{staff_id}/call", response_model=StaffCallResponse)
async def call_staff(
    staff_id: int,
    data: StaffCallRequest,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)
    user = await _get_staff_user(staff_id, studio_id, db)

    if not user.phone:
        raise HTTPException(status_code=400, detail="У сотрудника не указан номер телефона")

    return {
        "ok": True,
        "channel": data.channel,
        "phone": user.phone,
        "staff_id": staff_id,
    }

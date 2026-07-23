"""Инвайт-код клиента для реферальной программы (V5-6, задача 1.4).

Код генерируется лениво при первом обращении — не миграцией по всем клиентам.
Привязка нового клиента к рефереру — в profiles.py (create_client), триггер
бонуса за первую оплату — в clients/loyalty.py (register_purchase).
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Client
from schemas._base import BaseSchema

router = APIRouter()

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # без похожих 0/O, 1/I — как в certificates.py


class InviteCodeRead(BaseSchema):
    invite_code: str


async def _unique_invite_code(db: AsyncSession) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(8))
        exists = (await db.execute(
            select(Client.id).where(Client.invite_code == code)
        )).scalar_one_or_none()
        if exists is None:
            return code
    raise HTTPException(status_code=500, detail="Не удалось сгенерировать инвайт-код")


@router.get("/{client_id}/invite-code", response_model=InviteCodeRead)
async def get_invite_code(
    client_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    client = (await db.execute(
        select(Client).where(Client.id == client_id, Client.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    if client.invite_code is None:
        client.invite_code = await _unique_invite_code(db)
        await db.commit()

    return InviteCodeRead(invite_code=client.invite_code)

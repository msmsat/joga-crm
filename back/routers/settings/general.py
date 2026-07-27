from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import StudioContext, get_current_user, get_studio_context, require_role
from models import Studio, User
from schemas.settings.general import (
    AppearanceRead,
    AppearanceUpdate,
    GeneralRead,
    GeneralReadPublic,
    GeneralUpdate,
)

router = APIRouter()


async def _get_studio(studio_id: int, db: AsyncSession) -> Studio:
    studio = await db.get(Studio, studio_id)
    if studio is None:
        raise HTTPException(status_code=404, detail="Студия не найдена")
    return studio


@router.get("/general", response_model=None)
async def get_general_settings(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    studio = await _get_studio(ctx.studio_id, db)
    if ctx.role == "owner":
        return GeneralRead.model_validate(studio)
    # Не-owner (admin/trainer): без контактов и адреса студии (ТЗ эпика 2, задача 1).
    return GeneralReadPublic.model_validate(studio)


@router.patch("/general", response_model=GeneralRead)
async def update_general_settings(
    body: GeneralUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio = await _get_studio(ctx.studio_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(studio, field, value)
    await db.commit()
    await db.refresh(studio)
    return studio


@router.get("/appearance", response_model=AppearanceRead)
async def get_appearance(
    user: User = Depends(get_current_user),
):
    return user


@router.patch("/appearance", response_model=AppearanceRead)
async def update_appearance(
    body: AppearanceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user

"""Пакеты абонементов для продажи: CRUD (задача 5).

Пакеты живут под конфигом абонементов студии (StudioSubscriptionProgramConfig) —
при первом создании конфиг создаётся get-or-create. DELETE — мягкий (is_active=false),
чтобы не осиротить проданные абонементы. Всё — только owner, скоуп по ctx.studio_id.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import StudioSubscriptionProgramConfig, SubscriptionPackage
from schemas.loyalty import (
    SubscriptionPackageCreate,
    SubscriptionPackageRead,
    SubscriptionPackageUpdate,
)

router = APIRouter()


async def _get_config(studio_id: int, db: AsyncSession) -> StudioSubscriptionProgramConfig:
    cfg = (await db.execute(
        select(StudioSubscriptionProgramConfig).where(
            StudioSubscriptionProgramConfig.studio_id == studio_id
        )
    )).scalar_one_or_none()
    if cfg is None:
        cfg = StudioSubscriptionProgramConfig(studio_id=studio_id)
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
    return cfg


async def _get_package(package_id: int, studio_id: int, db: AsyncSession) -> SubscriptionPackage:
    pkg = (await db.execute(
        select(SubscriptionPackage).where(
            SubscriptionPackage.id == package_id,
            SubscriptionPackage.studio_id == studio_id,
        )
    )).scalar_one_or_none()
    if pkg is None:
        raise HTTPException(status_code=404, detail="Пакет не найден")
    return pkg


@router.get("/subscriptions", response_model=List[SubscriptionPackageRead])
async def list_packages(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(SubscriptionPackage)
        .where(SubscriptionPackage.studio_id == ctx.studio_id)
        .order_by(SubscriptionPackage.sort_order, SubscriptionPackage.id)
    )).scalars().all()
    return rows


@router.post("/subscriptions", response_model=SubscriptionPackageRead, status_code=201)
async def create_package(
    body: SubscriptionPackageCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    cfg = await _get_config(ctx.studio_id, db)
    pkg = SubscriptionPackage(
        studio_id=ctx.studio_id,
        config_id=cfg.id,
        **body.model_dump(),
    )
    db.add(pkg)
    await db.commit()
    await db.refresh(pkg)
    return pkg


@router.patch("/subscriptions/{package_id}", response_model=SubscriptionPackageRead)
async def update_package(
    package_id: int,
    body: SubscriptionPackageUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    pkg = await _get_package(package_id, ctx.studio_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pkg, field, value)
    await db.commit()
    await db.refresh(pkg)
    return pkg


@router.delete("/subscriptions/{package_id}", status_code=204)
async def delete_package(
    package_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    # Мягкое удаление: проданные абонементы ссылаются на пакет — физически не удаляем.
    pkg = await _get_package(package_id, ctx.studio_id, db)
    pkg.is_active = False
    await db.commit()

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import Service
from schemas.studio import ServiceRead, ServiceCreate, ServiceUpdate

router = APIRouter()


async def _get_service_or_404(service_id: int, studio_id: int, db: AsyncSession) -> Service:
    service = (await db.execute(
        select(Service).where(Service.id == service_id, Service.studio_id == studio_id)
    )).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    return service


@router.get("/services", response_model=list[ServiceRead])
async def list_services(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    services = (await db.execute(
        select(Service).where(Service.studio_id == ctx.studio_id).order_by(Service.name)
    )).scalars().all()
    return services


@router.get("/services/{service_id}", response_model=ServiceRead)
async def get_service(
    service_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_service_or_404(service_id, ctx.studio_id, db)


@router.post("/services", response_model=ServiceRead, status_code=201)
async def create_service(
    data: ServiceCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    service = Service(studio_id=ctx.studio_id, **data.model_dump())
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return service


@router.patch("/services/{service_id}", response_model=ServiceRead)
async def update_service(
    service_id: int,
    data: ServiceUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    service = await _get_service_or_404(service_id, ctx.studio_id, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(service, field, value)
    await db.commit()
    await db.refresh(service)
    return service


@router.delete("/services/{service_id}", status_code=204)
async def delete_service(
    service_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    service = await _get_service_or_404(service_id, ctx.studio_id, db)
    await db.delete(service)
    await db.commit()

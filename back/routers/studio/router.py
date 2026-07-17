from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_role, StudioContext
from models import Studio, StudioMember, StudioBranch, BranchWorkingHours, Hall
from schemas.studio import StudioRead, BranchCreate, BranchUpdate, BranchListItem, BranchDetail, HallBrief, WorkingHoursRead
from schemas.schedule import HallCreate, HallUpdate
from .media import router as media_router
from .services import router as services_router

router = APIRouter()
router.include_router(media_router)
router.include_router(services_router)


@router.post("/branches", response_model=BranchListItem, status_code=201)
async def create_branch(
    data: BranchCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    branch = StudioBranch(studio_id=studio_id, **data.model_dump())
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    return BranchListItem(
        id=branch.id,
        name=branch.name,
        address=branch.address,
        city=branch.city,
        country=branch.country,
        hall_count=0,
    )


async def _get_branch_or_404(branch_id: int, studio_id: int, db: AsyncSession) -> StudioBranch:
    branch = (await db.execute(
        select(StudioBranch).where(
            StudioBranch.id == branch_id, StudioBranch.studio_id == studio_id
        )
    )).scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Филиал не найден")
    return branch


@router.patch("/branches/{branch_id}", response_model=BranchListItem)
async def update_branch(
    branch_id: int,
    data: BranchUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    branch = await _get_branch_or_404(branch_id, ctx.studio_id, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(branch, field, value)
    await db.commit()
    await db.refresh(branch, attribute_names=["halls"])
    return BranchListItem(
        id=branch.id,
        name=branch.name,
        address=branch.address,
        city=branch.city,
        country=branch.country,
        hall_count=len(branch.halls),
    )


@router.delete("/branches/{branch_id}", status_code=204)
async def delete_branch(
    branch_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    branch = await _get_branch_or_404(branch_id, ctx.studio_id, db)
    await db.delete(branch)
    await db.commit()


@router.post("/branches/{branch_id}/halls", response_model=HallBrief, status_code=201)
async def create_hall(
    branch_id: int,
    data: HallCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    await _get_branch_or_404(branch_id, ctx.studio_id, db)
    hall = Hall(studio_id=ctx.studio_id, branch_id=branch_id, **data.model_dump())
    db.add(hall)
    await db.commit()
    await db.refresh(hall)
    return _hall_brief(hall)


async def _get_hall_or_404(hall_id: int, studio_id: int, db: AsyncSession) -> Hall:
    hall = (await db.execute(
        select(Hall).where(Hall.id == hall_id, Hall.studio_id == studio_id)
    )).scalar_one_or_none()
    if not hall:
        raise HTTPException(status_code=404, detail="Зал не найден")
    return hall


def _hall_brief(hall: Hall) -> HallBrief:
    return HallBrief(
        id=hall.id,
        name=hall.name,
        capacity=hall.capacity,
        color=hall.color,
        area=hall.area,
        hourly_rate=hall.hourly_rate,
        equipment=hall.equipment,
    )


@router.patch("/halls/{hall_id}", response_model=HallBrief)
async def update_hall(
    hall_id: int,
    data: HallUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    hall = await _get_hall_or_404(hall_id, ctx.studio_id, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(hall, field, value)
    await db.commit()
    await db.refresh(hall)
    return _hall_brief(hall)


@router.delete("/halls/{hall_id}", status_code=204)
async def delete_hall(
    hall_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    hall = await _get_hall_or_404(hall_id, ctx.studio_id, db)
    await db.delete(hall)
    await db.commit()


@router.get("/branches/{branch_id}", response_model=BranchDetail)
async def get_branch(
    branch_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    result = await db.execute(
        select(StudioBranch)
        .where(StudioBranch.id == branch_id, StudioBranch.studio_id == studio_id)
        .options(
            selectinload(StudioBranch.halls),
            selectinload(StudioBranch.working_hours),
        )
    )
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Филиал не найден")
    return BranchDetail(
        id=branch.id,
        name=branch.name,
        city=branch.city,
        phone=branch.phone,
        email=branch.email,
        address=branch.address,
        photo_url=branch.photo_url,
        halls=[
            HallBrief(
                id=h.id,
                name=h.name,
                capacity=h.capacity,
                color=h.color,
                area=h.area,
                hourly_rate=h.hourly_rate,
                equipment=h.equipment,
            )
            for h in branch.halls
        ],
        working_hours=[
            WorkingHoursRead(
                day_of_week=wh.day_of_week,
                is_open=wh.is_open,
                open_time=wh.open_time,
                close_time=wh.close_time,
            )
            for wh in branch.working_hours
        ],
    )


@router.get("/branches", response_model=list[BranchListItem])
async def get_branches(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    result = await db.execute(
        select(StudioBranch)
        .where(StudioBranch.studio_id == studio_id)
        .options(selectinload(StudioBranch.halls))
    )
    branches = result.scalars().all()
    return [
        BranchListItem(
            id=b.id,
            name=b.name,
            address=b.address,
            city=b.city,
            country=b.country,
            hall_count=len(b.halls),
        )
        for b in branches
    ]


@router.get("", response_model=StudioRead)
async def get_studio(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    studio = await db.get(Studio, studio_id)
    if not studio:
        raise HTTPException(status_code=404, detail="Студия не найдена")
    return studio

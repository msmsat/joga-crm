from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_role, StudioContext
from models import Studio, StudioMember, StudioBranch, BranchWorkingHours, StudioWorkingHours, Hall
from schemas.studio import StudioRead, BranchCreate, BranchUpdate, BranchListItem, BranchDetail, HallBrief, WorkingHoursRead
from schemas.schedule import HallCreate, HallUpdate
from .media import router as media_router
from .services import router as services_router

router = APIRouter()
router.include_router(media_router)
router.include_router(services_router)

# Fallback-график, если у студии нет часов из онбординга: пн–пт 09:00–21:00, сб–вс закрыто.
_DEFAULT_HOURS = [
    {"is_open": True, "open_time": "09:00", "close_time": "21:00"} if d < 5
    else {"is_open": False, "open_time": "09:00", "close_time": "21:00"}
    for d in range(7)
]


async def _default_branch_hours(studio_id: int, branch_id: int, db: AsyncSession) -> list[BranchWorkingHours]:
    studio_hours = (await db.execute(
        select(StudioWorkingHours).where(StudioWorkingHours.studio_id == studio_id)
    )).scalars().all()
    by_day = {h.day_of_week: h for h in studio_hours}
    return [
        BranchWorkingHours(
            branch_id=branch_id,
            day_of_week=d,
            is_open=by_day[d].is_open if d in by_day else _DEFAULT_HOURS[d]["is_open"],
            open_time=by_day[d].open_time if d in by_day else _DEFAULT_HOURS[d]["open_time"],
            close_time=by_day[d].close_time if d in by_day else _DEFAULT_HOURS[d]["close_time"],
        )
        for d in range(7)
    ]


@router.post("/branches", response_model=BranchListItem, status_code=201)
async def create_branch(
    data: BranchCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    studio_id = ctx.studio_id
    branch = StudioBranch(studio_id=studio_id, **data.model_dump())
    db.add(branch)
    await db.flush()
    for wh in await _default_branch_hours(studio_id, branch.id, db):
        db.add(wh)
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
    fields = data.model_dump(exclude_unset=True, exclude={"working_hours"})
    for field, value in fields.items():
        setattr(branch, field, value)
    if not branch.phone and not branch.email:
        raise HTTPException(status_code=422, detail="Укажите телефон или email")

    if data.working_hours is not None:
        await db.execute(
            delete(BranchWorkingHours).where(BranchWorkingHours.branch_id == branch_id)
        )
        for wh in data.working_hours:
            db.add(BranchWorkingHours(
                branch_id=branch_id,
                day_of_week=wh.day_of_week,
                is_open=wh.is_open,
                open_time=wh.open_time,
                close_time=wh.close_time,
            ))
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
        is_online=hall.is_online,
        photo_url=hall.photo_url,
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
        country=branch.country,
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
                is_online=h.is_online,
                photo_url=h.photo_url,
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

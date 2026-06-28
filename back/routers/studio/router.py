from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import oauth2_scheme, SECRET_KEY, ALGORITHM
from models import Studio, StudioMember, StudioBranch, BranchWorkingHours
from schemas.studio import StudioRead, BranchCreate, BranchListItem, BranchDetail, HallBrief, WorkingHoursRead
from .media import router as media_router

router = APIRouter()
router.include_router(media_router)


def _studio_id_from_token(token: str) -> int:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    studio_id = payload.get("studio_id")
    if not studio_id:
        raise HTTPException(status_code=401, detail="studio_id не найден в токене")
    return int(studio_id)


@router.post("/branches", response_model=BranchListItem, status_code=201)
async def create_branch(
    data: BranchCreate,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)
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


@router.get("/branches/{branch_id}", response_model=BranchDetail)
async def get_branch(
    branch_id: int,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)
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
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)
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
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    studio_id = _studio_id_from_token(token)
    studio = await db.get(Studio, studio_id)
    if not studio:
        raise HTTPException(status_code=404, detail="Студия не найдена")
    return studio

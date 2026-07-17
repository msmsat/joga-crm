from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_studio_context, StudioContext
from models import Hall
from schemas.schedule.halls import HallRead

router = APIRouter()


@router.get("/halls", response_model=List[HallRead])
async def list_halls(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Активные залы студии для колонок и фильтров расписания. ТОЛЬКО чтение —
    создание/правка залов живут в Каталоге."""
    halls = (await db.execute(
        select(Hall)
        .where(Hall.studio_id == ctx.studio_id, Hall.is_active == True)  # noqa: E712
        .order_by(Hall.name)
    )).scalars().all()
    return halls

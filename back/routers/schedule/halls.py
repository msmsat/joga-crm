from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_studio_context, StudioContext
from models import Hall, Lesson
from schemas.schedule.halls import HallRead

router = APIRouter()


@router.get("/halls", response_model=List[HallRead])
async def list_halls(
    ctx: StudioContext = Depends(get_studio_context),
    db: AsyncSession = Depends(get_db),
):
    """Активные залы студии для колонок и фильтров расписания. ТОЛЬКО чтение —
    создание/правка залов живут в Каталоге.

    Тренеру — только «его» залы: те, где у него есть занятия (в любую сторону от
    сегодня — он листает расписание и вперёд). Полный список залов студии ему в
    журнале нечего фильтровать, занятий в чужих залах он всё равно не видит.
    Признак «зал сотрудника» тот же, что в профиле сотрудника (staff/profiles.py):
    отдельной привязки тренера к залам в модели нет.
    """
    stmt = (
        select(Hall)
        .where(Hall.studio_id == ctx.studio_id, Hall.is_active == True)  # noqa: E712
        .order_by(Hall.name)
    )
    if ctx.role == "trainer":
        stmt = stmt.where(Hall.id.in_(
            select(Lesson.hall_id).where(
                Lesson.studio_id == ctx.studio_id,
                Lesson.teacher_id == ctx.user.id,
            )
        ))

    halls = (await db.execute(stmt)).scalars().all()
    return halls

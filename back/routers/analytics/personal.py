"""GET /analytics/me — KPI Дашборда для админа и тренера.

Вся студийная аналитика (/summary, /overview, /series) — owner-only, поэтому у
остальных ролей Дашборд был пустым. Здесь тот же счёт, но в их охвате: тренеру
— только его занятия, администратору — зал без денег (выручка/прибыль в ответ
не попадают, у него нет доступа к Финансам).

Своих запросов почти нет: считают те же помощники, что и Обзор с Командой,
просто с суженным ReportFilters.
"""
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role, StudioContext
from models import Lesson, Reservation
from schemas.analytics.reports import MyKpi, MySummaryRead
from ._filters import check_report_range, lesson_conds, pct, prev_range, ReportFilters
from .overview import _period_kpi
from .team import _lesson_stats, _rating_by_trainer

router = APIRouter()

_ZERO_LESSON_STATS = {"lessons": 0, "attendance": 0, "fill_pct": 0.0}


def _range(date_from: date, date_to: date, trainer_id: int | None = None) -> ReportFilters:
    """Дашборд фильтров не имеет — все срезы, кроме своего тренера, пустые."""
    return ReportFilters(
        date_from=date_from, date_to=date_to,
        branch_id=None, hall_id=None, trainer_id=trainer_id, service_id=None,
    )


async def _trainer_metrics(f: ReportFilters, sid: int, uid: int, db: AsyncSession) -> dict[str, float]:
    """Показатели тренера. f уже сужен trainer_id=uid — чужие занятия в выборку
    не попадают даже до фильтрации словаря по ключу."""
    stats = (await _lesson_stats(f, sid, db)).get(uid, _ZERO_LESSON_STATS)
    rating, _votes = (await _rating_by_trainer(f, sid, db)).get(uid, (None, 0))
    return {
        "lessons": float(stats["lessons"]),
        "attendance": float(stats["attendance"]),
        "fill_rate": stats["fill_pct"],
        # Оценок за период нет → 0.0, фронт рисует прочерк (усреднять нечего).
        "rating": float(rating or 0),
    }


async def _admin_metrics(f: ReportFilters, sid: int, db: AsyncSession) -> dict[str, float]:
    """Показатели студии без денег: записи, посещения, заполняемость, активные
    клиенты. _period_kpi считает ещё выручку и прибыль — в ответ они не идут."""
    kpi = await _period_kpi(f, sid, db)
    bookings = (await db.execute(
        select(func.count(Reservation.id))
        .select_from(Lesson)
        .join(Reservation, Reservation.lesson_id == Lesson.id)
        .where(*lesson_conds(f, sid), Reservation.status != "cancelled")
    )).scalar_one()
    return {
        "bookings": float(int(bookings)),
        "attendance": kpi["attendance"],
        "fill_rate": kpi["fill_rate"],
        "active_clients": kpi["active_clients"],
    }


@router.get("/me", response_model=MySummaryRead)
async def my_summary(
    date_from: date = Query(...),
    date_to: date = Query(...),
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    db: AsyncSession = Depends(get_db),
):
    check_report_range(date_from, date_to)
    sid = ctx.studio_id
    prev_from, prev_to = prev_range(_range(date_from, date_to))

    if ctx.role == "trainer":
        uid = ctx.user.id
        curr = await _trainer_metrics(_range(date_from, date_to, uid), sid, uid, db)
        prev = await _trainer_metrics(_range(prev_from, prev_to, uid), sid, uid, db)
    else:
        curr = await _admin_metrics(_range(date_from, date_to), sid, db)
        prev = await _admin_metrics(_range(prev_from, prev_to), sid, db)

    return MySummaryRead(
        role=ctx.role,
        kpi=[MyKpi(id=key, value=value, prev_pct=pct(value, prev[key])) for key, value in curr.items()],
    )

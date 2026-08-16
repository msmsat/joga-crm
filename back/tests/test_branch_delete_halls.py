"""Удаление филиала уносит его залы (иначе они становятся «ничейными»: в Каталоге
их не видно, а журнал по /schedule/halls их всё ещё показывает).
Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_branch_delete_halls
"""
import asyncio
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import Hall, Lesson, Studio, StudioBranch, User
from routers.studio.router import delete_branch


async def _run():
    async with async_session_maker() as db:
        s = Studio(name="TEST-BRANCH-DELETE-HALLS"); db.add(s); await db.flush()
        owner = User(email="branch-del-owner@x.com", hashed_password="x", name="Own")
        db.add(owner)
        branch = StudioBranch(studio_id=s.id, name="Филиал")
        db.add(branch); await db.flush()
        hall = Hall(studio_id=s.id, branch_id=branch.id, name="Зал", capacity=10)
        db.add(hall); await db.flush()
        lesson = Lesson(
            studio_id=s.id, name="L", teacher_name="T", hall_id=hall.id,
            start_time=datetime.combine(date.today() - timedelta(days=1), time(10, 0)),
            duration_min=60, price=1000, level="all", equipment="mat",
            total_spots=10, status="confirmed",
        )
        db.add(lesson); await db.commit()
        sid, bid, lid, uid = s.id, branch.id, lesson.id, owner.id

    try:
        async with async_session_maker() as db:
            u = (await db.execute(select(User).where(User.id == uid))).scalar_one()
            await delete_branch(
                branch_id=bid,
                ctx=StudioContext(user=u, studio_id=sid, role="owner"),
                db=db,
            )

        async with async_session_maker() as db:
            halls = (await db.execute(select(Hall).where(Hall.studio_id == sid))).scalars().all()
            assert halls == [], f"зал пережил филиал: {[h.id for h in halls]}"
            # Занятие остаётся, просто без зала (FK lessons.hall_id → SET NULL).
            l = (await db.execute(select(Lesson).where(Lesson.id == lid))).scalar_one()
            assert l.hall_id is None, l.hall_id
    finally:
        async with async_session_maker() as db:
            await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
            await db.execute(delete(Hall).where(Hall.studio_id == sid))
            await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == sid))
            await db.execute(delete(Studio).where(Studio.id == sid))
            await db.execute(delete(User).where(User.id == uid))
            await db.commit()
        await engine.dispose()


def test_branch_delete_removes_halls():
    asyncio.run(_run())


if __name__ == "__main__":
    test_branch_delete_removes_halls()
    print("OK")

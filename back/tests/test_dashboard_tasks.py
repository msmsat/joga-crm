"""EPIC D2 задача 5: ролевая матрица делегирования задач (GET/POST/PATCH scope+assignee_id).
Образец — tests/test_analytics_utilization.py (реальная БД, сид, ручная чистка).

Запуск из back/:  python -m tests.test_dashboard_tasks
"""
import asyncio
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import Studio, StudioMember, StudioTask, User
from routers.analytics.tasks import create_task, delete_task, list_assignees, list_tasks, update_task
from schemas.analytics.tasks import StudioTaskCreate, StudioTaskUpdate


async def _seed():
    async with async_session_maker() as db:
        s = Studio(name="TEST-DASHBOARD-TASKS")
        db.add(s)
        await db.flush()
        sid = s.id

        owner = User(email="dt-owner@x.com", hashed_password="x", name="Olga", last_name="Owner")
        admin = User(email="dt-admin@x.com", hashed_password="x", name="Igor", last_name="Admin")
        t1 = User(email="dt-t1@x.com", hashed_password="x", name="Anna", last_name="Trainer1")
        t2 = User(email="dt-t2@x.com", hashed_password="x", name="Boris", last_name="Trainer2")
        db.add_all([owner, admin, t1, t2])
        await db.flush()
        oid, aid, t1id, t2id = owner.id, admin.id, t1.id, t2.id

        db.add_all([
            StudioMember(user_id=oid, studio_id=sid, role="owner", name="Владелец"),
            StudioMember(user_id=aid, studio_id=sid, role="admin", name="Админ"),
            StudioMember(user_id=t1id, studio_id=sid, role="trainer", name="Тренер 1"),
            StudioMember(user_id=t2id, studio_id=sid, role="trainer", name="Тренер 2"),
        ])

        # По задаче на каждого, автор — owner (что не мешает scope-фильтрации по assignee_id).
        db.add_all([
            StudioTask(studio_id=sid, author_id=oid, assignee_id=oid, text="Owner task"),
            StudioTask(studio_id=sid, author_id=oid, assignee_id=aid, text="Admin task"),
            StudioTask(studio_id=sid, author_id=oid, assignee_id=t1id, text="Trainer1 task"),
            StudioTask(studio_id=sid, author_id=oid, assignee_id=t2id, text="Trainer2 task"),
        ])
        await db.commit()
        return sid, oid, aid, t1id, t2id


async def _cleanup(sid: int, user_ids: list[int]) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioTask).where(StudioTask.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id.in_(user_ids)))
        await db.commit()


async def _expect_403(coro) -> None:
    try:
        await coro
        raise AssertionError("ожидали 403")
    except HTTPException as e:
        assert e.status_code == 403, e.status_code


async def _run():
    sid, oid, aid, t1id, t2id = await _seed()
    try:
        # _assignable_ids читает ctx.user.id — нужен объект с .id, не None (в отличие
        # от analytics_utilization, которому ctx.user не требуется).
        _FakeUser = type("_FakeUser", (), {})

        def _ctx(user_id: int, role: str) -> StudioContext:
            u = _FakeUser()
            u.id = user_id
            return StudioContext(user=u, studio_id=sid, role=role)

        owner_ctx = _ctx(oid, "owner")
        admin_ctx = _ctx(aid, "admin")
        t1_ctx = _ctx(t1id, "trainer")
        t2_ctx = _ctx(t2id, "trainer")

        # 1. trainer1, scope="mine" → только задачи с assignee_id == trainer1
        async with async_session_maker() as db:
            tasks = await list_tasks(scope="mine", assignee_id=None, ctx=t1_ctx, db=db)
        assert len(tasks) == 1 and tasks[0]["assignee_id"] == t1id, tasks

        # 2. trainer1, scope="trainers" → 403
        async with async_session_maker() as db:
            await _expect_403(list_tasks(scope="trainers", assignee_id=None, ctx=t1_ctx, db=db))

        # 3. trainer1, assignee_id=trainer2 → 403
        async with async_session_maker() as db:
            await _expect_403(list_tasks(scope="mine", assignee_id=t2id, ctx=t1_ctx, db=db))

        # 4. admin, scope="trainers" → задачи обоих тренеров, своей задачи нет
        async with async_session_maker() as db:
            tasks = await list_tasks(scope="trainers", assignee_id=None, ctx=admin_ctx, db=db)
        assert {t["assignee_id"] for t in tasks} == {t1id, t2id}, tasks

        # 5. admin, scope="admins" → 403
        async with async_session_maker() as db:
            await _expect_403(list_tasks(scope="admins", assignee_id=None, ctx=admin_ctx, db=db))

        # 6. owner, scope="admins" → задачи админов
        async with async_session_maker() as db:
            tasks = await list_tasks(scope="admins", assignee_id=None, ctx=owner_ctx, db=db)
        assert len(tasks) == 1 and tasks[0]["assignee_id"] == aid, tasks

        # 7. owner POST assignee_id=trainer1 → 201, в БД assignee_id==trainer1, author_id==owner
        async with async_session_maker() as db:
            created = await create_task(
                StudioTaskCreate(text="Delegated", priority="medium", tag="Клиент", assignee_id=t1id),
                ctx=owner_ctx, db=db,
            )
        assert created["assignee_id"] == t1id, created
        async with async_session_maker() as db:
            row = (await db.execute(select(StudioTask).where(StudioTask.id == created["id"]))).scalar_one()
            assert row.author_id == oid and row.assignee_id == t1id, row

        # 8. trainer1 POST assignee_id=trainer2 → 403
        async with async_session_maker() as db:
            await _expect_403(create_task(
                StudioTaskCreate(text="Nope", priority="low", tag="Клиент", assignee_id=t2id),
                ctx=t1_ctx, db=db,
            ))

        # 9. trainer1 PATCH is_done чужой задачи (trainer2) → 403
        async with async_session_maker() as db:
            t2_task = (await db.execute(
                select(StudioTask).where(StudioTask.studio_id == sid, StudioTask.assignee_id == t2id)
            )).scalars().first()
        async with async_session_maker() as db:
            await _expect_403(update_task(t2_task.id, StudioTaskUpdate(is_done=True), ctx=t1_ctx, db=db))

        # 10. trainer1 PATCH is_done своей → 200, done_at is not None
        async with async_session_maker() as db:
            t1_task = (await db.execute(
                select(StudioTask).where(StudioTask.studio_id == sid, StudioTask.assignee_id == t1id)
            )).scalars().first()
        async with async_session_maker() as db:
            updated = await update_task(t1_task.id, StudioTaskUpdate(is_done=True), ctx=t1_ctx, db=db)
        assert updated["is_done"] is True and updated["done_at"] is not None, updated

        # 11. GET любой ролью → assignee_name заполнен (проверка selectinload)
        async with async_session_maker() as db:
            tasks = await list_tasks(scope="admins", assignee_id=None, ctx=owner_ctx, db=db)
        assert all(t["assignee_name"] for t in tasks), tasks

        # Доп.: GET /tasks/assignees — trainer не может делегировать никому
        async with async_session_maker() as db:
            opts = await list_assignees(ctx=t1_ctx, db=db)
        assert opts == [], opts

        # cleanup созданной в п.7 задачи и is_done, выставленного в п.10, — до общей очистки студии.
        async with async_session_maker() as db:
            await delete_task(created["id"], ctx=owner_ctx, db=db)
    finally:
        await _cleanup(sid, [oid, aid, t1id, t2id])
        await engine.dispose()


def test_dashboard_tasks():
    asyncio.run(_run())


if __name__ == "__main__":
    test_dashboard_tasks()
    print("ALL PASS")

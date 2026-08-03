"""Срез тренера: свои клиенты, своя строка в /staff/, свои залы и отметка прихода.
Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_role_scope
"""
import asyncio
import warnings
from datetime import date, datetime, time, timedelta

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker, engine
from dependencies import StudioContext
from models import Client, Hall, Lesson, Reservation, Studio, StudioMember, User
from routers.clients.profiles import get_client, get_clients_count, list_clients
from routers.schedule.halls import list_halls
from routers.schedule.reservations import attend_reservation
from routers.staff.profiles import list_staff


async def _seed() -> dict:
    async with async_session_maker() as db:
        s = Studio(name="TEST-ROLE-SCOPE"); db.add(s); await db.flush()
        sid = s.id

        a = User(email="scope-trainer-a@x.com", hashed_password="x", name="Anna")
        b = User(email="scope-trainer-b@x.com", hashed_password="x", name="Boris")
        db.add_all([a, b]); await db.flush()
        db.add_all([
            StudioMember(studio_id=sid, user_id=a.id, role="trainer", name="Anna"),
            StudioMember(studio_id=sid, user_id=b.id, role="trainer", name="Boris"),
        ])

        mine = Client(studio_id=sid, name="Mine")        # был на занятии A
        other = Client(studio_id=sid, name="Other")      # был только у B
        never = Client(studio_id=sid, name="Never")      # ни на одном занятии
        db.add_all([mine, other, never]); await db.flush()

        # Зал A ведёт только тренер A, зал B — только тренер B, зал C пустует.
        hall_a = Hall(studio_id=sid, name="Zal A", capacity=10)
        hall_b = Hall(studio_id=sid, name="Zal B", capacity=10)
        hall_c = Hall(studio_id=sid, name="Zal C", capacity=10)
        db.add_all([hall_a, hall_b, hall_c]); await db.flush()

        def _lesson(teacher_id, name, hall_id):
            return Lesson(
                studio_id=sid, name=name, teacher_name=name, teacher_id=teacher_id, hall_id=hall_id,
                start_time=datetime.combine(date.today() - timedelta(days=2), time(10, 0)),
                duration_min=60, price=1000, level="all", equipment="mat",
                total_spots=10, status="confirmed",
            )

        la, lb = _lesson(a.id, "A", hall_a.id), _lesson(b.id, "B", hall_b.id)
        db.add_all([la, lb]); await db.flush()
        res_mine = Reservation(client_id=mine.id, lesson_id=la.id, spot_number=1, status="active")
        res_other = Reservation(client_id=other.id, lesson_id=lb.id, spot_number=1, status="attended")
        db.add_all([res_mine, res_other]); await db.flush()
        await db.commit()
        return {"sid": sid, "uid_a": a.id, "uid_b": b.id,
                "mine": mine.id, "other": other.id, "never": never.id,
                "hall_a": hall_a.id, "hall_b": hall_b.id, "hall_c": hall_c.id,
                "res_mine": res_mine.id, "res_other": res_other.id}


async def _cleanup(ids: dict) -> None:
    sid = ids["sid"]
    async with async_session_maker() as db:
        lids = (await db.execute(select(Lesson.id).where(Lesson.studio_id == sid))).scalars().all()
        if lids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id == sid))
        await db.execute(delete(Hall).where(Hall.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.execute(delete(User).where(User.id.in_([ids["uid_a"], ids["uid_b"]])))
        await db.commit()


async def _run():
    ids = await _seed()
    try:
        async with async_session_maker() as db:
            a_user = (await db.execute(select(User).where(User.id == ids["uid_a"]))).scalar_one()
            trainer = StudioContext(user=a_user, studio_id=ids["sid"], role="trainer")
            admin = StudioContext(user=a_user, studio_id=ids["sid"], role="admin")

            page = await list_clients(
                ctx=trainer, current_user=a_user, db=db,
                search=None, status=None, category=None, tag=None, offset=0, limit=40,
            )
            assert [c.id for c in page.items] == [ids["mine"]], page.items
            assert page.total == 1, page.total

            # Бейдж меню — по тому же срезу, что и список.
            assert (await get_clients_count(ctx=trainer, current_user=a_user, db=db)).count == 1

            got = await get_client(client_id=ids["mine"], ctx=trainer, current_user=a_user, db=db)
            assert got.id == ids["mine"], got

            # Чужой и «ничейный» клиент — 404, а не 403: 403 подтвердил бы,
            # что такой клиент в студии существует.
            for hidden in (ids["other"], ids["never"]):
                try:
                    await get_client(client_id=hidden, ctx=trainer, current_user=a_user, db=db)
                    raise AssertionError(f"тренер достал чужого клиента {hidden}")
                except HTTPException as e:
                    assert e.status_code == 404, e.status_code

            # Администратору сужение не применяется.
            assert (await get_clients_count(ctx=admin, current_user=a_user, db=db)).count == 3

            # /staff/: тренеру — только он сам, админу — вся команда.
            staff_t = await list_staff(ctx=trainer, db=db, offset=0, limit=40)
            assert [i["id"] for i in staff_t["staff"]["items"]] == [ids["uid_a"]], staff_t
            assert staff_t["summary"]["total"] == 1, staff_t["summary"]

            staff_a = await list_staff(ctx=admin, db=db, offset=0, limit=40)
            assert {i["id"] for i in staff_a["staff"]["items"]} == {ids["uid_a"], ids["uid_b"]}, staff_a

            # Залы: тренеру — только те, где он ведёт; админу — все три.
            halls_t = await list_halls(ctx=trainer, db=db)
            assert [h.id for h in halls_t] == [ids["hall_a"]], [h.name for h in halls_t]
            halls_a = await list_halls(ctx=admin, db=db)
            assert {h.id for h in halls_a} == {ids["hall_a"], ids["hall_b"], ids["hall_c"]}, halls_a

            # Отметка прихода: на своём занятии тренеру можно...
            marked = await attend_reservation(reservation_id=ids["res_mine"], ctx=trainer, db=db)
            assert marked.status == "attended", marked
            # ...на чужом — 403 (get_scoped_lesson).
            try:
                await attend_reservation(reservation_id=ids["res_other"], ctx=trainer, db=db)
                raise AssertionError("тренер отметил приход на чужом занятии")
            except HTTPException as e:
                assert e.status_code == 403, e.status_code
    finally:
        await _cleanup(ids)
        await engine.dispose()


def test_role_scope():
    asyncio.run(_run())


if __name__ == "__main__":
    test_role_scope()
    print("OK")

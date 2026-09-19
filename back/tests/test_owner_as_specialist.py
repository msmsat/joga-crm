"""Кто в студии мастер: `services/members.is_specialist_clause`.

Владелец остаётся владельцем, а мастером его делает НАЗНАЧЕННАЯ УСЛУГА —
второй роли и второго членства для этого нет. На этом правиле держатся
колонки журнала, проверка «кому можно поставить занятие», каталог ассистента
и Resource-доступность витрины, поэтому проверяется оно здесь, в SQL, а не в
каждом из них по отдельности.

Реальная БД, ручная чистка — образец: tests/test_analytics_team.py.
Запуск из back/:  python -m tests.test_owner_as_specialist
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker, engine
from models import Service, Studio, StudioMember, User
from services.members import is_specialist, is_specialist_clause

EMAILS = (
    "owner-specialist-test@x.com",
    "trainer-specialist-test@x.com",
    "admin-specialist-test@x.com",
)


async def _seed() -> tuple[int, int, dict[str, int]]:
    """Студия с тремя ролями плюс ЧУЖАЯ студия со своей услугой."""
    async with async_session_maker() as db:
        studio = Studio(name="TEST-SPECIALIST"); db.add(studio)
        other = Studio(name="TEST-SPECIALIST-OTHER"); db.add(other)
        await db.flush()

        ids: dict[str, int] = {}
        for role, email in zip(("owner", "trainer", "admin"), EMAILS):
            user = User(email=email, hashed_password="x", name=role.capitalize())
            db.add(user); await db.flush()
            ids[role] = user.id
            db.add(StudioMember(studio_id=studio.id, user_id=user.id, role=role,
                                status="active", name=role.capitalize()))

        db.add(Service(studio_id=studio.id, name="Стрижка", price=1000, duration_min=60))
        db.add(Service(studio_id=other.id, name="Чужая услуга", price=1000, duration_min=60))
        await db.commit()
        return studio.id, other.id, ids


async def _cleanup(sid: int, other_id: int, ids: dict[str, int]) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Studio).where(Studio.id.in_([sid, other_id])))
        await db.execute(delete(User).where(User.id.in_(list(ids.values()))))
        await db.commit()


async def _link(user_id: int, service_studio_id: int) -> None:
    """Назначить человеку услугу из указанной студии — так это делает
    PUT /staff/{id} (`_apply_studio_services`)."""
    async with async_session_maker() as db:
        user = (await db.execute(
            select(User).where(User.id == user_id)
        )).scalars().one()
        await db.refresh(user, ["services"])
        service = (await db.execute(
            select(Service).where(Service.studio_id == service_studio_id)
        )).scalars().first()
        user.services.append(service)
        await db.commit()


async def _specialists(sid: int) -> set[int]:
    """user_id всех мастеров студии — тем же предикатом, что и продукт."""
    async with async_session_maker() as db:
        return set((await db.execute(
            select(StudioMember.user_id).where(
                StudioMember.studio_id == sid, is_specialist_clause(sid))
        )).scalars().all())


async def _run() -> None:
    sid, other_id, ids = await _seed()
    try:
        # 1. Без услуг мастер только тренер: обычная студия ничего не замечает.
        assert await _specialists(sid) == {ids["trainer"]}, "мастер до услуг — только тренер"

        # 2. Услуга ЧУЖОЙ студии владельца мастером не делает: услуги скоупятся
        #    по studio_id, иначе работа в другой студии протекала бы сюда.
        await _link(ids["owner"], other_id)
        assert await _specialists(sid) == {ids["trainer"]}, "чужая услуга не делает мастером"

        # 3. Услуга СВОЕЙ студии — делает, роль при этом остаётся owner.
        await _link(ids["owner"], sid)
        assert await _specialists(sid) == {ids["trainer"], ids["owner"]}, "владелец с услугой — мастер"
        async with async_session_maker() as db:
            role = (await db.execute(select(StudioMember.role).where(
                StudioMember.studio_id == sid, StudioMember.user_id == ids["owner"]))).scalar_one()
            assert role == "owner", role
            # Тот же вопрос про одного человека — ответ обязан совпадать.
            assert await is_specialist(db, sid, ids["owner"]) is True
            assert await is_specialist(db, sid, ids["admin"]) is False
            # Не член студии — не мастер, а не ошибка.
            assert await is_specialist(db, sid, 0) is False

        # 4. Администратору услуга мастерства не даёт: в сетке он не стоит.
        await _link(ids["admin"], sid)
        assert await _specialists(sid) == {ids["trainer"], ids["owner"]}, "админ мастером не становится"
    finally:
        await _cleanup(sid, other_id, ids)
        # Пул asyncpg привязан к текущему event loop — см. tests/test_analytics_team.py.
        await engine.dispose()


def test_owner_with_services_is_specialist():
    asyncio.run(_run())


if __name__ == "__main__":
    test_owner_with_services_is_specialist()
    print("ALL PASS — мастер = тренер или владелец с услугами своей студии")

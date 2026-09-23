"""Категория услуги — свободная строка самой студии, а не отрасль из списка.

Справочника категорий нет: набор складывается из самих услуг, поэтому
«Стрижка» и «стрижка» разошлись бы на две группы Каталога и два разреза
Отчётов. Форма подставляет существующую строку сама, но ассистент и импорт
пишут в эндпоинт напрямую — правило живёт на сервере.

Run via pytest so database.py selects the dedicated test database.
"""
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from database import engine
from dependencies import StudioContext
from models import Studio, User
from routers.studio.services import create_service, update_service
from schemas.studio import ServiceCreate, ServiceUpdate


async def _context(db: AsyncSession) -> StudioContext:
    studio = Studio(name=f"Barbershop {uuid4().hex[:8]}", timezone="UTC+0", currency="EUR")
    db.add(studio)
    await db.flush()
    owner = User(
        email=f"owner-{uuid4().hex}@example.com",
        hashed_password="unused", name="Owner", is_onboarded=True,
    )
    db.add(owner)
    await db.flush()
    return StudioContext(user=owner, studio_id=studio.id, role="owner")


async def _add(ctx: StudioContext, db: AsyncSession, name: str, category=None):
    return await create_service(ServiceCreate(name=name, price=500, category=category), ctx, db)


async def test_category_keeps_the_spelling_the_studio_already_uses():
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            async with AsyncSession(
                bind=connection, expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            ) as db:
                ctx = await _context(db)

                first = await _add(ctx, db, "Мужская стрижка", "Стрижка")
                assert first.category == "Стрижка"

                # Другой регистр и лишние пробелы — та же категория.
                second = await _add(ctx, db, "Детская стрижка", "  стрижка ")
                assert second.category == "Стрижка"

                # Своё направление студии заводится как написано.
                beard = await _add(ctx, db, "Коррекция бороды", "Уход за бородой")
                assert beard.category == "Уход за бородой"

                # Пустая строка — это «без категории», а не категория из пробелов.
                blank = await _add(ctx, db, "Камуфляж седины", "   ")
                assert blank.category is None

                # Правка услуги подчиняется тому же правилу.
                moved = await update_service(
                    blank.id, ServiceUpdate(category="СТРИЖКА"), ctx, db,
                )
                assert moved.category == "Стрижка"

                # Категория другой студии на чужое написание не влияет.
                other = await _context(db)
                theirs = await _add(other, db, "Йога для начинающих", "стрижка")
                assert theirs.category == "стрижка"
        finally:
            await transaction.rollback()

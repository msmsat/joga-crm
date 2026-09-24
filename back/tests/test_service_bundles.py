"""Комплексы услуг: «Стрижка + борода» за один визит одной записью.

Комплекс — обычная услуга со своим составом (services/service_bundles.py).
Проверяются правила вокруг состава — именно их не видят ни типы, ни сборка:
годная часть, автоназначение мастеров, честная зачёркнутая сумма и запрет
оставить комплекс с дырой в составе.

Run via pytest so database.py selects the dedicated test database.
"""
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import engine
from dependencies import StudioContext
from models import Studio, StudioMember, User, user_services
from routers.studio.services import create_service, delete_service, list_services, update_service
from schemas.studio import ServiceCreate, ServiceUpdate


async def _context(db: AsyncSession) -> StudioContext:
    studio = Studio(name=f"Barbershop {uuid4().hex[:8]}", timezone="UTC+0", currency="EUR")
    db.add(studio)
    await db.flush()
    return StudioContext(user=None, studio_id=studio.id, role="owner")


async def _master(db: AsyncSession, ctx: StudioContext, name: str, service_ids: list[int]) -> int:
    user = User(email=f"{name}-{uuid4().hex}@example.com", hashed_password="unused", name=name)
    db.add(user)
    await db.flush()
    db.add(StudioMember(user_id=user.id, studio_id=ctx.studio_id, role="trainer",
                        status="active", name=name))
    for service_id in service_ids:
        await db.execute(insert(user_services).values(user_id=user.id, service_id=service_id))
    await db.flush()
    return user.id


async def _service(ctx, db, name, price, duration=30, service_type="individual"):
    return await create_service(ServiceCreate(
        name=name, price=price, duration_min=duration, service_type=service_type,
    ), ctx, db)


async def _bundle(ctx, db, parts, price, name="Стрижка + борода"):
    return await create_service(ServiceCreate(
        name=name, price=price, duration_min=75, bundle_service_ids=parts,
    ), ctx, db)


def _code(exc: pytest.ExceptionInfo) -> str:
    return exc.value.detail["code"]


async def _in_rollback(scenario):
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            async with AsyncSession(
                bind=connection, expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            ) as db:
                await scenario(db)
        finally:
            await transaction.rollback()


async def test_bundle_is_a_service_with_its_parts_in_order():
    async def scenario(db):
        ctx = await _context(db)
        haircut = await _service(ctx, db, "Стрижка", 1200, 45)
        beard = await _service(ctx, db, "Борода", 600, 30)

        # Порядок — порядок выполнения, а не id и не алфавит.
        bundle = await _bundle(ctx, db, [beard.id, haircut.id], 1500)
        assert [p.service_id for p in bundle.bundle_items] == [beard.id, haircut.id]
        assert [p.name for p in bundle.bundle_items] == ["Борода", "Стрижка"]
        assert bundle.service_type == "individual"
        # По отдельности 1800 > 1500 — клиент видит выгоду.
        assert bundle.bundle_full_price == 1800

        catalog = {s.id: s for s in await list_services(ctx, db)}
        assert [b.id for b in catalog[haircut.id].in_bundles] == [bundle.id]
        assert catalog[bundle.id].in_bundles == []
        assert catalog[haircut.id].bundle_items == []

        # Комплекс дороже частей — зачёркивать нечего, выгоду не обещаем.
        pricey = await _bundle(ctx, db, [haircut.id, beard.id], 2000, name="VIP")
        assert pricey.bundle_full_price is None
    await _in_rollback(scenario)


async def test_parts_must_be_individual_services_of_this_studio():
    async def scenario(db):
        ctx = await _context(db)
        haircut = await _service(ctx, db, "Стрижка", 1200)
        beard = await _service(ctx, db, "Борода", 600)
        yoga = await _service(ctx, db, "Йога", 500, service_type="group")

        with pytest.raises(HTTPException) as one:
            await _bundle(ctx, db, [haircut.id], 1000)
        assert _code(one) == "catalog.bundle_size"

        with pytest.raises(HTTPException) as twice:
            await _bundle(ctx, db, [haircut.id, haircut.id], 1000)
        assert _code(twice) == "catalog.bundle_part_invalid"

        with pytest.raises(HTTPException) as group:
            await _bundle(ctx, db, [haircut.id, yoga.id], 1000)
        assert _code(group) == "catalog.bundle_part_invalid"

        bundle = await _bundle(ctx, db, [haircut.id, beard.id], 1500)
        with pytest.raises(HTTPException) as nested:
            await _bundle(ctx, db, [bundle.id, beard.id], 1800, name="Матрёшка")
        assert _code(nested) == "catalog.bundle_part_invalid"

        other = await _context(db)
        theirs = await _service(other, db, "Чужая стрижка", 900)
        with pytest.raises(HTTPException) as foreign:
            await _bundle(ctx, db, [haircut.id, theirs.id], 1500, name="Чужой")
        assert _code(foreign) == "catalog.bundle_part_invalid"
    await _in_rollback(scenario)


async def test_bundle_goes_to_masters_who_do_every_part():
    async def scenario(db):
        ctx = await _context(db)
        haircut = await _service(ctx, db, "Стрижка", 1200)
        beard = await _service(ctx, db, "Борода", 600)
        anna = await _master(db, ctx, "Anna", [haircut.id, beard.id])
        await _master(db, ctx, "Boris", [haircut.id])

        bundle = await _bundle(ctx, db, [haircut.id, beard.id], 1500)
        # Весь комплекс ведёт один мастер — годится только тот, кто умеет всё.
        assert [m.user_id for m in bundle.masters] == [anna]
        # Цена мастера не выставлена — он берёт цену комплекса.
        assert bundle.masters[0].price == 1500
    await _in_rollback(scenario)


async def test_a_part_cannot_leave_its_bundle_silently():
    async def scenario(db):
        ctx = await _context(db)
        haircut = await _service(ctx, db, "Стрижка", 1200)
        beard = await _service(ctx, db, "Борода", 600)
        wash = await _service(ctx, db, "Мытьё головы", 300)
        bundle = await _bundle(ctx, db, [haircut.id, beard.id], 1500)

        with pytest.raises(HTTPException) as removed:
            await delete_service(service_id=beard.id, ctx=ctx, db=db)
        assert removed.value.status_code == 409
        assert _code(removed) == "catalog.service_in_bundle"

        with pytest.raises(HTTPException) as grouped:
            await update_service(beard.id, ServiceUpdate(service_type="group"), ctx, db)
        assert _code(grouped) == "catalog.service_in_bundle"

        # Обычную услугу комплексом не делаем — только новым комплексом.
        with pytest.raises(HTTPException) as converted:
            await update_service(wash.id, ServiceUpdate(bundle_service_ids=[haircut.id, beard.id]), ctx, db)
        assert _code(converted) == "catalog.not_a_bundle"

        # Сменили состав — борода больше не часть и удаляется.
        changed = await update_service(bundle.id, ServiceUpdate(bundle_service_ids=[wash.id, haircut.id]), ctx, db)
        assert [p.service_id for p in changed.bundle_items] == [wash.id, haircut.id]
        await delete_service(service_id=beard.id, ctx=ctx, db=db)

        # Удалили комплекс — его части свободны.
        await delete_service(service_id=bundle.id, ctx=ctx, db=db)
        await delete_service(service_id=wash.id, ctx=ctx, db=db)
    await _in_rollback(scenario)


async def test_inactive_and_admin_members_are_not_automatically_assigned():
    async def scenario(db):
        ctx = await _context(db)
        a = await _service(ctx, db, "A", 100)
        b = await _service(ctx, db, "B", 100)
        inactive = await _master(db, ctx, "Inactive", [a.id, b.id])
        admin = await _master(db, ctx, "Admin", [a.id, b.id])
        owner = await _master(db, ctx, "Owner", [a.id, b.id])
        await db.execute(update(StudioMember).where(StudioMember.user_id == inactive).values(status="inactive"))
        await db.execute(update(StudioMember).where(StudioMember.user_id == admin).values(role="admin"))
        await db.execute(update(StudioMember).where(StudioMember.user_id == owner).values(role="owner"))
        bundle = await _bundle(ctx, db, [a.id, b.id], 150)
        ids = (await db.execute(select(user_services.c.user_id).where(user_services.c.service_id == bundle.id))).scalars().all()
        assert ids == [owner]
        assert bundle.max_clients == 1
    await _in_rollback(scenario)


async def test_parts_change_preserves_custom_prices_and_bumps_booking_version():
    async def scenario(db):
        ctx = await _context(db)
        a = await _service(ctx, db, "A", 100)
        b = await _service(ctx, db, "B", 200)
        c = await _service(ctx, db, "C", 300)
        master = await _master(db, ctx, "Master", [a.id, b.id, c.id])
        bundle = await _bundle(ctx, db, [a.id, b.id], 250)
        await db.execute(update(user_services).where(user_services.c.service_id == bundle.id).values(price=240))
        studio = await db.get(Studio, ctx.studio_id)
        version = studio.booking_config_version
        edited = await update_service(bundle.id, ServiceUpdate(bundle_service_ids=[c.id, a.id]), ctx, db)
        assert [p.service_id for p in edited.bundle_items] == [c.id, a.id]
        assert edited.price == 250 and edited.duration_min == 75
        assert [(m.user_id, m.price) for m in edited.masters] == [(master, 240)]
        assert studio.booking_config_version == version + 1
        await update_service(bundle.id, ServiceUpdate(bundle_service_ids=[c.id, a.id]), ctx, db)
        assert studio.booking_config_version == version + 1
    await _in_rollback(scenario)


async def test_changing_part_price_never_reprices_the_bundle():
    async def scenario(db):
        ctx = await _context(db)
        a = await _service(ctx, db, "A", 100)
        b = await _service(ctx, db, "B", 200)
        bundle = await _bundle(ctx, db, [a.id, b.id], 250)
        await update_service(a.id, ServiceUpdate(price=500), ctx, db)
        catalog = {s.id: s for s in await list_services(ctx, db)}
        assert catalog[bundle.id].price == 250
        assert catalog[bundle.id].bundle_full_price == 700
    await _in_rollback(scenario)


async def test_bundle_cannot_be_cleared_nested_or_changed_to_group():
    async def scenario(db):
        ctx = await _context(db)
        a = await _service(ctx, db, "A", 100)
        b = await _service(ctx, db, "B", 200)
        bundle = await _bundle(ctx, db, [a.id, b.id], 250)
        for change in (ServiceUpdate(bundle_service_ids=[]), ServiceUpdate(bundle_service_ids=[bundle.id, a.id]), ServiceUpdate(service_type="group")):
            with pytest.raises(HTTPException) as exc:
                await update_service(bundle.id, change, ctx, db)
            assert exc.value.status_code == 422
        # Explicit null format cannot erase its identity as an individual visit.
        changed = await update_service(bundle.id, ServiceUpdate(service_type=None, max_clients=20), ctx, db)
        assert changed.service_type == "individual" and changed.max_clients == 1
    await _in_rollback(scenario)


def test_no_savings_claim_when_any_bundle_price_is_higher():
    from services.service_bundles import full_price
    from services.service_pricing import PriceRange
    spans = {1: PriceRange(100, 300), 2: PriceRange(200, 400)}
    assert full_price([1, 2], spans, PriceRange(200, 350)) is None
    assert full_price([1, 2], spans, PriceRange(200, 300)) is None
    assert full_price([1, 2], spans, PriceRange(200, 250)) == 300


@pytest.mark.parametrize("payload", [{"price": -1}, {"duration_min": 0}, {"price": None}, {"duration_min": None}, {"name": None}])
def test_invalid_values_are_rejected_before_a_database_write(payload):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ServiceUpdate(**payload)

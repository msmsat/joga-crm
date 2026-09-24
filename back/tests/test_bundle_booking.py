"""A bundle occupies one specialist for its own duration, with one booking."""
import pytest
from sqlalchemy import insert

import test_resource_booking as booking_fixture
from database import async_session_maker
from dependencies import StudioContext
from models import Lesson, Service, user_services
from routers.studio.services import create_service
from schemas.schedule import hybrid
from schemas.studio import ServiceCreate


async def test_bundle_books_one_interval_and_keeps_ordered_parts(monkeypatch):
    monkeypatch.setattr(hybrid, 'AVAILABLE_BOOKING_MODES', frozenset({'event', 'resource', 'hybrid'}))
    ids = await booking_fixture.seed()
    try:
        async with async_session_maker() as db:
            part = Service(studio_id=ids['studio'], name='Beard', price=0, duration_min=30,
                           service_type='individual', booking_mode='resource')
            db.add(part)
            await db.flush()
            await db.execute(insert(user_services).values(user_id=ids['teacher'], service_id=part.id))
            bundle = await create_service(ServiceCreate(name='Haircut + Beard', price=0,
                duration_min=65, booking_mode='resource', bundle_service_ids=[ids['service'], part.id]),
                StudioContext(user=None, studio_id=ids['studio'], role='owner'), db)
            assert [p.name for p in bundle.bundle_items] == ['Haircut', 'Beard']
            assert [m.user_id for m in bundle.masters] == [ids['teacher']]
            ids['service'] = bundle.id
        quote_id = await booking_fixture.quote(ids)
        result = await booking_fixture.confirm(ids, quote_id)
        assert result['booking_mode'] == 'resource'
        assert result['status'] == 'active'
        assert await booking_fixture.confirm(ids, quote_id) == result
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, result['lesson_id'])
            assert lesson.service_id == bundle.id
            assert lesson.teacher_id == ids['teacher']
            assert lesson.duration_min == 65
            assert lesson.total_spots == 1
    finally:
        await booking_fixture.cleanup(ids)

"""Creation and lookup against the isolated TEST_DATABASE_URL configured by pytest."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from sqlalchemy import delete, select

from database import async_session_maker
from models import Client, Studio, StudioBillingPlan, User
from routers.clients import profiles
from schemas.clients.clients import ClientCreate
from services.client_search import client_search_condition


async def test_name_only_clients_persist_with_distinct_ids(monkeypatch):
    monkeypatch.setattr(profiles, 'notify', AsyncMock())
    sid = uid = None
    try:
        async with async_session_maker() as db:
            studio = Studio(name='TEST-NAME-ONLY', currency='EUR')
            owner = User(name='Test', email=f'{uuid4().hex}@example.com', hashed_password='test')
            db.add_all([studio, owner])
            await db.flush()
            sid, uid = studio.id, owner.id
            db.add(StudioBillingPlan(studio_id=sid, plan_name='pro'))
            await db.commit()
            ctx = SimpleNamespace(studio_id=sid)
            first = await profiles.create_client(ClientCreate(name='Я'), ctx=ctx, current_user=owner, db=db)
            second = await profiles.create_client(ClientCreate(name='Я'), ctx=ctx, current_user=owner, db=db)
            assert first.id != second.id

        # A fresh connection verifies committed rows, not the ORM identity map.
        async with async_session_maker() as db:
            clients = (await db.execute(select(Client).where(Client.studio_id == sid))).scalars().all()
            assert len(clients) == 2
            assert all(c.name == 'Я' and c.phone is None and c.email is None and c.city is None for c in clients)
            for query, expected in [('Я', {first.id, second.id}), (f'#{first.id}', {first.id})]:
                found = (await db.execute(select(Client.id).where(
                    Client.studio_id == sid, client_search_condition(query),
                ))).scalars().all()
                assert set(found) == expected
            other_studio = (await db.execute(select(Client.id).where(
                Client.studio_id == -1, client_search_condition(f'#{first.id}'),
            ))).scalars().all()
            assert other_studio == []
    finally:
        async with async_session_maker() as db:
            if sid is not None:
                await db.execute(delete(Studio).where(Studio.id == sid))
            if uid is not None:
                await db.execute(delete(User).where(User.id == uid))
            await db.commit()

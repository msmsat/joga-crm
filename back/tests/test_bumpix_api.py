"""Real FastAPI routes with fake authentication context and isolated SQLite only."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from sqlalchemy import select
import test_bumpix_import as fixtures


class ApiTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.ImportTests.asyncSetUp
    asyncTearDown = fixtures.ImportTests.asyncTearDown
    export = fixtures.ImportTests.export
    apply = fixtures.ImportTests.apply

    async def build(self):
        fake_database = types.ModuleType('database')
        async def get_db():
            async with self.sessions() as db:
                yield db
        fake_database.get_db = get_db
        fake_security = types.ModuleType('security')
        fake_security.ALGORITHM = 'HS256'
        fake_security.SECRET_KEY = 'fictional-test-secret'
        with patch.dict(sys.modules, {'database': fake_database, 'security': fake_security}):
            import dependencies
            spec = importlib.util.spec_from_file_location('bumpix_test_router', Path(__file__).parents[1] / 'routers/clients/bumpix.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        app = FastAPI()
        app.include_router(module.router, prefix='/clients')
        self.ctx = dependencies.StudioContext(user=types.SimpleNamespace(id=1), studio_id=1, role='owner')
        async def context():
            return self.ctx
        app.dependency_overrides[dependencies.get_studio_context] = context
        self.http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        self.addAsyncCleanup(self.http.aclose)
        with self.export() as export:
            await self.apply(export, {'masters': {'1.1': 2}})
        async with self.sessions() as db:
            self.cid = await db.scalar(select(self.models[0].id))
        self.url = f'/clients/{self.cid}/bumpix'

    async def test_real_routes_return_statuses_notes_and_protected_photo_bytes(self):
        await self.build()
        response = await self.http.get(self.url)
        self.assertEqual(response.status_code, 200)
        profile = response.json()[0]
        self.assertEqual(profile['profile']['comment'], 'Profile note')
        self.assertEqual(profile['counts']['all'], 3)
        self.assertEqual(profile['lookups']['masters'][0]['2'], 'Fictional specialist')
        self.assertNotIn('media', profile['profile'])
        page = (await self.http.get(self.url + '/events?status=new')).json()
        self.assertEqual(page['total'], 1)
        photo = page['items'][0]['photos'][0]
        self.assertNotIn('media', page['items'][0]['details'])
        with patch.dict('os.environ', {'BUMPIX_STORAGE_ROOT': str(self.root / 'uploads')}):
            response = await self.http.get(photo['url'])
            self.assertEqual(response.status_code, 200)
            import hashlib
            self.assertEqual(hashlib.sha256(response.content).hexdigest(), photo['sha256'])
            self.assertEqual(response.headers['cache-control'], 'private, no-store')
        self.assertEqual((await self.http.get(self.url + '/events?limit=201')).status_code, 422)
        self.assertEqual((await self.http.get(self.url + '/events?status=invalid')).status_code, 422)

    async def test_other_studio_or_nonstaff_cannot_access_profile_events_or_photos(self):
        await self.build()
        profile = (await self.http.get(self.url)).json()[0]
        self.ctx.studio_id = 2
        for url in (self.url, self.url + '/events', profile['avatar']['url']):
            self.assertEqual((await self.http.get(url)).status_code, 404)
        self.ctx.studio_id, self.ctx.role = 1, 'client'
        self.assertEqual((await self.http.get(self.url)).status_code, 403)

    async def test_trainer_cannot_read_another_masters_event_or_photo(self):
        await self.build()
        page = (await self.http.get(self.url + '/events')).json()
        photographed = next(item for item in page['items'] if item['photos'])
        other_event = photographed['id']
        async with self.sessions.begin() as db:
            (await db.get(self.models[3], other_event)).teacher_user_id = 1
        self.ctx.role, self.ctx.user.id = 'trainer', 2
        page = (await self.http.get(self.url + '/events')).json()
        self.assertEqual(page['total'], 2)
        self.assertNotIn(other_event, [i['id'] for i in page['items']])
        self.assertEqual((await self.http.get(photographed['photos'][0]['url'])).status_code, 404)


if __name__ == '__main__':
    unittest.main()

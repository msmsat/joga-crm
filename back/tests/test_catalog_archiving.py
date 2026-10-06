"""Archiving hides catalogue entries; all journal/finance service IDs survive."""
import json
from datetime import datetime, date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from sqlalchemy import select, update
import models as m
from stretch_support import StretchCase


class CatalogueArchiveTests(StretchCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda c: m.Base.metadata.create_all(c, tables=[
                m.ServiceBundleItem.__table__, m.BookingChannelConfig.__table__, m.OnlineChannel.__table__,
            ]))
        self.keep = json.loads((Path(__file__).parents[1]/'scripts/melita_catalog_keep.json').read_text(encoding='utf-8'))
        async with self.sessions.begin() as db:
            db.add(m.Studio(id=15,name='Sugar Melita',currency='CZK',tz_iana='Europe/Prague'))
            db.add_all([m.User(id=42,name='Melita',email='mhabor500@gmail.com',hashed_password='test'),
                        m.User(id=43,name='Анастасія',email='trainer@example.com',hashed_password='test')])
            await db.flush()
            db.add_all([m.StudioMember(studio_id=15,user_id=42,name='Melita',role='owner',status='active'),
                        m.StudioMember(studio_id=15,user_id=43,name='Анастасія',role='trainer',status='active')])
            for card in self.keep:
                db.add(m.Service(id=card['id'],studio_id=15,name=card['name'],category=card['category'],
                    price=card['price'],duration_min=card['duration_min'],service_type='individual',max_clients=1))
            for sid in range(152,357):
                db.add(m.Service(id=sid,studio_id=15,name=f'Історична {sid}',price=777,duration_min=45))
            db.add(m.Service(id=500,studio_id=16,name='Чужа послуга',price=500,duration_min=60,is_bookable=False))
            await db.flush()
            for card in self.keep:
                for master in card['masters']:
                    await db.execute(m.user_services.insert().values(user_id=master['user_id'],service_id=card['id'],
                        price=master['price'],duration_min=master['duration_min']))
                for index, part in enumerate(card['parts']):
                    db.add(m.ServiceBundleItem(bundle_id=card['id'],service_id=part,position=index))
            branch = m.StudioBranch(studio_id=15,name='Студія')
            db.add(branch)
            await db.flush()
            lesson = m.Lesson(studio_id=15,branch_id=branch.id,name='Стара назва',teacher_id=42,teacher_name='Melita',service_id=152,
                start_time=datetime(2025,1,2,9),duration_min=45,price=777,total_spots=1,level='',equipment='',
                notes='Нотатка',photos=['/static/notes/photo.jpg'],booking_mode='resource',tz_iana='Europe/Prague')
            db.add(lesson)
            client = m.Client(studio_id=15,name='Клієнтка')
            db.add(client)
            await db.flush()
            db.add(m.Reservation(client_id=client.id,lesson_id=lesson.id,spot_number=1,status='attended'))
            db.add(m.Operation(studio_id=15,client_id=client.id,service_id=152,trainer_id=42,type='income',
                title='Готівка',amount=777,op_date=date(2025,1,2),category='Послуги',method='cash'))

    async def history(self):
        async with self.sessions() as db:
            found = {}
            for model in (m.Lesson,m.Reservation,m.Operation,m.Client):
                found[model.__tablename__] = [tuple(getattr(row,c.name) for c in model.__table__.columns)
                    for row in (await db.scalars(select(model).order_by(model.id))).all()]
            return found

    async def test_archive_is_a_durable_field(self):
        self.assertTrue(hasattr(m.Service,'is_archived'), 'Archive must retain services instead of deleting them')

    async def test_cleanup_preview_apply_repeat_and_history_links(self):
        from scripts.archive_melita_catalog import archive_catalog
        before = await self.history()
        preview = await archive_catalog(self.sessions,apply=False)
        self.assertEqual(preview['to_archive'],205)
        self.assertFalse(preview['complete'])
        async with self.sessions() as db:
            self.assertFalse((await db.get(m.Service,152)).is_archived)
        result = await archive_catalog(self.sessions,apply=True)
        self.assertEqual(result['archived'],205)
        self.assertTrue(result['complete'])
        self.assertEqual(before,await self.history())
        async with self.sessions() as db:
            from routers.studio.services import list_services,get_service
            cards = await list_services(ctx=SimpleNamespace(studio_id=15),db=db)
            self.assertEqual({c.id for c in cards},{r['id'] for r in self.keep})
            self.assertEqual((await get_service(152,ctx=SimpleNamespace(studio_id=15),db=db)).name,'Історична 152')
            self.assertEqual(len(await list_services(ctx=SimpleNamespace(studio_id=16),db=db)),1)
            self.assertEqual((await db.get(m.Service,152)).price,777)
            self.assertFalse((await db.get(m.Service,152)).is_bookable)
            self.assertEqual(await db.scalar(select(m.Lesson.service_id).where(m.Lesson.studio_id==15)),152)
        repeat = await archive_catalog(self.sessions,apply=True)
        self.assertEqual(repeat['archived'],0)
        self.assertEqual(before,await self.history())

    async def test_changed_keep_price_new_service_or_wrong_owner_stops_whole_batch(self):
        from scripts.archive_melita_catalog import archive_catalog
        async with self.sessions.begin() as db:
            service = await db.get(m.Service,36)
            service.price=1
        with self.assertRaises(ValueError):
            await archive_catalog(self.sessions,apply=True)
        async with self.sessions.begin() as db:
            self.assertFalse((await db.get(m.Service,152)).is_archived)
            (await db.get(m.Service,36)).price=850
            db.add(m.Service(id=501,studio_id=15,name='Нова',price=55,duration_min=30))
        with self.assertRaises(ValueError):
            await archive_catalog(self.sessions,apply=True)
        async with self.sessions.begin() as db:
            await db.delete(await db.get(m.Service,501))
            await db.execute(update(m.User).where(m.User.id==42).values(email='other@example.com'))
        with self.assertRaises(ValueError):
            await archive_catalog(self.sessions,apply=True)
        async with self.sessions() as db:
            self.assertFalse((await db.get(m.Service,152)).is_archived)

    async def test_archived_bundle_does_not_appear_on_active_part(self):
        async with self.sessions.begin() as db:
            (await db.get(m.Service,152)).is_archived=True
            db.add(m.ServiceBundleItem(bundle_id=152,service_id=36,position=0))
            db.add(m.ServiceBundleItem(bundle_id=152,service_id=37,position=1))
        async with self.sessions() as db:
            from routers.studio.services import list_services
            cards = await list_services(ctx=SimpleNamespace(studio_id=15),db=db)
            part = next(c for c in cards if c.id==36)
            self.assertNotIn(152,[b.id for b in part.in_bundles])

    async def test_client_catalogue_hides_archives_but_preserves_bundle_names(self):
        from scripts.archive_melita_catalog import archive_catalog
        from routers.booking.miniapp_studio import get_studio_catalog
        from ratelimit import limiter
        from starlette.requests import Request
        await archive_catalog(self.sessions,apply=True)
        request = Request({'type':'http','method':'GET','path':'/','headers':[],
                           'query_string':b'', 'client':('127.0.0.1',0)})
        async with self.sessions() as db:
            with patch.object(limiter,'enabled',False):
                catalog = await get_studio_catalog(request,SimpleNamespace(studio_id=15,client=None),db)
            self.assertEqual({s.id for s in catalog.services},{c['id'] for c in self.keep})
            self.assertEqual(next(s for s in catalog.services if s.id==53).bundle_parts,
                             ['Глибоке бікіні','Підмишки'])

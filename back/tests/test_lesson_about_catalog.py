"""«Подробнее» о занятии и мастере: что каталог мини-приложения отдаёт клиенту.

Карточка занятия раскрывается в тот же кадр, без похода в сеть, поэтому всё
нужное ей приходит каталогом студии (`/global/studio`): описание направления,
«О себе» мастера и средние оценки. Проверяется:

1. средняя — по направлению и по мастеру, отменённые брони не считаются,
   чужая студия в счёт не идёт;
2. меньше трёх оценок — средней нет (число оценок есть);
3. обе разбивки считаются ОДНИМ запросом, сколько бы ни было направлений;
4. каталог отдаёт описание и «О себе» без пробелов по краям, а тексты отзывов
   наружу не уходят: клиенты писали их «для тренера и студии».

Временная SQLite-база (StretchCase), рабочую не трогает. Запуск из back/:
    python -m pytest tests/test_lesson_about_catalog.py -q
"""
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import event
from starlette.requests import Request

import models as m
from services import catalog
from stretch_support import StretchCase

TRAINER = 50


class LessonAboutCatalogTests(StretchCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda c: m.Base.metadata.create_all(c, tables=[
                m.ServiceBundleItem.__table__, m.BookingChannelConfig.__table__, m.OnlineChannel.__table__,
            ]))
        async with self.sessions.begin() as db:
            db.add(m.User(id=TRAINER, name='Анна', email='anna-about@velora-test.com', hashed_password='x'))
            await db.flush()
            db.add_all([
                m.StudioMember(studio_id=17, user_id=TRAINER, name='Анна', last_name='Соколова',
                               role='trainer', status='active', department='Хатха',
                               photo_url='/static/staff/anna.jpg', bio='  Восемь лет практики.  '),
                # Тот же человек в другой студии — со своей подачей и своими оценками.
                m.StudioMember(studio_id=16, user_id=TRAINER, name='Анна', role='trainer',
                               status='active', bio='Другая студия'),
            ])
            back = m.Service(studio_id=17, name='Здорова спина', price=450, duration_min=60,
                             service_type='group', description='  Мягкая практика для спины.  ')
            stretch = m.Service(studio_id=17, name='Розтяжка', price=450, duration_min=60, service_type='group')
            foreign = m.Service(studio_id=16, name='Чужа', price=300, duration_min=60, service_type='group')
            db.add_all([back, stretch, foreign])
            await db.flush()
            self.back, self.stretch = back.id, stretch.id

            client = m.Client(studio_id=17, name='Клієнтка')
            other = m.Client(studio_id=16, name='Інша')
            db.add_all([client, other])
            await db.flush()

            start = datetime(2026, 9, 1, 9)
            plan = [
                # (студия, услуга, клиент, оценка, статус)
                (17, back.id, client.id, 5, 'attended'),
                (17, back.id, client.id, 4, 'attended'),
                (17, back.id, client.id, 4, 'attended'),
                (17, back.id, client.id, 1, 'cancelled'),   # отменённая — не в счёт
                (17, back.id, client.id, None, 'attended'),  # без оценки — не в счёт
                (17, stretch.id, client.id, 5, 'attended'),
                (17, stretch.id, client.id, 5, 'attended'),
                (16, foreign.id, other.id, 1, 'attended'),  # чужая студия
            ]
            for day, (studio_id, service_id, client_id, rating, status) in enumerate(plan):
                lesson = m.Lesson(
                    studio_id=studio_id, service_id=service_id, name='Заняття', teacher_id=TRAINER,
                    teacher_name='Анна', start_time=start + timedelta(days=day), duration_min=60,
                    price=450, total_spots=10, level='', equipment='', tz_iana='Europe/Prague')
                db.add(lesson)
                await db.flush()
                db.add(m.Reservation(client_id=client_id, lesson_id=lesson.id, spot_number=1,
                                     status=status, rating=rating, review_text='секрет для тренера'))

    async def test_ratings_respect_threshold_cancellations_and_studio(self):
        async with self.sessions() as db:
            rated = await catalog.ratings(db, 17)
            foreign = await catalog.ratings(db, 16)
        self.assertEqual(rated.by_service[self.back], catalog.Rating(4.3, 3))
        # Две оценки — средней нет, но счёт виден.
        self.assertEqual(rated.by_service[self.stretch], catalog.Rating(None, 2))
        self.assertEqual(rated.by_teacher[TRAINER], catalog.Rating(4.6, 5))
        # Единица из чужой студии осталась там.
        self.assertEqual(foreign.by_teacher[TRAINER], catalog.Rating(None, 1))

    async def test_ratings_are_one_query_for_the_whole_studio(self):
        async with self.sessions.begin() as db:
            for i in range(12):
                db.add(m.Service(studio_id=17, name=f'Напрям {i}', price=100, duration_min=60))
        statements: list[str] = []

        def count(conn, cursor, statement, *args):
            statements.append(statement)

        event.listen(self.engine.sync_engine, 'before_cursor_execute', count)
        try:
            async with self.sessions() as db:
                await catalog.ratings(db, 17)
        finally:
            event.remove(self.engine.sync_engine, 'before_cursor_execute', count)
        self.assertEqual(len(statements), 1, statements)

    async def test_client_catalog_carries_about_but_never_review_text(self):
        from ratelimit import limiter
        from routers.booking.miniapp_studio import get_studio_catalog

        request = Request({'type': 'http', 'method': 'GET', 'path': '/', 'headers': [],
                           'query_string': b'', 'client': ('127.0.0.1', 0)})
        async with self.sessions() as db:
            with patch.object(limiter, 'enabled', False):
                shown = await get_studio_catalog(request, SimpleNamespace(studio_id=17, client=None), db)

        back = next(s for s in shown.services if s.id == self.back)
        stretch = next(s for s in shown.services if s.id == self.stretch)
        self.assertEqual((back.description, back.rating_avg, back.rating_count),
                         ('Мягкая практика для спины.', 4.3, 3))
        self.assertEqual((stretch.description, stretch.rating_avg, stretch.rating_count), (None, None, 2))

        anna = next(s for s in shown.staff if s.id == TRAINER)
        self.assertEqual(anna.name, 'Анна Соколова')
        self.assertEqual(anna.bio, 'Восемь лет практики.')
        self.assertEqual(anna.department, 'Хатха')
        self.assertEqual(anna.photo_url, '/static/staff/anna.jpg')
        self.assertEqual((anna.rating_avg, anna.rating_count), (4.6, 5))

        self.assertNotIn('секрет', shown.model_dump_json())

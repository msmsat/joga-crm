"""Канонический каталог (P1.3): что существует, чьё оно и когда начинается.

Главное, что здесь проверяется, — три вещи, на которых стоит весь следующий
слой поиска:

  1. тождество даёт ИДЕНТИФИКАТОР, а не строка: у студии бывают две услуги
     «Стретчинг» и два тренера с одной подписью, и различить их можно только
     по id;
  2. чужая студия недостижима — существующий id ничего не открывает;
  3. каталог показывает ТО ЖЕ, что клиентское мини-приложение. Это сверяется
     не на глаз, а прогоном настоящей ручки витрины (§G, §M, golden).

Реальная БД: две студии создаются и удаляются целиком.

Запуск из back/:  python -m tests.test_catalog
"""
import asyncio
import importlib
import os
import time
import warnings
from datetime import date, datetime, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import delete, event, select

from database import async_session_maker, engine
from models import (
    Client, Hall, Lesson, Reservation, Service, Studio, StudioBookingSettings,
    StudioBranch, StudioMember, User,
)
from services import catalog

MA = importlib.import_module("routers.booking.miniapp")
ML = importlib.import_module("routers.booking.miniapp_lessons")

_TAG = "TEST-CATALOG"
# Дата в будущем и подальше от края суток: занятия должны попадать в свой
# местный день независимо от того, когда прогоняются тесты.
DAY = date(2027, 5, 12)


# ─── Стенд ───────────────────────────────────────────────────────────────────

async def _user(db, email: str) -> int:
    user = User(email=email, hashed_password="x", name="X")
    db.add(user)
    await db.flush()
    return user.id


async def _seed() -> dict:
    """Две студии. У A всё, чем каталог может подавиться: тёзки-услуги,
    тёзки-тренеры, два филиала, занятие без зала, занятие без тренера,
    отменённое занятие и занятие без снимка зоны."""
    stamp = f"{int(time.time())}-{os.getpid()}"
    ids: dict = {}
    async with async_session_maker() as db:
        a = Studio(name=f"{_TAG}-A", tz_iana="Europe/Prague", currency="CZK")
        b = Studio(name=f"{_TAG}-B", tz_iana="Europe/Prague", currency="CZK")
        db.add_all([a, b])
        await db.flush()
        ids["studio_a"], ids["studio_b"] = a.id, b.id
        db.add_all([StudioBookingSettings(studio_id=a.id),
                    StudioBookingSettings(studio_id=b.id)])

        # Два филиала студии A — одинаковой роли, разного города.
        vaclav = StudioBranch(studio_id=a.id, name="Вацлавская", city="Praha")
        karlin = StudioBranch(studio_id=a.id, name="Карлин", city="Praha")
        b_branch = StudioBranch(studio_id=b.id, name="Чужой филиал", city="Brno")
        db.add_all([vaclav, karlin, b_branch])
        await db.flush()
        ids["branch_vaclav"], ids["branch_karlin"] = vaclav.id, karlin.id
        ids["branch_foreign"] = b_branch.id

        hall_v = Hall(studio_id=a.id, branch_id=vaclav.id, name="Зал В", capacity=10)
        hall_k = Hall(studio_id=a.id, branch_id=karlin.id, name="Зал К", capacity=10)
        # Отключённый зал: у зала признак есть, и витрина его не смотрит.
        hall_off = Hall(studio_id=a.id, branch_id=karlin.id, name="Зал закрыт",
                        capacity=10, is_active=False)
        hall_b = Hall(studio_id=b.id, branch_id=b_branch.id, name="Чужой зал", capacity=10)
        db.add_all([hall_v, hall_k, hall_off, hall_b])
        await db.flush()
        ids["hall_v"], ids["hall_k"] = hall_v.id, hall_k.id
        ids["hall_off"], ids["hall_foreign"] = hall_off.id, hall_b.id

        # ДВЕ услуги с одинаковым названием — тождество даёт только id.
        s1 = Service(studio_id=a.id, name="Стретчинг", duration_min=60, price=500)
        s2 = Service(studio_id=a.id, name="Стретчинг", duration_min=90, price=700)
        s_b = Service(studio_id=b.id, name="Стретчинг", duration_min=60, price=500)
        db.add_all([s1, s2, s_b])
        await db.flush()
        ids["service_1"], ids["service_2"] = s1.id, s2.id
        ids["service_foreign"] = s_b.id

        # ДВА тренера с одинаковой подписью.
        t1 = await _user(db, f"cat-t1-{stamp}@test.local")
        t2 = await _user(db, f"cat-t2-{stamp}@test.local")
        t_b = await _user(db, f"cat-tb-{stamp}@test.local")
        db.add_all([
            StudioMember(user_id=t1, studio_id=a.id, role="trainer",
                         status="active", name="Анна", last_name="Новак"),
            StudioMember(user_id=t2, studio_id=a.id, role="trainer",
                         status="pending", name="Анна", last_name="Новак"),
            StudioMember(user_id=t_b, studio_id=b.id, role="trainer",
                         status="active", name="Чужой", last_name="Тренер"),
        ])
        ids["trainer_1"], ids["trainer_2"] = t1, t2
        ids["trainer_foreign"] = t_b
        ids["users"] = [t1, t2, t_b]
        await db.flush()

        def _lesson(**kw):
            base = dict(name="Стретчинг", teacher_name="Анна Новак", duration_min=60,
                        price=500, level="all", equipment="mat", total_spots=8,
                        status="confirmed", tz_iana="Europe/Prague")
            base.update(kw)
            return Lesson(**base)

        full = _lesson(studio_id=a.id, hall_id=hall_v.id, service_id=s1.id,
                       teacher_id=t1, start_time=datetime.combine(DAY, datetime.min.time()).replace(hour=10))
        karlin_lesson = _lesson(studio_id=a.id, hall_id=hall_k.id, service_id=s2.id,
                                teacher_id=t2, name="Стретчинг 90",
                                start_time=datetime.combine(DAY, datetime.min.time()).replace(hour=12))
        # Занятие в отключённом зале — витрина его показывает, значит и каталог.
        in_off_hall = _lesson(studio_id=a.id, hall_id=hall_off.id, service_id=s1.id,
                              teacher_id=t1, name="В закрытом зале",
                              start_time=datetime.combine(DAY, datetime.min.time()).replace(hour=13))
        homeless = _lesson(studio_id=a.id, hall_id=None, service_id=s1.id, teacher_id=t1,
                           name="Без зала",
                           start_time=datetime.combine(DAY, datetime.min.time()).replace(hour=14))
        # Наследие: ни услуги, ни тренера, ни снимка зоны.
        legacy = _lesson(studio_id=a.id, hall_id=hall_v.id, service_id=None, teacher_id=None,
                         name="Наследие", teacher_name="Кто-то", tz_iana=None,
                         start_time=datetime.combine(DAY, datetime.min.time()).replace(hour=15))
        cancelled = _lesson(studio_id=a.id, hall_id=hall_v.id, service_id=s1.id, teacher_id=t1,
                            name="Отменённое", status="cancelled",
                            start_time=datetime.combine(DAY, datetime.min.time()).replace(hour=16))
        # Поздний вечер: проверка, что занятие остаётся в СВОЁМ местном дне.
        late = _lesson(studio_id=a.id, hall_id=hall_v.id, service_id=s1.id, teacher_id=t1,
                       name="Поздний вечер",
                       start_time=datetime.combine(DAY, datetime.min.time()).replace(hour=23, minute=30))
        foreign = _lesson(studio_id=b.id, hall_id=hall_b.id, service_id=s_b.id, teacher_id=t_b,
                          name="Чужое занятие", teacher_name="Чужой Тренер",
                          start_time=datetime.combine(DAY, datetime.min.time()).replace(hour=10))
        db.add_all([full, karlin_lesson, in_off_hall, homeless, legacy, cancelled, late, foreign])
        await db.flush()
        ids.update(
            full=full.id, karlin=karlin_lesson.id, in_off_hall=in_off_hall.id,
            homeless=homeless.id, legacy=legacy.id, cancelled=cancelled.id,
            late=late.id, foreign=foreign.id,
        )

        client = Client(studio_id=a.id, name="Катя", is_active=True)
        db.add(client)
        await db.flush()
        ids["client"] = client.id
        # Два несоседних коврика: счёт свободных мест не должен зависеть от их
        # номеров (§N).
        db.add_all([
            Reservation(client_id=client.id, lesson_id=full.id, spot_number=3, status="active"),
            Reservation(client_id=client.id, lesson_id=full.id, spot_number=7, status="pending"),
            # Отменённая бронь места не держит.
            Reservation(client_id=client.id, lesson_id=full.id, spot_number=1, status="cancelled"),
        ])
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        studios = [ids["studio_a"], ids["studio_b"]]
        lesson_ids = (await db.execute(
            select(Lesson.id).where(Lesson.studio_id.in_(studios))
        )).scalars().all()
        if lesson_ids:
            await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(lesson_ids)))
        await db.execute(delete(Lesson).where(Lesson.studio_id.in_(studios)))
        await db.execute(delete(Client).where(Client.studio_id.in_(studios)))
        await db.execute(delete(Hall).where(Hall.studio_id.in_(studios)))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id.in_(studios)))
        await db.execute(delete(Service).where(Service.studio_id.in_(studios)))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id.in_(studios)))
        await db.execute(delete(StudioBookingSettings).where(
            StudioBookingSettings.studio_id.in_(studios)))
        await db.execute(delete(Studio).where(Studio.id.in_(studios)))
        await db.execute(delete(User).where(User.id.in_(ids["users"])))
        await db.commit()


def _query(ids, **kw) -> catalog.LessonQuery:
    return catalog.LessonQuery(studio_id=ids["studio_a"], date_from=DAY, date_to=DAY, **kw)


def _by_id(found) -> dict:
    return {f.lesson_id: f for f in found}


# ─── Проверки ────────────────────────────────────────────────────────────────

async def _checks(ids: dict) -> None:
    async with async_session_maker() as db:
        found = await catalog.lessons(db, _query(ids))
        got = _by_id(found)

        # ── A: обычное занятие описано целиком и правильно.
        one = got[ids["full"]]
        assert one.studio_id == ids["studio_a"]
        assert one.branch_id == ids["branch_vaclav"], one.branch_id
        assert one.hall_id == ids["hall_v"] and one.hall_name == "Зал В"
        assert one.service_id == ids["service_1"] and one.service_name == "Стретчинг"
        assert one.trainer_id == ids["trainer_1"] and one.trainer_name == "Анна Новак"
        assert one.local_start == datetime(DAY.year, DAY.month, DAY.day, 10, 0)
        assert one.duration_min == 60 and one.price == 500 and one.total_spots == 8
        assert one.branch_name == "Вацлавская"

        # ── B: чужая студия недостижима — ни списком, ни по id.
        assert ids["foreign"] not in got, "занятие чужой студии попало в каталог"
        assert await catalog.lesson(db, ids["studio_a"], ids["foreign"]) is None, \
            "чужое занятие нашлось по валидному id"
        assert await catalog.lesson(db, ids["studio_b"], ids["foreign"]) is not None
        b_side = await catalog.lessons(db, catalog.LessonQuery(
            studio_id=ids["studio_b"], date_from=DAY, date_to=DAY))
        assert [f.lesson_id for f in b_side] == [ids["foreign"]], b_side

        # ── C: фильтр по филиалу. Занятие без зала филиала не имеет и в выборку
        # по филиалу не попадает — это и значит «филиала нет».
        vaclav = await catalog.lessons(db, _query(ids, branch_ids=[ids["branch_vaclav"]]))
        assert {f.lesson_id for f in vaclav} == {ids["full"], ids["legacy"], ids["late"]}, \
            [f.lesson_id for f in vaclav]
        karlin = await catalog.lessons(db, _query(ids, branch_ids=[ids["branch_karlin"]]))
        assert {f.lesson_id for f in karlin} == {ids["karlin"], ids["in_off_hall"]}
        both = await catalog.lessons(db, _query(
            ids, branch_ids=[ids["branch_vaclav"], ids["branch_karlin"]]))
        assert len(both) == 5, len(both)

        # ── D / H4: две услуги с ОДНИМ названием — разные id и разные выборки.
        assert ids["service_1"] != ids["service_2"]
        s1 = await catalog.lessons(db, _query(ids, service_ids=[ids["service_1"]]))
        s2 = await catalog.lessons(db, _query(ids, service_ids=[ids["service_2"]]))
        assert {f.lesson_id for f in s2} == {ids["karlin"]}, [f.lesson_id for f in s2]
        assert ids["karlin"] not in {f.lesson_id for f in s1}
        catalogue = await catalog.services(db, ids["studio_a"])
        names = [s.name for s in catalogue]
        assert names.count("Стретчинг") == 2, names
        assert len({s.id for s in catalogue}) == 2, "тёзки схлопнулись в одну услугу"

        # ── E: два тренера с одной подписью — тоже разные id.
        team = await catalog.trainers(db, ids["studio_a"])
        assert len(team) == 2 and len({t.id for t in team}) == 2, team
        assert {t.name for t in team} == {"Анна Новак"}, team
        assert {t.id: t.active for t in team} == {
            ids["trainer_1"]: True, ids["trainer_2"]: False}, team
        t1_only = await catalog.lessons(db, _query(ids, trainer_ids=[ids["trainer_1"]]))
        assert ids["karlin"] not in {f.lesson_id for f in t1_only}

        # ── F: отменённое занятие каталог не показывает.
        assert ids["cancelled"] not in got, "отменённое занятие попало в каталог"

        # ── G: отключённая сущность с будущим занятием. Признака «услуга
        # неактивна» в схеме нет вовсе; у зала он есть — и витрина его НЕ
        # смотрит. Каталог обязан вести себя так же, а не «правильнее».
        assert not hasattr(Service, "is_active"), \
            "у услуги появился признак активности — правило видимости надо пересмотреть"
        assert ids["in_off_hall"] in got, "занятие в отключённом зале пропало из каталога"
        # H3: тренер не принял приглашение — его занятие всё равно в расписании.
        assert ids["karlin"] in got

        # ── H: занятие без зала. Ни филиала, ни падения.
        homeless = got[ids["homeless"]]
        assert homeless.hall_id is None and homeless.branch_id is None
        assert homeless.branch_name is None and homeless.hall_name is None

        # ── I: занятие без тренера и без услуги.
        legacy = got[ids["legacy"]]
        assert legacy.trainer_id is None and legacy.service_id is None
        assert legacy.service_name is None
        # Подпись остаётся: расписание не бывает без имени ведущего.
        assert legacy.trainer_name == "Кто-то", legacy.trainer_name
        assert legacy.display_name == "Наследие"

        # ── J: снимок зоны есть — момент точный и однозначный.
        assert one.temporal_exact is True
        assert one.instant == datetime(DAY.year, DAY.month, DAY.day, 8, 0), one.instant

        # ── K: снимка нет — момент НЕИЗВЕСТЕН, и это видно.
        assert legacy.temporal_exact is False
        assert legacy.instant is None, "момент занятия без снимка выдан за точный"
        assert legacy.local_start.hour == 15, "местное время обязано остаться"

        # ── L: занятие в 23:30 принадлежит своему местному дню, а не соседнему.
        assert ids["late"] in got, "позднее занятие выпало из своего дня"
        assert got[ids["late"]].local_start.date() == DAY
        next_day = await catalog.lessons(db, catalog.LessonQuery(
            studio_id=ids["studio_a"], date_from=DAY + timedelta(days=1),
            date_to=DAY + timedelta(days=1)))
        assert next_day == [], "позднее занятие уехало в следующий день"

        # ── N: занятые коврики с дырами не ломают счёт.
        assert one.taken_spot_numbers == [3, 7], one.taken_spot_numbers
        assert one.taken_spots == 2, one.taken_spots
        assert one.available_spots == 6, one.available_spots
        # Конкретный коврик каталог не выбирает — это дело записи.
        assert 3 in one.taken_spot_numbers and 1 not in one.taken_spot_numbers

        # ── §17: «мест хватает» и «свободен коврик №N» — разные вопросы, и
        # каталог отвечает только на первый. Владелец вправе урезать число мест
        # до числа записанных, и тогда занятые НОМЕРА окажутся за пределами
        # диапазона: каталог покажет 0 свободных, а сама запись нашла бы
        # коврик №1. Расхождение допустимо только в эту сторону — каталог
        # обещает МЕНЬШЕ, чем есть, и никогда больше.
        from services.booking_access import next_free_spot

        lesson_row = await db.get(Lesson, ids["full"])
        was = lesson_row.total_spots
        lesson_row.total_spots = 2                     # столько же, сколько броней
        await db.commit()
        squeezed = _by_id(await catalog.lessons(db, _query(ids)))[ids["full"]]
        free_spot = await next_free_spot(db, lesson_row)
        assert squeezed.available_spots == 0, squeezed.available_spots
        assert free_spot == 1, free_spot
        assert squeezed.available_spots == 0 or free_spot is not None
        lesson_row.total_spots = was
        await db.commit()

        # ── Q: фильтр по филиалу ЧУЖОЙ студии не открывает её занятий и не
        # притягивает свои.
        alien = await catalog.lessons(db, _query(ids, branch_ids=[ids["branch_foreign"]]))
        assert alien == [], alien
        alien_service = await catalog.lessons(db, _query(ids, service_ids=[ids["service_foreign"]]))
        assert alien_service == [], alien_service
        alien_trainer = await catalog.lessons(db, _query(ids, trainer_ids=[ids["trainer_foreign"]]))
        assert alien_trainer == [], alien_trainer

        # Диапазон наизнанку — пустой ответ, а не выборка за всё время.
        assert await catalog.lessons(db, catalog.LessonQuery(
            studio_id=ids["studio_a"], date_from=DAY, date_to=DAY - timedelta(days=1))) == []


async def _hostile(ids: dict) -> None:
    """Атаки, которые нельзя устроить через продукт: строки заводятся в обход
    единственного писателя, прямо в базу."""
    # ── H1: занятие студии A с залом студии B. Приложение такого не даёт
    # (_assert_hall_in_studio), но композитного ключа в схеме нет — значит,
    # каталог обязан выстоять сам. Филиал чужой студии не должен просочиться.
    async with async_session_maker() as db:
        rogue = Lesson(
            studio_id=ids["studio_a"], name="Подложенное", teacher_name="Никто",
            hall_id=ids["hall_foreign"], service_id=ids["service_foreign"],
            teacher_id=ids["trainer_foreign"], tz_iana="Europe/Prague",
            start_time=datetime(DAY.year, DAY.month, DAY.day, 8, 0),
            duration_min=60, price=500, level="all", equipment="mat",
            total_spots=8, status="confirmed",
        )
        db.add(rogue)
        await db.commit()
        rogue_id = rogue.id
    try:
        async with async_session_maker() as db:
            facts = _by_id(await catalog.lessons(db, _query(ids)))[rogue_id]
            assert facts.branch_id is None, "филиал чужой студии просочился через зал"
            assert facts.branch_name is None and facts.hall_name is None
            assert facts.hall_id is None, "зал чужой студии показан как свой"
            assert facts.service_id is None and facts.service_name is None, \
                "услуга чужой студии показана как своя"
            # teacher_id — это то, на что ссылается строка; подмену видно по
            # тому, что подписи из своей студии для него нет.
            assert facts.trainer_name == "Никто", facts.trainer_name

            # Фильтр по СВОИМ филиалам подложенное занятие не подхватывает.
            in_branches = await catalog.lessons(db, _query(
                ids, branch_ids=[ids["branch_vaclav"], ids["branch_karlin"]]))
            assert rogue_id not in {f.lesson_id for f in in_branches}
    finally:
        async with async_session_maker() as db:
            await db.execute(delete(Lesson).where(Lesson.id == rogue_id))
            await db.commit()

    # ── H2: услугу переименовали между двумя чтениями. Каталог отдаёт НОВОЕ
    # название услуги и СТАРУЮ подпись занятия — они и правда разные вещи, и
    # именно поэтому тождество даёт id, а не строка.
    async with async_session_maker() as db:
        service = await db.get(Service, ids["service_1"])
        service.name = "Стретчинг глубокий"
        await db.commit()
    try:
        async with async_session_maker() as db:
            facts = _by_id(await catalog.lessons(db, _query(ids)))[ids["full"]]
            assert facts.service_name == "Стретчинг глубокий", facts.service_name
            assert facts.display_name == "Стретчинг", facts.display_name
            assert facts.service_id == ids["service_1"], "id услуги поехал вслед за именем"
    finally:
        async with async_session_maker() as db:
            service = await db.get(Service, ids["service_1"])
            service.name = "Стретчинг"
            await db.commit()

    # ── H8/H9: каталог — снимок. Новая бронь тут же меняет число свободных
    # мест, а отмена занятия убирает его из выдачи: ничего не кэшируется и
    # ничего не обещается.
    async with async_session_maker() as db:
        before = _by_id(await catalog.lessons(db, _query(ids)))[ids["full"]].available_spots
        db.add(Reservation(client_id=ids["client"], lesson_id=ids["full"],
                           spot_number=5, status="active"))
        await db.commit()
    try:
        async with async_session_maker() as db:
            after = _by_id(await catalog.lessons(db, _query(ids)))[ids["full"]].available_spots
        assert after == before - 1, f"мест было {before}, стало {after}"
    finally:
        async with async_session_maker() as db:
            await db.execute(delete(Reservation).where(
                Reservation.lesson_id == ids["full"], Reservation.spot_number == 5))
            await db.commit()

    async with async_session_maker() as db:
        lesson = await db.get(Lesson, ids["late"])
        lesson.status = "cancelled"
        await db.commit()
    try:
        async with async_session_maker() as db:
            assert ids["late"] not in _by_id(await catalog.lessons(db, _query(ids))), \
                "отменённое занятие осталось в выдаче"
    finally:
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, ids["late"])
            lesson.status = "confirmed"
            await db.commit()

    # ── H7: наследие в аномалии перевода стрелок. Такое занятие в базе есть, и
    # каталог обязан отдать его местное время, честно сказав, что момента нет.
    # Даты Праги вписаны константами (28 марта и 31 октября 2027) — тест,
    # который считает границы сам, повторил бы ошибку кода.
    gap_day, fold_day = date(2027, 3, 28), date(2027, 10, 31)
    async with async_session_maker() as db:
        broken = [
            Lesson(studio_id=ids["studio_a"], name=title, teacher_name="Анна Новак",
                   hall_id=ids["hall_v"], service_id=ids["service_1"],
                   teacher_id=ids["trainer_1"], tz_iana="Europe/Prague",
                   start_time=datetime.combine(day, datetime.min.time()).replace(hour=2, minute=30),
                   duration_min=60, price=500, level="all", equipment="mat",
                   total_spots=8, status="confirmed")
            for title, day in (("Дыра", gap_day), ("Повтор", fold_day))
        ]
        db.add_all(broken)
        await db.commit()
        broken_ids = [b.id for b in broken]
    try:
        async with async_session_maker() as db:
            for lesson_id, day in zip(broken_ids, (gap_day, fold_day)):
                facts = _by_id(await catalog.lessons(db, catalog.LessonQuery(
                    studio_id=ids["studio_a"], date_from=day, date_to=day)))[lesson_id]
                assert facts.instant is None, f"момент в аномалии выдан за точный: {facts.instant}"
                assert facts.temporal_exact is False
                assert facts.local_start.hour == 2 and facts.local_start.minute == 30
                # Остальные факты на месте: неизвестен только момент.
                assert facts.branch_id == ids["branch_vaclav"]
    finally:
        async with async_session_maker() as db:
            await db.execute(delete(Lesson).where(Lesson.id.in_(broken_ids)))
            await db.commit()

    # ── §34: филиал без адреса и города не роняет каталог и ничего не выдумывает.
    async with async_session_maker() as db:
        bare = StudioBranch(studio_id=ids["studio_a"], name="Без адреса")
        db.add(bare)
        await db.commit()
        bare_id = bare.id
    try:
        async with async_session_maker() as db:
            found = {b.id: b for b in await catalog.branches(db, ids["studio_a"])}
            assert found[bare_id].city is None and found[bare_id].address is None
            assert found[bare_id].name == "Без адреса"
    finally:
        async with async_session_maker() as db:
            await db.execute(delete(StudioBranch).where(StudioBranch.id == bare_id))
            await db.commit()

    # ── H5: студия без филиалов. Занятия у неё есть, филиала у них нет —
    # выдумывать «Основной» каталог не должен.
    async with async_session_maker() as db:
        assert await catalog.branches(db, ids["studio_b"]) != []
        await db.execute(delete(Hall).where(Hall.studio_id == ids["studio_b"]))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == ids["studio_b"]))
        await db.commit()
    async with async_session_maker() as db:
        assert await catalog.branches(db, ids["studio_b"]) == []
        orphan = await catalog.lessons(db, catalog.LessonQuery(
            studio_id=ids["studio_b"], date_from=DAY, date_to=DAY))
        assert [f.lesson_id for f in orphan] == [ids["foreign"]], orphan
        assert orphan[0].branch_id is None and orphan[0].hall_id is None

    # ── H6: зона не подтверждена. Каталог отдаёт ФАКТ, а не догадку, и не
    # отказывается работать: расписание по стенному времени остаётся видно.
    async with async_session_maker() as db:
        studio_b = await db.get(Studio, ids["studio_b"])
        studio_b.tz_iana, studio_b.timezone = None, "UTC+2"
        await db.commit()
    async with async_session_maker() as db:
        ref = await catalog.studio(db, ids["studio_b"])
        assert ref.timezone_verified is False, "неподтверждённая зона выдана за подтверждённую"
        assert ref.timezone is None
        assert await catalog.studio(db, ids["studio_a"]) is not None
        assert (await catalog.studio(db, ids["studio_a"])).timezone_verified is True
        # Несуществующая студия — None, а не пустая карточка.
        assert await catalog.studio(db, 0) is None


# ─── Совпадение с витриной (§M, §44) ─────────────────────────────────────────

async def _parity(ids: dict) -> None:
    """Golden: набор занятий и число свободных мест обязаны совпасть с тем,
    что видит клиент в мини-приложении. Прогоняется настоящая ручка витрины."""
    async with async_session_maker() as db:
        guest = MA.Viewer(None, ids["studio_a"])
        storefront = await ML.lessons_by_date(DAY, guest, db)
        found = await catalog.lessons(db, _query(ids))

    shop_ids = [card.id for card in storefront]
    cat_ids = [f.lesson_id for f in found]
    assert shop_ids == cat_ids, f"каталог и витрина разошлись: {shop_ids} против {cat_ids}"

    # ── M: места считаются одинаково — в том числе «pending» и отменённые.
    shop = {card.id: card for card in storefront}
    for facts in found:
        card = shop[facts.lesson_id]
        assert facts.taken_spot_numbers == sorted(card.taken_spots), facts.lesson_id
        assert facts.total_spots == card.total_spots, facts.lesson_id
        assert facts.available_spots == card.total_spots - len(card.taken_spots), facts.lesson_id
        # Время человеку показывается то же самое.
        assert facts.local_start == card.start_time, facts.lesson_id
        assert facts.display_name == card.name, facts.lesson_id


# ─── §O: правка занятия во время чтения ──────────────────────────────────────

async def _no_mixed_state(ids: dict) -> None:
    """O: админ переносит занятие, пока каталог читает. Допустимы старое и новое
    состояние, но не половина одного и половина другого."""
    before = datetime(DAY.year, DAY.month, DAY.day, 12, 0)
    after = datetime(DAY.year, DAY.month, DAY.day, 18, 0)
    async with async_session_maker() as writer:
        lesson = await writer.get(Lesson, ids["karlin"])
        # Одной транзакцией: время и зал (а значит и филиал) переезжают вместе.
        lesson.start_time = after
        lesson.hall_id = ids["hall_v"]
        await writer.commit()

    async with async_session_maker() as db:
        found = _by_id(await catalog.lessons(db, _query(ids)))
        moved = found[ids["karlin"]]
        assert (moved.local_start, moved.branch_id) == (after, ids["branch_vaclav"]), \
            f"смешанное состояние строки: {moved.local_start}, филиал {moved.branch_id}"

    async with async_session_maker() as writer:
        lesson = await writer.get(Lesson, ids["karlin"])
        lesson.start_time, lesson.hall_id = before, ids["hall_k"]
        await writer.commit()


# ─── §P / §H10: без N+1 ──────────────────────────────────────────────────────

async def _no_n_plus_1(ids: dict) -> None:
    """P / H10: число запросов не зависит от числа занятий. Считаем настоящие SQL,
    а не верим глазам."""
    seen: list[str] = []

    def _count(conn, cursor, statement, params, context, executemany):
        seen.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", _count)
    try:
        async with async_session_maker() as db:
            seen.clear()
            await catalog.lessons(db, _query(ids))
            few = len(seen)

        # Досыпаем 60 занятий в тот же день.
        async with async_session_maker() as db:
            db.add_all([
                Lesson(studio_id=ids["studio_a"], name=f"Массовое {i}",
                       teacher_name="Анна Новак", teacher_id=ids["trainer_1"],
                       hall_id=ids["hall_v"], service_id=ids["service_1"],
                       start_time=datetime(DAY.year, DAY.month, DAY.day, 9, 0)
                       + timedelta(seconds=i),
                       tz_iana="Europe/Prague", duration_min=60, price=500,
                       level="all", equipment="mat", total_spots=8, status="confirmed")
                for i in range(60)
            ])
            await db.commit()

        async with async_session_maker() as db:
            seen.clear()
            many = await catalog.lessons(db, _query(ids))
            grew = len(seen)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", _count)

    assert len(many) >= 60, len(many)
    assert grew == few, f"запросов было {few}, стало {grew} — это N+1"
    assert grew <= 3, f"{grew} запросов на выборку расписания — слишком много"


# ─── §46/§47: слой детерминирован ────────────────────────────────────────────

def test_catalog_is_deterministic():
    """Ни модели, ни сети. Каталог — доменный слой, а не ещё один клиент."""
    import services.catalog as mod

    source = open(mod.__file__, encoding="utf-8").read()
    for forbidden in ("llm", "assistant", "openai", "prompt", "ai_tools", "agent"):
        assert f"import {forbidden}" not in source and f"from {forbidden}" not in source, forbidden
    for network in ("aiohttp", "httpx", "requests", "stripe", "telegram", "gcal", "whatsapp"):
        assert network not in source, f"каталог тянет сеть: {network}"


def test_visibility_rule_lives_in_one_place():
    """Витрина обязана брать условие видимости отсюда, а не писать своё —
    иначе ассистент и клиент снова увидят разные расписания."""
    source = open(ML.__file__, encoding="utf-8").read()
    assert "catalog.visible_lessons" in source, \
        "расписание мини-приложения перестало брать видимость из каталога"
    assert "catalog.OCCUPIES_SPOT" in source, \
        "мини-приложение считает занятые места своим выражением"
    public = importlib.import_module("routers.booking.public")
    assert "catalog.OCCUPIES_SPOT" in open(public.__file__, encoding="utf-8").read(), \
        "веб-виджет считает занятые места своим выражением"
    access = importlib.import_module("services.booking_access")
    assert "OCCUPIES_SPOT" in open(access.__file__, encoding="utf-8").read(), \
        "выбор свободного коврика считает занятость своим выражением"
    # «Можно ли записаться» — тоже одно определение: следующему слою поиска
    # придётся спрашивать это же, и второй список правил разъедется с первым.
    rules = importlib.import_module("services.booking_rules")
    assert hasattr(rules, "is_bookable"), "правило записи снова уехало в роутер"
    assert "def _is_bookable" not in source, "в мини-приложении снова своя копия правила"


def test_r_suspension_gate_is_above_the_catalog():
    """§R: студию, отключённую за неоплату, закрывает витрина целиком — на
    входе (`get_viewer`/`get_current_client`), а не фильтром в расписании.
    Каталог лежит НИЖЕ этого гейта и своего дубля правила не заводит: два
    места, решающие про блокировку, разъедутся."""
    gate = open(MA.__file__, encoding="utf-8").read()
    assert gate.count("studio_suspended") >= 2, "гейт неоплаты ушёл из витрины"
    assert "suspend" not in open(catalog.__file__, encoding="utf-8").read()


def test_query_object_stays_small():
    """§28: типизированный фильтр, а не GraphQL внутри Python."""
    assert set(catalog.LessonQuery.__dataclass_fields__) == {
        "studio_id", "date_from", "date_to",
        "branch_ids", "service_ids", "trainer_ids", "limit",
    }


# ─── Один прогон на всё: стенд дорогой ───────────────────────────────────────

def test_catalog_against_the_database():
    async def run():
        ids = await _seed()
        try:
            await _checks(ids)
            await _parity(ids)
            await _no_mixed_state(ids)
            # Враждебный проход идёт ПОСЛЕ сверки с витриной: он ломает стенд
            # (сносит филиалы студии B, сбрасывает ей зону) и назад не чинит.
            await _hostile(ids)
            await _no_n_plus_1(ids)
        finally:
            await _cleanup(ids)

    asyncio.run(run())


if __name__ == "__main__":
    test_catalog_is_deterministic()
    test_visibility_rule_lives_in_one_place()
    test_r_suspension_gate_is_above_the_catalog()
    test_query_object_stays_small()
    test_catalog_against_the_database()
    print("catalog ok")

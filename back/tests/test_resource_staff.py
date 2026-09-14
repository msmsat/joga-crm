"""Экран «Записатись»: мастера филиала без дня и без обязательной услуги.

ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Мастеров клиенту теперь показывают ДО выбора услуги и
ДО выбора дня, а услуга стала фильтром. Дефект здесь невидим ни сборке, ни
типам: список может разойтись с тем, у кого сервер потом найдёт время, — или
пропустить мастера другой студии. Поэтому всё идёт через ASGI (запрос →
роутер → сервис → база → JSON) и сверяется с тем, что лежит в базе.

И второе: фильтр на экране — удобство, а не защита. quote и confirm обязаны
сами отказать мастеру, который услугу не оказывает, — это тоже проверяется
здесь, по HTTP, а не вызовом функции.

Реальная БД, ручная чистка (как в test_staff_day). Запуск из back/:
    python -m pytest tests/test_resource_staff.py -q
"""
import asyncio
import warnings
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, insert, select

import test_resource_hours as hours
from database import async_session_maker, get_db
from models import (BookingQuote, Client, Lesson, Reservation, Service, StaffBranchAssignment,
                    StaffWorkingHours, Studio, StudioBookingSettings, StudioBranch, StudioMember, User)
from models.base import user_services
from ratelimit import limiter
from routers.booking import miniapp_router
from routers.booking.miniapp import Viewer, get_current_client, get_viewer
from schemas.schedule import hybrid
from services import resource_availability

warnings.filterwarnings("ignore")

DAY = hours.DAY  # среда, 2027-06-16

MEMBER_FIELDS = {"teacher_id", "name", "last_name", "photo_url", "department", "service_ids", "branch_ids"}


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    monkeypatch.setattr(hybrid, "AVAILABLE_BOOKING_MODES", frozenset({"event", "resource", "hybrid"}))
    # Лимитер помнит запросы между файлами одного прогона: здесь проверяется
    # поведение ручек, а не их квоты.
    monkeypatch.setattr(limiter, "enabled", False)


async def _person(db, ids, key, *, studio_id=None, role="trainer", status="active",
                  name="X", last_name=None, department=None, photo_url=None) -> int:
    user = User(email=f"rs-{key}-{ids['studio']}@test.local", hashed_password="x", name=name)
    db.add(user)
    await db.flush()
    ids["extra_users"].append(user.id)
    db.add(StudioMember(user_id=user.id, studio_id=studio_id or ids["studio"], role=role, status=status,
                        name=name, last_name=last_name, department=department, photo_url=photo_url))
    return user.id


async def _link(db, user_id, *services):
    for service_id in services:
        await db.execute(insert(user_services).values(user_id=user_id, service_id=service_id))


async def _seed() -> dict:
    """Студия с мастерами, которых список ОБЯЗАН различать.

    Филиал A: Anna (стрижка, борода + групповая йога и скрытая услуга — их в
    списке быть не должно), Boris (только борода). Филиал B: Olga (стрижка).
    Не мастера для клиента: администратор, приглашённый (pending), тренер с
    одной групповой услугой, тренер с одной недоступной для записи услугой,
    тренер ДРУГОЙ студии со «враждебными» строками связи и назначения на наш
    филиал в обход единственного писателя.
    """
    ids = await hours._seed()
    ids["extra_users"] = []
    await hours._assign(ids)
    await hours._staff_hours(ids, DAY.weekday(), "09:00", "18:00")
    async with async_session_maker() as db:
        studio = await db.get(Studio, ids["studio"])
        studio.booking_mode, studio.strict_schedule_enabled, studio.journal_time_step = "resource", True, 15

        anna = (await db.execute(select(StudioMember).where(
            StudioMember.studio_id == studio.id, StudioMember.user_id == ids["teacher"]))).scalar_one()
        anna.name, anna.last_name = "Anna", "Koval"
        anna.department, anna.photo_url = "Master Barber", "/static/anna.jpg"

        haircut = Service(studio_id=studio.id, name="Haircut", price=0, duration_min=45, buffer_after_min=15,
                          service_type="individual", booking_mode="resource")
        # service_type NULL — наследие: не группа, значит доступна.
        beard = Service(studio_id=studio.id, name="Beard", price=0, duration_min=30,
                        service_type=None, booking_mode="resource")
        yoga = Service(studio_id=studio.id, name="Yoga", price=0, duration_min=60,
                       service_type="group", booking_mode="event")
        hidden = Service(studio_id=studio.id, name="Archived", price=0, duration_min=30,
                         service_type="individual", booking_mode="resource", is_bookable=False)
        client = Client(studio_id=studio.id, name="Customer")
        other = Studio(name=f"rs-other-{studio.id}", tz_iana="Europe/Prague")
        db.add_all([haircut, beard, yoga, hidden, client, other, StudioBookingSettings(
            studio_id=studio.id, prefill_on_booking=False, min_booking_advance_min=0,
            booking_window_days=400, widget_work_start="00:00", widget_work_end="00:00")])
        await db.flush()
        other_branch = StudioBranch(studio_id=other.id, name="Elsewhere")
        db.add(other_branch)
        await db.flush()
        ids.update(haircut=haircut.id, beard=beard.id, yoga=yoga.id, hidden=hidden.id,
                   client=client.id, other_studio=other.id, other_branch=other_branch.id)

        await _link(db, ids["teacher"], haircut.id, beard.id, yoga.id, hidden.id)

        boris = await _person(db, ids, "boris", name="Boris", last_name="Lysenko", department="Barber")
        await _link(db, boris, beard.id)
        db.add(StaffBranchAssignment(studio_id=studio.id, user_id=boris, branch_id=ids["branch_a"]))
        db.add(StaffWorkingHours(user_id=boris, studio_id=studio.id, day_of_week=DAY.weekday(),
                                 is_open=True, open_time="09:00", close_time="18:00"))

        olga = await _person(db, ids, "olga", name="Olga")
        await _link(db, olga, haircut.id)
        db.add(StaffBranchAssignment(studio_id=studio.id, user_id=olga, branch_id=ids["branch_b"]))

        excluded = {}
        for key, extra in {"admin": {"role": "admin"}, "pending": {"status": "pending"},
                           "event_only": {}, "hidden_only": {}}.items():
            user_id = await _person(db, ids, key, name=key, **extra)
            await _link(db, user_id, yoga.id if key == "event_only"
                        else hidden.id if key == "hidden_only" else haircut.id)
            db.add(StaffBranchAssignment(studio_id=studio.id, user_id=user_id, branch_id=ids["branch_a"]))
            excluded[key] = user_id

        foreign = await _person(db, ids, "foreign", studio_id=other.id, name="Foreign")
        await _link(db, foreign, haircut.id)
        db.add(StaffBranchAssignment(studio_id=other.id, user_id=foreign, branch_id=other_branch.id))
        db.add(StaffBranchAssignment(studio_id=studio.id, user_id=foreign, branch_id=ids["branch_a"]))
        excluded["foreign"] = foreign

        ids.update(boris=boris, olga=olga, excluded=excluded)
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    studios = [ids["studio"], ids["other_studio"]]
    async with async_session_maker() as db:
        await db.execute(delete(BookingQuote).where(BookingQuote.studio_id.in_(studios)))
        await db.execute(delete(Reservation).where(Reservation.lesson_id.in_(
            select(Lesson.id).where(Lesson.studio_id.in_(studios)))))
        await db.execute(delete(Lesson).where(Lesson.studio_id.in_(studios)))
        await db.execute(delete(Client).where(Client.studio_id.in_(studios)))
        await db.execute(delete(user_services).where(user_services.c.service_id.in_(
            select(Service.id).where(Service.studio_id.in_(studios)))))
        await db.execute(delete(Service).where(Service.studio_id.in_(studios)))
        await db.execute(delete(StudioBookingSettings).where(StudioBookingSettings.studio_id.in_(studios)))
        await db.execute(delete(StaffBranchAssignment).where(StaffBranchAssignment.studio_id.in_(studios)))
        await db.execute(delete(StaffWorkingHours).where(StaffWorkingHours.studio_id.in_(studios)))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == ids["other_studio"]))
        await db.execute(delete(StudioBranch).where(StudioBranch.studio_id == ids["other_studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["other_studio"]))
        await db.commit()
    await hours._cleanup(ids)
    async with async_session_maker() as db:
        await db.execute(delete(User).where(User.id.in_(ids["extra_users"])))
        await db.commit()


def _app(ids) -> FastAPI:
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(miniapp_router, prefix="/global")

    async def database():
        async with async_session_maker() as session:
            yield session

    async def current_client():
        async with async_session_maker() as session:
            return await session.get(Client, ids["client"])

    async def viewer():
        return Viewer(await current_client(), ids["studio"])

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_client] = current_client
    app.dependency_overrides[get_viewer] = viewer
    return app


def _run(scenario):
    async def run():
        ids = await _seed()
        try:
            async with AsyncClient(transport=ASGITransport(app=_app(ids)), base_url="http://test") as http:
                await scenario(ids, http)
        finally:
            await _cleanup(ids)
    asyncio.run(run())


async def _staff(http, ids, branch="branch_a", **params):
    response = await http.get("/global/resource-staff", params={"branch_id": ids[branch], **params})
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"staff", "reason"}
    return body


def _by_id(body):
    return {row["teacher_id"]: row for row in body["staff"]}


# ─── 1–2, 4–6. Без услуги: все мастера филиала вместе со своими услугами ──────

def test_without_a_service_every_master_of_the_branch_comes_with_own_services():
    async def scenario(ids, http):
        body = await _staff(http, ids)
        rows = _by_id(body)
        assert body["reason"] is None
        # Никого лишнего: ни администратора, ни приглашённого, ни мастера
        # только групп или архивной услуги, ни чужой студии, ни другого филиала.
        assert set(rows) == {ids["teacher"], ids["boris"]}, rows
        assert all(set(row) == MEMBER_FIELDS for row in body["staff"])

        # Ответ совпадает с базой, а не с умолчаниями схемы.
        async with async_session_maker() as db:
            anna = (await db.execute(select(StudioMember).where(
                StudioMember.studio_id == ids["studio"], StudioMember.user_id == ids["teacher"]))).scalar_one()
            linked = set((await db.execute(select(user_services.c.service_id).where(
                user_services.c.user_id == ids["teacher"]))).scalars().all())
        row = rows[ids["teacher"]]
        assert (row["name"], row["last_name"], row["photo_url"], row["department"]) == (
            anna.name, anna.last_name, anna.photo_url, anna.department)
        # В базе у Anna четыре связи; клиенту — только те две, на которые можно
        # записаться, в порядке названий.
        assert linked == {ids["haircut"], ids["beard"], ids["yoga"], ids["hidden"]}
        assert row["service_ids"] == [ids["beard"], ids["haircut"]]
        assert rows[ids["boris"]]["service_ids"] == [ids["beard"]]

        # Филиал — не фильтр, а принадлежность: Olga есть только в B.
        other = await _staff(http, ids, branch="branch_b")
        assert list(_by_id(other)) == [ids["olga"]]
        assert other["staff"][0]["service_ids"] == [ids["haircut"]]
    _run(scenario)


# ─── Несколько филиалов или все: мастера вместе со своими адресами ────────────

def test_several_branches_or_none_merge_masters_and_name_their_branches():
    async def scenario(ids, http):
        a, b = ids["branch_a"], ids["branch_b"]
        both = await http.get("/global/resource-staff", params=[("branch_id", a), ("branch_id", b)])
        assert both.status_code == 200, both.text
        rows = _by_id(both.json())
        assert set(rows) == {ids["teacher"], ids["boris"], ids["olga"]}, rows
        assert all(set(row) == MEMBER_FIELDS for row in both.json()["staff"])
        assert (rows[ids["teacher"]]["branch_ids"], rows[ids["olga"]]["branch_ids"]) == ([a], [b])

        # Без филиала — все филиалы студии: те же мастера, с теми же адресами.
        everyone = await http.get("/global/resource-staff")
        assert everyone.status_code == 200, everyone.text
        assert {k: v["branch_ids"] for k, v in _by_id(everyone.json()).items() if k in rows} == {
            k: v["branch_ids"] for k, v in rows.items()}

        # Мастер в двух филиалах — одна карточка, услуги не задваиваются.
        async with async_session_maker() as db:
            db.add(StaffBranchAssignment(studio_id=ids["studio"], user_id=ids["boris"], branch_id=b))
            await db.commit()
        boris = _by_id((await http.get("/global/resource-staff",
                                       params=[("branch_id", a), ("branch_id", b)])).json())[ids["boris"]]
        assert (boris["branch_ids"], boris["service_ids"]) == (sorted([a, b]), [ids["beard"]])
        # Выбран один филиал — у мастера только он, хотя адресов у него два.
        assert _by_id(await _staff(http, ids, branch="branch_b"))[ids["boris"]]["branch_ids"] == [b]

        # Чужой филиал среди своих — отказ целиком, а не «половина списка».
        mixed = await http.get("/global/resource-staff", params=[("branch_id", a), ("branch_id", ids["other_branch"])])
        assert mixed.status_code == 404
    _run(scenario)


# ─── 3. С услугой: только те, кто её оказывает ────────────────────────────────

def test_service_filter_keeps_only_masters_who_provide_it():
    async def scenario(ids, http):
        haircut = _by_id(await _staff(http, ids, service_id=ids["haircut"]))
        assert list(haircut) == [ids["teacher"]]
        # Фильтр сужает мастеров, а не их услуги: карточка показывает всё.
        assert haircut[ids["teacher"]]["service_ids"] == [ids["beard"], ids["haircut"]]

        beard = _by_id(await _staff(http, ids, service_id=ids["beard"]))
        assert set(beard) == {ids["teacher"], ids["boris"]}

        # Снятый фильтр возвращает всех.
        assert set(_by_id(await _staff(http, ids))) == {ids["teacher"], ids["boris"]}

        # Услуги в филиале нет ни у кого — пустой список с причиной, не 404.
        empty = await _staff(http, ids, branch="branch_b", service_id=ids["beard"])
        assert empty == {"staff": [], "reason": "no_eligible_staff"}

        # Фильтр не открывает то, на что записаться нельзя, и чужое.
        for service, status, code in ((ids["yoga"], 409, "SERVICE_UNAVAILABLE"),
                                      (ids["hidden"], 409, "SERVICE_UNAVAILABLE")):
            response = await http.get("/global/resource-staff",
                                      params={"branch_id": ids["branch_a"], "service_id": service})
            assert (response.status_code, response.json()["detail"]["code"]) == (status, code)
        foreign_branch = await http.get("/global/resource-staff", params={"branch_id": ids["other_branch"]})
        assert foreign_branch.status_code == 404
    _run(scenario)


# ─── 7. Нет N+1: число запросов не растёт вместе с мастерами ──────────────────

def test_query_count_does_not_depend_on_the_number_of_masters(monkeypatch):
    async def scenario(ids, _http):
        async def measure():
            async with async_session_maker() as db:
                queries = []
                original = db.execute

                async def counted(query, *args, **kwargs):
                    queries.append(str(query))
                    return await original(query, *args, **kwargs)

                monkeypatch.setattr(db, "execute", counted)
                report = await resource_availability.resource_staff(
                    db, studio_id=ids["studio"], branch_ids=[ids["branch_a"]])
                return len(report.staff), len(queries)

        few, few_queries = await measure()
        async with async_session_maker() as db:
            for n in range(6):
                user_id = await _person(db, ids, f"crowd{n}", name=f"Crowd {n}")
                await _link(db, user_id, ids["haircut"], ids["beard"])
                db.add(StaffBranchAssignment(studio_id=ids["studio"], user_id=user_id,
                                             branch_id=ids["branch_a"]))
            await db.commit()
        many, many_queries = await measure()

        assert (few, many) == (2, 8)
        assert few_queries == many_queries <= 4, (few_queries, many_queries)
    _run(scenario)


# ─── 8–9. quote и confirm перепроверяют пару «мастер ↔ услуга» ────────────────

def test_quote_and_confirm_refuse_a_master_who_does_not_provide_the_service():
    async def scenario(ids, http):
        day = str(DAY)
        haircut = {"service_id": ids["haircut"], "branch_id": ids["branch_a"], "date_from": day, "date_to": day}

        # Boris стрижку не делает: времени у него для неё нет, а не «чужое время».
        boris_free = await http.get("/global/availability", params={**haircut, "teacher_id": ids["boris"]})
        assert boris_free.status_code == 200
        assert boris_free.json() == {"slots": [], "reason": "no_eligible_staff"}

        anna_free = (await http.get("/global/availability",
                                    params={**haircut, "teacher_id": ids["teacher"]})).json()["slots"]
        assert anna_free, "у Anna есть время на стрижку"
        slot = anna_free[0]

        # Подставленный teacher_id — не оказывающего услугу, другой студии, другого филиала.
        for impostor in (ids["boris"], ids["excluded"]["foreign"], ids["olga"],
                         ids["excluded"]["admin"], ids["excluded"]["pending"]):
            refused = await http.post("/global/booking-quotes", json={
                "booking_mode": "resource", "service_id": ids["haircut"], "branch_id": ids["branch_a"],
                "teacher_id": impostor, "starts_at": slot["starts_at"]})
            assert refused.status_code == 409, (impostor, refused.text)
            assert refused.json()["detail"]["code"] == "SLOT_UNAVAILABLE"

        # Законный quote, а потом связь мастера с услугой снимают — confirm обязан
        # пересчитать и отказать, не создав ни интервала, ни брони.
        quote = await http.post("/global/booking-quotes", json={
            "booking_mode": "resource", "service_id": ids["haircut"], "branch_id": ids["branch_a"],
            "teacher_id": ids["teacher"], "starts_at": slot["starts_at"]})
        assert quote.status_code == 201, quote.text
        async with async_session_maker() as db:
            await db.execute(delete(user_services).where(user_services.c.user_id == ids["teacher"],
                                                         user_services.c.service_id == ids["haircut"]))
            await db.commit()
        confirmed = await http.post("/global/bookings", json={"quote_id": quote.json()["quote_id"]})
        assert confirmed.status_code == 409, confirmed.text
        assert confirmed.json()["detail"]["code"] == "SLOT_UNAVAILABLE"
        async with async_session_maker() as db:
            assert (await db.execute(select(Lesson.id).where(Lesson.studio_id == ids["studio"]))).all() == []
            assert (await db.get(BookingQuote, quote.json()["quote_id"])).consumed_at is None
        # И из списка мастеров по стрижке она тоже ушла.
        assert (await _staff(http, ids, service_id=ids["haircut"]))["staff"] == []
    _run(scenario)


# ─── Сквозной путь по HTTP: оба порядка выбора ────────────────────────────────

async def _book(http, ids, *, service, teacher, not_before=None):
    """Availability с teacher_id → quote → confirm. Возвращает слот и ответ confirm."""
    day = str(DAY)
    free = await http.get("/global/availability", params={
        "service_id": service, "branch_id": ids["branch_a"], "date_from": day, "date_to": day,
        "teacher_id": teacher})
    assert free.status_code == 200, free.text
    slots = free.json()["slots"]
    assert slots and all(s["teacher_ids"] == [teacher] for s in slots), slots[:3]
    # Местное время студии без смещения: мини-приложение режет его срезом.
    assert all(len(s["local_start"]) == 19 and s["local_start"][10] == "T" for s in slots)
    slot = next(s for s in slots if not_before is None or s["local_start"] >= not_before)

    quote = await http.post("/global/booking-quotes", json={
        "booking_mode": "resource", "service_id": service, "branch_id": ids["branch_a"],
        "teacher_id": teacher, "starts_at": slot["starts_at"]})
    assert quote.status_code == 201, quote.text
    terms = quote.json()["terms"]
    assert (terms["teacher_id"], terms["service_id"]) == (teacher, service)

    confirmed = await http.post("/global/bookings", json={"quote_id": quote.json()["quote_id"]})
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "active"
    return slot, terms, confirmed.json()


def test_full_http_flow_from_the_service_and_from_the_master():
    async def scenario(ids, http):
        # Каталог: услуги экрана — оттуда же, откуда их берёт мини-приложение.
        catalog = await http.get("/global/studio")
        assert catalog.status_code == 200, catalog.text
        services = {s["id"]: s for s in catalog.json()["services"]}
        assert services[ids["haircut"]]["booking_mode"] == "resource" and services[ids["haircut"]]["is_bookable"]
        # Услуга без формата (service_type NULL) раньше роняла весь каталог в 500.
        assert services[ids["beard"]]["service_type"] is None
        assert catalog.json()["booking_capabilities"]["booking_mode"] == "resource"

        # ── Путь A: услуга → мастер → время ──
        everyone = _by_id(await _staff(http, ids))
        assert set(everyone) == {ids["teacher"], ids["boris"]}
        chosen = _by_id(await _staff(http, ids, service_id=ids["haircut"]))
        assert list(chosen) == [ids["teacher"]]

        slot, terms, booked = await _book(http, ids, service=ids["haircut"], teacher=ids["teacher"])
        async with async_session_maker() as db:
            service = await db.get(Service, ids["haircut"])
            reservation = await db.get(Reservation, booked["reservation_id"])
            lesson = await db.get(Lesson, booked["lesson_id"])
        assert terms["duration_min"] == service.duration_min
        assert terms["domain"]["trainer_name"] == "Anna Koval"
        assert reservation.client_id == ids["client"] and reservation.status == "active"
        assert (lesson.teacher_id, lesson.service_id, lesson.branch_id, lesson.booking_mode) == (
            ids["teacher"], ids["haircut"], ids["branch_a"], "resource")
        assert lesson.start_time == datetime.fromisoformat(slot["local_start"])
        assert lesson.duration_min == service.duration_min

        # ── Путь B: мастер → его услуга → время ──
        boris = everyone[ids["boris"]]
        assert boris["service_ids"] == [ids["beard"]]
        later = (datetime.fromisoformat(slot["local_start"]) + timedelta(hours=2)).isoformat()
        second_slot, _, second = await _book(http, ids, service=boris["service_ids"][0],
                                             teacher=ids["boris"], not_before=later)
        async with async_session_maker() as db:
            lesson = await db.get(Lesson, second["lesson_id"])
        assert (lesson.teacher_id, lesson.service_id) == (ids["boris"], ids["beard"])
        assert lesson.start_time == datetime.fromisoformat(second_slot["local_start"])

        # «Мои записи» видят обе — с теми мастером и услугой, что выбраны.
        mine = await http.get("/global/lessons/my")
        assert mine.status_code == 200, mine.text
        upcoming = {row["reservation_id"]: row for row in mine.json()["upcoming"]}
        assert {booked["reservation_id"], second["reservation_id"]} <= set(upcoming)
        assert (upcoming[booked["reservation_id"]]["teacher_id"],
                upcoming[booked["reservation_id"]]["service_id"]) == (ids["teacher"], ids["haircut"])
        assert (upcoming[second["reservation_id"]]["teacher_id"],
                upcoming[second["reservation_id"]]["service_id"]) == (ids["boris"], ids["beard"])

        # «Любой мастер»: без teacher_id сервер сам берёт свободного из тех, кто
        # оказывает услугу, — Boris стрижку не делает и появиться не может.
        day = str(DAY)
        anyone = await http.get("/global/availability", params={
            "service_id": ids["haircut"], "branch_id": ids["branch_a"], "date_from": day, "date_to": day})
        assert anyone.status_code == 200
        assert {t for s in anyone.json()["slots"] for t in s["teacher_ids"]} == {ids["teacher"]}
    _run(scenario)

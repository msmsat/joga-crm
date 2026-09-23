"""Индивидуальная цена услуги у мастера: чему равна и что попадает в «от–до».

ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Цена услуги — единственное число, которое одновременно
показывают витрина, Каталог, касса и Журнал. Пока оно было одно на услугу,
расходиться было нечему. Теперь ответ зависит от того, КТО оказывает услугу, и
дефект здесь невидим ни типам, ни сборке: витрина напишет «от 300», касса
спишет 500, и узнают об этом от клиента у стойки.

Поэтому проверяется само правило (`services/service_pricing`) на реальной базе,
а не на фейковой сессии: половина правила — SQL (LEFT JOIN, COALESCE, GROUP BY),
и на подменённой сессии он бы просто не выполнялся.

Запуск из back/:  python -m pytest tests/test_staff_service_price.py -q
"""
import asyncio
import warnings

import pytest
from sqlalchemy import delete, insert, select

from database import async_session_maker
from models import Service, Studio, StudioMember, User
from models.base import user_services
from services import service_pricing

warnings.filterwarnings("ignore")


def _run(scenario):
    ids = asyncio.run(_seed())
    try:
        asyncio.run(scenario(ids))
    finally:
        asyncio.run(_cleanup(ids))


async def _member(db, ids, key, *, role="trainer", status="active", name="X") -> int:
    user = User(email=f"ssp-{key}-{ids['studio']}@test.local", hashed_password="x", name=name)
    db.add(user)
    await db.flush()
    ids["users"].append(user.id)
    db.add(StudioMember(user_id=user.id, studio_id=ids["studio"], role=role,
                        status=status, name=name))
    return user.id


async def _link(db, user_id, service_id, price=None):
    await db.execute(insert(user_services).values(
        user_id=user_id, service_id=service_id, price=price))


async def _seed() -> dict:
    """Одна услуга по 300 и мастера, которых правило ОБЯЗАНО различать.

    anna — своя цена 500, boris — своя цена 700, clara — без своей (наследует
    300), dima — уволен со своей ценой 9000 (в диапазон попасть не смеет),
    admin — администратор со строкой связи (мастером не считается).
    """
    ids = {"users": []}
    async with async_session_maker() as db:
        studio = Studio(name="ssp-studio", tz_iana="Europe/Prague")
        db.add(studio)
        await db.flush()
        ids["studio"] = studio.id

        haircut = Service(studio_id=studio.id, name="Haircut", price=300, duration_min=30)
        lonely = Service(studio_id=studio.id, name="Nobody does it", price=450, duration_min=30)
        db.add_all([haircut, lonely])
        await db.flush()
        ids.update(haircut=haircut.id, lonely=lonely.id)

        ids["anna"] = await _member(db, ids, "anna", name="Anna")
        ids["boris"] = await _member(db, ids, "boris", name="Boris")
        ids["clara"] = await _member(db, ids, "clara", name="Clara")
        ids["dima"] = await _member(db, ids, "dima", name="Dima", status="inactive")
        ids["admin"] = await _member(db, ids, "admin", name="Admin", role="admin")
        await db.flush()

        await _link(db, ids["anna"], haircut.id, 500)
        await _link(db, ids["boris"], haircut.id, 700)
        await _link(db, ids["clara"], haircut.id)
        await _link(db, ids["dima"], haircut.id, 9000)
        await _link(db, ids["admin"], haircut.id, 1)
        await db.commit()
    return ids


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(user_services).where(user_services.c.service_id.in_(
            select(Service.id).where(Service.studio_id == ids["studio"]))))
        await db.execute(delete(Service).where(Service.studio_id == ids["studio"]))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == ids["studio"]))
        await db.execute(delete(Studio).where(Studio.id == ids["studio"]))
        await db.execute(delete(User).where(User.id.in_(ids["users"])))
        await db.commit()


# ─── price_for: сколько платит клиент ─────────────────────────────────────────

def test_price_is_the_masters_own_or_the_services_one():
    async def scenario(ids):
        async with async_session_maker() as db:
            service = await db.get(Service, ids["haircut"])
            assert await service_pricing.price_for(db, service, ids["anna"]) == 500
            # Мастер без своей цены наследует цену Каталога, а не получает ноль.
            assert await service_pricing.price_for(db, service, ids["clara"]) == 300
            # Мастера не назвали вовсе — тоже цена Каталога: так устроены пути,
            # где мастера ещё нет (продажа абонемента, старая форма).
            assert await service_pricing.price_for(db, service, None) == 300
            # Человек, который эту услугу не оказывает, цену ей не задаёт.
            assert await service_pricing.price_for(db, service, ids["users"][0] + 10_000) == 300
    _run(scenario)


def test_zero_is_a_price_and_not_an_absence():
    """Ноль у мастера — «бесплатно у стажёра», а не «своей цены нет».

    Спутать их значит выставить стажёрскую услугу по полному прайсу — ошибка,
    которую заметит клиент, а не разработчик."""
    async def scenario(ids):
        async with async_session_maker() as db:
            await db.execute(user_services.update().where(
                user_services.c.user_id == ids["clara"],
                user_services.c.service_id == ids["haircut"]).values(price=0))
            await db.commit()
        async with async_session_maker() as db:
            service = await db.get(Service, ids["haircut"])
            assert await service_pricing.price_for(db, service, ids["clara"]) == 0
            span = await service_pricing.price_range_for(db, service)
            assert span.min == 0
    _run(scenario)


# ─── price_ranges: что показывать, пока мастер не выбран ──────────────────────

def test_range_spans_the_masters_of_the_service():
    async def scenario(ids):
        async with async_session_maker() as db:
            spans = await service_pricing.price_ranges(
                db, ids["studio"], [ids["haircut"], ids["lonely"]])
            span = spans[ids["haircut"]]
            # Clara наследует 300, Boris берёт 700 — и то и другое в диапазоне.
            # Уволенный Dima с 9000 в него не попадает: записаться к нему
            # нельзя, и обещать его цену клиенту тоже. Администратор с 1 — тоже
            # нет: мастером его не делает строка связи.
            assert (span.min, span.max) == (300, 700)
            assert span.is_range is True
            # Услугу не ведёт никто — показывать нечего, кроме её цены.
            assert spans[ids["lonely"]] == service_pricing.PriceRange(min=450, max=450)
            assert spans[ids["lonely"]].is_range is False
    _run(scenario)


def test_base_price_drops_out_when_nobody_works_for_it():
    """База 300 при мастерах по 500 и 700 даёт «от 500», а не «от 300».

    За 300 не работает никто, и показать её значит обещать несуществующее."""
    async def scenario(ids):
        async with async_session_maker() as db:
            await db.execute(delete(user_services).where(
                user_services.c.user_id == ids["clara"],
                user_services.c.service_id == ids["haircut"]))
            await db.commit()
        async with async_session_maker() as db:
            spans = await service_pricing.price_ranges(db, ids["studio"], [ids["haircut"]])
            assert (spans[ids["haircut"]].min, spans[ids["haircut"]].max) == (500, 700)
    _run(scenario)


def test_range_asks_the_database_once_for_the_whole_catalogue():
    """Один запрос на любое число услуг.

    Каталог и витрина показывают их десятками, и обход по услугам вернул бы
    на эти экраны N+1 — ровно то, что CLAUDE.md §5 п.2 запрещает. Тест держит
    это свойство: без него оно тихо исчезнет при первой правке."""
    async def scenario(ids):
        async with async_session_maker() as db:
            seen = []
            original = db.execute

            async def counting(statement, *a, **kw):
                seen.append(statement)
                return await original(statement, *a, **kw)

            db.execute = counting
            await service_pricing.price_ranges(
                db, ids["studio"], [ids["haircut"], ids["lonely"]])
            assert len(seen) == 1, f"ожидали один запрос, получили {len(seen)}"
    _run(scenario)


def test_masters_of_services_matches_the_range():
    """Касса предлагает ровно тех, чьи цены попали в «от–до».

    Разойдись эти два списка — кассир выбрал бы мастера дешевле или дороже
    показанного диапазона."""
    async def scenario(ids):
        async with async_session_maker() as db:
            found = await service_pricing.masters_of_services(
                db, ids["studio"], [ids["haircut"], ids["lonely"]])
            by_id = {m.user_id: m.price for m in found[ids["haircut"]]}
            assert by_id == {ids["anna"]: 500, ids["boris"]: 700, ids["clara"]: 300}
            span = (await service_pricing.price_ranges(
                db, ids["studio"], [ids["haircut"]]))[ids["haircut"]]
            assert (min(by_id.values()), max(by_id.values())) == (span.min, span.max)
            # Услуга без мастеров не даёт пустого списка — её просто нет в ответе.
            assert ids["lonely"] not in found
    _run(scenario)


# ─── apply_staff_prices: запись ───────────────────────────────────────────────

def test_saving_prices_drops_the_ones_left_out():
    """Пришедший набор — истина целиком.

    Владелец снял надбавку, убрав услугу из списка; пережить сохранение она не
    должна, иначе он продолжит продавать по старой цене, видя новую."""
    async def scenario(ids):
        async with async_session_maker() as db:
            await service_pricing.apply_staff_prices(
                db, ids["anna"], ids["studio"], {ids["haircut"]: 900})
            await db.commit()
        async with async_session_maker() as db:
            service = await db.get(Service, ids["haircut"])
            assert await service_pricing.price_for(db, service, ids["anna"]) == 900

        async with async_session_maker() as db:
            await service_pricing.apply_staff_prices(db, ids["anna"], ids["studio"], {})
            await db.commit()
        async with async_session_maker() as db:
            service = await db.get(Service, ids["haircut"])
            assert await service_pricing.price_for(db, service, ids["anna"]) == 300
            own = await service_pricing.prices_of_staff(db, ids["anna"], ids["studio"])
            # Не просто «цена равна базовой» — своей цены больше НЕТ, и правка
            # Каталога снова поедет к этому мастеру.
            assert own[ids["haircut"]].custom is False
    _run(scenario)


def test_saving_prices_does_not_create_rows_for_unassigned_services():
    """Цена ложится на существующую связь, своей строки у неё нет.

    Иначе «назначить цену» молча означало бы «назначить услугу»."""
    async def scenario(ids):
        async with async_session_maker() as db:
            await service_pricing.apply_staff_prices(
                db, ids["anna"], ids["studio"], {ids["lonely"]: 1000})
            await db.commit()
        async with async_session_maker() as db:
            linked = set((await db.execute(select(user_services.c.service_id).where(
                user_services.c.user_id == ids["anna"]))).scalars().all())
            assert linked == {ids["haircut"]}
    _run(scenario)


def test_prices_of_staff_tells_own_apart_from_inherited():
    async def scenario(ids):
        async with async_session_maker() as db:
            own = await service_pricing.prices_of_staff(db, ids["anna"], ids["studio"])
            assert own[ids["haircut"]] == service_pricing.StaffPrice(price=500, custom=True)
            inherited = await service_pricing.prices_of_staff(db, ids["clara"], ids["studio"])
            assert inherited[ids["haircut"]] == service_pricing.StaffPrice(price=300, custom=False)
    _run(scenario)


@pytest.mark.parametrize("price", [0, 1, 999_999])
def test_any_non_negative_price_is_accepted(price):
    async def scenario(ids):
        async with async_session_maker() as db:
            await service_pricing.apply_staff_prices(
                db, ids["anna"], ids["studio"], {ids["haircut"]: price})
            await db.commit()
        async with async_session_maker() as db:
            service = await db.get(Service, ids["haircut"])
            assert await service_pricing.price_for(db, service, ids["anna"]) == price
    _run(scenario)

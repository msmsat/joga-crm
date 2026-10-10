"""Именованные скидки студии (DiscountCampaign) — то, за что отвечают деньги.

Движок (services/pricing.resolve_price → services/discount_campaigns):
  * период включительный с обеих сторон и сверяется с ДНЁМ ЗАНЯТИЯ (`on`);
  * «на выбранное» действует только на занятия своих услуг и свои абонементы,
    а продаже, про которую неизвестно, что продают, не достаётся вовсе;
  * «кому»: отдельные клиенты, группы как у фильтров Клиентов, именинники с
    окном до и после дня рождения (и через Новый год);
  * минимальная сумма, самая выгодная из нескольких, выключенная программа;
  * продажа прибавляет скидке used_count (mark_used), расчёт — нет.

Эндпоинты: создание включает программу; «на выбранное» без выбранного,
процент больше 100 и перевёрнутый период — отказ; чужой клиент — 404; правка
проверяет итог целиком; статус по часам студии; охват групп.

Реальная БД. Движок — в транзакции с откатом; эндпоинты коммитят сами, их
студия удаляется в конце (скидки и клиенты уходят каскадом).

Запуск из back/:  python -m pytest tests/test_discount_campaigns.py -q
"""
import asyncio
from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.future import select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    Client, DiscountCampaign, Service, Studio, StudioDiscountConfig,
    StudioSubscriptionProgramConfig, SubscriptionPackage,
)
from routers.loyalty.discounts import (
    create_discount_campaign, delete_discount_campaign, discount_reach,
    list_discount_campaigns, update_discount_campaign,
)
from schemas.loyalty import DiscountCampaignCreate, DiscountCampaignUpdate
from services.pricing import resolve_price

DAY = date(2026, 10, 15)


class _User:
    id = 1


def _ctx(studio_id):
    return StudioContext(user=_User(), studio_id=studio_id, role="owner")


async def _studio(db, name):
    studio = Studio(name=name, tz_iana="Europe/Prague")
    db.add(studio)
    await db.flush()
    db.add(StudioDiscountConfig(studio_id=studio.id, is_enabled=True))
    return studio.id


def test_period_item_and_audience():
    async def run():
        async with async_session_maker() as db:
            sid = await _studio(db, "TEST-DISCOUNT-ENGINE")
            yoga = Service(studio_id=sid, name="Yoga", price=500)
            pilates = Service(studio_id=sid, name="Pilates", price=500)
            program = StudioSubscriptionProgramConfig(studio_id=sid)
            db.add_all([yoga, pilates, program]); await db.flush()
            pack = SubscriptionPackage(studio_id=sid, config_id=program.id, name="8", class_count=8,
                                       price=4000, per_visit_price=500)
            anna = Client(studio_id=sid, name="Anna", is_active=True,
                          registration_date=datetime(2020, 1, 1), birth_date=date(1990, 10, 17))
            boris = Client(studio_id=sid, name="Boris", is_active=True,
                           registration_date=datetime(2020, 1, 1), birth_date=date(1990, 1, 2))
            db.add_all([pack, anna, boris]); await db.flush()

            # Период включительный и сверяется по `on` — дню занятия.
            db.add(DiscountCampaign(studio_id=sid, name="Октябрь", discount_type="percent", value=10,
                                    valid_from=DAY, valid_until=DAY + timedelta(days=6)))
            await db.flush()
            for on, final in ((DAY - timedelta(days=1), 500), (DAY, 450),
                              (DAY + timedelta(days=6), 450), (DAY + timedelta(days=7), 500)):
                price = await resolve_price(db, sid, boris.id, 500, service_id=yoga.id, on=on)
                assert price.final_price == final, (on, price.final_price)
            await db.execute(DiscountCampaign.__table__.delete().where(DiscountCampaign.studio_id == sid))

            # На выбранное: занятие йоги и абонемент — да; пилатес и «неизвестно что» — нет.
            db.add(DiscountCampaign(studio_id=sid, name="Йога", discount_type="amount", value=100,
                                    applies_to="selected", service_ids=[yoga.id], package_ids=[pack.id]))
            await db.flush()
            assert (await resolve_price(db, sid, boris.id, 500, service_id=yoga.id, on=DAY)).final_price == 400
            assert (await resolve_price(db, sid, boris.id, 500, service_id=pilates.id, on=DAY)).final_price == 500
            assert (await resolve_price(db, sid, boris.id, 4000, package_id=pack.id)).final_price == 3900
            assert (await resolve_price(db, sid, boris.id, 500, on=DAY)).final_price == 500
            await db.execute(DiscountCampaign.__table__.delete().where(DiscountCampaign.studio_id == sid))

            # Кому: отдельные клиенты.
            db.add(DiscountCampaign(studio_id=sid, name="Анне", discount_type="percent", value=20,
                                    audience="clients", client_ids=[anna.id]))
            await db.flush()
            assert (await resolve_price(db, sid, anna.id, 500, on=DAY)).final_price == 400
            assert (await resolve_price(db, sid, boris.id, 500, on=DAY)).final_price == 500
            await db.execute(DiscountCampaign.__table__.delete().where(DiscountCampaign.studio_id == sid))

            # Именинники ±3 дня от дня занятия: у Анны 17.10 — занятие 15.10 в окне,
            # 21.10 уже нет. У Бориса 2 января — окно 30.12 переходит через год.
            db.add(DiscountCampaign(studio_id=sid, name="ДР", discount_type="percent", value=15,
                                    audience="segments", segments=["birthday"], birthday_window_days=3))
            await db.flush()
            assert (await resolve_price(db, sid, anna.id, 1000, on=DAY)).final_price == 850
            assert (await resolve_price(db, sid, anna.id, 1000, on=date(2026, 10, 21))).final_price == 1000
            assert (await resolve_price(db, sid, boris.id, 1000, on=date(2026, 12, 30))).final_price == 850
            assert (await resolve_price(db, sid, boris.id, 1000, on=DAY)).final_price == 1000

            # Новички — та же категория, что фильтр Клиентов: зарегистрированный
            # вчера Виктор новичок, Анна (2020) — нет.
            await db.execute(DiscountCampaign.__table__.delete().where(DiscountCampaign.studio_id == sid))
            victor = Client(studio_id=sid, name="Victor", is_active=True,
                            registration_date=datetime.utcnow() - timedelta(days=1))
            db.add(victor)
            db.add(DiscountCampaign(studio_id=sid, name="Новичкам", discount_type="percent", value=10,
                                    audience="segments", segments=["new", "vip"]))
            await db.flush()
            assert (await resolve_price(db, sid, victor.id, 1000)).final_price == 900
            assert (await resolve_price(db, sid, anna.id, 1000)).final_price == 1000
            anna.status = "vip"
            await db.flush()
            assert (await resolve_price(db, sid, anna.id, 1000)).final_price == 900
            await db.rollback()
    asyncio.run(run())


def test_best_minimum_program_and_usage():
    async def run():
        async with async_session_maker() as db:
            sid = await _studio(db, "TEST-DISCOUNT-BEST")
            client = Client(studio_id=sid, name="Kate", is_active=True, registration_date=datetime(2020, 1, 1))
            db.add(client)
            small = DiscountCampaign(studio_id=sid, name="10", discount_type="percent", value=10)
            big = DiscountCampaign(studio_id=sid, name="300 от 2000", discount_type="amount", value=300,
                                   min_purchase_amount=2000)
            paused = DiscountCampaign(studio_id=sid, name="Пауза", discount_type="percent", value=90, is_active=False)
            db.add_all([small, big, paused]); await db.flush()

            # Ниже минимальной суммы крупная не работает — берётся 10 %.
            cheap = await resolve_price(db, sid, client.id, 1000)
            assert cheap.final_price == 900 and cheap.campaign.name == "10"
            # Выше — самая выгодная из двух (300 > 10 % от 2000).
            rich = await resolve_price(db, sid, client.id, 2000)
            assert rich.final_price == 1700 and rich.campaign.name == "300 от 2000"
            assert big.used_count == 0  # расчёт ничего не тратит
            rich.mark_used()
            assert big.used_count == 1

            # Программа выключена — ни одна скидка студии не действует.
            cfg = (await db.execute(select(StudioDiscountConfig).where(
                StudioDiscountConfig.studio_id == sid))).scalar_one()
            cfg.is_enabled = False
            await db.flush()
            assert (await resolve_price(db, sid, client.id, 2000)).final_price == 2000
            await db.rollback()
    asyncio.run(run())


def test_endpoints():
    async def run():
        async with async_session_maker() as db:
            mine = Studio(name="TEST-DISCOUNT-API", tz_iana="Europe/Prague")
            other = Studio(name="TEST-DISCOUNT-API-OTHER")
            db.add_all([mine, other]); await db.flush()
            anna = Client(studio_id=mine.id, name="Anna", last_name="Smith", is_active=True)
            stranger = Client(studio_id=other.id, name="Eve", is_active=True)
            db.add_all([anna, stranger])
            await db.commit()
            ids = (mine.id, other.id, anna.id, stranger.id)
        sid, other_id, anna_id, stranger_id = ids
        try:
            async with async_session_maker() as db:
                # Первая скидка включает программу (строки конфига ещё нет).
                created = await create_discount_campaign(DiscountCampaignCreate(
                    name="  Анне  ", value=15, audience="clients", client_ids=[anna_id, anna_id],
                ), _ctx(sid), db)
                assert created.name == "Анне" and created.client_ids == [anna_id]
                assert [c.name for c in created.clients] == ["Anna Smith"]
                assert created.status == "active"
                cfg = (await db.execute(select(StudioDiscountConfig).where(
                    StudioDiscountConfig.studio_id == sid))).scalar_one()
                assert cfg.is_enabled

                with pytest.raises(HTTPException) as caught:
                    await create_discount_campaign(DiscountCampaignCreate(
                        name="Чужой", value=5, audience="clients", client_ids=[stranger_id],
                    ), _ctx(sid), db)
                assert caught.value.status_code == 404

                # Правка проверяет итог целиком: «группам» без групп — отказ.
                with pytest.raises(HTTPException) as caught:
                    await update_discount_campaign(created.id, DiscountCampaignUpdate(audience="segments"),
                                                   _ctx(sid), db)
                assert caught.value.status_code == 422
                future = date.today() + timedelta(days=30)
                moved = await update_discount_campaign(created.id, DiscountCampaignUpdate(
                    valid_from=future, is_active=True), _ctx(sid), db)
                assert moved.status == "scheduled" and moved.client_ids == [anna_id]
                paused = await update_discount_campaign(created.id, DiscountCampaignUpdate(is_active=False),
                                                        _ctx(sid), db)
                assert paused.status == "paused"

                # Выключенная программа включается, когда скидку включают обратно.
                cfg.is_enabled = False
                await db.commit()
                await update_discount_campaign(created.id, DiscountCampaignUpdate(is_active=True), _ctx(sid), db)
                await db.refresh(cfg)
                assert cfg.is_enabled

                listed = await list_discount_campaigns(_ctx(sid), db)
                assert [c.id for c in listed] == [created.id]
                assert await list_discount_campaigns(_ctx(other_id), db) == []

                reach = await discount_reach(segments=["new"], birthday_window_days=3, ctx=_ctx(sid), db=db)
                assert reach.clients == 1 and reach.total == reach.segments["new"]
                assert set(reach.segments) == {"new", "vip", "active", "inactive", "has_subscription", "birthday"}

                with pytest.raises(HTTPException) as caught:
                    await delete_discount_campaign(created.id, _ctx(other_id), db)
                assert caught.value.status_code == 404
                await delete_discount_campaign(created.id, _ctx(sid), db)
                assert await list_discount_campaigns(_ctx(sid), db) == []

            for bad in (
                dict(name="Ничего", value=5, applies_to="selected"),
                dict(name="Много", value=101),
                dict(name="Задом", value=5, valid_from=date(2026, 10, 10), valid_until=date(2026, 10, 1)),
                dict(name="   ", value=5),
                dict(name="Никому", value=5, audience="clients"),
            ):
                with pytest.raises(ValidationError):
                    DiscountCampaignCreate(**bad)
        finally:
            async with async_session_maker() as db:
                await db.execute(Studio.__table__.delete().where(Studio.id.in_([sid, other_id])))
                await db.commit()
    asyncio.run(run())

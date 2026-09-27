"""Промокод на одного клиента и период действия «с … по …».

Проверяется то, за что отвечают деньги:
  * личный промокод принимается только у своего клиента — ни у другого, ни в
    продаже без клиента (иначе код, пересланный подруге, работал бы и у неё);
  * период включительный с обеих сторон: в первый и последний день код
    действует, накануне и назавтра — нет;
  * касса (calculate) не падает на чужом коде, а честно говорит promo_valid=False;
  * создание: клиент чужой студии — 404, начало позже конца — отказ схемы,
    в ответе и в списке — имя клиента.

Реальная БД. Проверки движка — в транзакции с откатом; эндпоинт создания
коммитит сам, его студия удаляется в конце (клиенты и коды уходят каскадом).

Запуск из back/:  python -m pytest tests/test_promo_client_period.py -q
"""
import asyncio
import importlib
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from database import async_session_maker
from dependencies import StudioContext
from models import Client, Studio, StudioPromoCode, StudioSubscriptionProgramConfig, SubscriptionPackage
from routers.loyalty.promocodes import create_promocode, find_valid_promo, list_promocodes
from schemas.checkout import CheckoutCalculateRequest
from schemas.loyalty import PromoCodeCreate

CO = importlib.import_module("routers.checkout.router")
TODAY = date.today()


class _User:
    id = 1


def _ctx(studio_id):
    return StudioContext(user=_User(), studio_id=studio_id, role="owner")


async def _refused(coro, reason):
    with pytest.raises(HTTPException) as caught:
        await coro
    assert caught.value.status_code == 400 and caught.value.detail == reason, caught.value.detail


def test_personal_code_and_inclusive_period():
    async def run():
        async with async_session_maker() as db:
            studio = Studio(name="TEST-PROMO-PERSONAL")
            db.add(studio); await db.flush()
            sid = studio.id
            anna = Client(studio_id=sid, name="Anna", is_active=True)
            boris = Client(studio_id=sid, name="Boris", is_active=True)
            db.add_all([anna, boris]); await db.flush()
            db.add_all([
                StudioPromoCode(studio_id=sid, code="ANNA20", discount_type="percent", value=20, client_id=anna.id),
                StudioPromoCode(studio_id=sid, code="SOON", discount_type="percent", value=10,
                                valid_from=TODAY + timedelta(days=1)),
                StudioPromoCode(studio_id=sid, code="TODAY", discount_type="percent", value=10,
                                valid_from=TODAY, valid_until=TODAY),
                StudioPromoCode(studio_id=sid, code="GONE", discount_type="percent", value=10,
                                valid_from=TODAY - timedelta(days=10), valid_until=TODAY - timedelta(days=1)),
            ])
            await db.flush()

            # Личный код: у своего клиента — да, у чужого и без клиента — нет.
            assert (await find_valid_promo(sid, "anna20", db, anna.id)).client_id == anna.id
            await _refused(find_valid_promo(sid, "ANNA20", db, boris.id), "Промокод выписан другому клиенту")
            await _refused(find_valid_promo(sid, "ANNA20", db), "Промокод выписан другому клиенту")

            # Период: обе границы включительно.
            assert (await find_valid_promo(sid, "TODAY", db, boris.id)).code == "TODAY"
            await _refused(find_valid_promo(sid, "SOON", db, boris.id), "Промокод ещё не действует")
            await _refused(find_valid_promo(sid, "GONE", db, boris.id), "Срок действия промокода истёк")

            # Касса: чужой личный код не роняет расчёт, а не даёт скидки.
            cfg = StudioSubscriptionProgramConfig(studio_id=sid, is_enabled=True)
            db.add(cfg); await db.flush()
            pkg = SubscriptionPackage(studio_id=sid, config_id=cfg.id, name="8 занятий", class_count=8,
                                      price=10000, per_visit_price=1250, is_active=True)
            db.add(pkg); await db.flush()
            for client, valid, total in ((anna, True, 8000), (boris, False, 10000)):
                result = await CO.calculate(CheckoutCalculateRequest(
                    client_id=client.id, product_id=pkg.id, product_type="subscription", promo_code="ANNA20",
                ), _ctx(sid), db)
                assert (result.promo_valid, result.total_price) == (valid, total), (client.name, result)

            await db.rollback()
    asyncio.run(run())


def test_create_personal_code_with_period():
    async def run():
        async with async_session_maker() as db:
            mine, other = Studio(name="TEST-PROMO-CREATE"), Studio(name="TEST-PROMO-OTHER")
            db.add_all([mine, other]); await db.flush()
            anna = Client(studio_id=mine.id, name="Anna", last_name="Smith", is_active=True)
            stranger = Client(studio_id=other.id, name="Eve", is_active=True)
            db.add_all([anna, stranger])
            await db.commit()
            ids = (mine.id, other.id, anna.id, stranger.id)
        sid, other_id, anna_id, stranger_id = ids
        try:
            async with async_session_maker() as db:
                created = await create_promocode(PromoCodeCreate(
                    code="anna-oct", value=15, client_id=anna_id,
                    valid_from=TODAY, valid_until=TODAY + timedelta(days=30),
                ), _ctx(sid), db)
                assert created.code == "ANNA-OCT"
                assert (created.client_id, created.client_name) == (anna_id, "Anna Smith")
                assert (created.valid_from, created.valid_until) == (TODAY, TODAY + timedelta(days=30))

                listed = {p.code: p for p in await list_promocodes(_ctx(sid), db)}
                assert listed["ANNA-OCT"].client_name == "Anna Smith"

                with pytest.raises(HTTPException) as caught:
                    await create_promocode(PromoCodeCreate(code="EVE", value=5, client_id=stranger_id), _ctx(sid), db)
                assert caught.value.status_code == 404

            with pytest.raises(ValidationError):
                PromoCodeCreate(code="BACKWARDS", value=5, valid_from=TODAY, valid_until=TODAY - timedelta(days=1))
        finally:
            async with async_session_maker() as db:
                await db.execute(Studio.__table__.delete().where(Studio.id.in_([sid, other_id])))
                await db.commit()
    asyncio.run(run())

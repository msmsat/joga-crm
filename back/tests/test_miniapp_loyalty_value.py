"""Цена балла в кабинете клиента совпадает с ценой балла на кассе.

Раздел «Клуб» подписывает баланс деньгами («1 250 ₴») и объясняет курс словами.
Пока это была отдельная формула (`balance // rate`), кабинет обещал в rate раз
меньше, чем касса реально снимала с цены: 1 250 баллов показывались как «12 ₴»
и гасили 1 250 ₴. Здесь эти две стороны сравниваются напрямую — снимок
`GET /global/loyalty` против расчёта чека `_quote`, — поэтому разойтись молча
они больше не могут.

Второе, что здесь защищается: цена балла зависит от уровня
(`LoyaltyLevel.point_value`). Клиент на ступени «2 ₴ за балл» обязан получить
вдвое больше и в кабинете, и в чеке — одним и тем же числом.

Реальная БД. Ручка кабинета коммитит (она может создать лестницу уровней),
поэтому студия удаляется явно, а не откатом.

Запуск из back/:  python -m tests.test_miniapp_loyalty_value
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete
from starlette.requests import Request

from database import async_session_maker
from ratelimit import limiter
from models import (
    Client, ClientLoyaltyCard, LoyaltyLevel, Studio, StudioLoyaltyConfig,
    StudioSubscriptionProgramConfig, SubscriptionPackage,
)
from services.notifier import _fmt_amount
from services.points import redeem_points

CO = importlib.import_module("routers.checkout.router")
ML = importlib.import_module("routers.booking.miniapp_loyalty")

PRICE = 1_000
POINTS = 200
RATE = 100
CURRENCY = "CZK"
# Клиент стоит на верхней ступени: потрачено 60 000 при пороге 50 000.
SPENT = 60_000
TOP_POINT_VALUE = 2

limiter.enabled = False


def _Req() -> Request:
    """Настоящий starlette.Request: slowapi отказывается работать с заглушкой."""
    return Request({
        "type": "http", "method": "GET", "path": "/", "headers": [],
        "query_string": b"", "client": ("127.0.0.1", 0),
    })


async def _run():
    async with async_session_maker() as db:
        studio = Studio(name="TEST-MINIAPP-LOYALTY-VALUE", currency=CURRENCY)
        db.add(studio)
        await db.flush()

        sub_cfg = StudioSubscriptionProgramConfig(studio_id=studio.id, is_enabled=True)
        db.add(sub_cfg)
        db.add(StudioLoyaltyConfig(
            studio_id=studio.id, is_enabled=True, points_exchange_rate=RATE,
            expiry_period="6m", program_name="Test Club",
        ))
        await db.flush()

        package = SubscriptionPackage(
            studio_id=studio.id, config_id=sub_cfg.id, name="Абонемент 8",
            class_count=8, price=PRICE, per_visit_price=PRICE // 8, duration_days=90,
        )
        client = Client(studio_id=studio.id, name="Katya", is_active=True)
        db.add_all([package, client])
        await db.flush()

        db.add(ClientLoyaltyCard(
            studio_id=studio.id, client_id=client.id,
            points_balance=POINTS, total_spent=SPENT,
        ))
        # Своя лестница вместо дефолтной: на верхней ступени балл стоит вдвое.
        db.add_all([
            LoyaltyLevel(studio_id=studio.id, name="Золото", color="#F0C040",
                         min_threshold=0, max_threshold=50_000, sort_order=0, point_value=1),
            LoyaltyLevel(studio_id=studio.id, name="Бриллиант", color="#B0B0C0",
                         min_threshold=50_000, max_threshold=None, sort_order=1,
                         point_value=TOP_POINT_VALUE),
        ])
        await db.flush()

        try:
            overview = await ML.get_loyalty_overview(_Req(), client, db)

            # Касса: цена заведомо больше баланса, поэтому спишутся все баллы —
            # ровно та сумма, которую кабинет обещает строкой points_value_str.
            quote = await CO._quote(
                db, studio.id, client.id, package, "subscription", None, True, False, None,
            )
            assert quote.point_value == TOP_POINT_VALUE, quote.point_value
            assert quote.bonuses_applied == POINTS, quote.bonuses_applied
            # Главное: 200 баллов на этой ступени снимают 400, а не 200.
            assert quote.bonuses_value == POINTS * TOP_POINT_VALUE, quote.bonuses_value
            assert quote.total_price == PRICE - POINTS * TOP_POINT_VALUE, quote.total_price
            assert overview.points_value_str == _fmt_amount(quote.bonuses_value, CURRENCY), (
                overview.points_value_str, quote.bonuses_value,
            )

            # Курс словами — то, из чего собрано объяснение в «Как это работает».
            assert overview.earn_rate_str == _fmt_amount(RATE, CURRENCY), overview.earn_rate_str
            assert overview.point_unit_str == _fmt_amount(TOP_POINT_VALUE, CURRENCY), overview.point_unit_str
            assert overview.points_expiry == "6m", overview.points_expiry

            # Лестница несёт выгоду каждой ступени, а не только пороги.
            ladder = {lvl.name: lvl.point_value for lvl in overview.levels}
            assert ladder == {"Золото": 1, "Бриллиант": TOP_POINT_VALUE}, ladder
            # Клиент уже наверху — обещать «дальше дороже» нечем.
            assert overview.next_point_unit_str is None, overview.next_point_unit_str
        finally:
            # get_loyalty_overview коммитит — откат студию уже не уберёт.
            # Core-DELETE, а не db.delete(): ORM-каскад обнуляет studio_id у
            # загруженных детей (NOT NULL), а ON DELETE CASCADE в схеме сносит
            # клиента, карту и пакет сам.
            await db.execute(delete(Studio).where(Studio.id == studio.id))
            await db.commit()


def test_miniapp_loyalty_value():
    asyncio.run(_run())


def test_redeem_points_arithmetic():
    """Правило списания без БД — три случая, на которых оно ломается.

    Цена 1 обязана вести себя ровно как прежняя `min(balance, remaining)`,
    иначе апдейт молча переоценил бы баллы у всех, кто уровни не настраивал.
    """
    # Прежнее поведение при цене балла 1.
    assert redeem_points(200, 1_000, 1) == (200, 200)
    assert redeem_points(5_000, 1_000, 1) == (1_000, 1_000)

    # Цена 2: баллов хватает с запасом — берём ровно столько, сколько нужно.
    assert redeem_points(5_000, 1_000, 2) == (500, 1_000)
    # Баллов не хватает — покрываем, сколько можем, остаток к оплате.
    assert redeem_points(200, 1_000, 2) == (200, 400)
    # Нечётный остаток: последний балл перекрывает его целиком, чтобы к оплате
    # не осталась единица (её не проведёт ни один эквайринг).
    assert redeem_points(5_000, 5, 2) == (3, 5)

    # Вырожденные входы ничего не списывают.
    assert redeem_points(0, 1_000, 2) == (0, 0)
    assert redeem_points(200, 0, 2) == (0, 0)


if __name__ == "__main__":
    test_redeem_points_arithmetic()
    test_miniapp_loyalty_value()
    print("ALL PASS — балл в кабинете стоит столько же, сколько на кассе")

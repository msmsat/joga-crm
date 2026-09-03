"""Покупка абонемента клиентом в мини-приложении: промокод, сертификат,
депозит, баллы.

Главное свойство, которое здесь защищается: **брошенная оплата ничего не съедает**.
Создание сессии Stripe только считает цену; сертификат, депозит и баллы
списываются на вебхуке, после подтверждённого списания. Клиент, закрывший
вкладку Stripe, обязан остаться при своих.

Второе: касса CRM и мини-приложение считают ОДНИМ движком (`_quote`), поэтому
итог не может разойтись — здесь это проверяется прямым сравнением.

Реальная БД, откат.

Запуск из back/:  python -m tests.test_miniapp_checkout
"""
import asyncio
import importlib
import os
import secrets
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import select
from starlette.requests import Request

from database import async_session_maker
from ratelimit import limiter
from models import (
    Account, Client, ClientLoyaltyCard, ClientSubscription, GiftCertificate,
    StripeCheckout, Studio, StudioPromoCode, StudioSubscriptionProgramConfig,
    SubscriptionPackage,
)
from services.studio_link import public_ref

CO = importlib.import_module("routers.checkout.router")
MU = importlib.import_module("routers.booking.miniapp_users")
SP = importlib.import_module("routers.checkout.stripe_pay")

PRICE = 1000


# Предпросмотр цены дёргается на каждый символ промокода — в тесте лимит только
# мешает (та же причина, что в test_miniapp_email_auth.py).
limiter.enabled = False


def _Req(origin: str | None = None) -> Request:
    """Настоящий starlette.Request: slowapi отказывается работать с заглушкой."""
    headers = [(b"origin", origin.encode())] if origin else []
    return Request({
        "type": "http", "method": "POST", "path": "/", "headers": headers,
        "query_string": b"", "client": ("127.0.0.1", 0),
    })


def _code(prefix="GC") -> str:
    # Сертификат гасится внутри закоммиченной транзакции — код обязан быть
    # уникальным и между прогонами теста.
    return f"{prefix}-" + secrets.token_hex(6).upper()


async def _setup(db, *, deposit=0, points=0):
    studio = Studio(name="TEST-MINIAPP-CHECKOUT", currency="CZK")
    db.add(studio)
    await db.flush()

    cfg = StudioSubscriptionProgramConfig(studio_id=studio.id, is_enabled=True)
    db.add(cfg)
    await db.flush()

    package = SubscriptionPackage(
        studio_id=studio.id, config_id=cfg.id, name="Абонемент 8",
        class_count=8, price=PRICE, per_visit_price=PRICE // 8, duration_days=90,
    )
    client = Client(studio_id=studio.id, name="Katya", is_active=True)
    db.add_all([package, client])
    await db.flush()

    db.add(Account(studio_id=studio.id, name="Онлайн", type="online", balance=0, color="#000000"))
    db.add(ClientLoyaltyCard(
        studio_id=studio.id, client_id=client.id,
        deposit_balance=deposit, points_balance=points,
    ))
    await db.flush()
    return studio.id, package, client


async def _run():
    # ─── Возврат с оплаты ведёт на ТОТ ЖЕ origin, с которого платили ─────────
    # Сессия клиента (JWT) лежит в localStorage, а он у каждого origin свой:
    # вернув с дев-сервера на боевой домен, мы просим человека войти заново.
    async with async_session_maker() as db:
        sid, package, client = await _setup(db)
        # В ссылку идёт публичный код студии, а не её id (services/studio_link).
        ref = await public_ref(db, sid)
        saved = {k: os.environ.get(k) for k in ("MINIAPP_URL", "CORS_ORIGINS")}
        os.environ["MINIAPP_URL"] = "https://api.example.online"
        os.environ["CORS_ORIGINS"] = "http://localhost:5174,https://api.example.online"
        try:
            base = await MU._checkout_return_base(db, client, False, _Req("http://localhost:5174"))
            assert base == f"http://localhost:5174/s/{ref}?pay=", base

            # Origin не из белого списка — открытый редирект со страницы Stripe.
            # Падаем в MINIAPP_URL, а не идём куда сказали.
            base = await MU._checkout_return_base(db, client, False, _Req("https://evil.example"))
            assert base == f"https://api.example.online/s/{ref}?pay=", base

            # Origin вообще не пришёл — прежнее поведение.
            base = await MU._checkout_return_base(db, client, False, _Req())
            assert base == f"https://api.example.online/s/{ref}?pay=", base
        finally:
            # Env глобальный на весь прогон pytest — не утекаем в соседние файлы.
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        await db.rollback()

    # ─── calculate: депозит + баллы + сертификат складываются, остаток верный ──
    async with async_session_maker() as db:
        sid, package, client = await _setup(db, deposit=300, points=200)
        cert_code = _code()
        db.add(GiftCertificate(
            studio_id=sid, code=cert_code, amount=250, cert_type="gift", status="active",
        ))
        await db.flush()

        result = await MU.calculate_checkout(
            _Req(),
            MU.CheckoutCalcRequest(
                package_id=package.id, use_bonuses=True, use_deposit=True,
                certificate_code=cert_code,
            ),
            client, db,
        )
        # 1000 − 250 (сертификат) − 300 (депозит) − 200 (баллы) = 250
        assert result.certificate_applied == 250, result
        assert result.deposit_applied == 300, result
        assert result.bonuses_applied == 200, result
        assert result.total_price == 250, result
        assert result.fully_covered is False

        # Предпросмотр НИЧЕГО не списывает — иначе открытая форма съедала бы баллы.
        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one()
        await db.refresh(card)
        assert card.points_balance == 200 and card.deposit_balance == 300
        cert = (await db.execute(
            select(GiftCertificate).where(GiftCertificate.code == cert_code)
        )).scalar_one()
        assert cert.status == "active"

        await db.rollback()

    # ─── Мини-приложение и касса CRM считают ОДИН И ТОТ ЖЕ итог ──────────────
    async with async_session_maker() as db:
        sid, package, client = await _setup(db, deposit=400, points=150)
        promo = StudioPromoCode(
            studio_id=sid, code=_code("PROMO"), discount_type="percent", value=10, is_active=True,
        )
        db.add(promo)
        await db.flush()

        mini = await MU.calculate_checkout(
            _Req(),
            MU.CheckoutCalcRequest(
                package_id=package.id, promo_code=promo.code,
                use_bonuses=True, use_deposit=True,
            ),
            client, db,
        )
        cashier = await CO._quote(
            db, sid, client.id, package, "subscription", promo.code, True, True, None,
        )
        assert mini.total_price == cashier.total_price, (mini.total_price, cashier.total_price)
        # 1000 − 100 (промо 10%) − 400 (депозит) − 150 (баллы) = 350
        assert mini.total_price == 350, mini.total_price

        await db.rollback()

    # ─── Полное покрытие: Stripe не нужен, абонемент выдан, списания прошли ───
    async with async_session_maker() as db:
        sid, package, client = await _setup(db, deposit=PRICE, points=0)

        response = await MU.create_checkout_session(
            _Req(),
            MU.CheckoutSessionRequest(package_id=package.id, use_deposit=True),
            client, db,
        )
        assert response.paid is True and response.url is None, response

        sub = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == client.id)
        )).scalar_one()
        assert sub.total_classes == package.class_count

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one()
        await db.refresh(card)
        assert card.deposit_balance == 0, "депозит не списан"

        # Чистим за собой: _grant_fully_covered коммитит, rollback его не вернёт.
        await db.delete(sub)
        await db.commit()

    # ─── Вебхук: списывает сертификат и баллы ТОЛЬКО при подтверждённой оплате ─
    async with async_session_maker() as db:
        sid, package, client = await _setup(db, deposit=0, points=200)
        cert_code = _code()
        db.add(GiftCertificate(
            studio_id=sid, code=cert_code, amount=300, cert_type="gift", status="active",
        ))
        await db.flush()

        # Заявка в том виде, в каком её кладёт create_checkout_session.
        checkout = StripeCheckout(
            studio_id=sid, user_id=None, session_id=f"cs_test_{secrets.token_hex(8)}",
            account_id="acct_test",
            payload={
                "client_id": client.id, "package_id": package.id,
                "promo_code": None, "use_bonuses": True,
                "use_deposit": False, "certificate_code": cert_code,
            },
            amount=500,  # 1000 − 300 (сертификат) − 200 (баллы)
            application_fee=0,
        )
        db.add(checkout)
        await db.flush()

        await SP._apply_client_subscription_purchase(db, checkout)

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one()
        await db.refresh(card)
        assert card.points_balance == 0, "баллы не списаны на вебхуке"
        cert = (await db.execute(
            select(GiftCertificate).where(GiftCertificate.code == cert_code)
        )).scalar_one()
        await db.refresh(cert)
        assert cert.status == "used", "сертификат не погашен на вебхуке"

        sub = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == client.id)
        )).scalar_one()
        await db.delete(sub)
        # И заявку тоже. Оставленная в `pending`, она попадает в
        # stripe_pay.reconcile_pending на боевом сервере, который смотрит в эту же
        # dev-БД: сверка идёт с НАСТОЯЩИМ ключом в аккаунт `acct_test`, получает
        # PermissionError и раз в час поднимает тревогу на пустом месте.
        await db.delete(checkout)
        await db.commit()

    # ─── Возврат оплаты возвращает и баллы, и депозит, и сертификат ─────────
    # Иначе клиент, купивший абонемент за сертификат + карту, после возврата
    # остался бы и без абонемента, и без сертификата.
    async with async_session_maker() as db:
        sid, package, client = await _setup(db, deposit=200, points=100)
        cert_code = _code()
        db.add(GiftCertificate(
            studio_id=sid, code=cert_code, amount=300, cert_type="gift", status="active",
        ))
        await db.flush()

        checkout = StripeCheckout(
            studio_id=sid, user_id=None, session_id=f"cs_test_{secrets.token_hex(8)}",
            account_id="acct_test",
            payload={
                "client_id": client.id, "package_id": package.id,
                "promo_code": None, "use_bonuses": True,
                "use_deposit": True, "certificate_code": cert_code,
            },
            amount=400,  # 1000 − 300 (сертификат) − 200 (депозит) − 100 (баллы)
            application_fee=0,
        )
        db.add(checkout)
        await db.flush()

        sub_id = await SP._apply_client_subscription_purchase(db, checkout)
        checkout.subscription_id = sub_id

        # Опись списанного сохранена — по ней и пойдёт откат.
        assert checkout.payload.get(SP.CONSUMED_KEY) == {
            "bonuses": 100, "deposit": 200, "certificate_code": cert_code,
        }, checkout.payload

        await SP._revert_sale(db, checkout)
        await db.flush()

        card = (await db.execute(
            select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client.id)
        )).scalar_one()
        await db.refresh(card)
        assert card.points_balance == 100, "баллы не вернулись"
        assert card.deposit_balance == 200, "депозит не вернулся"

        cert = (await db.execute(
            select(GiftCertificate).where(GiftCertificate.code == cert_code)
        )).scalar_one()
        await db.refresh(cert)
        assert cert.status == "active", "сертификат не вернулся"
        assert cert.used_at is None

        sub = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.id == sub_id)
        )).scalar_one()
        assert sub.status == "cancelled"

        # Повторный откат (спор поверх возврата) не начисляет второй раз.
        await SP._revert_sale(db, checkout)
        await db.flush()
        await db.refresh(card)
        assert card.points_balance == 100 and card.deposit_balance == 200

        await db.delete(sub)
        await db.delete(checkout)      # см. выше: иначе заявка живёт в БД вечно
        await db.commit()

    # ─── Вебхук: сумма разошлась со списанной → продажу не проводим ──────────
    # Клиент потратил баллы в другом окне между созданием сессии и оплатой.
    async with async_session_maker() as db:
        sid, package, client = await _setup(db, deposit=0, points=0)

        checkout = StripeCheckout(
            studio_id=sid, user_id=None, session_id=f"cs_test_{secrets.token_hex(8)}",
            account_id="acct_test",
            payload={
                "client_id": client.id, "package_id": package.id,
                "promo_code": None, "use_bonuses": True,
                "use_deposit": False, "certificate_code": None,
            },
            amount=800,  # рассчитывали на 200 баллов, которых уже нет → выйдет 1000
            application_fee=0,
        )
        db.add(checkout)
        await db.flush()

        try:
            await SP._apply_client_subscription_purchase(db, checkout)
            raise AssertionError("продажа проведена по разошедшейся сумме")
        except HTTPException as exc:
            assert exc.status_code == 400, exc

        await db.rollback()


def test_miniapp_checkout():
    asyncio.run(_run())


if __name__ == "__main__":
    test_miniapp_checkout()
    print("ALL PASS — покупка в мини-приложении: бонусы, сертификат, депозит")

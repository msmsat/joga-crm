"""Мини-приложение покупает абонемент через Stripe Connect (блок 6,
EPIC_MA_REAL_BACKEND) — ветка apply_paid для заявок без кассира
(StripeCheckout.user_id is None).

Реальная БД. Функция коммитит сама (как perform_pay) — rollback её не
отменит, поэтому в конце теста строки удаляются явно, а не откатываются.

Запуск из back/:  python -m tests.test_miniapp_stripe_checkout
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    Client, ClientPayment, ClientSubscription, Studio, StripeCheckout,
    StudioSubscriptionProgramConfig, SubscriptionPackage,
)
from routers.checkout.stripe_pay import _apply_client_subscription_purchase


async def _run():
    async with async_session_maker() as db:
        studio = Studio(name="TEST-MINIAPP-STRIPE-CHECKOUT")
        db.add(studio)
        await db.flush()
        sid = studio.id

        client = Client(studio_id=sid, name="Mini App Buyer", is_active=True)
        db.add(client)
        await db.flush()

        config = StudioSubscriptionProgramConfig(studio_id=sid)
        db.add(config)
        await db.flush()

        package = SubscriptionPackage(
            studio_id=sid, config_id=config.id, name="Test Pack",
            class_count=8, price=1000, per_visit_price=125,
        )
        db.add(package)
        await db.flush()

        checkout = StripeCheckout(
            studio_id=sid, user_id=None, session_id="cs_test_miniapp_checkout_1",
            account_id="acct_test", payload={"client_id": client.id, "package_id": package.id},
            amount=1000,
        )
        db.add(checkout)
        await db.flush()

        # ─── Ветка apply_paid проводит покупку: абонемент + запись оплаты ────
        await _apply_client_subscription_purchase(db, checkout)

        sub = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == client.id)
        )).scalar_one()
        assert sub.total_classes == 8
        assert sub.used_classes == 0
        assert sub.status == "active"
        assert sub.package_id == package.id

        payment = (await db.execute(
            select(ClientPayment).where(ClientPayment.client_id == client.id)
        )).scalar_one()
        assert payment.amount == 1000
        assert payment.status == "success"
        # Тот же action_type, что и у продажи из кассы (attach_subscription
        # его не различает по источнику) — HistoryModal.tsx матчит именно это
        # значение, не "buy_subscription".
        assert payment.action_type == "subscription"

        # ─── Пакет сняли с продажи между созданием сессии Stripe и оплатой ───
        package.is_active = False
        await db.flush()

        checkout2 = StripeCheckout(
            studio_id=sid, user_id=None, session_id="cs_test_miniapp_checkout_2",
            account_id="acct_test", payload={"client_id": client.id, "package_id": package.id},
            amount=1000,
        )
        db.add(checkout2)
        await db.flush()

        try:
            await _apply_client_subscription_purchase(db, checkout2)
            raised = False
        except Exception:
            raised = True
        # is_active=False не убирает пакет из выборки в _apply_client_subscription_purchase
        # (она ищет по id, не по is_active) — это осознанно: пакет мог быть
        # снят с продажи ПОСЛЕ создания сессии Stripe, деньги уже списаны, и
        # клиент всё равно должен получить то, за что заплатил. Проверяем
        # обратное: полностью удалённый пакет — вот это уже 400.
        assert raised is False

        await db.execute(delete(SubscriptionPackage).where(SubscriptionPackage.id == package.id))
        await db.flush()
        checkout3 = StripeCheckout(
            studio_id=sid, user_id=None, session_id="cs_test_miniapp_checkout_3",
            account_id="acct_test", payload={"client_id": client.id, "package_id": 999999999},
            amount=1000,
        )
        db.add(checkout3)
        await db.flush()
        try:
            await _apply_client_subscription_purchase(db, checkout3)
            assert False, "удалённый пакет должен бросить HTTPException"
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 400

        # ─── Уборка: функция коммитит сама, поэтому чистим явно ──────────────
        await db.execute(delete(ClientPayment).where(ClientPayment.client_id == client.id))
        await db.execute(delete(ClientSubscription).where(ClientSubscription.client_id == client.id))
        await db.execute(delete(StripeCheckout).where(StripeCheckout.studio_id == sid))
        await db.execute(delete(Client).where(Client.id == client.id))
        await db.execute(delete(StudioSubscriptionProgramConfig).where(StudioSubscriptionProgramConfig.id == config.id))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


def test_apply_client_subscription_purchase():
    asyncio.run(_run())


if __name__ == "__main__":
    test_apply_client_subscription_purchase()
    print("ALL PASS — miniapp Stripe checkout apply_paid branch (block 6, EPIC_MA_REAL_BACKEND)")

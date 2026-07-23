"""Действия сценариев (V5-4, задача 3; renewal_offer — V5-5, задача 3):
баллы, занятия, сертификат, оффер.

Реальная БД, одна транзакция с откатом. Проверяет, что награда выдаётся
(и без email тоже), а renewal_offer создаёт реальный ClientOffer (не дублирует
активный, не создаёт ничего при discount=0).
Запуск из back/:  python -m tests.test_scenario_actions
"""
import asyncio
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

from sqlalchemy import func, select

from database import async_session_maker
from models import (
    Client, ClientLoyaltyCard, ClientOffer, ClientSubscription, GiftCertificate, LoyaltyScenario, Studio,
)
from services import scenario_runner as R
from services.loyalty_matching import Match


def _scn(db, sid, atype, aparams):
    x = LoyaltyScenario(studio_id=sid, trigger_type="inactive_days", trigger_params={"days": 21},
                        action_type=atype, action_params=aparams, channel="email", is_enabled=True)
    db.add(x)
    return x


async def _run():
    async with async_session_maker() as db:
        s = Studio(name="TEST-SCN-ACTIONS")
        db.add(s); await db.flush()
        sid = s.id
        today = date.today()

        c_pts = Client(studio_id=sid, name="Pts", email="p@x.com", is_active=True)
        c_gift_new = Client(studio_id=sid, name="GiftNew", email="g@x.com", is_active=True)
        c_gift_noemail = Client(studio_id=sid, name="GiftNoMail", email=None, is_active=True)
        c_cert = Client(studio_id=sid, name="Cert", last_name="Smith", email="c@x.com", is_active=True)
        c_off = Client(studio_id=sid, name="Off", email="o@x.com", is_active=True)
        for c in (c_pts, c_gift_new, c_gift_noemail, c_cert, c_off):
            db.add(c)
        await db.flush()

        exist = ClientSubscription(client_id=c_gift_noemail.id, type="Т", total_classes=3, used_classes=0,
                                   expires_at=today + timedelta(days=10), status="active")
        db.add(exist); await db.flush()

        # points
        await R._apply_action(db, _scn(db, sid, "points", {"points": 200}), Match(c_pts.id, "k"))
        await db.flush()
        bal = (await db.execute(
            select(ClientLoyaltyCard.points_balance).where(ClientLoyaltyCard.client_id == c_pts.id)
        )).scalar()
        assert bal == 200, bal

        # gift_classes без активного абонемента → новый бесплатный на 30 дней
        await R._apply_action(db, _scn(db, sid, "gift_classes", {"classes": 5}), Match(c_gift_new.id, "k"))
        await db.flush()
        newsub = (await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == c_gift_new.id)
        )).scalars().first()
        assert newsub and newsub.total_classes == 5 and newsub.type == "Подарок"
        assert (newsub.expires_at - today).days == 30

        # gift_classes с активным абонементом и без email → +N, награда всё равно
        await R._apply_action(db, _scn(db, sid, "gift_classes", {"classes": 2}), Match(c_gift_noemail.id, "k"))
        await db.flush()
        await db.refresh(exist)
        assert exist.total_classes == 5, exist.total_classes
        cnt = (await db.execute(
            select(func.count(ClientSubscription.id)).where(ClientSubscription.client_id == c_gift_noemail.id)
        )).scalar()
        assert cnt == 1, cnt

        # certificate
        await R._apply_action(db, _scn(db, sid, "certificate", {"amount": 1500}), Match(c_cert.id, "k"))
        await db.flush()
        cert = (await db.execute(
            select(GiftCertificate).where(GiftCertificate.client_id == c_cert.id)
        )).scalars().first()
        assert cert and cert.amount == 1500 and cert.status == "active"
        assert cert.recipient_name == "Cert Smith"
        assert cert.code.startswith("GC-")

        # renewal_offer — реальный ClientOffer в БД
        await R._apply_action(db, _scn(db, sid, "renewal_offer", {"discount": 15}), Match(c_off.id, "k"))
        await db.flush()
        offer = (await db.execute(
            select(ClientOffer).where(ClientOffer.client_id == c_off.id)
        )).scalars().first()
        assert offer and offer.value == 15 and offer.discount_type == "percent"
        assert offer.reason == "scenario" and offer.scope == "renewal" and not offer.is_used
        assert offer.valid_until == today + timedelta(days=30)

        # повторное срабатывание не плодит второй активный оффер — обновляет тот же
        await R._apply_action(db, _scn(db, sid, "renewal_offer", {"discount": 25}), Match(c_off.id, "k"))
        await db.flush()
        cnt = (await db.execute(
            select(func.count(ClientOffer.id)).where(ClientOffer.client_id == c_off.id)
        )).scalar()
        assert cnt == 1, cnt
        await db.refresh(offer)
        assert offer.value == 25

        # discount=0 — нечего предлагать, оффер не создаётся
        c_zero = Client(studio_id=sid, name="Zero", email="z@x.com", is_active=True)
        db.add(c_zero); await db.flush()
        await R._apply_action(db, _scn(db, sid, "renewal_offer", {"discount": 0}), Match(c_zero.id, "k"))
        await db.flush()
        zero_cnt = (await db.execute(
            select(func.count(ClientOffer.id)).where(ClientOffer.client_id == c_zero.id)
        )).scalar()
        assert zero_cnt == 0

        await db.rollback()


def test_scenario_actions():
    asyncio.run(_run())


if __name__ == "__main__":
    test_scenario_actions()
    print("ALL PASS")

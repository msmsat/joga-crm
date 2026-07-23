"""SubscriptionPackage.sold_as_single/sold_as_subscription (V5-6, Блок 3, Вариант A).
Дефолт True — обратная совместимость; create/update прокидывают оба флага.
Реальная БД, откат.

Запуск из back/:  python -m tests.test_package_sold_as_flags
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioSubscriptionProgramConfig, User
from schemas.loyalty import SubscriptionPackageCreate, SubscriptionPackageUpdate

PACKAGES = importlib.import_module("routers.loyalty.packages")


def _ctx(studio_id, role="owner"):
    return StudioContext(user=User(email="o@test.local", hashed_password="x", name="O"), studio_id=studio_id, role=role)


async def _run():
    async with async_session_maker() as db:
        s = Studio(name="TEST-PACKAGE-FLAGS")
        db.add(s); await db.flush()
        sid = s.id

        # Дефолт (флаги не переданы) → оба True — старый каталог продолжает
        # продаваться в обоих табах кассы без ручной миграции данных.
        body = SubscriptionPackageCreate(name="8 занятий", class_count=8, price=8000, per_visit_price=1200)
        pkg = await PACKAGES.create_package(body, _ctx(sid), db)
        assert pkg.sold_as_single is True
        assert pkg.sold_as_subscription is True

        # Явно только «Абонементы» — не показывать в «Разовых».
        body2 = SubscriptionPackageCreate(
            name="Только абонемент", class_count=12, price=12000, per_visit_price=1500,
            sold_as_single=False, sold_as_subscription=True,
        )
        pkg2 = await PACKAGES.create_package(body2, _ctx(sid), db)
        assert pkg2.sold_as_single is False
        assert pkg2.sold_as_subscription is True

        # PATCH меняет один флаг, не трогая второй.
        updated = await PACKAGES.update_package(pkg2.id, SubscriptionPackageUpdate(sold_as_single=True), _ctx(sid), db)
        assert updated.sold_as_single is True
        assert updated.sold_as_subscription is True

        await db.rollback()


def test_package_sold_as_flags():
    asyncio.run(_run())


if __name__ == "__main__":
    test_package_sold_as_flags()
    print("ALL PASS — package sold_as flags V5-6 Block3 зелёные")

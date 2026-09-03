"""Завести тестовую базу и поставить в неё схему.

Зачем отдельная база. Тесты пишут в БД, и пока это была база приложения, они
оставляли в ней заявки с `account_id='acct_test'`. Сверка оплат
(routers/checkout/stripe_pay.reconcile_pending) раз в час спрашивала о них
БОЕВЫМ ключом Stripe, получала PermissionError и слала тревогу в Telegram.

Схема ставится из моделей (`Base.metadata.create_all`), а не alembic'ом, и это
осознанно: тестам нужна схема, которую ждёт КОД, а миграция под свежую модель
может быть ещё не написана. Проверено — набор таблиц совпадает с базой
приложения один в один (кроме служебной alembic_version).

Запуск из back/:  python -m scripts.init_test_db
"""
import asyncio
import os
import re
import sys

import asyncpg
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv(override=True)


def _fail(message: str) -> None:
    print(f"ОШИБКА: {message}")
    sys.exit(1)


async def main() -> None:
    app_url = os.getenv("DATABASE_URL")
    test_url = os.getenv("TEST_DATABASE_URL")
    if not app_url:
        _fail("DATABASE_URL не задан")
    if not test_url:
        _fail("TEST_DATABASE_URL не задан — пропишите его в .env (см. .env.example)")

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from database import db_key
    from models import Base

    if db_key(test_url) == db_key(app_url):
        _fail(
            "TEST_DATABASE_URL и DATABASE_URL — одна и та же база "
            f"({db_key(app_url)[2]}). Заведите тестовой базе своё имя."
        )

    name = db_key(test_url)[2]
    raw = test_url.replace("postgresql+asyncpg://", "postgresql://")
    admin = re.sub(r"/[^/?]+$", "/postgres", raw)

    conn = await asyncpg.connect(admin)
    try:
        if await conn.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", name):
            print(f"база {name} уже есть")
        else:
            await conn.execute(f'CREATE DATABASE "{name}"')
            print(f"база {name} создана")
    finally:
        await conn.close()

    engine = create_async_engine(test_url)
    try:
        async with engine.begin() as c:
            await c.run_sync(Base.metadata.create_all)
    finally:
        await engine.dispose()
    print(f"схема поставлена: таблиц {len(Base.metadata.tables)}")


if __name__ == "__main__":
    asyncio.run(main())

"""HB-25: миграция `b3f7a1d4c209` действительно накатывается и откатывается.

ПОЧЕМУ НЕ `alembic upgrade` В ТЕСТЕ. `migrations/env.py` зовёт
`load_dotenv(override=True)`, и `find_dotenv()` ищет от самого env.py — то есть
всегда находит `back/.env`. Переменная окружения его не переопределяет, и любой
запуск alembic из тестов уехал бы в базу приложения. Поэтому здесь вызываются
САМИ функции `upgrade()`/`downgrade()` ревизии, но привязанные к отдельной
PostgreSQL-СХЕМЕ в тестовой базе: тот же SQL, ноль риска для чужих данных.

Проверяется не «функция не упала», а результат: таблица, оба индекса (включая
частичный), уникальный ключ и CHECK появляются и исчезают.

Запуск из back/:  python -m pytest tests/test_hybrid_migration.py -q
"""
import asyncio
import importlib

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text

from database import engine

SCHEMA = "hb_migration_check"
REVISION = "migrations.versions.b3f7a1d4c209_hb25_booking_notification_intents"
TABLE = "booking_notification_intents"


def _facts(connection):
    """Что реально есть в схеме после операции."""
    args = {"schema": SCHEMA, "table": TABLE}
    table = connection.execute(text(
        "select 1 from information_schema.tables "
        "where table_schema=:schema and table_name=:table"), args).scalar()
    indexes = set(connection.execute(text(
        "select indexname from pg_indexes where schemaname=:schema and tablename=:table"),
        args).scalars().all())
    checks = set(connection.execute(text(
        "select constraint_name from information_schema.table_constraints "
        "where table_schema=:schema and table_name=:table"), args).scalars().all())
    return bool(table), indexes, checks


def test_upgrade_creates_and_downgrade_removes_the_intent_table():
    revision = importlib.import_module(REVISION)

    async def run():
        async with engine.begin() as conn:
            def apply(sync_conn):
                sync_conn.execute(text(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE'))
                sync_conn.execute(text(f'CREATE SCHEMA "{SCHEMA}"'))
                # Новая таблица создаётся в нашей схеме (она первая в
                # search_path), а внешние ключи по-прежнему находят `studios`
                # и `reservations` в public — поэтому public остаётся вторым.
                sync_conn.execute(text(f'SET LOCAL search_path TO "{SCHEMA}", public'))
                context = MigrationContext.configure(sync_conn)
                with Operations.context(context):
                    revision.upgrade()
                created = _facts(sync_conn)
                with Operations.context(context):
                    revision.downgrade()
                removed = _facts(sync_conn)
                sync_conn.execute(text(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE'))
                return created, removed

            return await conn.run_sync(apply)

    created, removed = asyncio.run(run())

    exists, indexes, checks = created
    assert exists, "upgrade не создал таблицу намерений"
    # Частичный индекс воркера и оба ключа — не декорация: без них выборка
    # незавершённых строк пошла бы по всей истории, а повтор перехода завёл бы
    # второе намерение о том же событии.
    assert "ix_booking_notification_due" in indexes, indexes
    assert "uq_booking_notification_intent" in checks, checks
    assert "check_booking_notification_state" in checks, checks

    exists_after, indexes_after, _ = removed
    assert not exists_after, "downgrade оставил таблицу"
    assert indexes_after == set(), indexes_after


@pytest.mark.parametrize("attribute", ["revision", "down_revision"])
def test_revision_is_wired_into_a_single_chain(attribute):
    """Голова обязана быть одна: параллельная сессия уже разводила её надвое."""
    revision = importlib.import_module(REVISION)
    assert getattr(revision, attribute), f"{attribute} не задан"
    if attribute == "down_revision":
        # Родитель — ревизия соседней сессии, а не общий предок: иначе
        # `alembic heads` показывает две головы и upgrade становится неоднозначным.
        assert revision.down_revision == "d1c4e8b70a35", revision.down_revision

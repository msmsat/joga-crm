"""Колонки дат регистрации существуют, SQL заполнения валиден, и история НЕ
подменена моментом выката.

Последнее — главное. Такую ошибку потом не отличить от настоящих данных, и
заметить её надо сразу, а не через год на графике.

Запуск из back/:  pytest tests/test_signup_backfill.py -v
"""
import warnings

warnings.filterwarnings("ignore")

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import func, select, text

from database import async_session_maker
from models import Studio, User

_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "migrations" / "versions" / "aa457ff31dab_signup_dates_and_anon_id.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("_backfill_migration", _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def test_columns_exist():
    async with async_session_maker() as db:
        await db.execute(select(User.created_at, User.signup_anon_id).limit(1))
        await db.execute(select(Studio.created_at).limit(1))


async def test_backfill_sql_runs_against_the_real_schema():
    # Прогоняем настоящий SQL миграции и откатываем. Проверяется именно то, что
    # в нём нет опечаток в именах таблиц и колонок: иначе они всплыли бы только
    # на сервере, когда откатывать уже дорого.
    migration = _load_migration()
    async with async_session_maker() as db:
        await db.execute(text(migration.BACKFILL_USERS))
        await db.execute(text(migration.BACKFILL_STUDIOS))
        await db.rollback()


async def test_existing_rows_are_not_all_stamped_with_one_moment():
    async with async_session_maker() as db:
        total = (await db.execute(select(func.count(User.id)))).scalar_one()
        if total < 2:
            pytest.skip("в базе меньше двух пользователей — проверять нечего")
        distinct_dates = (
            await db.execute(
                select(func.count(func.distinct(User.created_at))).where(
                    User.created_at.isnot(None)
                )
            )
        ).scalar_one()
        # Одно-единственное значение на всю таблицу — верный признак того, что
        # колонку добавили сразу с server_default.
        assert distinct_dates != 1, "у всех пользователей одна и та же дата регистрации"

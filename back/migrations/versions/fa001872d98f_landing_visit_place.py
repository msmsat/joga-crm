"""Регион и город посетителя лендинга.

Страна была и раньше, но одной страны мало, чтобы понимать, откуда идут люди.
Место берётся из той же офлайн-базы, что и страна (DB-IP City Lite), поэтому
новых внешних вызовов миграция за собой не тянет.

Старые строки остаются пустыми: задним числом место не восстановить — адреса
для тех заходов не сохранялись.

Revision ID: fa001872d98f
Revises: c9c2fc0bea09
Create Date: 2026-09-17
"""
from alembic import op
import sqlalchemy as sa

revision = "fa001872d98f"
down_revision = "c9c2fc0bea09"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("landing_visits", sa.Column("region", sa.String(length=80), nullable=True))
    op.add_column("landing_visits", sa.Column("city", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("landing_visits", "city")
    op.drop_column("landing_visits", "region")

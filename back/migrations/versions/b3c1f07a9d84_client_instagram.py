"""Ник клиента в Instagram.

Голый ник без «@» и без ссылки (contact_format.normalize_instagram). Отдельная
колонка, а не переиспользованный `clients.ig_id`: там IGSID мессенджера Meta,
он unique и индексирован под сопоставление входящих сообщений, и ник туда
класть нельзя — два разных факта об одном клиенте.

Revision ID: b3c1f07a9d84
Revises: a1d7c3e59f42
Create Date: 2026-09-19
"""
from alembic import op
import sqlalchemy as sa

revision = "b3c1f07a9d84"
down_revision = "a1d7c3e59f42"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("instagram", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "instagram")

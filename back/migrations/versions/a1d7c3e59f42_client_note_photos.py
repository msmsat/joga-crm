"""Фото в заметках о клиенте.

Список путей к файлам (/static/notes/<uuid>.jpg), сами файлы — на диске рядом
с логотипами и фото залов. Существующие заметки получают пустой список, а не
NULL: код читает колонку как список всегда.

Revision ID: a1d7c3e59f42
Revises: fa001872d98f
Create Date: 2026-09-18
"""
from alembic import op
import sqlalchemy as sa

revision = "a1d7c3e59f42"
down_revision = "fa001872d98f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_notes",
        sa.Column("photos", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("client_notes", "photos")

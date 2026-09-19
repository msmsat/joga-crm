"""Заметка студии о занятии и снимки к ней.

Внутренняя запись «для своих»: что принести, к чему готовиться, что случилось
на занятии. Клиенту она не уходит ни одним каналом. Снимки живут там же, где
фото в заметках о клиенте (/static/notes/<uuid>.jpg), и проверяются тем же
правилом.

Пусто у существующих занятий — не NULL: код читает оба поля как строку и
список всегда.

Revision ID: b2e4f81a7c35
Revises: a1d7c3e59f42
Create Date: 2026-09-19
"""
from alembic import op
import sqlalchemy as sa

revision = "b2e4f81a7c35"
down_revision = "a1d7c3e59f42"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lessons", sa.Column("notes", sa.Text(), nullable=False, server_default=""))
    op.add_column("lessons", sa.Column("photos", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("lessons", "photos")
    op.drop_column("lessons", "notes")

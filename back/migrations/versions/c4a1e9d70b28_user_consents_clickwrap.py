"""доказательство согласия с Условиями и Политикой (clickwrap)

Таблица append-only: строка на каждое нажатие галочки при регистрации.
Хранится редакция документов (legal.TERMS_VERSION), время, IP и User-Agent —
этого набора достаточно, чтобы доказать согласие в спорной ситуации.

Существующим аккаунтам строки не проставляем: согласия у них не спрашивали, и
задним числом рисовать доказательство нельзя. Их согласие соберётся, когда
появится экран повторного принятия при смене версии.

Revision ID: c4a1e9d70b28
Revises: a7c31f0be4d2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4a1e9d70b28"
down_revision: Union[str, Sequence[str], None] = "a7c31f0be4d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_consents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=400), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_consents_user_id", "user_consents", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_consents_user_id", table_name="user_consents")
    op.drop_table("user_consents")

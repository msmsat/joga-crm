"""members: приглашение со статусом — доступ только после согласия человека

docs/ROADMAP_ACCOUNTS, решение 10. До этого членство создавалось сразу активным:
владелец, зная чужой email, добавлял человека в свою студию без его ведома —
блокер продакшена, помеченный в итогах эпика A-1.

Существующие членства становятся active: это работающие сотрудники, повторного
согласия у них не спрашивают. server_default снимается сразу после засева —
дальше статус обязан задавать код (по умолчанию модели "pending"), а не БД,
иначе забытое поле снова начнёт молча выдавать доступ.

Revision ID: c9a41b6de235
Revises: b5d2e8c41f07
Create Date: 2026-07-31
"""
from alembic import op
import sqlalchemy as sa


revision = "c9a41b6de235"
down_revision = "b5d2e8c41f07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "studio_members",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
    )
    op.alter_column("studio_members", "status", server_default=None)


def downgrade() -> None:
    op.drop_column("studio_members", "status")

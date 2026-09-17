"""landing visits: кто заходил на лендинг

Revision ID: 2b8474752c32
Revises: e2a9c4f17b35
Create Date: 2026-09-17

Новая таблица, ничего существующего не трогает, поэтому downgrade безопасен:
он удаляет ровно то, что создал.

Миграция написана руками, а не autogenerate: dev-база проекта стоит на более
ранней ревизии, и автогенератор приписал бы сюда чужой дрейф схемы.
"""
import sqlalchemy as sa
from alembic import op

revision = "2b8474752c32"
down_revision = "e2a9c4f17b35"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "landing_visits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("anon_id", sa.String(length=64), nullable=False),
        sa.Column("path", sa.String(length=200), nullable=False),
        sa.Column("referrer", sa.String(length=300), nullable=True),
        sa.Column("utm_source", sa.String(length=100), nullable=True),
        sa.Column("utm_medium", sa.String(length=100), nullable=True),
        sa.Column("utm_campaign", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("device", sa.String(length=10), nullable=False, server_default="unknown"),
        sa.Column("lang", sa.String(length=5), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_landing_visits_id", "landing_visits", ["id"])
    op.create_index("ix_landing_visits_anon_id", "landing_visits", ["anon_id"])
    op.create_index("ix_landing_visits_created_at", "landing_visits", ["created_at"])
    op.create_index(
        "ix_landing_visits_anon_path_time",
        "landing_visits",
        ["anon_id", "path", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_landing_visits_anon_path_time", table_name="landing_visits")
    op.drop_index("ix_landing_visits_created_at", table_name="landing_visits")
    op.drop_index("ix_landing_visits_anon_id", table_name="landing_visits")
    op.drop_index("ix_landing_visits_id", table_name="landing_visits")
    op.drop_table("landing_visits")

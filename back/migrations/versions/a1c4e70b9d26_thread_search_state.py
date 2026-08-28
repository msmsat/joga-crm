"""Состояние поиска в разговоре и непрозрачные ссылки на варианты (P1.5).

Аддитивно и целиком: три nullable-колонки на существующий тред и одна новая
таблица. Старый бинарник продолжает работать — он про эти поля не знает, а
ничего обязательного они не добавляют. Бэкфилла нет и быть не может: условий
прошлых разговоров никто не записывал, и придумать их задним числом нельзя.

Revision ID: a1c4e70b9d26
Revises: ff072a9ffb45
"""
import sqlalchemy as sa
from alembic import op

revision = "a1c4e70b9d26"
down_revision = "ff072a9ffb45"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("channel_threads", sa.Column(
        "search_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("channel_threads", sa.Column("search_state", sa.JSON(), nullable=True))
    op.add_column("channel_threads", sa.Column(
        "search_state_at", sa.DateTime(timezone=False), nullable=True))

    op.create_table(
        "thread_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("studio_id", sa.Integer(), nullable=False),
        sa.Column("thread_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("search_version", sa.Integer(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=False), nullable=False),
        sa.ForeignKeyConstraint(["studio_id"], ["studios.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["thread_id"], ["channel_threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_thread_options_id", "thread_options", ["id"])
    op.create_index("ix_thread_options_studio_id", "thread_options", ["studio_id"])
    op.create_index("ix_thread_options_thread_id", "thread_options", ["thread_id"])
    # Разрешение «второго» из последнего показанного списка.
    op.create_index("ix_thread_options_pick", "thread_options",
                    ["thread_id", "search_version", "ordinal"])
    # Уборка просроченных.
    op.create_index("ix_thread_options_expires", "thread_options", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_thread_options_expires", table_name="thread_options")
    op.drop_index("ix_thread_options_pick", table_name="thread_options")
    op.drop_index("ix_thread_options_thread_id", table_name="thread_options")
    op.drop_index("ix_thread_options_studio_id", table_name="thread_options")
    op.drop_index("ix_thread_options_id", table_name="thread_options")
    op.drop_table("thread_options")
    op.drop_column("channel_threads", "search_state_at")
    op.drop_column("channel_threads", "search_state")
    op.drop_column("channel_threads", "search_version")

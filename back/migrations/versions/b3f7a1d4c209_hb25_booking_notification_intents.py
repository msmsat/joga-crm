"""HB-25: намерения уведомить о переходах брони.

Revision ID: b3f7a1d4c209
Revises: 6cdd4f27a359
Create Date: 2026-09-10

Одна новая таблица, ничего существующего не трогает: старые уведомления
продолжают уходить прежним путём, а строки здесь появляются только у новых
переходов. Поэтому downgrade безопасен — он удаляет только то, что создал.

Миграция написана руками, а не autogenerate: dev-база проекта стоит на более
ранней ревизии, и автогенератор приписал бы сюда чужой дрейф схемы.
"""
import sqlalchemy as sa
from alembic import op

revision = "b3f7a1d4c209"
down_revision = "6cdd4f27a359"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "booking_notification_intents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("studio_id", sa.Integer(), nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=False),
        sa.Column("lesson_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("event_code", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=False), server_default=sa.func.now(), nullable=False),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(["studio_id"], ["studios.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reservation_id"], ["reservations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reservation_id", "lesson_version", "event_code",
                            name="uq_booking_notification_intent"),
        sa.CheckConstraint("state IN ('pending', 'sent', 'failed')",
                           name="check_booking_notification_state"),
    )
    op.create_index("ix_booking_notification_intents_id", "booking_notification_intents", ["id"])
    op.create_index("ix_booking_notification_intents_studio_id",
                    "booking_notification_intents", ["studio_id"])
    op.create_index("ix_booking_notification_intents_reservation_id",
                    "booking_notification_intents", ["reservation_id"])
    # Частичный: воркер выбирает только незавершённые строки.
    op.create_index("ix_booking_notification_due", "booking_notification_intents",
                    ["next_attempt_at"], postgresql_where=sa.text("state = 'pending'"))


def downgrade() -> None:
    op.drop_index("ix_booking_notification_due", table_name="booking_notification_intents")
    op.drop_index("ix_booking_notification_intents_reservation_id",
                  table_name="booking_notification_intents")
    op.drop_index("ix_booking_notification_intents_studio_id",
                  table_name="booking_notification_intents")
    op.drop_index("ix_booking_notification_intents_id", table_name="booking_notification_intents")
    op.drop_table("booking_notification_intents")

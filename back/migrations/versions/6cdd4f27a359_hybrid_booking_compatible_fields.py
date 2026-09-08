"""hybrid booking compatible fields (HB-02)

ЧТО И ПОЧЕМУ. Первая миграция эпика гибридной записи
(docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md §6.1/§6.6, HB-02). Добавляет ТОЛЬКО
совместимые поля и новые таблицы — ни одна существующая запись не меняет
время, цену, статус или связи. `booking_mode` у Studio/Service/Lesson везде
получает дефолт/бэкофилл `event`: гибридная запись включается владельцем
явно, а не этой миграцией (HB-03/HB-24).

`Lesson.branch_id` заполняется ТОЛЬКО из уже существующего `Hall.branch_id` —
для hall-less истории остаётся NULL, угадывать филиал запрещено (§6.1).

`check_lesson_duration_positive` добавлен `NOT VALID`: это первая проверка
предсуществующей колонки (`duration_min`) на исторических данных, а протокол
задачи требует сначала вывести нарушения в отчёт (HB-24
`hybrid_booking_audit.py`), а не чинить их догадкой прямо здесь. NOT VALID
означает — новые/изменённые строки проверяются как обычно, старые нарушения
(если найдутся) просто не блокируют выполнение этой миграции.

Revision ID: 6cdd4f27a359
Revises: 7628ffa12be3
Create Date: 2026-09-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6cdd4f27a359'
down_revision: Union[str, Sequence[str], None] = '7628ffa12be3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Studio: режим записи, терминология, версия конфигурации, strict ──
    op.add_column("studios", sa.Column(
        "booking_mode", sa.String(16), nullable=False, server_default="event"))
    op.add_column("studios", sa.Column(
        "terminology_profile", sa.String(16), nullable=False, server_default="generic"))
    op.add_column("studios", sa.Column(
        "booking_config_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("studios", sa.Column(
        "strict_schedule_enabled", sa.Boolean(), nullable=False, server_default="false"))

    # ── Service: механика, буферы, доступность, свой пресет терминов ──
    op.add_column("services", sa.Column(
        "booking_mode", sa.String(16), nullable=False, server_default="event"))
    op.add_column("services", sa.Column(
        "buffer_before_min", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("services", sa.Column(
        "buffer_after_min", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("services", sa.Column(
        "is_bookable", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("services", sa.Column(
        "terminology_profile", sa.String(16), nullable=True))
    op.create_check_constraint(
        "check_service_booking_mode", "services", "booking_mode IN ('event', 'resource')")
    op.create_check_constraint(
        "check_service_buffer_before_range", "services", "buffer_before_min BETWEEN 0 AND 240")
    op.create_check_constraint(
        "check_service_buffer_after_range", "services", "buffer_after_min BETWEEN 0 AND 240")
    op.create_check_constraint(
        "check_service_resource_duration_range", "services",
        "booking_mode <> 'resource' OR (duration_min BETWEEN 1 AND 1440)")

    # ── Lesson: снимок механики/буферов, версия, филиал ──
    op.add_column("lessons", sa.Column(
        "booking_mode", sa.String(16), nullable=False, server_default="event"))
    op.add_column("lessons", sa.Column(
        "buffer_before_min", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("lessons", sa.Column(
        "buffer_after_min", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("lessons", sa.Column(
        "version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("lessons", sa.Column(
        "branch_id", sa.Integer(), sa.ForeignKey("studio_branches.id", ondelete="SET NULL"),
        nullable=True))
    op.create_index("ix_lessons_branch_id", "lessons", ["branch_id"])

    # Бэкофилл branch_id — ТОЛЬКО из существующего Hall.branch_id.
    op.execute("""
        UPDATE lessons
        SET branch_id = halls.branch_id
        FROM halls
        WHERE lessons.hall_id = halls.id
          AND halls.branch_id IS NOT NULL
          AND lessons.branch_id IS NULL
    """)

    op.create_check_constraint(
        "check_lesson_booking_mode", "lessons", "booking_mode IN ('event', 'resource')")
    op.create_check_constraint(
        "check_lesson_buffers_non_negative", "lessons",
        "buffer_before_min >= 0 AND buffer_after_min >= 0")
    op.create_check_constraint(
        "check_lesson_resource_requires_fields", "lessons",
        "booking_mode <> 'resource' OR ("
        "total_spots = 1 AND service_id IS NOT NULL AND teacher_id IS NOT NULL "
        "AND branch_id IS NOT NULL AND tz_iana IS NOT NULL)")
    # NOT VALID — см. докстринг файла.
    op.execute(
        "ALTER TABLE lessons ADD CONSTRAINT check_lesson_duration_positive "
        "CHECK (duration_min > 0) NOT VALID")
    op.create_index("ix_lesson_studio_teacher_start", "lessons",
                    ["studio_id", "teacher_id", "start_time"])
    op.create_index("ix_lesson_studio_branch_start", "lessons",
                    ["studio_id", "branch_id", "start_time"])

    # ── StaffBranchAssignment: явная привязка сотрудника к филиалу ──
    op.create_table(
        "staff_branch_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("studio_id", sa.Integer(),
                  sa.ForeignKey("studios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", sa.Integer(),
                  sa.ForeignKey("studio_branches.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("studio_id", "user_id", "branch_id",
                            name="uq_staff_branch_assignment"),
    )
    op.create_index("ix_staff_branch_assignments_studio_id", "staff_branch_assignments", ["studio_id"])
    op.create_index("ix_staff_branch_assignments_user_id", "staff_branch_assignments", ["user_id"])
    op.create_index("ix_staff_branch_assignments_branch_id", "staff_branch_assignments", ["branch_id"])

    # ── StaffBusyInterval: перерыв/отсутствие сотрудника ──
    op.create_table(
        "staff_busy_intervals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("studio_id", sa.Integer(),
                  sa.ForeignKey("studios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=False), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=False), nullable=False),
        sa.Column("tz_iana", sa.String(64), nullable=True),
        sa.Column("reason", sa.String(200), nullable=True),
        sa.CheckConstraint("end_time > start_time", name="check_staff_busy_interval_positive"),
    )
    op.create_index("ix_staff_busy_intervals_studio_id", "staff_busy_intervals", ["studio_id"])
    op.create_index("ix_staff_busy_intervals_user_id", "staff_busy_intervals", ["user_id"])
    op.create_index("ix_staff_busy_interval_studio_user_start", "staff_busy_intervals",
                    ["studio_id", "user_id", "start_time"])

    # ── BookingQuote: условия на момент показа, без резервирования ──
    op.create_table(
        "booking_quotes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("studio_id", sa.Integer(),
                  sa.ForeignKey("studios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(),
                  sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("surface", sa.String(20), nullable=False),
        sa.Column("booking_mode", sa.String(16), nullable=False),
        sa.Column("payload_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("terms", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reservation_id", sa.Integer(),
                  sa.ForeignKey("reservations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_booking_quotes_studio_id", "booking_quotes", ["studio_id"])
    op.create_index("ix_booking_quotes_client_id", "booking_quotes", ["client_id"])
    op.create_index("ix_booking_quotes_reservation_id", "booking_quotes", ["reservation_id"])
    op.create_index("ix_booking_quote_studio_client_created", "booking_quotes",
                    ["studio_id", "client_id", "created_at"])


def downgrade() -> None:
    op.drop_table("booking_quotes")
    op.drop_table("staff_busy_intervals")
    op.drop_table("staff_branch_assignments")

    op.drop_index("ix_lesson_studio_branch_start", table_name="lessons")
    op.drop_index("ix_lesson_studio_teacher_start", table_name="lessons")
    op.execute("ALTER TABLE lessons DROP CONSTRAINT check_lesson_duration_positive")
    op.drop_constraint("check_lesson_resource_requires_fields", "lessons", type_="check")
    op.drop_constraint("check_lesson_buffers_non_negative", "lessons", type_="check")
    op.drop_constraint("check_lesson_booking_mode", "lessons", type_="check")
    op.drop_index("ix_lessons_branch_id", table_name="lessons")
    op.drop_column("lessons", "branch_id")
    op.drop_column("lessons", "version")
    op.drop_column("lessons", "buffer_after_min")
    op.drop_column("lessons", "buffer_before_min")
    op.drop_column("lessons", "booking_mode")

    op.drop_constraint("check_service_resource_duration_range", "services", type_="check")
    op.drop_constraint("check_service_buffer_after_range", "services", type_="check")
    op.drop_constraint("check_service_buffer_before_range", "services", type_="check")
    op.drop_constraint("check_service_booking_mode", "services", type_="check")
    op.drop_column("services", "terminology_profile")
    op.drop_column("services", "is_bookable")
    op.drop_column("services", "buffer_after_min")
    op.drop_column("services", "buffer_before_min")
    op.drop_column("services", "booking_mode")

    op.drop_column("studios", "strict_schedule_enabled")
    op.drop_column("studios", "booking_config_version")
    op.drop_column("studios", "terminology_profile")
    op.drop_column("studios", "booking_mode")

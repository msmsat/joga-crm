"""Свой цвет у каждого сотрудника студии.

  * studio_members.color — цвет человека в этой студии: им окрашены его
    колонка и занятия в журнале. Раньше цвет вычислялся на лету как
    `id % 5`, и мастера то и дело совпадали.

Существующим участникам цвета раздаются по палитре без повторов внутри студии
(пока хватает палитры): сперва тренерам — их различать в журнале важнее всего,
затем владельцам и администраторам, внутри группы — по порядку заведения.
Палитра — копия `services.members.STAFF_PALETTE` на момент миграции: миграция
не должна менять смысл, если палитру в коде потом поправят.

Revision ID: a74771fbf697
Revises: 7c66830758a2
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa

revision = "a74771fbf697"
down_revision = "7c66830758a2"
branch_labels = None
depends_on = None

PALETTE = (
    "#F9A08B", "#4A80C4", "#5BAB72", "#7B6CD4", "#E0A030", "#3AA39B",
    "#D0678F", "#8B6F5A", "#B062C0", "#8FA53A", "#C4553D", "#5E7389",
)


def upgrade() -> None:
    op.add_column("studio_members", sa.Column("color", sa.String(length=7), nullable=True))
    palette = "ARRAY[" + ", ".join(f"'{c}'" for c in PALETTE) + "]"
    op.execute(f"""
        UPDATE studio_members AS m
        SET color = ({palette})[((ranked.n - 1) % {len(PALETTE)}) + 1]
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY studio_id
                ORDER BY CASE role WHEN 'trainer' THEN 0 WHEN 'owner' THEN 1 ELSE 2 END, id
            ) AS n
            FROM studio_members
        ) AS ranked
        WHERE ranked.id = m.id
    """)


def downgrade() -> None:
    op.drop_column("studio_members", "color")

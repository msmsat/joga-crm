"""client segment config: пороги категорий клиентов настраиваются студией

Категории на странице «Клиенты» (новый / активный / неактивный / VIP) считаются
из данных, а пороги до этого были константами в services/client_segments.
Таблица хранит их на студию; строка создаётся лениво при первом чтении, поэтому
у студий, которые настройку не открывали, её нет — работают дефолты из кода.

Revision ID: d8b3f5027a91
Revises: c7f1a3d92e40
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d8b3f5027a91"
down_revision: Union[str, Sequence[str], None] = "c7f1a3d92e40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "studio_client_segment_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("studio_id", sa.Integer(), nullable=False),
        sa.Column("new_client_days", sa.Integer(), server_default="15", nullable=False),
        sa.Column("active_within_days", sa.Integer(), server_default="60", nullable=False),
        sa.Column("vip_min_spent", sa.Integer(), server_default="50000", nullable=False),
        sa.Column("vip_min_visits", sa.Integer(), server_default="30", nullable=False),
        sa.ForeignKeyConstraint(["studio_id"], ["studios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_studio_client_segment_configs_id"), "studio_client_segment_configs", ["id"])
    op.create_index(
        op.f("ix_studio_client_segment_configs_studio_id"),
        "studio_client_segment_configs", ["studio_id"], unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_studio_client_segment_configs_studio_id"), table_name="studio_client_segment_configs")
    op.drop_index(op.f("ix_studio_client_segment_configs_id"), table_name="studio_client_segment_configs")
    op.drop_table("studio_client_segment_configs")

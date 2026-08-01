"""operations.service_id — выручка, привязанная к услуге Каталога

Фильтр Отчётов «Услуга» приходит с id из таблицы services (селект тулбара
наполняется из GET /studio/services), а op_conds сравнивал его с
Operation.product_id — внешним ключом на products. Два разных пространства id:
выбор услуги давал не «выручку этой услуги», а сумму по случайному товару с тем
же номером (а при пустой products — стабильный ноль). Колонка даёт деньгам
настоящую ссылку на услугу; заполняется кассой при продаже разового посещения.

Существующие операции остаются с null — задним числом услугу у них не восстановить,
и придумывать привязку нельзя: под фильтром они честно не попадают в срез.

Revision ID: d1c47f0a9b32
Revises: c9a41b6de235
Create Date: 2026-07-31
"""
from alembic import op
import sqlalchemy as sa


revision = "d1c47f0a9b32"
down_revision = "c9a41b6de235"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("operations", sa.Column("service_id", sa.Integer(), nullable=True))
    op.create_index("ix_operations_service_id", "operations", ["service_id"])
    op.create_foreign_key(
        "fk_operations_service_id_services",
        "operations", "services",
        ["service_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_operations_service_id_services", "operations", type_="foreignkey")
    op.drop_index("ix_operations_service_id", table_name="operations")
    op.drop_column("operations", "service_id")

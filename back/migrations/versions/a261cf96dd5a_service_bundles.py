"""Комплексы услуг: состав «Стрижка + борода».

Сам комплекс — обычная строка `services` (своя цена, длительность, мастера),
поэтому новая здесь только таблица состава. Существующие услуги комплексами не
становятся: пустой состав и значит «обычная услуга», поведение продукта после
наката не меняется.

Часть комплекса удаляется только вместе с ним (bundle_id CASCADE); удалить
услугу, которая входит в комплекс, внешний ключ не даёт (NO ACTION — чтобы
удаление студии целиком проходило одним каскадом).

Revision ID: a261cf96dd5a
Revises: 4a2f4d591d21
Create Date: 2026-09-24
"""
from alembic import op
import sqlalchemy as sa

revision = "a261cf96dd5a"
down_revision = "4a2f4d591d21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_bundle_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bundle_id", sa.Integer(), sa.ForeignKey("services.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service_id", sa.Integer(), sa.ForeignKey("services.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.UniqueConstraint("bundle_id", "service_id", name="uq_service_bundle_item"),
        sa.CheckConstraint("bundle_id <> service_id", name="check_service_bundle_item_not_self"),
    )
    op.create_index("ix_service_bundle_items_id", "service_bundle_items", ["id"])
    op.create_index("ix_service_bundle_items_bundle_id", "service_bundle_items", ["bundle_id"])
    op.create_index("ix_service_bundle_items_service_id", "service_bundle_items", ["service_id"])


def downgrade() -> None:
    op.drop_index("ix_service_bundle_items_service_id", table_name="service_bundle_items")
    op.drop_index("ix_service_bundle_items_bundle_id", table_name="service_bundle_items")
    op.drop_index("ix_service_bundle_items_id", table_name="service_bundle_items")
    op.drop_table("service_bundle_items")

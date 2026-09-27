"""Промокод на одного клиента и период действия «с … по …».

  * studio_promo_codes.client_id — промокод выписан конкретному клиенту:
    другой его применить не может. CASCADE, а не SET NULL: удалили клиента —
    уходит и его личный код, а не становится общим;
  * studio_promo_codes.valid_from — с какой даты код действует (включительно).
    Прежде была только верхняя граница valid_until.

Существующие коды не меняются: оба поля пустые — код общий и действует сразу.

Revision ID: 7c66830758a2
Revises: 0d817c5907c8
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa

revision = "7c66830758a2"
down_revision = "0d817c5907c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("studio_promo_codes", sa.Column("client_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_studio_promo_codes_client_id", "studio_promo_codes", "clients",
        ["client_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index("ix_studio_promo_codes_client_id", "studio_promo_codes", ["client_id"])
    op.add_column("studio_promo_codes", sa.Column("valid_from", sa.Date(), nullable=True))
    op.create_check_constraint(
        "check_promo_period",
        "studio_promo_codes",
        "valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until",
    )


def downgrade() -> None:
    op.drop_constraint("check_promo_period", "studio_promo_codes", type_="check")
    op.drop_column("studio_promo_codes", "valid_from")
    op.drop_index("ix_studio_promo_codes_client_id", table_name="studio_promo_codes")
    op.drop_constraint("fk_studio_promo_codes_client_id", "studio_promo_codes", type_="foreignkey")
    op.drop_column("studio_promo_codes", "client_id")

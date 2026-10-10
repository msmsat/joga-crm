"""Именованные скидки студии вместо одной общей.

Программа «Скидки» умела одно число на всю студию. Теперь скидок сколько угодно,
и у каждой своё название, период, услуги и абонементы, круг клиентов
(`discount_campaigns`). Включённая общая скидка переезжает строкой «Скидка для
всех» — тот же размер, та же минимальная сумма, на всё и всем, поэтому цена
ни у одного клиента не меняется. Выключенную не переносим: строка конфига с
10 % по умолчанию заводится у каждой студии, открывшей программу, и превратилась
бы в скидку, которой никто не создавал.

Кешбэк был третьим «типом» общей скидки и не мог жить рядом с ней — теперь у
него своё поле `cashback_percent`.

Revision ID: aabb4b721b81
Revises: 9938de444e5d
Create Date: 2026-10-10
"""
from alembic import op
import sqlalchemy as sa

revision = "aabb4b721b81"
down_revision = "9938de444e5d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "discount_campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("studio_id", sa.Integer(), sa.ForeignKey("studios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("discount_type", sa.String(length=10), nullable=False, server_default="percent"),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("applies_to", sa.String(length=10), nullable=False, server_default="all"),
        sa.Column("service_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("package_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("audience", sa.String(length=10), nullable=False, server_default="all"),
        sa.Column("segments", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("client_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("birthday_window_days", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("min_purchase_amount", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("discount_type IN ('percent', 'amount')", name="check_campaign_discount_type"),
        sa.CheckConstraint("applies_to IN ('all', 'selected')", name="check_campaign_applies_to"),
        sa.CheckConstraint("audience IN ('all', 'segments', 'clients')", name="check_campaign_audience"),
    )
    op.create_index("ix_discount_campaigns_id", "discount_campaigns", ["id"])
    op.create_index("ix_discount_campaigns_studio_id", "discount_campaigns", ["studio_id"])

    op.add_column("studio_discount_configs", sa.Column("cashback_percent", sa.Integer(), nullable=True))
    op.execute("""
        UPDATE studio_discount_configs
        SET cashback_percent = discount_value
        WHERE discount_type = 'cashback'
    """)
    # Название — на языке студии (тот же набор из пяти, что у исходящих
    # текстов; язык вне набора — английский).
    op.execute("""
        INSERT INTO discount_campaigns
            (studio_id, name, discount_type, value, min_purchase_amount, is_active)
        SELECT c.studio_id,
               CASE lower(coalesce(s.language, ''))
                   WHEN 'ru' THEN 'Скидка для всех'
                   WHEN 'uk' THEN 'Знижка для всіх'
                   WHEN 'cs' THEN 'Sleva pro všechny'
                   WHEN 'de' THEN 'Rabatt für alle'
                   ELSE 'Discount for everyone'
               END,
               CASE c.discount_type WHEN 'percentage' THEN 'percent' ELSE 'amount' END,
               c.discount_value,
               c.min_purchase_amount,
               true
        FROM studio_discount_configs c
        JOIN studios s ON s.id = c.studio_id
        WHERE c.is_enabled AND c.discount_type IN ('percentage', 'fixed') AND c.discount_value > 0
    """)


def downgrade() -> None:
    op.drop_column("studio_discount_configs", "cashback_percent")
    op.drop_index("ix_discount_campaigns_studio_id", table_name="discount_campaigns")
    op.drop_index("ix_discount_campaigns_id", table_name="discount_campaigns")
    op.drop_table("discount_campaigns")

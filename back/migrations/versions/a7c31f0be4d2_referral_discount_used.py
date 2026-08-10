"""referral_records.discount_used

Скидка новичку — второе обещание реферальной записи, независимое от бонуса
пригласившему. До этого поля resolve_price ключевал её на status == 'pending',
что при триггере 'registration' не давало скидку никогда, а при 'first_visit' —
давало на каждой покупке до первого визита.

Revision ID: a7c31f0be4d2
Revises: e5a4c8d1f962
"""
from alembic import op
import sqlalchemy as sa

revision = 'a7c31f0be4d2'
down_revision = 'e5a4c8d1f962'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'referral_records',
        sa.Column('discount_used', sa.Boolean(), nullable=False, server_default='false'),
    )
    # Существующие завершённые рефералы: бонус выдан, значит клиент своё уже
    # отходил/оплатил — выдавать ему скидку «новичка» задним числом неправильно.
    op.execute("UPDATE referral_records SET discount_used = true WHERE status = 'completed'")


def downgrade() -> None:
    op.drop_column('referral_records', 'discount_used')

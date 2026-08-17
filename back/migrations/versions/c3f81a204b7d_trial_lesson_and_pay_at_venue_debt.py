"""trial lesson and pay-at-venue debt

Четыре колонки под пробное занятие и оплату на месте
(docs/superpowers/specs/2026-08-17-trial-and-pay-at-venue-design.md):

  * studio_booking_settings.trial_lesson_free — тумблер «Первое занятие бесплатно»
    в правилах записи;
  * reservations.is_trial — эта бронь и есть подаренный визит;
  * reservations.debt_payment_id — долг за бронь (ClientPayment в статусе
    pending); ON DELETE SET NULL, чтобы удаление платежа не уносило бронь;
  * clients.phone_verified — номер подтверждён Telegram, а не набран руками.

server_default у булевых колонок обязателен: они NOT NULL, а строки уже есть.
Новой таблицы нет намеренно — долг это ClientPayment(status='pending'), статус
уже разрешён CheckConstraint'ом модели.

Revision ID: c3f81a204b7d
Revises: ef32901ff09f
Create Date: 2026-08-17 12:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3f81a204b7d'
down_revision: Union[str, Sequence[str], None] = 'ef32901ff09f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'studio_booking_settings',
        sa.Column('trial_lesson_free', sa.Boolean(), server_default='false', nullable=False),
    )
    op.add_column(
        'reservations',
        sa.Column('is_trial', sa.Boolean(), server_default='false', nullable=False),
    )
    op.add_column('reservations', sa.Column('debt_payment_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_reservations_debt_payment_id'), 'reservations', ['debt_payment_id'])
    op.create_foreign_key(
        'fk_reservations_debt_payment_id', 'reservations', 'client_payments',
        ['debt_payment_id'], ['id'], ondelete='SET NULL',
    )
    op.add_column(
        'clients',
        sa.Column('phone_verified', sa.Boolean(), server_default='false', nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('clients', 'phone_verified')
    op.drop_constraint('fk_reservations_debt_payment_id', 'reservations', type_='foreignkey')
    op.drop_index(op.f('ix_reservations_debt_payment_id'), table_name='reservations')
    op.drop_column('reservations', 'debt_payment_id')
    op.drop_column('reservations', 'is_trial')
    op.drop_column('studio_booking_settings', 'trial_lesson_free')

"""allow pending reservation status

Настройка «Подтверждение тренером» (StudioBookingSettings.trainer_confirmation_required)
создаёт бронь в статусе pending — его не было в check_reservation_status с самой
инициализации БД, и запись из мини-приложения при включённом тумблере падала
IntegrityError, а не создавалась. Тесты этого не ловили: они ходят в фейковую
сессию, где CHECK не срабатывает.

Revision ID: d4b2e70c1a93
Revises: c3f81a204b7d
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd4b2e70c1a93'
down_revision: Union[str, Sequence[str], None] = 'c3f81a204b7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint('check_reservation_status', 'reservations', type_='check')
    op.create_check_constraint(
        'check_reservation_status',
        'reservations',
        "status IN ('active', 'pending', 'cancelled', 'attended')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Откат ужесточает правило — брони, ждущие подтверждения, пришлось бы
    # признать активными, иначе новый CHECK не создастся.
    op.execute("UPDATE reservations SET status = 'active' WHERE status = 'pending'")
    op.drop_constraint('check_reservation_status', 'reservations', type_='check')
    op.create_check_constraint(
        'check_reservation_status',
        'reservations',
        "status IN ('active', 'cancelled', 'attended')",
    )

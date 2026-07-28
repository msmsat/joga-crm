"""instagram как канал уведомлений (Client/User.ig_id) + WhatsApp-агент (studio_ai_settings.wa_*)

Revision ID: b7d41c9f0a12
Revises: 712ef52a466b
Create Date: 2026-07-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d41c9f0a12'
down_revision: Union[str, Sequence[str], None] = '712ef52a466b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('clients', sa.Column('ig_id', sa.String(length=50), nullable=True))
    op.create_index(op.f('ix_clients_ig_id'), 'clients', ['ig_id'], unique=False)
    op.add_column('users', sa.Column('ig_id', sa.String(length=50), nullable=True))

    op.add_column('studio_ai_settings', sa.Column('wa_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('studio_ai_settings', sa.Column('wa_tone', sa.String(length=20), nullable=False, server_default='friendly'))
    op.add_column('studio_ai_settings', sa.Column('wa_max_length', sa.Integer(), nullable=False, server_default='300'))
    op.add_column('studio_ai_settings', sa.Column('wa_off_hours_only', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('studio_ai_settings', sa.Column('wa_handled_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('studio_ai_settings', sa.Column('wa_avg_rating', sa.Float(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('studio_ai_settings', 'wa_avg_rating')
    op.drop_column('studio_ai_settings', 'wa_handled_count')
    op.drop_column('studio_ai_settings', 'wa_off_hours_only')
    op.drop_column('studio_ai_settings', 'wa_max_length')
    op.drop_column('studio_ai_settings', 'wa_tone')
    op.drop_column('studio_ai_settings', 'wa_enabled')

    op.drop_column('users', 'ig_id')
    op.drop_index(op.f('ix_clients_ig_id'), table_name='clients')
    op.drop_column('clients', 'ig_id')

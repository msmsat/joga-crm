"""client_email_otp: вход клиента в мини-приложение по email вне Telegram

Revision ID: b2e91f47c3aa
Revises: ef343cd215b5
Create Date: 2026-08-04 19:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2e91f47c3aa'
down_revision: Union[str, Sequence[str], None] = 'ef343cd215b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'client_email_otp',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('studio_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('code_hash', sa.String(length=255), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
        sa.ForeignKeyConstraint(['studio_id'], ['studios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('studio_id', 'email', name='uq_client_email_otp_studio_email'),
    )
    op.create_index(op.f('ix_client_email_otp_id'), 'client_email_otp', ['id'])
    op.create_index(op.f('ix_client_email_otp_studio_id'), 'client_email_otp', ['studio_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_client_email_otp_studio_id'), table_name='client_email_otp')
    op.drop_index(op.f('ix_client_email_otp_id'), table_name='client_email_otp')
    op.drop_table('client_email_otp')

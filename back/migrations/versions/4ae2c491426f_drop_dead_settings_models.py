"""drop dead settings models: roles, role_permissions, api_tokens, studio_backup_settings

Revision ID: 4ae2c491426f
Revises: 290f927b547d
Create Date: 2026-07-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ae2c491426f'
down_revision: Union[str, Sequence[str], None] = '290f927b547d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint('users_role_id_fkey', 'users', type_='foreignkey')
    op.drop_index('ix_users_role_id', table_name='users')
    op.drop_column('users', 'role_id')
    op.drop_table('role_permissions')   # FK на roles — раньше roles
    op.drop_table('roles')
    op.drop_table('api_tokens')
    op.drop_table('studio_backup_settings')


def downgrade() -> None:
    """Downgrade schema."""
    raise NotImplementedError("Мёртвые модели: откат не предусмотрен")

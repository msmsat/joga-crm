"""ig oauth fields

Revision ID: 4d1656fe48c9
Revises: 742608e91849
Create Date: 2026-07-24 03:01:45.343526

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d1656fe48c9'
down_revision: Union[str, Sequence[str], None] = '742608e91849'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Только IG OAuth-поля (AI-3, задача 3). Autogenerate заодно предложил снести
    # ix_users_phone/users_phone_key — это несвязанный дрейф схемы (User.phone
    # давно не unique в модели, но constraint в БД остался), сюда не тащим:
    # отдельное решение, не по этой задаче.
    op.add_column('studio_ai_settings', sa.Column('ig_user_id', sa.String(length=50), nullable=True))
    op.add_column('studio_ai_settings', sa.Column('ig_token_expires_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('studio_ai_settings', 'ig_token_expires_at')
    op.drop_column('studio_ai_settings', 'ig_user_id')

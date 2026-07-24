"""ai model default velora-3.5

Revision ID: 742608e91849
Revises: 8ac395f005da
Create Date: 2026-07-24 02:10:50.807821

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '742608e91849'
down_revision: Union[str, Sequence[str], None] = '8ac395f005da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
        UPDATE studio_ai_settings
        SET model = 'velora-3.5'
        WHERE model = 'gpt-4o'
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
        UPDATE studio_ai_settings
        SET model = 'gpt-4o'
        WHERE model = 'velora-3.5'
    """)

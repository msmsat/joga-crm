"""studio company_id for invoices

Revision ID: 268c7f42c95a
Revises: 1453605b4c66
Create Date: 2026-08-08 13:37:56.891944

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '268c7f42c95a'
down_revision: Union[str, Sequence[str], None] = '1453605b4c66'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # IČO студии: обязательный реквизит фактуры юрлицу. Написана руками, а не
    # autogenerate — тот тянет за собой посторонний дрейф моделей и БД.
    op.add_column("studios", sa.Column("company_id", sa.String(length=30), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("studios", "company_id")

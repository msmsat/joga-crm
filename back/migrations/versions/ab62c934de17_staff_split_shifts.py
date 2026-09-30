"""Staff split shifts and dated schedule exceptions.
Revision ID: ab62c934de17
Revises: 8f2e61c0b9d7
"""
from alembic import op
import sqlalchemy as sa
revision = "ab62c934de17"
down_revision = "8f2e61c0b9d7"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("staff_working_hours",sa.Column("breaks",sa.JSON(),nullable=False,server_default="[]"))
    op.add_column("staff_working_hours",sa.Column("off_label",sa.String(200),nullable=True))
    op.add_column("staff_day_overrides",sa.Column("hours",sa.JSON(),nullable=True))

def downgrade():
    op.drop_column("staff_day_overrides","hours")
    op.drop_column("staff_working_hours","off_label")
    op.drop_column("staff_working_hours","breaks")

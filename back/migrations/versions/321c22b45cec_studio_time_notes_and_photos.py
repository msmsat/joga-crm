"""«Время студии»: заметка и снимки к блоку.

Уборка, подготовка зала, планёрка — к блоку в журнале теперь пишут, что
сделать, и прикладывают фото (как разложить инвентарь, что сломалось). Снимки
живут там же, где фото заметок занятия (/static/notes/<uuid>.jpg), и
проверяются тем же правилом (schemas/photos.NotePhotos).

Пусто у существующих интервалов — не NULL: код читает оба поля как строку и
список всегда.

Revision ID: 321c22b45cec
Revises: e8c41b90f762
Create Date: 2026-10-07
"""
from alembic import op
import sqlalchemy as sa

revision = "321c22b45cec"
down_revision = "e8c41b90f762"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("staff_busy_intervals", sa.Column("notes", sa.Text(), nullable=False, server_default=""))
    op.add_column("staff_busy_intervals", sa.Column("photos", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("staff_busy_intervals", "photos")
    op.drop_column("staff_busy_intervals", "notes")

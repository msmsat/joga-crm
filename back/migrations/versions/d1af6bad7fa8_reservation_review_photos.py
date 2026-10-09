"""Снимки к отзыву о занятии.

Клиент оценивал занятие в мини-приложении только числом: колонка review_text
была, но писать в неё было неоткуда. Теперь к оценке прикладываются слова и до
четырёх снимков — пути из загрузки /global/bookings/{id}/review-photos. Студия
видит их там же, где отзыв: в карточке занятия Журнала и в истории клиента.

Revision ID: d1af6bad7fa8
Revises: 56d83c37a9a6
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa

revision = "d1af6bad7fa8"
down_revision = "56d83c37a9a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reservations",
        sa.Column("review_photos", sa.JSON(), server_default="[]", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("reservations", "review_photos")

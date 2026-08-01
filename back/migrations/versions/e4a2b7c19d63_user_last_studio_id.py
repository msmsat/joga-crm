"""users.last_studio_id — последняя открытая студия

Мультистудийного пользователя при каждом входе встречал /select-crm: токен
логина получал studio_id только когда членство ровно одно. Колонка помнит, где
человек работал в прошлый раз, и `_build_token_for_user` минтит токен сразу на
неё.

SET NULL, а не CASCADE: удаление студии не должно удалять аккаунт — просто
забываем выбор и снова спрашиваем.

Revision ID: e4a2b7c19d63
Revises: d1c47f0a9b32
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa


revision = "e4a2b7c19d63"
down_revision = "d1c47f0a9b32"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_studio_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_users_last_studio_id_studios",
        "users", "studios",
        ["last_studio_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_last_studio_id_studios", "users", type_="foreignkey")
    op.drop_column("users", "last_studio_id")

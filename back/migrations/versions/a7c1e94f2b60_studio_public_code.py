"""studio public code for miniapp link

Ссылка мини-приложения перестаёт быть порядковым номером студии: у каждой
студии появляется `public_code` — 10 случайных букв и цифр. Существующие
студии получают код здесь же, по одному на строку; старые числовые ссылки
продолжают работать (services/studio_link.resolve_studio_id).

Revision ID: a7c1e94f2b60
Revises: c3e8a1f7b204
Create Date: 2026-09-02
"""
from typing import Sequence, Union

import secrets

import sqlalchemy as sa
from alembic import op

revision: str = 'a7c1e94f2b60'
down_revision: Union[str, Sequence[str], None] = 'c3e8a1f7b204'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Копия алфавита из services/studio_link: миграция обязана оставаться рабочей
# и после того, как сервис переедет или изменится — она описывает состояние БД
# на своей дате, а не текущий код.
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def _code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(10))


def upgrade() -> None:
    op.add_column('studios', sa.Column('public_code', sa.String(length=16), nullable=True))

    bind = op.get_bind()
    ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM studios"))]
    used: set[str] = set()
    for studio_id in ids:
        code = _code()
        while code in used:
            code = _code()
        used.add(code)
        bind.execute(
            sa.text("UPDATE studios SET public_code = :code WHERE id = :id"),
            {"code": code, "id": studio_id},
        )

    op.create_index(op.f('ix_studios_public_code'), 'studios', ['public_code'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_studios_public_code'), table_name='studios')
    op.drop_column('studios', 'public_code')

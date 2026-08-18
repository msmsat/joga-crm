"""staff_day_overrides: index on id, as in every other table

Расхождение модели и БД, которое показывает `alembic check`: в модели у `id`
стоит `index=True` (общая для проекта форма первичного ключа), а в миграции,
создававшей таблицу, индекс не проехал. Само по себе это ничего не ломает —
PK и так уникально проиндексирован, — но пока модель расходится с базой,
`alembic check` красный, и в этом шуме потеряется настоящая пропущенная
миграция. Приводим базу к модели, а не наоборот: так же выглядят все соседние
таблицы.

Revision ID: f2c9d3e51a76
Revises: e1f4a72b6c08
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f2c9d3e51a76'
down_revision: Union[str, Sequence[str], None] = 'e1f4a72b6c08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index("ix_staff_day_overrides_id", "staff_day_overrides", ["id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_staff_day_overrides_id", table_name="staff_day_overrides")

"""attach_orphan_halls_to_branch

Revision ID: f5b28c31a604
Revises: e6c3a4218b95
Create Date: 2026-08-16 12:00:00.000000

Залы без филиала не показывает ни один экран Каталога (он рисует залы внутри
филиала), но журнал берёт их из /schedule/halls по студии — так в расписании
жили залы, которых «нет в каталоге». Появлялись они двумя путями: залы старше
самой сущности филиала (branch_id добавлен nullable в e1f2a3b4c5d6) и удаление
филиала (FK halls.branch_id → SET NULL; с этой ревизии зал удаляется вместе с
филиалом, см. routers/studio/router.py:delete_branch).

Прицепляем «ничейные» залы к первому филиалу студии — так владелец видит их в
Каталоге и решает сам, удалять или оставить. Удалять залы миграцией нельзя:
на них ссылаются занятия.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5b28c31a604'
down_revision: Union[str, Sequence[str], None] = 'e6c3a4218b95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Студии без филиалов пропускаем: цеплять не к чему.
    op.get_bind().execute(sa.text(
        "UPDATE halls h SET branch_id = ("
        "  SELECT b.id FROM studio_branches b"
        "  WHERE b.studio_id = h.studio_id ORDER BY b.id LIMIT 1"
        ") "
        "WHERE h.branch_id IS NULL"
        "  AND EXISTS (SELECT 1 FROM studio_branches b WHERE b.studio_id = h.studio_id)"
    ))


def downgrade() -> None:
    # Откат отвязал бы и залы, созданные в филиале нормальным путём, — только
    # фиксируем ревизию.
    pass

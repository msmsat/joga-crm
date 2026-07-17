"""backfill_branch_working_hours

Revision ID: e7b3107855a3
Revises: a021f100f92c
Create Date: 2026-07-17 14:44:05.517389

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7b3107855a3'
down_revision: Union[str, Sequence[str], None] = 'a021f100f92c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Тот же дефолт, что и при создании филиала (routers/studio/router.py:_DEFAULT_HOURS):
# пн–пт 09:00–21:00, сб–вс закрыто — используется, если у студии нет часов из онбординга.
_FALLBACK = [
    {"is_open": True, "open_time": "09:00", "close_time": "21:00"} if d < 5
    else {"is_open": False, "open_time": "09:00", "close_time": "21:00"}
    for d in range(7)
]


def upgrade() -> None:
    conn = op.get_bind()

    branch_ids = [
        row[0] for row in conn.execute(sa.text(
            "SELECT sb.id FROM studio_branches sb "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM branch_working_hours bwh WHERE bwh.branch_id = sb.id"
            ")"
        )).fetchall()
    ]
    if not branch_ids:
        return

    studio_by_branch = dict(conn.execute(sa.text(
        "SELECT id, studio_id FROM studio_branches WHERE id = ANY(:ids)"
    ), {"ids": branch_ids}).fetchall())

    studio_ids = list(set(studio_by_branch.values()))
    studio_hours: dict[int, dict[int, dict]] = {}
    for row in conn.execute(sa.text(
        "SELECT studio_id, day_of_week, is_open, open_time, close_time "
        "FROM studio_working_hours WHERE studio_id = ANY(:ids)"
    ), {"ids": studio_ids}).fetchall():
        studio_id, day, is_open, open_time, close_time = row
        studio_hours.setdefault(studio_id, {})[day] = {
            "is_open": is_open, "open_time": open_time, "close_time": close_time,
        }

    insert_stmt = sa.text(
        "INSERT INTO branch_working_hours (branch_id, day_of_week, is_open, open_time, close_time) "
        "VALUES (:branch_id, :day_of_week, :is_open, :open_time, :close_time)"
    )
    for branch_id in branch_ids:
        studio_id = studio_by_branch[branch_id]
        by_day = studio_hours.get(studio_id, {})
        for d in range(7):
            source = by_day.get(d, _FALLBACK[d])
            conn.execute(insert_stmt, {
                "branch_id": branch_id,
                "day_of_week": d,
                "is_open": source["is_open"],
                "open_time": source["open_time"],
                "close_time": source["close_time"],
            })


def downgrade() -> None:
    # Бэкфилл необратим точечно (нельзя отличить бэкфилленные строки от введённых
    # вручную после апгрейда) — откат не удаляет данные, только фиксирует ревизию.
    pass

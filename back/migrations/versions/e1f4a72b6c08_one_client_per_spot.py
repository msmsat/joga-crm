"""one client per spot: unique (lesson_id, spot_number) among live reservations

Три точки записи ставили номер коврика как «занято + 1». После отмены середины
(заняты 1 и 3, снялся 2) счёт даёт 3 — уже занятый номер, и два человека
получали один коврик; гонка двух одновременных записей давала то же самое. В
dev-БД такая пара на момент миграции уже была.

Номера чинит сам роутер (services.booking_access.next_free_spot), а последним
словом становится этот индекс: проверка «место свободно» и вставка идут разными
запросами, между ними влезает второй клиент.

Частичный (status <> 'cancelled'): отменённые брони копятся на том же месте, и
без условия занять освободившийся коврик было бы нельзя.

Revision ID: e1f4a72b6c08
Revises: d4b2e70c1a93
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f4a72b6c08'
down_revision: Union[str, Sequence[str], None] = 'd4b2e70c1a93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LIVE = "status <> 'cancelled'"


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # Уже существующие двойники разводим ДО индекса, иначе он не создастся.
    # Место остаётся за тем, кто записался раньше (меньший id) — он его и занял;
    # опоздавшего переносим на первый свободный коврик.
    duplicates = conn.execute(sa.text(f"""
        SELECT id, lesson_id FROM (
            SELECT id, lesson_id,
                   ROW_NUMBER() OVER (PARTITION BY lesson_id, spot_number ORDER BY id) AS rn
            FROM reservations WHERE {_LIVE}
        ) t WHERE rn > 1
    """)).all()

    for reservation_id, lesson_id in duplicates:
        taken = {
            row[0] for row in conn.execute(
                sa.text(f"SELECT spot_number FROM reservations WHERE lesson_id = :l AND {_LIVE}"),
                {"l": lesson_id},
            )
        }
        total = conn.execute(
            sa.text("SELECT total_spots FROM lessons WHERE id = :l"), {"l": lesson_id},
        ).scalar() or 0
        # Свободных ковриков может не быть вовсе — занятие перебронировано именно
        # этой ошибкой. Тогда номер уезжает за границу зала: терять живую бронь
        # хуже, чем показать студии лишнего человека, который и так придёт.
        free = next((n for n in range(1, total + 1) if n not in taken), max(taken, default=0) + 1)
        conn.execute(
            sa.text("UPDATE reservations SET spot_number = :s WHERE id = :i"),
            {"s": free, "i": reservation_id},
        )

    op.create_index(
        "uq_reservation_spot_active", "reservations", ["lesson_id", "spot_number"],
        unique=True, postgresql_where=sa.text(_LIVE),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_reservation_spot_active", table_name="reservations")

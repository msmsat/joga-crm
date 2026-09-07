"""Статус брони `hold` — место держится под неоплаченную запись (P4)

ЧТО ЭТО. Клиент подтвердил запись на платное занятие и уходит платить. Пока он
платит, место обязано быть за ним: иначе последний коврик продадут второму, и
деньги придут за бронь, которой уже нет. `hold` — это «место занято, запись ещё
не состоялась».

ПОЧЕМУ НЕ `pending`. `pending` уже значит другое — «ждём одобрения студии», и у
него свои переходы (approve/reject) и свои уведомления. Свалить в один статус
два разных ожидания значит однажды одобрить бронь, за которую не заплатили.

СОГЛАСОВАННОСТЬ С ЧИТАТЕЛЯМИ ПРОВЕРЕНА ПО КОДУ, а не предположена. В продукте
три устойчивых способа спрашивать про брони, и `hold` попадает в каждый
правильно без единой правки:

    status != 'cancelled'          — занятость мест. hold ДЕРЖИТ место  ✓
    status == 'attended'           — посещаемость. hold не посещение    ✓
    status in ('active','attended')— подтверждённые. hold не из них     ✓

Изменение — только расширение CHECK-ограничения. Данные не трогаются: строк со
статусом `hold` до этого выпуска не существует.

Revision ID: 50105defb880
Revises: f061d8187ad4
"""
from typing import Sequence, Union

from alembic import op

revision: str = "50105defb880"
down_revision: Union[str, Sequence[str], None] = "f061d8187ad4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NAME = "check_reservation_status"
_OLD = "status IN ('active', 'pending', 'cancelled', 'attended')"
_NEW = "status IN ('active', 'pending', 'hold', 'cancelled', 'attended')"


def upgrade() -> None:
    op.drop_constraint(_NAME, "reservations", type_="check")
    op.create_check_constraint(_NAME, "reservations", _NEW)


def downgrade() -> None:
    # Откат возможен, только если строк в `hold` не осталось: снимать ограничение
    # с живыми значениями означало бы оставить в таблице статус, которого схема
    # не признаёт. Освобождать места молча тем более нельзя — за ними могут
    # стоять начатые оплаты.
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM reservations WHERE status = 'hold') "
        "THEN RAISE EXCEPTION 'есть брони в статусе hold — сначала разберите "
        "незавершённые оплаты'; END IF; END $$;"
    )
    op.drop_constraint(_NAME, "reservations", type_="check")
    op.create_check_constraint(_NAME, "reservations", _OLD)

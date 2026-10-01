"""reservation attendance autopilot

Посещение по умолчанию — «пришёл». Бронь ждёт до начала занятия, по его
окончании система сама отмечает неотмеченных пришедшими и проводит долг
«оплата на месте» наличными (services/attendance.py). Три поля:

  * `no_show` — явная отметка «не пришёл». Только она отличает неявку: статус
    остаётся `active`, и отчёты считают такую бронь записью без визита ровно
    так же, как раньше считали неотмеченную;
  * `closed_at` — система закрыла бронь по окончании занятия (отметка, запрос
    отзыва, деньги). Закрытую автоматика больше не трогает;
  * `auto_paid` — долг погашен системой, а не кассиром. Только такой платёж
    «не пришёл» откатывает сам.

ПЕРЕНОС СТАРЫХ ДАННЫХ. До этой ревизии неотмеченная бронь прошедшего занятия
означала НЕЯВКУ. Брони закончившихся занятий закрываются, а неотмеченные из них
получают `no_show` — смысл сохраняется один в один. Без этого первый же проход
автоматики объявил бы все старые неявки визитами и «принял» за них наличные.
«Закончилось» — по часам самого занятия (снимок зоны, иначе зона студии):
сравнение с часами сервера задело бы занятия последних часов по ту или другую
сторону. Неизвестная Postgres зона читается как UTC, а не роняет выкатку.

Revision ID: f6246f517716
Revises: 8304ab2b3bce
Create Date: 2026-10-01
"""
from alembic import op
import sqlalchemy as sa

revision = "f6246f517716"
down_revision = "8304ab2b3bce"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reservations", sa.Column(
        "no_show", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("reservations", sa.Column("closed_at", sa.DateTime(timezone=False), nullable=True))
    op.add_column("reservations", sa.Column(
        "auto_paid", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.execute("""
        WITH zones AS (
            SELECT l.id AS lesson_id,
                   l.start_time + make_interval(mins => COALESCE(l.duration_min, 0)) AS ends_at,
                   COALESCE(NULLIF(l.tz_iana, ''), NULLIF(s.tz_iana, '')) AS zone
            FROM lessons l
            JOIN studios s ON s.id = l.studio_id
        ), finished AS (
            SELECT lesson_id FROM zones
            WHERE ends_at <= (now() AT TIME ZONE CASE
                WHEN zone IN (SELECT name FROM pg_timezone_names) THEN zone ELSE 'UTC' END)
        )
        UPDATE reservations r
        SET closed_at = (now() AT TIME ZONE 'UTC'),
            no_show = (r.status = 'active')
        FROM finished f
        WHERE r.lesson_id = f.lesson_id
    """)


def downgrade() -> None:
    op.drop_column("reservations", "auto_paid")
    op.drop_column("reservations", "closed_at")
    op.drop_column("reservations", "no_show")

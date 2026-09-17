"""signup dates and anon id: когда завели аккаунт и откуда пришли

Revision ID: aa457ff31dab
Revises: 2b8474752c32
Create Date: 2026-09-17

ПОРЯДОК ШАГОВ ОБЯЗАТЕЛЕН И НЕ ПЕРЕСТАВЛЯЕТСЯ.

Колонка добавляется БЕЗ server_default, потом заполняется, и только потом
default ставится на будущее. Добавление сразу с server_default в Postgres
проставило бы всем существующим строкам момент выката — то есть навсегда
подменило бы историю регистраций датой миграции и нарисовало на графике
вертикальную стену из тысячи «регистраций» одной секундой.

Заполняем тем, что реально знаем: у пользователя — время его первой сессии,
у студии — самая ранняя из известных дат её участников. Где не знаем — оставляем
NULL. NULL честнее правдоподобной выдумки: выдумку уже не отличить от факта.
"""
import sqlalchemy as sa
from alembic import op

revision = "aa457ff31dab"
down_revision = "2b8474752c32"
branch_labels = None
depends_on = None

# SQL вынесен в константы намеренно: его прогоняет tests/test_signup_backfill.py
# по настоящей схеме. Опечатка в имени таблицы иначе всплыла бы только на
# сервере, в момент, когда откатывать уже дорого.
BACKFILL_USERS = """
    UPDATE users u
       SET created_at = s.first_seen
      FROM (
        SELECT user_id, MIN(created_at) AS first_seen
          FROM user_sessions
         GROUP BY user_id
      ) s
     WHERE s.user_id = u.id
"""

BACKFILL_STUDIOS = """
    UPDATE studios st
       SET created_at = m.first_seen
      FROM (
        SELECT sm.studio_id, MIN(u.created_at) AS first_seen
          FROM studio_members sm
          JOIN users u ON u.id = sm.user_id
         WHERE u.created_at IS NOT NULL
         GROUP BY sm.studio_id
      ) m
     WHERE m.studio_id = st.id
"""


def upgrade() -> None:
    # 1. Колонки без default.
    op.add_column("users", sa.Column("created_at", sa.DateTime(timezone=False), nullable=True))
    op.add_column("users", sa.Column("signup_anon_id", sa.String(length=64), nullable=True))
    op.add_column("studios", sa.Column("created_at", sa.DateTime(timezone=False), nullable=True))
    op.create_index("ix_users_signup_anon_id", "users", ["signup_anon_id"])

    # 2. Заполнение по тому, что известно.
    op.execute(BACKFILL_USERS)
    op.execute(BACKFILL_STUDIOS)

    # 3. И только теперь default — он касается лишь будущих строк.
    op.alter_column("users", "created_at", server_default=sa.func.now())
    op.alter_column("studios", "created_at", server_default=sa.func.now())


def downgrade() -> None:
    op.drop_index("ix_users_signup_anon_id", table_name="users")
    op.drop_column("studios", "created_at")
    op.drop_column("users", "signup_anon_id")
    op.drop_column("users", "created_at")

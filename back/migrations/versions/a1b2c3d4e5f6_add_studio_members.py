"""add studio_members table, remove role and studio_id from users

Revision ID: a1b2c3d4e5f6
Revises: 6aaea90e19ed
Create Date: 2026-06-25 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '6aaea90e19ed'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Создаём таблицу studio_members
    op.create_table(
        'studio_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('studio_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['studio_id'], ['studios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'studio_id', name='uq_studio_member'),
    )
    op.create_index('ix_studio_members_id', 'studio_members', ['id'])
    op.create_index('ix_studio_members_user_id', 'studio_members', ['user_id'])
    op.create_index('ix_studio_members_studio_id', 'studio_members', ['studio_id'])

    # 2. Переносим данные: каждый юзер с studio_id и ролью → запись в studio_members
    op.execute("""
        INSERT INTO studio_members (user_id, studio_id, role)
        SELECT id, studio_id, COALESCE(role, 'Владелец')
        FROM users
        WHERE studio_id IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_studio_member DO NOTHING
    """)

    # 3. Удаляем старые колонки из users
    op.drop_column('users', 'studio_id')
    op.drop_column('users', 'role')


def downgrade() -> None:
    # Возвращаем колонки
    op.add_column('users', sa.Column('role', sa.String(length=50), nullable=True))
    op.add_column('users', sa.Column('studio_id', sa.Integer(), nullable=True))

    # Восстанавливаем данные обратно (берём первую студию пользователя)
    op.execute("""
        UPDATE users u
        SET studio_id = sm.studio_id,
            role = sm.role
        FROM studio_members sm
        WHERE sm.user_id = u.id
    """)

    op.drop_index('ix_studio_members_studio_id', 'studio_members')
    op.drop_index('ix_studio_members_user_id', 'studio_members')
    op.drop_index('ix_studio_members_id', 'studio_members')
    op.drop_table('studio_members')

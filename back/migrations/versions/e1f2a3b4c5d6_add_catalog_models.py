"""add catalog models: studio branches, hall extensions, service extensions

Revision ID: e1f2a3b4c5d6
Revises: d7e8f9a0b1c2
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd7e8f9a0b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── studio_branches ───────────────────────────────────────────────────────
    op.create_table(
        'studio_branches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('studio_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('address', sa.String(length=300), nullable=True),
        sa.Column('country', sa.String(length=100), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(['studio_id'], ['studios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_studio_branches_id', 'studio_branches', ['id'], unique=False)
    op.create_index('ix_studio_branches_studio_id', 'studio_branches', ['studio_id'], unique=False)

    # ── branch_working_hours ──────────────────────────────────────────────────
    op.create_table(
        'branch_working_hours',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('branch_id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('is_open', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('open_time', sa.String(length=5), nullable=False),
        sa.Column('close_time', sa.String(length=5), nullable=False),
        sa.ForeignKeyConstraint(['branch_id'], ['studio_branches.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('branch_id', 'day_of_week', name='uq_branch_day'),
    )
    op.create_index('ix_branch_working_hours_id', 'branch_working_hours', ['id'], unique=False)
    op.create_index('ix_branch_working_hours_branch_id', 'branch_working_hours', ['branch_id'], unique=False)

    # ── service_schedule_slots ────────────────────────────────────────────────
    op.create_table(
        'service_schedule_slots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('service_id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.String(length=5), nullable=False),
        sa.Column('end_time', sa.String(length=5), nullable=False),
        sa.ForeignKeyConstraint(['service_id'], ['services.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_service_schedule_slots_id', 'service_schedule_slots', ['id'], unique=False)
    op.create_index('ix_service_schedule_slots_service_id', 'service_schedule_slots', ['service_id'], unique=False)

    # ── halls extensions ──────────────────────────────────────────────────────
    op.add_column('halls', sa.Column('branch_id', sa.Integer(), nullable=True))
    op.add_column('halls', sa.Column('area', sa.Float(), nullable=True))
    op.add_column('halls', sa.Column('equipment', sa.JSON(), nullable=True))
    op.create_index('ix_halls_branch_id', 'halls', ['branch_id'], unique=False)
    op.create_foreign_key('fk_halls_branch_id', 'halls', 'studio_branches', ['branch_id'], ['id'], ondelete='SET NULL')

    # ── services extensions ───────────────────────────────────────────────────
    op.add_column('services', sa.Column('service_type', sa.String(length=20), nullable=True))
    op.add_column('services', sa.Column('color', sa.String(length=7), nullable=True))
    op.add_column('services', sa.Column('max_clients', sa.Integer(), nullable=True))
    op.add_column('services', sa.Column('bookings_count', sa.Integer(), server_default='0', nullable=False))
    op.add_column('services', sa.Column('revenue_total', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('services', 'revenue_total')
    op.drop_column('services', 'bookings_count')
    op.drop_column('services', 'max_clients')
    op.drop_column('services', 'color')
    op.drop_column('services', 'service_type')

    op.drop_constraint('fk_halls_branch_id', 'halls', type_='foreignkey')
    op.drop_index('ix_halls_branch_id', table_name='halls')
    op.drop_column('halls', 'equipment')
    op.drop_column('halls', 'area')
    op.drop_column('halls', 'branch_id')

    op.drop_index('ix_service_schedule_slots_service_id', table_name='service_schedule_slots')
    op.drop_index('ix_service_schedule_slots_id', table_name='service_schedule_slots')
    op.drop_table('service_schedule_slots')

    op.drop_index('ix_branch_working_hours_branch_id', table_name='branch_working_hours')
    op.drop_index('ix_branch_working_hours_id', table_name='branch_working_hours')
    op.drop_table('branch_working_hours')

    op.drop_index('ix_studio_branches_studio_id', table_name='studio_branches')
    op.drop_index('ix_studio_branches_id', table_name='studio_branches')
    op.drop_table('studio_branches')

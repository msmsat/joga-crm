"""Durable weekly timetable and opt-in studio pricing rules."""
from alembic import op
import sqlalchemy as sa

revision = 'c74d80ab316e'
down_revision = 'f28a6c9041bd'
branch_labels = depends_on = None


def upgrade():
    op.create_table('studio_setup_links',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('studio_id', sa.Integer(), sa.ForeignKey('studios.id', ondelete='CASCADE'), nullable=False),
        sa.Column('preset', sa.String(50), nullable=False), sa.Column('key', sa.String(100), nullable=False),
        sa.Column('entity_type', sa.String(80), nullable=False), sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.UniqueConstraint('studio_id', 'preset', 'key', name='uq_studio_setup_key'))
    op.create_index('ix_studio_setup_links_studio_id', 'studio_setup_links', ['studio_id'])
    op.add_column("studio_subscription_program_configs", sa.Column("renewal_discount_percent", sa.Integer(), nullable=True))
    op.add_column("client_subscriptions", sa.Column("renewal_discount_used", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('studio_subscription_program_configs', sa.Column('max_freeze_days', sa.Integer(), nullable=True))
    op.add_column('clients', sa.Column('freeze_restore_status', sa.String(20), nullable=True))
    op.add_column('clients', sa.Column('freeze_restore_active', sa.Boolean(), nullable=True))
    op.add_column('client_subscriptions', sa.Column('freeze_used_days', sa.Integer(), server_default='0', nullable=False))
    op.add_column('studio_booking_settings', sa.Column('trial_service_ids', sa.JSON(), nullable=True))
    op.create_table('recurring_lesson_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('studio_id', sa.Integer(), sa.ForeignKey('studios.id', ondelete='CASCADE'), nullable=False),
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('service_id', sa.Integer(), sa.ForeignKey('services.id', ondelete='CASCADE'), nullable=False),
        sa.Column('teacher_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('hall_id', sa.Integer(), sa.ForeignKey('halls.id', ondelete='CASCADE'), nullable=False),
        sa.Column('weekday', sa.Integer(), nullable=False), sa.Column('start_minute', sa.Integer(), nullable=False),
        sa.Column('duration_min', sa.Integer(), nullable=False), sa.Column('total_spots', sa.Integer(), nullable=False),
        sa.Column('price', sa.Integer(), nullable=False), sa.Column('starts_on', sa.Date(), nullable=False),
        sa.Column('ends_on', sa.Date(), nullable=True), sa.Column('is_enabled', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.UniqueConstraint('studio_id', 'key', name='uq_recurring_template_key'),
        sa.CheckConstraint('weekday BETWEEN 0 AND 6 AND start_minute BETWEEN 0 AND 1439', name='check_recurring_slot'),
        sa.CheckConstraint('duration_min > 0 AND total_spots BETWEEN 1 AND 50 AND price >= 0', name='check_recurring_values'))
    op.create_index('ix_recurring_lesson_templates_studio_id', 'recurring_lesson_templates', ['studio_id'])
    op.create_table('recurring_lesson_occurrences',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('recurring_lesson_templates.id', ondelete='CASCADE'), nullable=False),
        sa.Column('local_date', sa.Date(), nullable=False),
        sa.Column('lesson_id', sa.Integer(), sa.ForeignKey('lessons.id', ondelete='SET NULL'), unique=True, nullable=True),
        sa.UniqueConstraint('template_id', 'local_date', name='uq_recurring_occurrence'))
    op.create_index('ix_recurring_lesson_occurrences_template_id', 'recurring_lesson_occurrences', ['template_id'])


def downgrade():
    op.drop_table('studio_setup_links')
    op.drop_column("client_subscriptions", "renewal_discount_used")
    op.drop_column("studio_subscription_program_configs", "renewal_discount_percent")
    op.drop_column('client_subscriptions', 'freeze_used_days')
    op.drop_column('clients', 'freeze_restore_active')
    op.drop_column('clients', 'freeze_restore_status')
    op.drop_column('studio_subscription_program_configs', 'max_freeze_days')
    op.drop_table('recurring_lesson_occurrences')
    op.drop_table('recurring_lesson_templates')
    op.drop_column('studio_booking_settings', 'trial_service_ids')

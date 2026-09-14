"""industry space terminology: six profiles and the space axis

Пресетов терминологии становится шесть — ровно разделы экрана «Вид
деятельности» в онбординге (studio, sport, beauty, recovery, relax, other).
Переименование словам не вредит: generic и other описаны одним набором форм,
fitness и sport — тоже, поэтому у студии, которая ничего не трогала, ни одно
слово не меняется.

Заодно чиним то, чего не было с самого начала: онбординг НИКОГДА не проставлял
пресет — студия создавалась с жёстким business_type='fitness' и дефолтным
terminology_profile='generic'. Поэтому у всех, кто не лазил в настройки, стоит
'generic', и по ним можно восстановить отрасль из business_subtype. Тех, кто
выбрал пресет руками (fitness/beauty), не трогаем — их выбор старше нашей
догадки.

Порядок важен: сначала backfill по ещё не переименованным 'generic', потом
переименование остатка.

Разделы в backfill перебираются в порядке онбординга, и каждый UPDATE берёт
только строки, до которых предыдущие не дотянулись. Форма запрещает смешивать
разделы, так что для честных данных порядок ни на что не влияет; для кривых он
задаёт предсказуемое правило вместо случайного.

Revision ID: c7e5a92f31bd
Revises: b3f7a1d4c209
Create Date: 2026-09-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c7e5a92f31bd'
down_revision: Union[str, Sequence[str], None] = 'b3f7a1d4c209'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Снимок таблицы направлений на дату миграции. Копия services.terminology
# осознанная: миграция обязана остаться воспроизводимой, даже когда в коде
# появятся новые направления.
SECTIONS = [
    ("studio", ["yoga", "pilates", "stretching", "barre", "meditation"]),
    ("sport", ["gym", "crossfit", "martial_arts", "dance", "swimming",
               "kids_sport", "personal_training"]),
    ("beauty", ["barbershop", "hair_salon", "makeup", "nails", "brows_lashes",
                "cosmetology", "hair_removal", "tattoo"]),
    ("recovery", ["massage", "manual_therapy", "osteopathy", "physio", "nutrition"]),
    ("relax", ["spa", "sauna", "wraps"]),
]

RENAME = [("generic", "other"), ("fitness", "sport")]
# studio и sport говорят словами прежнего fitness, всё остальное — словами
# прежнего generic: обратный путь тоже не теряет ни одного слова.
ROLLBACK = [("studio", "fitness"), ("sport", "fitness"),
            ("recovery", "generic"), ("relax", "generic"), ("other", "generic")]


def _array_literal(values: Sequence[str]) -> str:
    return "ARRAY[" + ",".join(f"'{value}'" for value in values) + "]"


def upgrade() -> None:
    op.add_column('studios', sa.Column('space_is_axis', sa.Boolean(), nullable=True))

    for profile, activities in SECTIONS:
        op.execute(sa.text(f"""
            UPDATE studios
               SET terminology_profile = '{profile}'
             WHERE terminology_profile = 'generic'
               AND business_subtype IS NOT NULL
               AND regexp_split_to_array(business_subtype, '\\s*,\\s*')
                   && {_array_literal(activities)}
        """))

    for old, new in RENAME:
        op.execute(sa.text(
            f"UPDATE studios SET terminology_profile = '{new}' WHERE terminology_profile = '{old}'"))
        op.execute(sa.text(
            f"UPDATE services SET terminology_profile = '{new}' WHERE terminology_profile = '{old}'"))

    op.alter_column('studios', 'terminology_profile',
                    existing_type=sa.String(length=16),
                    server_default='other', existing_nullable=False)


def downgrade() -> None:
    op.alter_column('studios', 'terminology_profile',
                    existing_type=sa.String(length=16),
                    server_default='generic', existing_nullable=False)
    for new, old in ROLLBACK:
        op.execute(sa.text(
            f"UPDATE studios SET terminology_profile = '{old}' WHERE terminology_profile = '{new}'"))
        op.execute(sa.text(
            f"UPDATE services SET terminology_profile = '{old}' WHERE terminology_profile = '{new}'"))
    op.drop_column('studios', 'space_is_axis')

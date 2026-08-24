"""Управление фичефлагами студии (P0.1).

Единственный способ включить этап Receptionist на студии. Отдельного эндпоинта
нет намеренно: флаги — внутренняя инфраструктура раскатки, а не настройка,
которую студия трогает сама. Появится потребность у поддержки — эндпоинт
добавится поверх тех же двух функций сервиса.

Почему скрипт, а не psql: имя флага проверяется по StudioFeature. Опечатка в
ручном INSERT создала бы строку, которую никто никогда не прочитает, и этап
остался бы выключенным при «включённом» флаге в базе.

Запуск из back/:
    python -m scripts.feature_flag list
    python -m scripts.feature_flag show 42
    python -m scripts.feature_flag on   42 agent_pipeline_v2
    python -m scripts.feature_flag off  42 agent_pipeline_v2
"""
import asyncio
import sys

from sqlalchemy import select

from database import async_session_maker
from models import Studio, StudioFeatureFlag
from services.feature_flags import StudioFeature, set_flag


def _parse_flag(raw: str) -> StudioFeature:
    try:
        return StudioFeature(raw)
    except ValueError:
        known = ", ".join(f.value for f in StudioFeature)
        print(f"Неизвестный флаг {raw!r}.\nДопустимые: {known}")
        raise SystemExit(2)


async def _show(studio_id: int) -> None:
    async with async_session_maker() as db:
        studio = (await db.execute(
            select(Studio.name).where(Studio.id == studio_id)
        )).scalar_one_or_none()
        if studio is None:
            print(f"Студия {studio_id} не найдена")
            raise SystemExit(1)

        rows = {r.flag: r for r in (await db.execute(
            select(StudioFeatureFlag).where(StudioFeatureFlag.studio_id == studio_id)
        )).scalars().all()}

    print(f"Студия {studio_id} — {studio}")
    for feature in StudioFeature:
        row = rows.get(feature.value)
        if row is None:
            print(f"  {feature.value:<26} выключен (нет строки)")
        else:
            state = "ВКЛЮЧЕН" if row.is_enabled else "выключен"
            print(f"  {feature.value:<26} {state}  (изменён {row.updated_at:%Y-%m-%d %H:%M})")


async def _set(studio_id: int, feature: StudioFeature, enabled: bool) -> None:
    async with async_session_maker() as db:
        exists = (await db.execute(
            select(Studio.id).where(Studio.id == studio_id)
        )).scalar_one_or_none()
        if exists is None:
            print(f"Студия {studio_id} не найдена")
            raise SystemExit(1)

        await set_flag(db, studio_id, feature, enabled)
        await db.commit()   # set_flag не коммитит: транзакцией владеет вызывающий

    print(f"Студия {studio_id}: {feature.value} → {'ВКЛЮЧЕН' if enabled else 'выключен'}")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        raise SystemExit(2)

    command = args[0]

    if command == "list":
        for feature in StudioFeature:
            print(feature.value)
        return

    if command == "show" and len(args) == 2:
        asyncio.run(_show(int(args[1])))
        return

    if command in ("on", "off") and len(args) == 3:
        asyncio.run(_set(int(args[1]), _parse_flag(args[2]), command == "on"))
        return

    print(__doc__)
    raise SystemExit(2)


if __name__ == "__main__":
    main()

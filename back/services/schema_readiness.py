"""Read-only check before serving requests or starting background jobs."""
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncEngine

from models import Base


def _missing_columns(connection) -> list[str]:
    columns = inspect(connection).get_multi_columns()
    missing = []
    for table in Base.metadata.tables.values():
        actual = columns.get((table.schema, table.name))
        if actual is None:
            missing.append(f"{table.name} (table missing)")
            continue
        names = {column["name"] for column in actual}
        missing.extend(f"{table.name}.{column.name}" for column in table.columns
                       if column.name not in names)
    return sorted(missing)


async def ensure_database_schema(engine: AsyncEngine) -> None:
    """Fail before background loops flood alerts with UndefinedColumnError.

    Inspect the actual schema, not just alembic_version: a stamped database
    can claim to be current while still missing columns. Never change data.
    """
    async with engine.connect() as connection:
        missing = await connection.run_sync(_missing_columns)
    if missing:
        raise RuntimeError(
            "Database schema is behind the application: " + ", ".join(missing)
            + ". Apply migrations from back/: python -m alembic upgrade head. "
            "Do not use alembic stamp to skip migrations."
        )

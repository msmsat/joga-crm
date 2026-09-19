"""Read-only schema check: python -m scripts.check_schema."""
import asyncio

from database import engine
from services.schema_readiness import ensure_database_schema


async def main() -> None:
    try:
        await ensure_database_schema(engine)
        print("Database schema matches application columns.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

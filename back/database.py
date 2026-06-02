import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Загружаем переменные окружения
load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")

# Железобетонный фикс драйвера для асинхронности
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

print(f"🚀 Итоговая ссылка для БД: {DATABASE_URL}")

# Создаем асинхронный движок
engine = create_async_engine(DATABASE_URL, echo=False)

# Фабрика для асинхронных сессий
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Главная функция-зависимость (Dependency) для FastAPI.
# Она будет выдавать сессию базы данных на каждый запрос и автоматически закрывать её.
async def get_db():
    async with async_session_maker() as session:
        yield session
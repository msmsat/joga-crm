import os
import sys
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

# Загружаем переменные окружения
load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")

# Железобетонный фикс драйвера для асинхронности
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)


# Создаем асинхронный движок.
#
# Под pytest пул соединений выключаем. Каждый тестовый файл гоняет свой
# `asyncio.run()`, то есть свой event loop, а соединение asyncpg намертво привязано
# к тому циклу, в котором открылось. Пул переносил соединение из УЖЕ ЗАКРЫТОГО цикла
# в следующий файл, и прогон всей папки падал на
# «'NoneType' object has no attribute 'send'» — именно поэтому тесты запускались
# только пофайлово. NullPool открывает соединение на операцию и закрывает сразу:
# переносить между циклами нечего.
#
# Проверяем sys.modules, а не переменную окружения: под uvicorn pytest не
# импортирован, и договариваться с деплоем о лишнем флаге не нужно. В проде пул
# по-прежнему обычный — это переключатель, а не замена.
_POOL_KWARGS = {"poolclass": NullPool} if "pytest" in sys.modules else {}
engine = create_async_engine(DATABASE_URL, echo=False, **_POOL_KWARGS)

# Фабрика для асинхронных сессий
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Главная функция-зависимость (Dependency) для FastAPI.
# Она будет выдавать сессию базы данных на каждый запрос и автоматически закрывать её.
async def get_db():
    async with async_session_maker() as session:
        yield session
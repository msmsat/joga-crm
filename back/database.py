import os
import sys
from urllib.parse import urlsplit
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

# Загружаем переменные окружения
load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")


def db_key(url: str | None) -> tuple:
    """Хост, порт и имя базы. По ним и решаем, одна это база или разные: строки
    сравнивать нельзя — у одной и той же базы отличаются драйвер, регистр и
    параметры подключения."""
    if not url:
        return ()
    parts = urlsplit(url)
    return (parts.hostname or "", parts.port or 5432, (parts.path or "").lstrip("/").lower())


def resolve_database_url(app_url: str | None, test_url: str | None, *, under_pytest: bool) -> str | None:
    """Какой базой пользоваться. Под pytest — ТОЛЬКО своей, и это не удобство.

    Тесты пишут в БД, и до сентября 2026 писали в ту же, что и работающее
    приложение. `tests/test_miniapp_checkout.py` оставлял там заявки в `pending`
    с `account_id='acct_test'`, а сверка оплат (routers/checkout/stripe_pay.
    reconcile_pending) раз в час спрашивала о них БОЕВЫМ ключом Stripe, получала
    PermissionError и слала тревогу в Telegram — двое суток на пустом месте.

    Отдельной функцией, а не парой `if` по месту, ровно чтобы её можно было
    проверить тестом: `.env` с боевыми секретами ради этого править нельзя, а
    непроверенная защита — это обещание, а не защита.

    Бросает RuntimeError ДО создания движка: при неверной настройке соединения с
    базой приложения не случается вовсе.
    """
    if not under_pytest:
        return app_url
    if not test_url:
        raise RuntimeError(
            "TEST_DATABASE_URL не задан, а тесты пишут в БД — без своей базы они "
            "загрязняют базу приложения. Пропишите её в .env (см. .env.example) и "
            "создайте схему: python -m scripts.init_test_db"
        )
    if db_key(test_url) == db_key(app_url):
        raise RuntimeError(
            "TEST_DATABASE_URL и DATABASE_URL — одна и та же база "
            f"({db_key(app_url)[2]}). Тесты затирают данные приложения."
        )
    return test_url


DATABASE_URL = resolve_database_url(
    DATABASE_URL, os.getenv("TEST_DATABASE_URL"), under_pytest="pytest" in sys.modules,
)

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
# Все временные метки в моделях — `timestamp without time zone`, а часть из них
# заполняется через server_default=now(). Фиксируем UTC на КАЖДОМ соединении,
# чтобы БД и Python не записывали одно событие с разницей в часовых поясах.
_CONNECT_KWARGS = (
    {"connect_args": {"server_settings": {"timezone": "UTC"}}}
    if DATABASE_URL and DATABASE_URL.startswith("postgresql+asyncpg://")
    else {}
)
engine = create_async_engine(DATABASE_URL, echo=False, **_POOL_KWARGS, **_CONNECT_KWARGS)

# Фабрика для асинхронных сессий
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Главная функция-зависимость (Dependency) для FastAPI.
# Она будет выдавать сессию базы данных на каждый запрос и автоматически закрывать её.
async def get_db():
    async with async_session_maker() as session:
        yield session

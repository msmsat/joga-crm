"""Конфиг pytest для back/.

Тесты лежат в back/tests, а модули приложения — в back/ (`from database import …`),
поэтому корень проекта добавляется в sys.path: без этого pytest кладёт в путь
только back/tests и сбор падает на ModuleNotFoundError.

Прогон ВСЕЙ папки теперь безопасен (эпик N-10). Две вещи, из-за которых раньше
запускали только пофайлово, закрыты здесь:

  1. Реальная отправка писем. Фикстуры тестов используют выдуманные адреса
     (o@x.com и подобные), и прогон слал на них НАСТОЯЩИЙ SMTP — это баунсы и
     репутация домена, а не просто шум. Ниже креды затираются, и каждый отправщик
     уходит в свою ветку «не настроено» (mailer.send_email печатает в stdout,
     notifier.send_telegram возвращает False). Плюс сам транспорт aiosmtplib
     подменяется заглушкой — на случай, если креды приедут откуда-то ещё.

  2. Соединения БД между файлами. Лечится в database.py (NullPool под pytest) —
     см. комментарий там.

  3. Чужая база и боевой Stripe (сентябрь 2026). Тесты писали в базу работающего
     приложения и оставляли там заявки с `account_id='acct_test'`; сверка оплат
     раз в час спрашивала о них БОЕВЫМ ключом Stripe, получала PermissionError и
     слала тревогу в Telegram. Теперь база своя (TEST_DATABASE_URL, проверяется в
     database.py ДО подключения), ключи Stripe подменяются ниже, а сеть SDK
     закрыта в `_stub_stripe`. Убирает за прогоном фикстура в конце файла.

Схема тестовой базы ставится из моделей: `python -m scripts.init_test_db`.
DATABASE_URL на боевую базу при прогоне не подставлять.

pytest — dev-зависимость: `pip install -r requirements-dev.txt`.
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

# Порядок важен: database.py зовёт load_dotenv(override=True) и перетирает всё, что
# мы поставим до него. Импортируем его ПЕРВЫМ, и только потом затираем креды —
# остальные модули зовут load_dotenv() без override, а он уже выставленные ключи
# (пусть даже пустые) не трогает.
import database  # noqa: E402,F401  (импорт ради его же load_dotenv)

# Пустая строка, а НЕ del: удалённый ключ python-dotenv вернул бы обратно из .env
# при первом же load_dotenv() в services/mailer.py.
for _key in (
    "SMTP_HOST", "SMTP_USER", "SMTP_PASS",
    "TG_BOT_TOKEN", "TOKEN", "ALERT_TG_CHAT_ID",
    "WA_APP_ID", "WA_APP_SECRET",
    "IG_APP_ID", "IG_APP_SECRET",
):
    os.environ[_key] = ""

# Stripe — тот же принцип и та же цена ошибки, что у SMTP выше. В .env лежат
# БОЕВЫЕ ключи (sk_live_/pk_live_): забытая заглушка в тесте ушла бы с ними в
# настоящий аккаунт платформы. Пустая строка тут не годится — на ключе не
# ветвится никто, все три модуля (stripe_billing, stripe_catalog, stripe_connect)
# просто кладут значение в stripe.api_key, — поэтому подставляем заведомо
# недействующий тестовый. Секреты вебхуков тоже: тесты, которым нужна настоящая
# подпись, ставят свой секрет сами (SC.WEBHOOK_SECRET = _SECRET).
os.environ["STRIPE_SECRET_KEY"] = "sk_test_not_a_real_key_pytest"
os.environ["STRIPE_PUBLISHABLE_KEY"] = "pk_test_not_a_real_key_pytest"
os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_not_a_real_secret_pytest"
os.environ["STRIPE_BILLING_WEBHOOK_SECRET"] = "whsec_not_a_real_billing_secret_pytest"

# LLM (эпик AI-5): боевой ключ затирается заведомо нерабочим адресом, а не
# пустой строкой. Пустая означала бы «провайдер не настроен» — ассистент ушёл бы
# в заглушку, и агентный цикл в тестах не выполнялся бы ни разу. Нерабочий
# адрес держит ветку «настроен», но физически никуда не ведёт; реальные вызовы
# всё равно невозможны — сам транспорт подменён в pytest_configure ниже.
os.environ["LLM_BASE_URL"] = "http://llm.invalid"
os.environ["LLM_API_KEY"] = "test-key-not-real"
os.environ["LLM_MODEL_FAST"] = "google/gemini-3-flash"
os.environ["LLM_MODEL_MAIN"] = "anthropic/claude-sonnet-5"
os.environ["LLM_MODEL_SMART"] = "anthropic/claude-opus-5"


def pytest_configure(config):
    """Второй рубеж: глушим сам транспорт SMTP.

    Затирания кредов достаточно, пока каждый отправщик честно проверяет их перед
    отправкой. Проверку однажды забудут — а цена ошибки здесь письмо реальному
    человеку с тестовыми данными, поэтому подменяем и то, через что письмо
    физически уходит. Все отправители сидят на одном aiosmtplib.send.
    """
    import aiosmtplib

    async def _swallow(*_args, **_kwargs):
        return {}, "тест: письмо не отправлено"

    aiosmtplib.send = _swallow

    _stub_llm()
    _stub_stripe()


def _stub_llm():
    """Третий рубеж — модель (эпик AI-5, задача 14, п. 1).

    Без него 460+ тестов ушли бы в настоящий API платёжным ключом: счёт, упёртый
    рейт-лимит — и всё это МОЛЧА, потому что тесты при этом позеленеют. Цена
    ошибки та же, что у письма реальному человеку.

    Подменяются ОБЕ функции. Забытая chat_stream не выглядит как дыра ровно до
    того дня, когда появится тест на стрим: он позеленеет, сходив в боевой API.
    Тест, которому нужен свой сценарий ответа, подменяет services.llm.chat сам.
    """
    from services import llm

    def _usage():
        return llm.LLMUsage(model="google/gemini-3-flash", prompt_tokens=10,
                            cached_tokens=0, completion_tokens=5, cost_micro=20)

    # **_ вместо перечисления: заглушка обязана пережить появление нового
    # параметра у llm.chat, иначе прогон падает не там, где ошибка.
    async def _chat(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0, **_):
        return llm.LLMReply(text="Тестовый ответ ассистента.", tool_calls=[], usage=_usage())

    async def _chat_stream(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0):
        yield "token", "Тестовый ответ ассистента."
        yield "usage", _usage()

    # Настоящие реализации остаются доступны по имени: тесту транспорта нужно
    # проверить именно разбор ответа провайдера, а не заглушку. Сети он при
    # этом не касается — подменяет aiohttp у себя. Без этих двух ссылок такой
    # тест позеленел бы, проверив заглушку, и это выглядело бы как успех.
    llm._real_chat, llm._real_chat_stream = llm.chat, llm.chat_stream
    llm.chat = _chat
    llm.chat_stream = _chat_stream


def _stub_stripe():
    """Четвёртый рубеж — сеть Stripe.

    Подменённого ключа хватает, пока каждый тест честно подменяет тот вызов,
    который делает. Однажды забудут — и тест уйдёт в настоящий API. С боевым
    ключом это чужие деньги, с подставленным тестовым — просто поход в сеть за
    ошибкой авторизации; и то и другое в тестах не нужно.

    `request_raw` / `request_raw_async` — единственная воронка ввода-вывода SDK:
    и `request`, и `request_stream` идут через них (проверено по исходнику
    stripe 15.4.0). Классы ошибок и разбор ответа при этом остаются настоящими,
    так что тесты, подменяющие конкретные методы, ничего не замечают.
    """
    from stripe._api_requestor import _APIRequestor

    def _blocked(self, method, url, *_args, **_kwargs):
        raise RuntimeError(
            f"Тест пошёл в НАСТОЯЩИЙ Stripe: {str(method).upper()} {url}. "
            "Сеть в тестах закрыта — подмените нужный вызов через monkeypatch."
        )

    async def _blocked_async(self, method, url, *_args, **_kwargs):
        _blocked(self, method, url)

    _APIRequestor.request_raw = _blocked
    _APIRequestor.request_raw_async = _blocked_async


@pytest.fixture(scope="session", autouse=True)
def _test_database_is_left_clean():
    """Уборка тестовой БД после прогона — и после упавшего тоже.

    Финализатор фикстуры выполняется в обоих случаях, в отличие от кода в конце
    теста: именно поэтому уборка живёт здесь, а не там. Откатом это не решается —
    тесты коммитят (`await db.commit()`), а после коммита откатывать нечего.

    TRUNCATE, а не DELETE: таблиц 81, порядок между ними нам не интересен, и
    CASCADE снимает вопрос внешних ключей. RESTART IDENTITY возвращает счётчики,
    чтобы id в прогонах не расползались.

    База сверяется ПЕРЕД очисткой: имя должно совпадать с TEST_DATABASE_URL и
    отличаться от DATABASE_URL. Ошибиться тут — значит вычистить базу приложения.

    `lock_timeout` — не перестраховка, а разбор реального затора. TRUNCATE берёт
    ACCESS EXCLUSIVE, и если по базе идёт ВТОРОЙ прогон (а тут это норма), хватает
    одной сессии, забывшей закрыть транзакцию: TRUNCATE встаёт за ней, а за
    TRUNCATE — очередь чужих INSERT'ов, потому что запрос такой блокировки
    пропускает вперёд всех. Наблюдалось: три прогона стояли десять минут. Уборка
    обязана быть НЕОБЯЗАТЕЛЬНОЙ — не смогли за пару секунд, значит не сегодня.

    PYTEST_KEEP_DB=1 — не убирать (разбор упавшего теста по оставшимся данным).
    """
    yield

    if os.getenv("PYTEST_KEEP_DB"):
        return

    import asyncio

    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError

    import database
    from models import Base

    app_key = database.db_key(os.getenv("DATABASE_URL"))
    test_key = database.db_key(os.getenv("TEST_DATABASE_URL"))

    async def _truncate() -> str:
        async with database.engine.begin() as conn:
            live = (await conn.execute(text("SELECT current_database()"))).scalar()
            if live != test_key[2] or test_key == app_key:
                raise RuntimeError(
                    f"Уборка отменена: подключились к базе {live!r}, "
                    f"а тестовая — {test_key[2]!r}"
                )
            # Есть ли по базе ДРУГИЕ прогоны. Если есть — не убираем вовсе.
            # TRUNCATE берёт ACCESS EXCLUSIVE, и запрос такой блокировки встаёт
            # ВПЕРЕДИ всех ожидающих: одна чужая сессия, забывшая закрыть
            # транзакцию, — и наш TRUNCATE ждёт её, а за ним копится очередь
            # чужих INSERT'ов. Наблюдалось вживую: шесть прогонов встали на
            # двенадцать минут. Уборка чужую работу останавливать не имеет права.
            others = (await conn.execute(text("""
                SELECT count(*) FROM pg_stat_activity
                 WHERE datname = current_database() AND pid <> pg_backend_pid()
            """))).scalar()
            if others:
                return f"пропущена: по базе идут другие прогоны ({others} соединений)"

            tables = ", ".join(f'public."{name}"' for name in Base.metadata.tables)
            # Второй рубеж на случай прогона, стартовавшего в эту же секунду.
            await conn.execute(text("SET LOCAL lock_timeout = '3s'"))
            await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
            return "выполнена"

    try:
        outcome = asyncio.run(_truncate())
    except DBAPIError as exc:
        # Блокировку за отведённое время взять не удалось. Своей цели (не писать
        # в базу приложения) мы уже достигли, мусор лежит в ТЕСТОВОЙ базе и
        # подождёт до одиночного прогона.
        outcome = f"пропущена: база занята ({type(exc).__name__})"
    print(f"\nуборка тестовой БД {test_key[2]}: {outcome}")


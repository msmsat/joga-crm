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

Тесты по-прежнему пишут в dev-БД: своей тестовой базы у проекта нет, и заводить
её — отдельная работа. DATABASE_URL на боевую базу при прогоне не подставлять.

pytest — dev-зависимость: `pip install -r requirements-dev.txt`.
"""
import os
import sys
from pathlib import Path

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
    "TG_BOT_TOKEN", "TOKEN",
    "WA_APP_ID", "WA_APP_SECRET",
    "IG_APP_ID", "IG_APP_SECRET",
):
    os.environ[_key] = ""

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

    async def _chat(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0):
        return llm.LLMReply(text="Тестовый ответ ассистента.", tool_calls=[], usage=_usage())

    async def _chat_stream(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0):
        yield "token", "Тестовый ответ ассистента."
        yield "usage", _usage()

    llm.chat = _chat
    llm.chat_stream = _chat_stream

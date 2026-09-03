"""Страж режима ключей Stripe: боевой ключ не должен работать на машине разработчика.

Зачем модуль вообще. В `back/.env` лежат ключи ПЛАТФОРМЫ, и до сентября 2026 они
были боевыми — значит любой локальный запуск приложения, любой скрипт и любая
ручная проверка уходили в живой аккаунт. Так и появились комиссии Stripe Tax за
эксперименты с выставлением счетов: код был обычный, ошибка была в том, ЧЕЙ ключ
он держал в руках. Проверка «а точно ли этот ключ можно трогать отсюда» обязана
жить в одном месте и звучать одинаково для веба, воркеров, CLI и диагностики —
иначе её забудут ровно там, где она нужна.

Что модуль делает и чего НЕ делает:

* находит несоответствие ДО первого изменяющего запроса — `guard_write()` стоит на
  каждом пути, который создаёт или меняет объекты Stripe;
* чтение не блокирует: читающая диагностика (`scripts.preflight`, разбор инцидента)
  обязана работать и на боевом ключе, иначе смотреть на прод будет нечем;
* НЕ мешает production: там боевой ключ — норма, и никакая неполнота настроек не
  должна ронять живой биллинг;
* НЕ переключает окружение сам. Единственный способ объявить машину боевой —
  выставить `APP_ENV=production` руками; код этого не делает нигде и никогда;
* НЕ печатает значения ключей — только имя переменной и режим (`live`/`test`).

Предел защиты, о котором нельзя молчать: она живёт ВНУТРИ приложения. Человек,
запустивший `curl` или свой скрипт с боевым ключом, обойдёт её, не заметив. Она
закрывает случайность, а не намерение.
"""
import logging
import os
import sys
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

MODE_LIVE = "live"
MODE_TEST = "test"
MODE_UNKNOWN = "unknown"

ENV_PRODUCTION = "production"

# Локальные хосты: если BACKEND_URL смотрит сюда, машина заведомо не боевая.
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", ""}


class StripeKeyModeError(RuntimeError):
    """Ключи Stripe не годятся для этого окружения. Значений ключей НЕ содержит."""


def key_mode(value: str | None) -> str:
    """`sk_live_…`/`pk_live_…` → live, `sk_test_…`/`pk_test_…` → test, иначе unknown.

    Ограниченные ключи (`rk_live_…`, `rk_test_…`) считаются наравне с секретными:
    режим у них тот же, и правами тут ничего не искупается — ограниченный боевой
    ключ всё равно ходит в живой аккаунт.
    """
    key = (value or "").strip()
    if not key:
        return MODE_UNKNOWN
    for prefix, mode in (("sk_live_", MODE_LIVE), ("rk_live_", MODE_LIVE),
                         ("pk_live_", MODE_LIVE), ("sk_test_", MODE_TEST),
                         ("rk_test_", MODE_TEST), ("pk_test_", MODE_TEST)):
        if key.startswith(prefix):
            return mode
    return MODE_UNKNOWN


def under_pytest() -> bool:
    """Идёт ли прогон тестов. Два признака: pytest сам себя объявляет переменной
    окружения, но она появляется не на всех версиях — модуль в `sys.modules`
    надёжнее."""
    return "pytest" in sys.modules or bool(os.getenv("PYTEST_CURRENT_TEST"))


def app_env() -> str:
    """Окружение процесса. Явное `APP_ENV` главнее любых догадок.

    Неполная настройка НЕ должна ронять прод, поэтому вывод по умолчанию
    консервативен ровно в одну сторону: локальный адрес — это разработка, всё
    остальное — production. То есть забытая переменная на боевом сервере ничего не
    ломает, а забытая на ноутбуке разработчика (где BACKEND_URL смотрит на
    localhost) включает защиту.
    """
    declared = (os.getenv("APP_ENV") or "").strip().lower()
    if declared:
        return declared
    if under_pytest():
        return "test"
    host = urlparse(os.getenv("BACKEND_URL", "http://localhost:8000")).hostname
    return "development" if (host or "") in _LOCAL_HOSTS else ENV_PRODUCTION


def _secret() -> str:
    return os.getenv("STRIPE_SECRET_KEY", "")


def _publishable() -> str:
    return os.getenv("STRIPE_PUBLISHABLE_KEY", "")


def problems() -> list[str]:
    """Список несоответствий человеческим языком. Пустой = можно писать в Stripe.

    Значения ключей сюда не попадают ни при каких условиях — только имя переменной
    и режим, который у неё распознан.
    """
    env = app_env()
    secret_mode = key_mode(_secret())
    public_mode = key_mode(_publishable())
    found: list[str] = []

    if under_pytest() and MODE_LIVE in (secret_mode, public_mode):
        found.append(
            "в тестовом прогоне обнаружен БОЕВОЙ ключ Stripe "
            f"(STRIPE_SECRET_KEY={secret_mode}, STRIPE_PUBLISHABLE_KEY={public_mode}). "
            "Тесты обязаны идти с тестовыми ключами — см. back/conftest.py"
        )
    elif env != ENV_PRODUCTION and MODE_LIVE in (secret_mode, public_mode):
        found.append(
            f"окружение {env!r}, а ключи Stripe боевые "
            f"(STRIPE_SECRET_KEY={secret_mode}, STRIPE_PUBLISHABLE_KEY={public_mode}). "
            "Возьмите тестовые ключи из дашборда Stripe (Test mode) либо, если это "
            "действительно боевой сервер, объявите его явно: APP_ENV=production"
        )

    # Разъехавшиеся режимы — отдельная беда: секретный ключ создаёт объекты в одном
    # аккаунте, а форма на фронте инициализируется ключом другого, и оплата падает
    # уже у клиента, а не при старте.
    if MODE_UNKNOWN not in (secret_mode, public_mode) and secret_mode != public_mode:
        found.append(
            f"ключи Stripe из разных режимов: STRIPE_SECRET_KEY={secret_mode}, "
            f"STRIPE_PUBLISHABLE_KEY={public_mode}. Оба обязаны быть из одного"
        )
    return found


def is_safe() -> bool:
    """Можно ли выполнять изменяющие запросы к Stripe из этого процесса."""
    return not problems()


def guard_write(what: str = "изменяющий запрос") -> None:
    """Проверка ПЕРЕД созданием или изменением объекта Stripe. Кидает при беде.

    Стоит в `services/stripe_billing.py`, `stripe_catalog.py` и `stripe_connect.py`
    на всех записывающих обёртках. Чтение сознательно не трогаем: диагностика на
    боевом аккаунте — законная и безопасная операция, а запретить её значило бы
    остаться без глаз в день инцидента.
    """
    found = problems()
    if found:
        raise StripeKeyModeError(
            f"Stripe: {what} остановлен. " + "; ".join(found)
        )


def log_status() -> None:
    """Крикнуть в лог на старте процесса. Приложение НЕ роняем.

    Ронять нельзя: на боевом сервере это остановило бы биллинг из-за диагностики,
    а на машине разработчика беду и так поймает `guard_write` — но уже с точным
    указанием, какой вызов остановлен.
    """
    found = problems()
    if found:
        logger.error("Stripe: конфигурация ключей небезопасна — %s", "; ".join(found))
    else:
        logger.info(
            "Stripe: ключи режима %s, окружение %s", key_mode(_secret()), app_env(),
        )

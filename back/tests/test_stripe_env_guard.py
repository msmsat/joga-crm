"""Страж режима ключей: боевой ключ не должен работать на машине разработчика.

Именно так и появились комиссии Stripe Tax за эксперименты: код был обычный,
а `.env` держал боевые ключи, и любой локальный запуск уходил в живой аккаунт.

Проверяется поведение, а не намерение: страж обязан РАЗРЕШАТЬ чтение (иначе в день
инцидента нечем смотреть на прод), ОСТАНАВЛИВАТЬ запись и НЕ ронять production.

Запуск из back/:  python -m pytest tests/test_stripe_env_guard.py
"""
import pytest

import services.stripe_env as ENV


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for name in ("APP_ENV", "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "BACKEND_URL"):
        monkeypatch.delenv(name, raising=False)
    yield


def _keys(monkeypatch, secret, publishable=None):
    monkeypatch.setenv("STRIPE_SECRET_KEY", secret)
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", publishable or secret.replace("sk_", "pk_"))


# --- распознавание режима -------------------------------------------------------

@pytest.mark.parametrize("key,mode", [
    ("sk_live_abc", ENV.MODE_LIVE),
    ("rk_live_abc", ENV.MODE_LIVE),   # ограниченный боевой — всё равно боевой
    ("pk_live_abc", ENV.MODE_LIVE),
    ("sk_test_abc", ENV.MODE_TEST),
    ("rk_test_abc", ENV.MODE_TEST),
    ("", ENV.MODE_UNKNOWN),
    ("garbage", ENV.MODE_UNKNOWN),
])
def test_key_mode_recognises_live_including_restricted_keys(key, mode):
    """Ограниченный ключ (`rk_live_`) — не смягчающее обстоятельство: он ходит в
    живой аккаунт ровно так же."""
    assert ENV.key_mode(key) == mode


# --- блокировка записи -----------------------------------------------------------

def test_live_key_in_development_blocks_writes(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    _keys(monkeypatch, "sk_live_abc")
    assert not ENV.is_safe()
    with pytest.raises(ENV.StripeKeyModeError):
        ENV.guard_write("создание счёта")


def test_live_key_under_pytest_blocks_even_if_env_says_production(monkeypatch):
    """Прогон тестов боевым ключом запрещён при любом APP_ENV.

    Иначе достаточно одной переменной в CI, чтобы 1100 тестов ушли в живой аккаунт.
    """
    monkeypatch.setenv("APP_ENV", "production")
    _keys(monkeypatch, "sk_live_abc")
    assert ENV.under_pytest()
    with pytest.raises(ENV.StripeKeyModeError):
        ENV.guard_write()


def test_mismatched_key_modes_are_refused(monkeypatch):
    """Секретный из одного режима, публичный из другого — оплата падает у клиента,
    а не при старте. Ловим при старте."""
    monkeypatch.setenv("APP_ENV", "production")
    _keys(monkeypatch, "sk_test_abc", "pk_live_abc")
    problems = ENV.problems()
    assert any("из разных режимов" in p for p in problems), problems


def test_test_keys_are_fine_anywhere(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    _keys(monkeypatch, "sk_test_abc")
    assert ENV.is_safe()
    ENV.guard_write()  # не кидает


# --- не ломать прод --------------------------------------------------------------

def test_production_config_is_not_broken_by_a_missing_app_env(monkeypatch):
    """Забытая APP_ENV на боевом сервере не должна останавливать биллинг.

    Признак — публичный BACKEND_URL: локальный адрес считается машиной
    разработчика, всё остальное — боевым сервером.
    """
    monkeypatch.setenv("BACKEND_URL", "https://api.example.com")
    _keys(monkeypatch, "sk_live_abc")
    monkeypatch.setattr(ENV, "under_pytest", lambda: False)
    assert ENV.app_env() == ENV.ENV_PRODUCTION
    assert ENV.is_safe(), "боевой сервер с боевым ключом — нормальная конфигурация"


def test_localhost_backend_is_treated_as_development(monkeypatch):
    monkeypatch.setenv("BACKEND_URL", "http://localhost:8000")
    monkeypatch.setattr(ENV, "under_pytest", lambda: False)
    assert ENV.app_env() == "development"


# --- секреты не утекают ------------------------------------------------------------

def test_error_messages_never_contain_key_values(monkeypatch):
    """В тексте ошибки — имя переменной и режим, но не значение.

    Сообщение попадает в логи, в трейсы и в тикеты поддержки.
    """
    monkeypatch.setenv("APP_ENV", "development")
    secret = "sk_live_51SuperSecretValue0000"
    _keys(monkeypatch, secret, "pk_live_51AlsoSecret0000")
    with pytest.raises(ENV.StripeKeyModeError) as exc:
        ENV.guard_write()
    text = str(exc.value)
    assert secret not in text
    assert "SuperSecret" not in text
    assert "AlsoSecret" not in text
    assert "STRIPE_SECRET_KEY=live" in text, "режим назвать надо — иначе непонятно, что чинить"


def test_reads_are_not_blocked(monkeypatch):
    """Диагностика на боевом аккаунте — законная операция.

    Страж стоит только на записи; запрет чтения оставил бы нас без глаз в день
    инцидента и ничего бы не сберёг.
    """
    monkeypatch.setenv("APP_ENV", "development")
    _keys(monkeypatch, "sk_live_abc")
    ENV.log_status()   # только пишет в лог
    assert ENV.problems(), "проблема обязана быть видна"


def test_guard_names_the_blocked_operation(monkeypatch):
    """Сообщение должно говорить, ЧТО остановлено, — иначе непонятно, что чинить."""
    monkeypatch.setenv("APP_ENV", "development")
    _keys(monkeypatch, "sk_live_abc")
    with pytest.raises(ENV.StripeKeyModeError, match="создание счёта"):
        ENV.guard_write("создание счёта")

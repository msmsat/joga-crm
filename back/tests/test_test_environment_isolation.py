"""Защиты тестового окружения: чужая база и боевой Stripe.

Сентябрь 2026. Тесты писали в базу РАБОТАЮЩЕГО приложения и оставляли там заявки
на оплату с `account_id='acct_test'` в статусе `pending`. Сверка потерянных оплат
(`routers/checkout/stripe_pay.reconcile_pending`) раз в час спрашивала о них
Stripe — БОЕВЫМ ключом `sk_live_`, потому что и ключ, и база у сервера были
настоящие. Stripe отвечал `PermissionError` («ключ не имеет доступа к аккаунту
acct_test»), заявка оставалась `pending`, и на следующем часу всё повторялось:
двое суток тревог в Telegram на пустом месте.

Чинится это не в сверке, а здесь: у тестов должна быть своя база и не должно быть
доступа к боевому Stripe. Проверки живут в `database.resolve_database_url`
(срабатывает ДО создания движка) и в `conftest._stub_stripe` (закрывает сеть
SDK). Этот файл проверяет, что обе действительно срабатывают — непроверенная
защита это обещание, а не защита.

Запуск из back/:  python -m pytest tests/test_test_environment_isolation.py -q
"""
import os

import pytest
import stripe

import database


APP = "postgresql+asyncpg://u:p@localhost:5432/localyoga"
TEST = "postgresql+asyncpg://u:p@localhost:5432/localyoga_test"


# ─── 1. Своя база ─────────────────────────────────────────────────────────────

def test_without_its_own_database_pytest_refuses_to_start():
    """Не задан TEST_DATABASE_URL — прогон обязан встать, а не пойти в базу
    приложения. Именно этот путь и насорил в проде."""
    with pytest.raises(RuntimeError) as exc:
        database.resolve_database_url(APP, None, under_pytest=True)
    assert "TEST_DATABASE_URL" in str(exc.value)


def test_the_test_database_may_not_be_the_application_one():
    """Указать в обе переменные одну базу — то же самое, что не разделять их
    вовсе, только выглядит настроенным."""
    with pytest.raises(RuntimeError) as exc:
        database.resolve_database_url(APP, APP, under_pytest=True)
    assert "localyoga" in str(exc.value)


def test_the_same_database_is_recognised_through_a_different_spelling():
    """Одну и ту же базу пишут по-разному: другой драйвер, регистр, параметры.
    Сравнивай мы строки — защита обходилась бы опечаткой."""
    disguised = "postgresql://u:p@LOCALHOST:5432/LocalYoga?sslmode=disable"
    with pytest.raises(RuntimeError):
        database.resolve_database_url(APP, disguised, under_pytest=True)


def test_a_separate_database_is_accepted():
    assert database.resolve_database_url(APP, TEST, under_pytest=True) == TEST


def test_the_application_itself_is_not_touched_by_any_of_this():
    """Вне pytest всё как было: приложение ходит в свою базу и ни от чего
    нового не зависит."""
    assert database.resolve_database_url(APP, None, under_pytest=False) == APP
    assert database.resolve_database_url(APP, TEST, under_pytest=False) == APP


def test_the_running_suite_is_actually_on_the_test_database():
    """Проверка не гипотетическая: прогон, который читает эту строку, обязан
    сидеть в тестовой базе."""
    assert database.db_key(database.DATABASE_URL) == database.db_key(
        os.getenv("TEST_DATABASE_URL")
    )
    assert database.db_key(database.DATABASE_URL) != database.db_key(
        os.getenv("DATABASE_URL")
    )


# ─── 2. Боевой Stripe ─────────────────────────────────────────────────────────

def test_the_live_stripe_key_never_reaches_the_tests():
    """В .env лежит sk_live_. До тестов он доходить не должен: забытая заглушка
    ушла бы с ним в настоящий аккаунт платформы."""
    for name in ("STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"):
        value = os.getenv(name, "")
        assert "_live_" not in value, f"{name} в тестах боевой"
        assert value.startswith(("sk_test_", "pk_test_")), value[:12]


def test_a_forgotten_stub_cannot_reach_stripe_over_the_network():
    """Последний рубеж. Тест, забывший подменить вызов, обязан упасть здесь, а
    не сходить в API — с любым ключом."""
    with pytest.raises(RuntimeError) as exc:
        stripe.checkout.Session.retrieve("cs_whatever", stripe_account="acct_test")
    assert "НАСТОЯЩИЙ Stripe" in str(exc.value)


def test_stripe_error_classes_still_work():
    """Сеть закрыта, а разбор ошибок настоящий: на нём стоит ветка
    reconcile_pending про недоступный аккаунт."""
    assert issubclass(stripe.PermissionError, stripe.StripeError)

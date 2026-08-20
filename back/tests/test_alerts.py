"""Алерты платформе в Telegram (services/alerts.py).

Проверяем то, что ломается молча: выключенный канал (нет чата — нет отправки),
схлопывание повторов (цикл падений не должен выстрелить тысячей сообщений),
хендлер логов и middleware, который обязан пропустить исключение дальше.

Ни сети, ни БД: _post подменяется списком. Запуск из back/:  python -m tests.test_alerts
"""
import asyncio
import logging
import os
from contextlib import contextmanager

from services import alerts


@contextmanager
def _enabled(sent: list):
    """Канал включён, отправка перехвачена, троттлер чист."""
    real_post, real_spawn = alerts._post, alerts._spawn
    os.environ["TG_BOT_TOKEN"], os.environ["ALERT_TG_CHAT_ID"] = "t", "1"
    alerts._last_sent.clear()
    # Поток не заводим: тест не должен зависеть от планировщика ОС.
    alerts._spawn = lambda target, args: target(*args)
    alerts._post = lambda token, chat_id, text: sent.append(text)
    try:
        yield
    finally:
        alerts._post, alerts._spawn = real_post, real_spawn
        os.environ["TG_BOT_TOKEN"] = os.environ["ALERT_TG_CHAT_ID"] = ""
        alerts._last_sent.clear()


def test_alert_off_without_chat_id():
    sent = []
    with _enabled(sent):
        os.environ["ALERT_TG_CHAT_ID"] = ""
        alerts.alert("что-то сломалось")
    assert sent == [], "без ALERT_TG_CHAT_ID отправки быть не должно"


def test_alert_throttles_repeats():
    sent = []
    with _enabled(sent):
        for _ in range(5):
            alerts.alert("одна и та же ошибка", key="k")
        alerts.alert("другая ошибка", key="k2")
    assert len(sent) == 2, f"повторы не схлопнулись: {sent}"


def test_handler_reports_exception_with_traceback():
    sent = []
    alerts.install()
    with _enabled(sent):
        try:
            raise ValueError("касса не открылась")
        except ValueError:
            logging.getLogger("services.test_alerts_demo").exception("сбой оплаты")
    assert len(sent) == 1, f"ошибка не превратилась в алерт: {sent}"
    assert "сбой оплаты" in sent[0] and "ValueError" in sent[0], sent[0]


def test_middleware_alerts_and_reraises():
    sent = []

    class _Req:
        method, headers = "POST", {}
        url = type("U", (), {"path": "/clients"})()

    async def _boom(_request):
        raise RuntimeError("БД недоступна")

    with _enabled(sent):
        try:
            asyncio.run(alerts.alert_on_server_error(_Req(), _boom))
            raise AssertionError("middleware проглотил исключение — ответ клиенту потерян")
        except RuntimeError:
            pass
    assert "/clients" in sent[0] and "БД недоступна" in sent[0], sent


def test_middleware_alerts_on_5xx_response():
    sent = []

    class _Req:
        method = "GET"
        headers = {"authorization": "Bearer нечитаемый"}
        url = type("U", (), {"path": "/analytics/overview"})()

    async def _fail(_request):
        return type("R", (), {"status_code": 502})()

    with _enabled(sent):
        asyncio.run(alerts.alert_on_server_error(_Req(), _fail))
    assert "502" in sent[0] and "/analytics/overview" in sent[0], sent


if __name__ == "__main__":
    for fn in (
        test_alert_off_without_chat_id, test_alert_throttles_repeats,
        test_handler_reports_exception_with_traceback,
        test_middleware_alerts_and_reraises, test_middleware_alerts_on_5xx_response,
    ):
        fn()
    print("ALL PASS")

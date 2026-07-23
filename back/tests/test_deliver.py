"""deliver() — диспетчер каналов доставки (V5-5, задача 6; N-2, задача 4). Без
реальной отправки: send_email/send_telegram подменены, _integration_config
возвращает {} — поэтому whatsapp-ветка (нет подключённого канала) тоже не
делает сетевых вызовов. Проверяем только маршрутизацию и защитные ветки (нет
email/tg_id/cfg → False, не пытаемся слать).
Запуск из back/:  python -m tests.test_deliver
"""
import asyncio

import services.notifier as N


class _Client:
    def __init__(self, email=None, tg_id=None, phone=None):
        self.id = 1
        self.email = email
        self.tg_id = tg_id
        self.phone = phone


async def _run():
    calls = []

    async def fake_send_email(to, subject, html, sender=None):
        calls.append(("email", to, subject, html, sender))

    async def fake_send_telegram(chat_id, text, token=None):
        calls.append(("telegram", chat_id, text))
        return True

    async def fake_integration_config(db, studio_id, kind):
        return {}

    orig_email, orig_tg, orig_cfg = N.send_email, N.send_telegram, N._integration_config
    N.send_email, N.send_telegram, N._integration_config = fake_send_email, fake_send_telegram, fake_integration_config
    try:
        # email: есть адрес — шлёт html, возвращает True
        ok = await N.deliver(None, "email", _Client(email="a@x.com"), "Тема", "текст", "<p>текст</p>", studio_id=1)
        assert ok is True
        assert calls[-1] == ("email", "a@x.com", "Тема", "<p>текст</p>", None)

        # email: нет адреса — не пытается слать, False
        calls.clear()
        ok = await N.deliver(None, "email", _Client(email=None), "Тема", "текст", "<p>текст</p>", studio_id=1)
        assert ok is False and calls == []

        # telegram: есть tg_id — шлёт text (не html), возвращает True
        calls.clear()
        ok = await N.deliver(None, "telegram", _Client(tg_id=555), "Тема", "текст", "<p>текст</p>", studio_id=1)
        assert ok is True
        assert calls[-1] == ("telegram", 555, "текст")

        # telegram: нет tg_id — не пытается слать, False
        calls.clear()
        ok = await N.deliver(None, "telegram", _Client(tg_id=None), "Тема", "текст", "<p>текст</p>", studio_id=1)
        assert ok is False and calls == []

        # whatsapp: канал не подключён (cfg={}) — не пытается слать, False
        calls.clear()
        ok = await N.deliver(
            None, "whatsapp", _Client(email="a@x.com", tg_id=555, phone="+79990000000"),
            "Тема", "текст", "<p>текст</p>", studio_id=1,
        )
        assert ok is False and calls == []
    finally:
        N.send_email, N.send_telegram, N._integration_config = orig_email, orig_tg, orig_cfg


def test_deliver():
    asyncio.run(_run())


if __name__ == "__main__":
    test_deliver()
    print("ALL PASS")

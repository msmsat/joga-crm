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

    async def fake_send_telegram(chat_id, text, token=None, parse_mode=None):
        calls.append(("telegram", chat_id, text, parse_mode))
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

        # telegram: есть tg_id — шлёт text (не html), возвращает True.
        # Без tg_text — голый текст без parse_mode (путь сценариев лояльности:
        # текст пишет владелец, HTML-разметки в нём нет и экранировать нечего).
        calls.clear()
        ok = await N.deliver(None, "telegram", _Client(tg_id=555), "Тема", "текст", "<p>текст</p>", studio_id=1)
        assert ok is True
        assert calls[-1] == ("telegram", 555, "текст", None)

        # telegram с tg_text (путь notify) — уходит форматированная версия и HTML.
        calls.clear()
        ok = await N.deliver(
            None, "telegram", _Client(tg_id=555), "Тема", "текст", "<p>текст</p>",
            studio_id=1, tg_text="✅ <b>Тема</b>\n\nтекст",
        )
        assert ok is True
        assert calls[-1] == ("telegram", 555, "✅ <b>Тема</b>\n\nтекст", "HTML")

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


async def _run_wa_phone_guard():
    """Номер не в E.164 — платное сообщение не уходит вообще.

    Сети тут нет и быть не должно: _send_whatsapp обязан отказаться ДО создания
    сессии, поэтому реквизиты в cfg заведомо нерабочие — если гейт пропустит,
    тест сходит в Graph и это будет видно.

    Главный случай — ручная российская запись «8 999 …»: раньше здесь просто
    выбрасывались не-цифры, и в Meta уезжал 89991234567, то есть ЧУЖОЙ номер за
    наши деньги. Теперь to_e164 делает из него +7 999 … (contact_format.demo).
    """
    cfg = {"phone_number_id": "999", "token": "EAAG"}
    for bad in ("123", "+0123456789", "не телефон", "+7999"):
        assert await N._send_whatsapp(cfg, _Client(phone=bad), "текст") is False, bad
    # Пустой номер — та же ветка, что и раньше.
    assert await N._send_whatsapp(cfg, _Client(phone=None), "текст") is False


def test_deliver():
    asyncio.run(_run())


def test_wa_phone_guard():
    asyncio.run(_run_wa_phone_guard())


if __name__ == "__main__":
    test_deliver()
    test_wa_phone_guard()
    print("ALL PASS")

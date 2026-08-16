"""deliver() — диспетчер каналов доставки (V5-5, задача 6; N-2, задача 4). Без
реальной отправки: send_email/send_telegram подменены, _integration_config
возвращает {} — поэтому whatsapp-ветка (нет подключённого канала) тоже не
делает сетевых вызовов. Проверяем только маршрутизацию и защитные ветки (нет
email/tg_id/cfg → False, не пытаемся слать).
Журнал отправок (N-10) тоже подменён: он ходит в БД своей сессией, а этот тест
сознательно не трогает ни сеть, ни базу. Сам журнал покрыт test_outbox.py.
Запуск из back/:  python -m tests.test_deliver
"""
import asyncio

import services.notifier as N
import services.outbox as O


class _Client:
    def __init__(self, email=None, tg_id=None, phone=None):
        self.id = 1
        self.email = email
        self.tg_id = tg_id
        self.phone = phone


class _Studio:
    """Карточка студии, которой подписывается письмо: имя в шапку, контакты и
    адрес в подвал, часовой пояс — в файл календаря."""
    name = "Студия Лотос"
    address = "Прага, Ke Kapslovně 3"
    phone = "+420 739 007 750"
    email = "hello@lotos.cz"
    timezone = "Europe/Prague"
    language = "ru"


class _DB:
    """Минимальная сессия: email-ветка спрашивает у неё карточку студии."""

    class _Row:
        @staticmethod
        def first():
            return _Studio()

        @staticmethod
        def scalar_one_or_none():
            return _Studio.name

    async def execute(self, *_args, **_kwargs):
        return self._Row()


async def _run():
    calls = []

    async def fake_send_email(to, subject, html, sender=None, brand=None, **_kw):
        calls.append(("email", to, subject, html, sender, brand))
        return True  # как настоящий send_email: True — письмо ушло

    async def fake_send_telegram(chat_id, text, token=None, parse_mode=None):
        calls.append(("telegram", chat_id, text, parse_mode))
        return True

    async def fake_integration_config(db, studio_id, kind):
        return {}

    logged = []

    async def fake_claim(studio_id, event_id, channel, recipient, context):
        logged.append((channel, event_id))
        return 1  # строка занята, слать надо

    async def fake_finish(log_id, status, error=None):
        logged.append((log_id, status))

    orig_email, orig_tg, orig_cfg = N.send_email, N.send_telegram, N._integration_config
    orig_claim, orig_finish = O.claim, O.finish
    N.send_email, N.send_telegram, N._integration_config = fake_send_email, fake_send_telegram, fake_integration_config
    O.claim, O.finish = fake_claim, fake_finish
    try:
        # email: есть адрес — шлёт html, возвращает True
        ok = await N.deliver(_DB(), "email", _Client(email="a@x.com"), "Тема", "текст", "<p>текст</p>", studio_id=1)
        assert ok is True
        _, to, subject, html, sender, brand = calls[-1]
        assert (to, subject, sender, brand) == ("a@x.com", "Тема", None, "Студия Лотос")
        assert html.startswith("<p>текст</p>")
        # К письму студии всегда подписана она сама: адрес, телефон и почта —
        # кликабельные, чтобы позвонить и доехать можно было из письма.
        assert "Ke Kapslovně 3" in html and 'href="tel:+420739007750"' in html
        assert 'href="mailto:hello@lotos.cz"' in html and "google.com/maps" in html

        # email: нет адреса — не пытается слать, False
        calls.clear()
        ok = await N.deliver(_DB(), "email", _Client(email=None), "Тема", "текст", "<p>текст</p>", studio_id=1)
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

        # Каждая отправка, удачная или нет, оставила в журнале и claim, и finish:
        # запись «мы пытались» не должна зависеть от исхода.
        assert ("email", None) in logged and (1, "sent") in logged
        assert (1, "rejected") in logged, logged
    finally:
        N.send_email, N.send_telegram, N._integration_config = orig_email, orig_tg, orig_cfg
        O.claim, O.finish = orig_claim, orig_finish


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

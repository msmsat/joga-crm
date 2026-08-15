"""Ядро notifier.py (эпик N-1, задача 4; N-9, задача 10): чистые функции
_render/_fmt_amount без БД, плюс staff-фан-аут _recipient/notify с фейковой
асинхронной сессией (образец — tests/test_lesson_reschedule_notify.py).
Запуск из back/:  python -m tests.test_notifier
"""
import asyncio

import services.notifier as N


class _FakeUser:
    def __init__(self, id, email, tg_id, phone):
        self.id, self.email, self.tg_id, self.phone = id, email, tg_id, phone


class _Settings:
    def __init__(self, enabled=True):
        self.email_notifications = enabled
        self.telegram_notifications = enabled
        self.whatsapp_notifications = enabled


class _StudioPrefs:
    language = "ru"
    currency = "RUB"


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v

    def scalars(self):
        return self

    def all(self):
        return self._v if isinstance(self._v, list) else [self._v]

    def first(self):
        return self._v[0] if isinstance(self._v, list) else self._v


class _DB:
    def __init__(self, seq):
        self._seq = list(seq)

    async def execute(self, _q):
        return _R(self._seq.pop(0))


def _expected_html(text):
    """html из _render: экранированный текст, переносы строк как <br>."""
    from html import escape
    return "<p>{}</p>".format(escape(text, quote=False).replace("\n", "<br>"))


def test_render_localizes_by_lang_and_currency():
    subject_en, text_en, html_en = N._render("c4", {"amount": 1500}, "en", "USD")
    assert "1 500 $" in text_en
    assert subject_en == "Payment received"

    subject_ru, text_ru, html_ru = N._render("c4", {"amount": 1500}, "ru", "RUB")
    assert "1 500 ₽" in text_ru
    assert subject_ru == "Оплата получена"
    assert html_ru == _expected_html(text_ru)


def test_render_unknown_event_returns_none():
    assert N._render("c99-unknown", {}, "ru", "RUB") is None


def test_render_unknown_lang_falls_back_to_ru():
    subject_ru, text_ru, _ = N._render("c4", {"amount": 100}, "ru", "RUB")
    subject_de, text_de, _ = N._render("c4", {"amount": 100}, "de", "RUB")
    assert (subject_de, text_de) == (subject_ru, text_ru)


def test_fmt_amount_none_defaults_to_zero():
    assert N._fmt_amount(None, "RUB") == "0 ₽"


def test_fmt_amount_unknown_currency_uses_code_as_sign():
    assert N._fmt_amount(10, "XYZ") == "10 XYZ"


def test_render_t1_trainer_booking():
    # t1 (уведомление тренеру о новой записи) — есть шаблон, подставляет имя
    # клиента и название занятия. Раньше шаблона не было → _render возвращал None.
    res = N._render("t1", {"client_name": "Матвей", "lesson_name": "Хатха"}, "ru", "RUB")
    assert res is not None
    subject, text, _ = res
    assert subject == "Новая запись"
    assert "Матвей" in text and "Хатха" in text

    subject_en, text_en, _ = N._render("t1", {"client_name": "Matvei", "lesson_name": "Hatha"}, "en", "USD")
    assert subject_en == "New booking"
    assert "Matvei" in text_en and "Hatha" in text_en


def test_render_new_dead_events_t2_t5_a7_a9_o9_t7():
    # N-9, задача 4/10 — 6 шаблонов, оживлённых этим эпиком. Полный контекст
    # и пустой контекст ({}) оба должны рендериться (защитные дефолты), None —
    # только для неизвестного event_id.
    full_ctx = {
        "t2": {"client_name": "Матвей", "lesson_name": "Хатха", "start_time": "18:00"},
        "t5": {"lesson_name": "Хатха", "start_time": "19:00"},
        "a7": {"lesson_name": "Хатха", "second_lesson_name": "Пилатес", "start_time": "18:00", "resource": "hall"},
        "a9": {"staff_name": "Анна", "device": "Chrome / Windows", "city": "Москва"},
        "o9": {"staff_name": "Анна", "kind": "операции"},
        "t7": {"client_name": "Матвей", "rating": 5, "lesson_name": "Хатха"},
    }
    for event_id, ctx in full_ctx.items():
        for lang, currency in (("ru", "RUB"), ("en", "USD")):
            res = N._render(event_id, ctx, lang, currency)
            assert res is not None, (event_id, lang)
            subject, text, html = res
            assert subject and text and html == _expected_html(text)
        # пустой контекст — не должен падать (дефолты вида context.get(...) or "")
        assert N._render(event_id, {}, "ru", "RUB") is not None, f"{event_id}: пустой контекст ломает рендер"


def test_render_t9_trainer_lesson_cancelled():
    # EPIC 3, задача 4 — новое событие: тренер узнаёт об отмене СВОЕГО занятия
    # (раньше при cancel_lesson уведомлялся только клиент через c3).
    res = N._render("t9", {"lesson_name": "Хатха", "start_time": "18:00"}, "ru", "RUB")
    assert res is not None
    subject, text, html = res
    assert subject == "Занятие отменено"
    assert "Хатха" in text and "18:00" in text
    assert html == _expected_html(text)

    subject_en, text_en, _ = N._render("t9", {"lesson_name": "Hatha", "start_time": "18:00"}, "en", "USD")
    assert subject_en == "Class cancelled"
    assert "Hatha" in text_en

    assert N._render("t9", {}, "ru", "RUB") is not None  # пустой контекст не должен падать


def test_recipient_staff_includes_tg_id_and_phone():
    # N-9, задача 2/10 — раньше _recipient для сотрудника возвращал только
    # email (client=None), теперь — полноценный Recipient с tg_id/phone.
    trainer = _FakeUser(id=5, email="trainer@studio.ru", tg_id=123456789, phone="+79990000000")
    db = _DB([trainer])  # _recipient: role="trainer" + context["trainer_id"] → select(User).where(id==trainer_id)
    recipients = asyncio.run(N._recipient(db, 1, "trainer", {"trainer_id": 5}))
    assert len(recipients) == 1
    r = recipients[0]
    assert r.email == "trainer@studio.ru"
    assert r.tg_id == 123456789
    assert r.phone == "+79990000000"


def test_recipient_a8_does_not_fall_back_to_owner():
    # В студии без отдельного администратора владелец получал в 21:00 два
    # одинаковых письма: a8 «Отчёт за день» (по фолбэку) и o1 «Ежедневная сводка».
    assert asyncio.run(N._recipient(_DB([[]]), 1, "admin", {}, "a8")) == []
    # Остальным admin-событиям фолбэк на владельца нужен как раньше.
    owner = _FakeUser(id=9, email="owner@studio.ru", tg_id=None, phone=None)
    got = asyncio.run(N._recipient(_DB([[], owner]), 1, "admin", {}, "a3"))
    assert [r.email for r in got] == ["owner@studio.ru"]


def test_recipient_owner_fallback_can_be_switched_off_per_call():
    # Пара a4 «Оплата получена» ↔ o3 «Крупный платёж»: списком по event_id её не
    # погасить (o3 уходит только на крупных суммах), поэтому фолбэк снимает сам
    # вызывающий. Без этого владелец студии без администратора получал два письма
    # об одном платеже — см. routers/finances/operations.py.
    owner = _FakeUser(id=9, email="owner@studio.ru", tg_id=None, phone=None)
    assert asyncio.run(
        N._recipient(_DB([[]]), 1, "admin", {}, "a4", False)
    ) == []
    # Обычный платёж (o3 не уходит) — владелец по-прежнему узнаёт о нём из a4.
    got = asyncio.run(N._recipient(_DB([[], owner]), 1, "admin", {}, "a4", True))
    assert [r.email for r in got] == ["owner@studio.ru"]


def test_notify_staff_fanout_hits_telegram_and_whatsapp():
    # Ключевой регресс-тест эпика N-9: раньше notify() слал сотруднику ТОЛЬКО
    # email (гейт `if client is not None` перед tg/wa). Теперь при включённых
    # каналах и заполненном tg_id/phone у сотрудника уходят все три.
    # EPIC 3, Задача 2: резолвинг каналов делегирован resolve_channels — здесь
    # патчим его напрямую (сам резолвер покрыт test_notification_resolver.py),
    # чтобы проверить только фан-аут по каналам получателя.
    import services.notification_resolver as R

    owner = _FakeUser(id=9, email="owner@studio.ru", tg_id=42, phone="+79991112233")
    db = _DB([
        _StudioPrefs(),                             # notify: _studio_prefs
        owner,                                      # _recipient: role="owner" → select(User)...first()
    ])

    calls = []

    async def fake_deliver(db_, channel, recipient, subject, text, html, *, studio_id,
                           tg_text=None, wa_template=None, event_id=None, context=None):
        calls.append(channel)
        # event_id/context нужны журналу отправок (N-10) — без них ключ дедупа
        # схлопнул бы все события студии в одну строку.
        assert event_id == "o1" and context is not None, (event_id, context)
        # Telegram получает форматированную версию, остальные каналы — нет.
        assert (tg_text is not None) == (channel == "telegram"), (channel, tg_text)
        # WhatsApp — только шаблоном: свободный текст Meta доставит лишь внутри
        # 24-часового окна, а уведомление приходит вне его.
        assert (wa_template is not None) == (channel == "whatsapp"), (channel, wa_template)
        return True

    async def fake_resolve(db_, studio_id, role, event_id, recipient_user_id):
        return {"email", "telegram", "whatsapp"}, False

    orig_deliver = N.deliver
    orig_resolve = R.resolve_channels
    N.deliver = fake_deliver
    R.resolve_channels = fake_resolve
    try:
        result = asyncio.run(N.notify(db, 1, "owner", "o1", {}))
    finally:
        N.deliver = orig_deliver
        R.resolve_channels = orig_resolve

    assert result is True
    assert calls == ["email", "telegram", "whatsapp"], calls


def test_render_c12_bonus_uses_raw_amount_and_description():
    # c12 «Начислены бонусы» — amount как сырые баллы (не денежный формат), + описание.
    res = N._render("c12", {"amount": 500, "description": "Бонус за отзыв"}, "ru", "RUB")
    assert res is not None
    subject, text, _ = res
    assert subject == "Начислены бонусы"
    assert "500" in text and "Бонус за отзыв" in text
    assert "₽" not in text  # баллы — не валюта


def test_tg_format_every_event_renders_valid_html():
    # Telegram-версия сообщения: эмодзи + <b>заголовок</b> + тело. Проверяем ВСЕ
    # события каталога в обоих языках — событие без эмодзи или с неэкранированным
    # телом Telegram отвергнет с 400, и уведомление молча не дойдёт.
    for event_id in sorted(N.KNOWN_EVENT_IDS):
        for lang in ("ru", "en"):
            subject, text, _ = N._render(event_id, {}, lang, "RUB")
            tg = N.tg_format(event_id, subject, text)
            assert tg.startswith(N.EVENT_EMOJI[event_id]), (event_id, tg)
            assert f"<b>{subject}</b>" in tg, (event_id, tg)
            assert tg.count("<") == 2 and tg.count(">") == 2, (event_id, tg)  # только <b></b>

    # Имя клиента с HTML-символами не должно порождать лишних тегов.
    tg = N.tg_format("t1", "Новая запись", 'Клиент <Витя> & "Ко" записался.')
    assert "&lt;Витя&gt;" in tg and "&amp;" in tg, tg
    assert tg.count("<") == 2 and tg.count(">") == 2, tg
    assert '"Ко"' in tg, tg  # кавычки не превращаем в &quot; — Telegram их не разбирает


def test_every_event_email_is_assembled_exactly_once():
    """Письмо-близнец tg_format-теста: собираем письмо по КАЖДОМУ событию каталога
    в обоих языках и проверяем, что ничего не задвоилось.

    Раз оболочка (email_layout.wrap) ставит заголовок, подвал и кнопку сама,
    первое же событие, обзаведшееся собственным <h1> или вторым разделом в карте
    ссылок, дало бы клиенту письмо с двумя заголовками или двумя кнопками — молча,
    потому что отправку это не ломает."""
    from services import email_layout as L
    from services.mailer import build_message

    for event_id in sorted(N.KNOWN_EVENT_IDS):
        for lang in ("ru", "en"):
            subject, _text, html = N._render(event_id, {}, lang, "RUB")
            cta = L.cta(event_id, 42, lang)
            assert cta, f"{event_id}: письму некуда вести — событие без раздела"
            message = build_message("k@x.com", subject, html + cta, None, "Студия Лотос")
            rich = list(message.iter_parts())[1].get_content()
            where = (event_id, lang)
            assert rich.count("<h1") == 1, where
            assert rich.count('border-radius:12px"><a href') == 1, where
            # Условия и Политика — документы платформы, в письме студии клиенту
            # их быть не должно (шапка письма — имя студии).
            assert "static/terms.html" not in rich, where
            assert rich.count("Студия Лотос") == 1, where


def test_render_report_events_are_multiline():
    # Сводки/отчёты — по факту на строку (в мессенджере одна длинная строка
    # нечитаема); в html переносы становятся <br>, а не схлопываются.
    subject, text, html = N._render("o1", {"revenue": 12000, "lessons": 5, "new_clients": 2}, "ru", "RUB")
    assert text.count("\n") == 2, text
    assert "<br>" in html, html


def test_notify_payment_fires_c4_client_and_a4_admin():
    class _Row:
        name = "Матвей"
        last_name = "Садовой"

    seen = []

    async def fake_notify(db, studio_id, role, event_id, ctx):
        seen.append((role, event_id, ctx.get("amount")))
        return True

    orig = N.notify
    N.notify = fake_notify
    try:
        asyncio.run(N.notify_payment(_DB([_Row()]), 1, client_id=5, amount=1500))
    finally:
        N.notify = orig
    assert ("client", "c4", 1500) in seen
    assert ("admin", "a4", 1500) in seen


def test_notify_payment_skips_zero_amount_and_missing_client():
    async def boom(*a, **k):
        raise AssertionError("notify не должен зваться при amount<=0 или client_id=None")

    orig = N.notify
    N.notify = boom
    try:
        asyncio.run(N.notify_payment(_DB([]), 1, client_id=5, amount=0))
        asyncio.run(N.notify_payment(_DB([]), 1, client_id=None, amount=100))
    finally:
        N.notify = orig


def test_render():
    test_render_localizes_by_lang_and_currency()
    test_render_unknown_event_returns_none()
    test_render_unknown_lang_falls_back_to_ru()
    test_fmt_amount_none_defaults_to_zero()
    test_fmt_amount_unknown_currency_uses_code_as_sign()
    test_render_t1_trainer_booking()
    test_render_t9_trainer_lesson_cancelled()
    test_render_new_dead_events_t2_t5_a7_a9_o9_t7()
    test_recipient_staff_includes_tg_id_and_phone()
    test_recipient_a8_does_not_fall_back_to_owner()
    test_recipient_owner_fallback_can_be_switched_off_per_call()
    test_notify_staff_fanout_hits_telegram_and_whatsapp()
    test_render_c12_bonus_uses_raw_amount_and_description()
    test_tg_format_every_event_renders_valid_html()
    test_every_event_email_is_assembled_exactly_once()
    test_render_report_events_are_multiline()
    test_notify_payment_fires_c4_client_and_a4_admin()
    test_notify_payment_skips_zero_amount_and_missing_client()


if __name__ == "__main__":
    test_render()
    print("ALL PASS")

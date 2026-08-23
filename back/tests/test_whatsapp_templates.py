"""Шаблоны WhatsApp: соответствие каталогу событий и правилам Meta.

Оффлайн — ни сети, ни БД. Правила ниже ЗАМЕРЕНЫ на живом Graph API (в
документации Meta их нет), поэтому держим их тестом: нарушишь формулировку —
падает здесь, а не в модерации через сутки.

Языков пять (ru, en, uk, cs, de) — все проверки идут по каждому: язык, забытый
в одном шаблоне, означает студию, которая молча не получает это уведомление.

Запуск из back/:  python -m tests.test_whatsapp_templates
"""
import re

from services import email_layout
from services.notification_catalog import CATALOG
from services.notifier import EVENT_EMOJI
from services.whatsapp_templates import (
    _FOOTER,
    WA_LANGS,
    WA_TEMPLATES,
    build_components,
    build_payload,
    is_our_template,
    message_payload,
    resolve_lang,
    template_name,
)

_PLACEHOLDER = re.compile(r"\{\{(\d+)\}\}")


def test_every_event_has_a_template():
    """Событие без шаблона = канал WhatsApp по нему молча не доставит."""
    assert WA_TEMPLATES.keys() == CATALOG.keys()


def test_all_five_languages_everywhere():
    """Пять языков продукта — у каждого шаблона, у подвала и у примеров."""
    assert WA_LANGS == ("ru", "en", "uk", "cs", "de")
    for event_id, tpl in WA_TEMPLATES.items():
        assert set(tpl.body) == set(WA_LANGS), f"{event_id}: языки шаблона {sorted(tpl.body)}"
    assert set(_FOOTER) == set(WA_LANGS)


def test_placeholders_are_sequential_and_examples_match():
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            assert lang in tpl.body, f"{event_id}: нет текста на {lang}"
            numbers = {int(n) for n in _PLACEHOLDER.findall(tpl.body[lang])}
            assert numbers == set(range(1, len(numbers) + 1)), f"{event_id}/{lang}: дыра в нумерации"
            assert len(tpl.example[lang]) == len(numbers), f"{event_id}/{lang}: пример не той длины"
            assert all(v.strip() for v in tpl.example[lang]), f"{event_id}/{lang}: пустое значение примера"


def test_variables_are_not_at_the_edges():
    """Замеренное правило Meta: «Variables can't be at the start or end of the
    template». Хвостовая точка статикой не считается — «…{{2}}.» отклоняется."""
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            stripped = tpl.body[lang].strip(" .!?…\n*")
            assert not stripped.startswith("{{"), f"{event_id}/{lang}: начинается с переменной"
            assert not stripped.endswith("}}"), f"{event_id}/{lang}: заканчивается переменной"


def test_body_has_enough_static_words():
    """Замеренное правило Meta: «Params Words Ratio Exceeds Limit» — на переменную
    нужно достаточно статичных слов.

    Точный порог Meta не публикует, поэтому берём его из замеров на живом API:
        2.0 слова/переменную — ОТКЛОНЕНО («Занятие отменено: {{1}}»)
        1.3 слова/переменную — ОТКЛОНЕНО (три переменные в трёх строках)
        4.5 слова/переменную — ПРИНЯТО   («Вы записаны на «{{1}}» — {{2}}…»)
    Планка 3 стоит между замеренным отказом и замеренным успехом: ловит явно
    куцые формулировки и не заворачивает то, что Meta пропускает.

    Словом считается только то, в чём есть буквы: эмодзи и звёздочки жирного
    начертания счётчик бы надули, а Meta за слова их не считает — иначе «⚠️ 🗓
    *{{1}}*» проходило бы проверку, оставаясь ровно тем, что Meta отклоняет.
    """
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            body = tpl.body[lang]
            variables = len(set(_PLACEHOLDER.findall(body)))
            static_words = len([w for w in _PLACEHOLDER.sub(" ", body).split()
                                if any(ch.isalpha() for ch in w)])
            assert static_words >= 3 * variables, (
                f"{event_id}/{lang}: {static_words} статичных слов на {variables} переменных — "
                f"Meta отклонит по ratio"
            )


def test_no_triple_newline():
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            assert "\n\n\n" not in tpl.body[lang], f"{event_id}/{lang}: три переноса подряд"


def test_body_fits_meta_limits():
    """Тело — до 1024 символов, подвал — до 60: за пределом Meta отклоняет шаблон."""
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            assert len(tpl.body[lang]) <= 1024, f"{event_id}/{lang}: тело длиннее 1024"
    for lang, footer in _FOOTER.items():
        assert len(footer) <= 60, f"{lang}: подвал длиннее 60"


def test_card_starts_with_event_emoji_and_bold_title():
    """Карточка узнаётся с первого взгляда: иконка события и жирный заголовок.

    Эмодзи — тот же, что у события в Telegram (notifier.EVENT_EMOJI): одно
    событие в двух каналах не должно выглядеть двумя разными.
    """
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            body = tpl.body[lang]
            assert body.startswith(f"{EVENT_EMOJI[event_id]} *"), f"{event_id}/{lang}: нет шапки"
            assert body.count("*") % 2 == 0, f"{event_id}/{lang}: непарная звёздочка жирного"
            assert "<b>" not in body and "<br" not in body, f"{event_id}/{lang}: HTML в шаблоне"


def test_params_never_empty_even_on_empty_context():
    """Meta отклоняет пустое значение параметра при отправке, а половина
    контекстов приходит без времени или имени — на этот случай есть заглушки."""
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            values = tpl.params({}, lang, "RUB")
            expected = len(set(_PLACEHOLDER.findall(tpl.body[lang])))
            assert len(values) == expected, f"{event_id}/{lang}: params() вернул {len(values)}, нужно {expected}"
            assert all(v.strip() for v in values), f"{event_id}/{lang}: пустой параметр {values}"


def test_params_are_localized():
    """Заглушки и словарные значения идут на языке шаблона, а не на русском."""
    assert WA_TEMPLATES["c1"].params({}, "cs", "CZK")[0] == "lekce"
    assert WA_TEMPLATES["c1"].params({}, "de", "EUR")[0] == "Kurs"
    assert WA_TEMPLATES["o7"].params({"role": "admin"}, "de", "EUR")[1] == "Administrator"
    # Дата занятия — на языке шаблона: «12. Mai», а не «12 мая».
    when = WA_TEMPLATES["c1"].params({"start_at": "2026-05-12T10:00:00"}, "de", "EUR")[1]
    assert when == "12. Mai, 10:00", when
    assert WA_TEMPLATES["c1"].params({"start_at": "2026-05-12T10:00:00"}, "uk", "UAH")[1] == "12 травня, 10:00"


def test_categories_are_valid():
    for event_id, tpl in WA_TEMPLATES.items():
        assert tpl.category in ("UTILITY", "MARKETING", "AUTHENTICATION"), event_id


def test_template_names_match_meta_naming_rules():
    """Meta: только строчные буквы, цифры и подчёркивания."""
    for event_id in WA_TEMPLATES:
        name = template_name(event_id)
        assert re.fullmatch(r"[a-z0-9_]+", name), f"{event_id}: недопустимое имя {name}"
        assert is_our_template(name)
    # Шаблоны прошлого поколения и чужие шаблоны студии — не наши.
    assert not is_our_template("vlr_c1") and not is_our_template("hello_world")


def test_resolve_lang():
    """Язык студии → язык шаблона: свой, если он есть; иначе английский."""
    assert resolve_lang("cs") == "cs" and resolve_lang("uk") == "uk"
    assert resolve_lang("de-DE") == "de", "региональный код приводим к языку"
    assert resolve_lang("pl") == "en", "язык без шаблонов — английский, а не русский"
    assert resolve_lang(None) == "ru" and resolve_lang("") == "ru"


def test_payload_shape():
    payload = build_payload("c1", "ru")
    assert payload["name"] == "vlr2_c1"
    assert payload["language"] == "ru"
    body, footer = payload["components"]
    assert body["type"] == "BODY"
    assert body["example"]["body_text"] == [WA_TEMPLATES["c1"].example["ru"]]
    assert footer == {"type": "FOOTER", "text": _FOOTER["ru"]}


def test_payload_without_variables_has_no_example():
    """Пустой example Meta не принимает, а шаблон без переменных у нас есть."""
    body = build_payload("c6", "cs")["components"][0]
    assert not WA_TEMPLATES["c6"].slots and "example" not in body


def test_payload_button_only_on_public_url(monkeypatch):
    """Кнопка «открыть раздел» — только при публичном https-адресе.

    На дев-URL (http://localhost) Meta заворачивает ВЕСЬ шаблон, а не только
    кнопку, — студия осталась бы вообще без уведомления ради мёртвой ссылки.
    """
    monkeypatch.setattr(email_layout, "MINIAPP_URL", "http://localhost:5174")
    assert len(build_payload("c1", "ru", studio_id=7)["components"]) == 2

    monkeypatch.setattr(email_layout, "MINIAPP_URL", "https://app.velora.cz")
    buttons = build_payload("c1", "cs", studio_id=7)["components"][-1]
    assert buttons["type"] == "BUTTONS"
    button = buttons["buttons"][0]
    assert button == {"type": "URL", "text": "Moje rezervace",
                      "url": "https://app.velora.cz/s/7?tab=my"}
    assert len(button["text"]) <= 25, "подпись не влезет в кнопку Meta"


def test_payload_button_for_staff_leads_to_crm(monkeypatch):
    monkeypatch.setattr(email_layout, "WEB_APP_URL", "https://crm.velora.cz")
    buttons = build_payload("o6", "de", studio_id=7)["components"][-1]
    assert buttons["buttons"][0]["url"] == "https://crm.velora.cz/dashboard/billing"
    assert buttons["buttons"][0]["text"] == "Tarif und Zahlung"


def test_message_payload_fills_real_values():
    payload = message_payload("c1", {"lesson_name": "Йога", "start_time": "12 мая"}, "ru", "RUB")
    assert payload["name"] == "vlr2_c1"
    assert payload["language"] == {"code": "ru"}
    texts = [p["text"] for p in payload["components"][0]["parameters"]]
    assert texts == ["Йога", "12 мая"]


def test_message_payload_speaks_studio_language():
    payload = message_payload("c1", {"lesson_name": "Jóga"}, "cs", "CZK")
    assert payload["language"] == {"code": "cs"}
    assert payload["components"][0]["parameters"][1]["text"] == "bude upřesněno"


def test_message_payload_unknown_event_is_none():
    assert message_payload("__nope__", {}, "ru", "RUB") is None


def test_message_payload_without_variables_has_no_components():
    """Шаблон без переменных уходит как {name, language} — пустой components
    в сообщении Meta не ждёт."""
    assert message_payload("c6", {}, "de", "EUR") == {"name": "vlr2_c6", "language": {"code": "de"}}


def test_build_components_shape():
    components = build_components("c5", {"remaining": 2}, "ru", "RUB")
    assert components[0]["type"] == "body"
    assert components[0]["parameters"] == [{"type": "text", "text": "2"}]
    # Подвал и кнопка статичны — параметров не требуют; шаблон без переменных
    # уходит вообще без components.
    assert build_components("c6", {}, "ru", "RUB") == []


if __name__ == "__main__":
    class _Monkeypatch:
        """Мини-замена pytest-фикстуры для запуска файла напрямую."""

        def __init__(self):
            self._undo = []

        def setattr(self, obj, name, value):
            self._undo.append((obj, name, getattr(obj, name)))
            setattr(obj, name, value)

        def undo(self):
            for obj, name, old in reversed(self._undo):
                setattr(obj, name, old)
            self._undo.clear()

    _mp = _Monkeypatch()
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn(_mp) if _fn.__code__.co_argcount else _fn()
            _mp.undo()
    print(f"ALL PASS — шаблоны WhatsApp: {len(WA_TEMPLATES)} событий x {len(WA_LANGS)} языков")

"""Шаблоны WhatsApp: соответствие каталогу событий и правилам Meta.

Оффлайн — ни сети, ни БД. Правила ниже ЗАМЕРЕНЫ на живом Graph API (в
документации Meta их нет), поэтому держим их тестом: нарушишь формулировку —
падает здесь, а не в модерации через сутки.

Запуск из back/:  python -m tests.test_whatsapp_templates
"""
import re

from services.notification_catalog import CATALOG
from services.whatsapp_templates import (
    WA_LANGS,
    WA_TEMPLATES,
    build_components,
    build_payload,
    message_payload,
    template_name,
)

_PLACEHOLDER = re.compile(r"\{\{(\d+)\}\}")


def test_every_event_has_a_template():
    """Событие без шаблона = канал WhatsApp по нему молча не доставит."""
    assert WA_TEMPLATES.keys() == CATALOG.keys()


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
            stripped = tpl.body[lang].strip(" .!?…\n")
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
    """
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            body = tpl.body[lang]
            variables = len(set(_PLACEHOLDER.findall(body)))
            static_words = len([w for w in _PLACEHOLDER.sub(" ", body).split() if w.strip(" .,:!?—«»\"'")])
            assert static_words >= 3 * variables, (
                f"{event_id}/{lang}: {static_words} статичных слов на {variables} переменных — "
                f"Meta отклонит по ratio"
            )


def test_no_triple_newline():
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            assert "\n\n\n" not in tpl.body[lang], f"{event_id}/{lang}: три переноса подряд"


def test_params_never_empty_even_on_empty_context():
    """Meta отклоняет пустое значение параметра при отправке, а половина
    контекстов приходит без времени или имени — на этот случай есть заглушки."""
    for event_id, tpl in WA_TEMPLATES.items():
        for lang in WA_LANGS:
            values = tpl.params({}, lang, "RUB")
            expected = len(set(_PLACEHOLDER.findall(tpl.body[lang])))
            assert len(values) == expected, f"{event_id}/{lang}: params() вернул {len(values)}, нужно {expected}"
            assert all(v.strip() for v in values), f"{event_id}/{lang}: пустой параметр {values}"


def test_categories_are_valid():
    for event_id, tpl in WA_TEMPLATES.items():
        assert tpl.category in ("UTILITY", "MARKETING", "AUTHENTICATION"), event_id


def test_template_names_match_meta_naming_rules():
    """Meta: только строчные буквы, цифры и подчёркивания."""
    for event_id in WA_TEMPLATES:
        name = template_name(event_id)
        assert re.fullmatch(r"[a-z0-9_]+", name), f"{event_id}: недопустимое имя {name}"


def test_payload_shape():
    payload = build_payload("c1", "ru")
    assert payload["name"] == "vlr_c1"
    assert payload["language"] == "ru"
    component = payload["components"][0]
    assert component["type"] == "BODY"
    assert component["example"]["body_text"] == [WA_TEMPLATES["c1"].example["ru"]]


def test_message_payload_fills_real_values():
    payload = message_payload("c1", {"lesson_name": "Йога", "start_time": "12 мая"}, "ru", "RUB")
    assert payload["name"] == "vlr_c1"
    assert payload["language"] == {"code": "ru"}
    texts = [p["text"] for p in payload["components"][0]["parameters"]]
    assert texts == ["Йога", "12 мая"]


def test_message_payload_unknown_event_is_none():
    assert message_payload("__nope__", {}, "ru", "RUB") is None


def test_build_components_shape():
    components = build_components("c5", {"remaining": 2}, "ru", "RUB")
    assert components[0]["type"] == "body"
    assert components[0]["parameters"] == [{"type": "text", "text": "2"}]


if __name__ == "__main__":
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print(f"ALL PASS — шаблоны WhatsApp: {len(WA_TEMPLATES)} событий x {len(WA_LANGS)} языка")

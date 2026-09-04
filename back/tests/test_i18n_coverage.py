"""Все исходящие тексты — на всех пяти языках продукта.

Зачем тест. Переводы разбросаны по местам отправки: письма уведомлений, письма
биллинга, приглашение в команду, коды подтверждения, выгрузки CSV, шаблоны
WhatsApp. Забыть один язык в одном словаре — значит выдать чешской студии
русское или английское письмо, и заметит это она, а не мы: раньше именно так
и было, «всё, что не английское, — русское».

Проверка структурная: каждая таблица переводов обязана знать ровно пять языков
(services/i18n.LANGS), а шаблоны с подстановками — держать один и тот же набор
подстановок во всех переводах, иначе `.format` уронит боевое письмо KeyError'ом.

Оффлайн — ни сети, ни БД. Запуск из back/:  python -m tests.test_i18n_coverage
"""
import re

from importlib import import_module

import routers.booking.miniapp_email_auth as email_auth
import routers.settings.data as data_export
import routers.settings.integrations as integrations
import routers.settings.security as security
import services.assistant as assistant
import services.billing_mail as billing_mail
import services.email_layout as email_layout
import services.invites as invites
import services.notifier as notifier
import services.notify_texts as texts
import services.response_texts as reply_texts
import services.otp as otp
from services.i18n import LANGS, pick, resolve

# import_module, а не `import routers.billing.router as ...`: пакет routers.billing
# переэкспортирует из себя APIRouter под именем `router`, и обычный импорт вернул бы
# его вместо модуля.
billing_router = import_module("routers.billing.router")

_FIELD = re.compile(r"\{(\w+)\}")

# Таблицы «язык → значение». Имя — чтобы падение сразу называло виновника.
_FLAT_TABLES = {
    "notify_texts.LEFT_HOURS": texts.LEFT_HOURS,
    "notify_texts.LEFT_SOON": texts.LEFT_SOON,
    "notify_texts.PREV_REVENUE": texts.PREV_REVENUE,
    "notify_texts.BDAY_NAMED": texts.BDAY_NAMED,
    "notify_texts.BDAY_PLAIN": texts.BDAY_PLAIN,
    "notify_texts.SPOTS": texts.SPOTS,
    "notifier._MONTHS": notifier._MONTHS,
    "email_layout._GREETING": email_layout._GREETING,
    "email_layout._FOOTER": email_layout._FOOTER,
    "email_layout._LEGAL": email_layout._LEGAL,
    "email_layout._MAP_LINK": email_layout._MAP_LINK,
    "billing_mail._SUBJECT": billing_mail._SUBJECT,
    "billing_mail._BODY": billing_mail._BODY,
    "billing_mail._LINK": billing_mail._LINK,
    "billing_mail._METHOD": billing_mail._METHOD,
    "billing_mail._WARN_SUBJECT": billing_mail._WARN_SUBJECT,
    "billing_mail._WARN_BODY": billing_mail._WARN_BODY,
    "billing_mail._WARN_LINK": billing_mail._WARN_LINK,
    "billing_mail._VAT_SUBJECT": billing_mail._VAT_SUBJECT,
    "billing_mail._VAT_BODY": billing_mail._VAT_BODY,
    "invites._STRINGS": invites._STRINGS,
    "invites._ROLE_NAMES": invites._ROLE_NAMES,
    "otp._PURPOSE_FALLBACK": otp._PURPOSE_FALLBACK,
    "otp._BODY": otp._BODY,
    "otp._DANGER_NOTE": otp._DANGER_NOTE,
    "assistant._FALLBACK_REPLIES": assistant._FALLBACK_REPLIES,
    "data._CLIENT_STATUS": data_export._CLIENT_STATUS,
    "data._LESSON_STATUS": data_export._LESSON_STATUS,
    "data._OPERATION_TYPE": data_export._OPERATION_TYPE,
    "data._SUB_STATUS": data_export._SUB_STATUS,
    "billing._EXPORT_HEADERS": billing_router._EXPORT_HEADERS,
    "billing._EXPORT_METHOD": billing_router._EXPORT_METHOD,
    "billing._EXPORT_STATUS": billing_router._EXPORT_STATUS,
    "email_auth._CODE_SUBJECT": email_auth._CODE_SUBJECT,
    "email_auth._CODE_BODY": email_auth._CODE_BODY,
    "security._ARCHIVE_SUBJECT": security._ARCHIVE_SUBJECT,
    "security._ARCHIVE_BODY": security._ARCHIVE_BODY,
    "security._ARCHIVE_BUTTON": security._ARCHIVE_BUTTON,
    "integrations._SENDER_SUBJECT": integrations._SENDER_SUBJECT,
    "integrations._SENDER_INTRO": integrations._SENDER_INTRO,
    # Слова ассистента в мессенджере (P1.5). Перечисляются по одной, а не
    # обходом модуля: забытый язык должен падать с именем таблицы, а не
    # «где-то в response_texts».
    **{f"response_texts.{name}": table
       for name, table in vars(reply_texts).items()
       if name.isupper() and isinstance(table, dict)
       and not name.endswith("_FORMS")},
}

# Формы множественного числа: не «язык → строка», а «язык → три строки».
# Собираются по суффиксу: новая таблица форм попадает под проверку сама, без
# правки этого файла — забытая означала бы «4 занятий» в боевом ответе.
_FORM_TABLES = {f"response_texts.{name}": table
                for name, table in vars(reply_texts).items()
                if name.isupper() and isinstance(table, dict) and name.endswith("_FORMS")}
assert len(_FORM_TABLES) >= 2, _FORM_TABLES

# Таблицы «ключ → (язык → значение)»: событие, действие, вид выгрузки.
_NESTED_TABLES = {
    "notify_texts.TEXTS": texts.TEXTS,
    "notify_texts.WORDS": texts.WORDS,
    "notify_texts.ROLE_WORDS": texts.ROLE_WORDS,
    "notify_texts.RESOURCE_WORDS": texts.RESOURCE_WORDS,
    "notify_texts.FACT_LABELS": texts.FACT_LABELS,
    "otp._SUBJECTS": otp._SUBJECTS,
    "otp._PURPOSE": otp._PURPOSE,
    "data._HEADERS": data_export._HEADERS,
}


def test_every_table_knows_every_language():
    for name, table in _FLAT_TABLES.items():
        assert set(table) == set(LANGS), f"{name}: языки {sorted(table)}, нужно {sorted(LANGS)}"
    for name, table in _NESTED_TABLES.items():
        for key, by_lang in table.items():
            assert set(by_lang) == set(LANGS), f"{name}[{key}]: языки {sorted(by_lang)}"
    for name, table in _FORM_TABLES.items():
        assert set(table) == set(LANGS), f"{name}: языки {sorted(table)}"
        for lang, forms in table.items():
            assert len(forms) == 3, f"{name}[{lang}]: нужно три формы, а не {len(forms)}"
            fields = {frozenset(_FIELD.findall(f)) for f in forms}
            assert len(fields) == 1, f"{name}[{lang}]: подстановки разошлись — {fields}"


def test_templates_keep_the_same_placeholders_in_every_language():
    """Забытая подстановка в переводе — письмо без суммы; лишняя — KeyError."""
    checked = 0
    for name, table in {**_FLAT_TABLES}.items():
        values = list(table.values())
        if not all(isinstance(v, str) for v in values):
            continue  # тексты событий и списки колонок проверяются отдельно
        fields = {frozenset(_FIELD.findall(v)) for v in values}
        assert len(fields) == 1, f"{name}: подстановки разошлись — {fields}"
        checked += 1
    assert checked > 10, "проверка перестала что-либо находить"

    for event_id, by_lang in texts.TEXTS.items():
        fields = {frozenset(_FIELD.findall(text)) for _subject, text in by_lang.values()}
        assert len(fields) == 1, f"TEXTS[{event_id}]: подстановки разошлись — {fields}"


def test_csv_headers_have_the_same_number_of_columns():
    """Колонок в шапке столько же, сколько в строках: перевод не меняет таблицу."""
    for kind, by_lang in data_export._HEADERS.items():
        sizes = {lang: len(cols) for lang, cols in by_lang.items()}
        assert len(set(sizes.values())) == 1, f"_HEADERS[{kind}]: разное число колонок — {sizes}"
    sizes = {lang: len(cols) for lang, cols in billing_router._EXPORT_HEADERS.items()}
    assert len(set(sizes.values())) == 1, f"_EXPORT_HEADERS: {sizes}"


def test_every_event_renders_in_every_language():
    """Каждое событие каталога печатается на каждом языке — и на пустом контексте."""
    for event_id in sorted(notifier.KNOWN_EVENT_IDS):
        for lang in LANGS:
            subject, text, _html = notifier._render(event_id, {}, lang, "EUR")
            assert subject and text, (event_id, lang)
            assert "{" not in text, f"{event_id}/{lang}: незаполненная подстановка — {text}"


def test_unknown_language_falls_back_to_english_everywhere():
    """Студия на языке без переводов (pl) получает английский, а не русский."""
    assert resolve("pl") == "en"
    assert pick(billing_mail._SUBJECT, "pl") == billing_mail._SUBJECT["en"]
    assert pick(texts.TEXTS["c1"], "pl") == texts.TEXTS["c1"]["en"]
    assert notifier._render("c1", {}, "pl", "EUR")[0] == texts.TEXTS["c1"]["en"][0]


if __name__ == "__main__":
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print(f"ALL PASS — переводы: {len(_FLAT_TABLES) + len(_NESTED_TABLES)} таблиц x {len(LANGS)} языков")

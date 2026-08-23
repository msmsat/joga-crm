"""Языки, на которых продукт говорит с человеком, и выбор перевода.

Их пять — ru, en, uk, cs, de: ровно те, у которых в `front/src/locales/<язык>/`
лежат ВСЕ словари интерфейса. Список языков студии шире (22 кода, см.
schemas/settings/general.Language), но выбрать польский в настройках и получить
интерфейс на польском — разные вещи, и письма идут за интерфейсом, а не за
списком.

Зачем модуль. Переводы разбросаны по местам отправки — письма уведомлений
(notifier), письма биллинга (billing_mail), приглашения (invites), выгрузки
(settings/data, billing/router), шаблоны WhatsApp (whatsapp_templates). Общего у
них ровно два правила, и держать их надо в одном месте:

  resolve() — какой язык взять, если студия говорит на чём-то ещё;
  pick()    — как достать перевод, не уронив запрос KeyError'ом.

Второе не формальность: до этого словари индексировались как `_BODY[lang]`, и
любой новый язык студии ронял выгрузку клиентов пятисоткой.

Self-check:  python -m services.i18n
"""
from typing import TypeVar

T = TypeVar("T")

LANGS: tuple[str, ...] = ("ru", "en", "uk", "cs", "de")

# Язык студии не задан вовсе (Studio.language nullable, старые студии).
DEFAULT_LANG = "ru"
# Язык задан, но перевода на него у нас нет (pl, fr, …). Английский, а не
# русский: он понятен там, где русский может быть не понят вовсе.
FALLBACK_LANG = "en"


def resolve(raw: str | None) -> str:
    """Код языка студии → язык, на котором с ней говорим. «de-DE» → «de»."""
    lang = (raw or "").split("-")[0].lower()
    if not lang:
        return DEFAULT_LANG
    return lang if lang in LANGS else FALLBACK_LANG


def pick(mapping: dict[str, T], lang: str) -> T:
    """Перевод из словаря «язык → значение»; нет нужного — английский.

    Английский обязателен во всех таких словарях: он последняя опора, и без него
    падение вернулось бы ровно туда, откуда его убирали.
    """
    return mapping.get(lang) or mapping[FALLBACK_LANG]


if __name__ == "__main__":
    assert resolve("cs") == "cs" and resolve("uk") == "uk"
    assert resolve("de-DE") == "de" and resolve("EN") == "en"
    assert resolve("pl") == "en", "язык без переводов — английский"
    assert resolve(None) == "ru" and resolve("") == "ru"

    _m = {"ru": "да", "en": "yes", "cs": "ano"}
    assert pick(_m, "cs") == "ano" and pick(_m, "ru") == "да"
    assert pick(_m, "de") == "yes", "нет перевода — английский, а не KeyError"
    print(f"i18n self-check ok — {len(LANGS)} языков: {', '.join(LANGS)}")

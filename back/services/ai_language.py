"""На каком языке отвечать человеку. Один резолвер на все поверхности.

Почему это отдельный слой, а не строчка в промпте. До него язык ответа брался из
настроек ассистента, а при «auto» — из языка студии
(`assistant._resolve_language`). То есть из свойства СТУДИИ, а не из того, на чём
человек только что написал. Чешский тренер в студии с русским интерфейсом
получал русский ответ, и починить это надеждой на догадливость модели нельзя:
инструкции, описания инструментов, названия кнопок и ошибки бэкенда — всё это
тоже текст на своём языке, и каждый из них тянет ответ на себя.

Три вещи, на которых держится решение.

  * Язык определяется ДЕТЕРМИНИРОВАННО и бесплатно. Никакого второго вызова
    модели: распознать пять языков продукта (ru, en, uk, cs, de) по алфавиту,
    диакритике и коротким спискам служебных слов — задача на микросекунды.
  * Чужой текст в сообщении не считается. Цитата клиента, скопированное письмо,
    имя, код, идентификатор — это НЕ язык говорящего. «Клиент написал "I want to
    cancel", что делать?» — вопрос чешский, а не английский.
  * Результат — не только код языка, но и ПРИЧИНА. На вопрос «почему ассистент
    ответил по-русски» должен быть ответ из телеметрии, а не догадка.

Порядок приоритетов — в resolve(). Он один и тот же для CRM и для мессенджеров:
две копии разошлись бы, и «почему в директе иначе» стало бы отдельным багом.

Self-check:  python -m services.ai_language
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from services.i18n import DEFAULT_LANG, LANGS, resolve as resolve_locale

# Буквы, которые встречаются ТОЛЬКО в одном из языков набора. Самый дешёвый и
# самый надёжный признак: одна «ř» решает вопрос чешского окончательно.
_MARKERS = {
    "uk": "іїєґ",
    "ru": "ыъэё",
    "cs": "ěščřžůťďň",
    "de": "äöüß",
}
# Общая для чешского и других латинских диакритика — сама по себе не решает,
# но вместе со служебными словами склоняет чашу.
_LATIN_SOFT = "áíéýúóů"

# Служебные слова: работают там, где человек написал без диакритики
# («Ukaz mi rozvrh», «Skolko klientov»). Списки короткие намеренно — это
# разрешение спора, а не классификатор языка.
_STOPWORDS = {
    "en": {"the", "a", "an", "how", "many", "much", "do", "does", "we", "i", "you",
           "show", "me", "what", "when", "who", "is", "are", "have", "has", "can",
           "please", "give", "tell", "and", "for", "this", "that", "month", "week",
           "today", "tomorrow", "answer", "in", "english", "my", "our"},
    "cs": {"kolik", "mam", "mame", "ukaz", "ukazte", "jak", "co", "kdy", "kde",
           "na", "se", "je", "jsou", "prosim", "muzes", "muzete", "mi", "ten",
           "tento", "mesic", "tyden", "dnes", "zitra", "klientu", "klienti", "a",
           "za", "nas", "nase"},
    "de": {"wie", "viele", "haben", "wir", "zeige", "zeig", "bitte", "das", "der",
           "die", "ist", "sind", "was", "wann", "wo", "monat", "woche", "heute",
           "morgen", "und", "fur", "mir", "kunden", "mein", "unsere"},
    "ru": {"сколько", "покажи", "что", "как", "когда", "где", "мне", "нас", "наш",
           "этот", "месяц", "неделя", "сегодня", "завтра", "клиентов", "и", "за",
           "пожалуйста", "дай", "есть"},
    "uk": {"скільки", "покажи", "що", "як", "коли", "де", "мені", "нас", "наш",
           "цей", "місяць", "тиждень", "сьогодні", "завтра", "клієнтів", "і", "за",
           "будь", "ласка"},
}

# Явная просьба ответить на языке — перебивает распознавание (человек сказал
# прямо, догадываться не о чем). Ключ — подстрока в нижнем регистре.
_EXPLICIT = {
    "en": ("in english", "по-английски", "по английски", "англійською", "anglicky",
           "auf englisch", "in englisch"),
    "ru": ("in russian", "по-русски", "по русски", "російською", "rusky", "auf russisch"),
    "uk": ("in ukrainian", "по-украински", "по украински", "українською",
           "ukrajinsky", "auf ukrainisch"),
    "cs": ("in czech", "по-чешски", "по чешски", "чеською", "cesky", "česky",
           "auf tschechisch"),
    "de": ("in german", "по-немецки", "по немецки", "німецькою", "nemecky",
           "německy", "auf deutsch"),
}

# Что выбрасывается из текста перед распознаванием: это не речь говорящего.
_NOISE = (
    re.compile(r"```.*?```", re.S),            # блоки кода
    re.compile(r"`[^`]*`"),                    # инлайн-код
    re.compile(r"[«\"„][^«\"„”»]{0,400}[»\"”]"),   # цитаты всех начертаний
    re.compile(r"https?://\S+"),               # ссылки
    re.compile(r"\S+@\S+\.\w+"),               # почта
    re.compile(r"\b[a-z_]+_[a-z_]+\b"),        # get_schedule, client_id, request_id
    re.compile(r"\b\d[\d:.\-/]*\b"),           # числа, даты, время
)

_CYRILLIC = re.compile(r"[Ѐ-ӿ]")
_LATIN = re.compile(r"[A-Za-zÀ-ɏ]")
_WORD = re.compile(r"[^\W\d_]+", re.U)
# Меньше трёх букв — сигнала нет вовсе: «OK», «да», «?», «👍».
_MIN_LETTERS = 3


@dataclass(frozen=True)
class Language:
    """Разрешённый язык ответа и ПОЧЕМУ именно он."""
    code: str
    source: str        # explicit_request | settings_pin | latest_user_message
                       # | previous_user_message | locale_fallback


def _clean(text: str) -> str:
    """Убрать из сообщения то, что говорящему не принадлежит."""
    for pattern in _NOISE:
        text = pattern.sub(" ", text)
    return text


def explicit_request(text: str) -> str | None:
    """«Ответь по-чешски», «answer in English» — прямая просьба человека."""
    low = (text or "").lower()
    for lang, needles in _EXPLICIT.items():
        if any(needle in low for needle in needles):
            return lang
    return None


def detect(text: str) -> str | None:
    """Язык сообщения или None, если сигнала нет.

    None — полноценный ответ, а не неудача: «OK» и «2026-08-26 18:00?» языка не
    несут, и придумывать его для них означало бы менять язык разговора на
    каждой короткой реплике.
    """
    body = _clean(text or "")
    letters = _WORD.findall(body)
    if sum(len(w) for w in letters) < _MIN_LETTERS:
        return None

    low = body.lower()
    cyr = len(_CYRILLIC.findall(low))
    lat = len(_LATIN.findall(low))
    if cyr + lat < _MIN_LETTERS:
        return None

    # Алфавит решает первым: смесь «Покажи revenue за месяц» — русская речь с
    # английским термином, а не наоборот. Спорить об этом словами незачем.
    cyrillic_side = cyr >= lat
    family = ("ru", "uk") if cyrillic_side else ("en", "cs", "de")

    # 1. Уникальная буква — приговор.
    for lang in family:
        if any(ch in low for ch in _MARKERS.get(lang, "")):
            return lang

    # Одинокое латинское слово сигналом не считается: весь словарь продукта
    # латиницей — «Revenue?», «VIP», «get_schedule», имена людей. Кириллица
    # наоборот сама по себе решает: одним словом по-русски не пишут английскую
    # реплику. Замерено на состязательных случаях: без этой асимметрии «yes»
    # после чешского диалога переводило разговор на английский.
    if not cyrillic_side and len(letters) < 2:
        return None

    # 2. Служебные слова: у кого больше совпадений, тот и язык.
    words = {w.lower() for w in letters}
    hits = {lang: len(words & _STOPWORDS[lang]) for lang in family}
    best = max(hits, key=lambda k: hits[k])
    if hits[best]:
        # Ничья между чешским и английским разрешается в пользу чешского только
        # мягкой диакритикой: «Kolik» без неё всё равно чешское слово, а вот
        # «show me» — нет.
        tied = [lang for lang, n in hits.items() if n == hits[best]]
        if len(tied) > 1 and "cs" in tied and any(ch in low for ch in _LATIN_SOFT):
            return "cs"
        return best

    # 3. Ни уникальной буквы, ни служебного слова. Для кириллицы этого хватает:
    # сам алфавит уже отсекает три языка из пяти, а между ru и uk без признаков
    # честнее взять основной. Для латиницы — нет: фраза без единого служебного
    # слова это почти всегда имя, название или строка продукта («Anna Nováková»,
    # «VIP klient»). Мягкая диакритика тут не помощник — она стоит и в именах,
    # и именно на них ловилось ложное «чешский».
    return "ru" if cyrillic_side else None


def _user_texts(history) -> list[str]:
    """Реплики человека, новые первыми. Ответы ассистента не берём никогда:
    он мог ошибиться языком в прошлом ходе, и тогда ошибка закрепилась бы
    навсегда — каждый следующий ход подтверждал бы предыдущий."""
    return [m.text or "" for m in reversed(list(history or [])) if getattr(m, "role", "") == "user"]


def resolve(history, *, settings_language: str | None = None,
            studio_language: str | None = None) -> Language:
    """Язык ответа и причина выбора.

    Порядок:
      1. явная просьба в последнем сообщении человека;
      2. язык, закреплённый владельцем в настройках ассистента (не «auto»);
      3. язык последнего осмысленного сообщения человека;
      4. язык предыдущего осмысленного сообщения человека — для «ок», «да», «?»;
      5. язык студии, а если и его нет — язык продукта по умолчанию.

    Пункт 2 стоит выше распознавания намеренно: это тоже прямое указание
    человека, просто сделанное в настройках, а не в реплике. Умолчание поля —
    «auto», и тогда порядок работает так, как описан в задаче.
    """
    texts = _user_texts(history)

    if texts:
        asked = explicit_request(texts[0])
        if asked:
            return Language(asked, "explicit_request")

    pinned = (settings_language or "auto").strip().lower()
    if pinned and pinned != "auto":
        return Language(resolve_locale(pinned), "settings_pin")

    for i, text in enumerate(texts):
        found = detect(text)
        if found:
            return Language(found, "latest_user_message" if i == 0 else "previous_user_message")

    if studio_language:
        return Language(resolve_locale(studio_language), "locale_fallback")
    return Language(DEFAULT_LANG, "locale_fallback")


# Названия языков для строки в промпте: код «cs» модель поймёт, но слово
# «Czech» рядом снимает последние сомнения и стоит четыре токена.
_NAMES = {"ru": "Russian", "en": "English", "uk": "Ukrainian",
          "cs": "Czech", "de": "German"}


def name(code: str) -> str:
    return _NAMES.get(code, code)


if __name__ == "__main__":
    assert detect("Kolik klientů máme tento měsíc?") == "cs"
    assert detect("How many clients do we have this month?") == "en"
    assert detect("Сколько у нас клиентов за этот месяц?") == "ru"
    assert detect("Скільки в нас клієнтів цього місяця?") == "uk"
    assert detect("Wie viele Kunden haben wir?") == "de"

    # Термин на другом языке речь не меняет.
    assert detect("Покажи revenue за последний месяц.") == "ru"
    assert detect("Můžeš mi ukázat retention za poslední měsíc?") == "cs"

    # Чужой текст в кавычках — не язык говорящего.
    assert detect('Klient napsal "I want to cancel my booking". Co mám udělat?') == "cs"
    assert detect('Клиент прислал "Zrušte mi rezervaci" — что делать?') == "ru"

    # Сигнала нет.
    for empty in ("OK", "да", "?", "👍", "123", "2026-08-26 18:00?", "get_schedule"):
        assert detect(empty) is None, empty

    # Без диакритики выручают служебные слова.
    assert detect("Kolik mame klientu za tento mesic") == "cs"

    assert explicit_request("Answer in English: Kolik klientů máme?") == "en"
    assert explicit_request("Ответь по-чешски: сколько у меня клиентов?") == "cs"
    assert explicit_request("Сколько у нас клиентов?") is None
    print("ALL PASS")

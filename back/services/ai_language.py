"""На каком языке отвечать человеку. Один резолвер на все поверхности.

Контракт продукта в одну строчку: **человек пишет на языке X — ассистент
отвечает на языке X**. Всё остальное здесь существует, чтобы это правило
выдерживало боевые условия.

Что НЕ имеет права перебить ясно узнанный язык текущей реплики: язык студии,
локаль интерфейса, локаль аккаунта, страна, часовой пояс, роль, язык прошлого
ответа ассистента, язык системных инструкций, описаний инструментов,
результатов инструментов, ошибок бэкенда, цитат клиента, подписей кнопок, имён
и идентификаторов. Каждый из этих текстов написан на своём языке и тянет ответ
на себя — поэтому язык считается ЗДЕСЬ и приезжает к модели готовым значением.

Три решения, которые легко «упростить» неправильно.

  * **Настройка ассистента — предпочтение, а не приказ.** Раньше она стояла
    выше распознавания, и владелец, однажды выбравший русский, обрекал своего
    чешского тренера на русские ответы. Настройка теперь работает только тогда,
    когда в разговоре языка не видно вовсе.
  * **Ответ ассистента никогда не источник языка.** Иначе одна ошибка модели
    закрепилась бы навсегда: каждый следующий ход подтверждал бы предыдущий.
  * **Набор языков ответа шире набора локалей интерфейса.** Польскому клиенту
    незачем получать английский только потому, что у продукта нет польских
    словарей интерфейса. Модель говорит на большем числе языков, чем продукт
    переведён, и это разные вещи.

Распознавание — трёхслойное и бесплатное, без сети и без второго вызова модели:

  1. уникальная буква (ř, ї, ы, ß, ł, ľ) — приговор;
  2. служебные слова ВСЕХ языков сразу — грамматику несут именно они, поэтому
     «Show me загрузку тренеров» это английская команда, а «Покажи revenue за
     месяц» — русская, хотя букв в обоих случаях поровну;
  3. py3langid — офлайновая модель на 97 языков, для всего остального.

Self-check:  python -m services.ai_language
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from services.i18n import DEFAULT_LANG, resolve as resolve_locale

logger = logging.getLogger(__name__)

# Буквы, встречающиеся ТОЛЬКО в одном языке набора. Самый дешёвый и самый
# надёжный признак: одна «ř» закрывает вопрос чешского окончательно.
_MARKERS = {
    "uk": "їєґ",
    "ru": "ыъэё",
    "cs": "ěščřžůťďň",
    "pl": "ąęłńśźż",
    "sk": "ľĺŕô",
    "de": "äöüß",
}

# Служебные слова: грамматический костяк фразы. Считаются по ВСЕМ языкам сразу,
# а не только по преобладающему алфавиту, — именно так разводятся «Show me
# загрузку» (английская команда) и «Покажи revenue» (русская). Списки короткие
# намеренно: это разрешение спора, а не классификатор языка.
_STOPWORDS = {
    # Только служебные слова. Содержательные существительные («clients»,
    # «schedule») отсюда убраны намеренно: они общие у половины европейских
    # языков, и на них французский вопрос опознавался как английский.
    "en": {"the", "how", "many", "much", "do", "does", "we", "you",
           "show", "me", "what", "when", "who", "is", "are", "have", "has", "can",
           "please", "give", "tell", "and", "for", "this", "that", "month", "week",
           "today", "tomorrow", "answer", "my", "our", "her", "his", "him",
           "their", "them", "us", "it"},
    "cs": {"kolik", "mam", "mame", "ukaz", "ukazte", "jak", "co", "kdy", "kde",
           "se", "je", "jsou", "prosim", "muzes", "muzete", "mi", "ten",
           "tento", "mesic", "tyden", "dnes", "zitra", "klientu", "klienti",
           "nas", "nase", "rozvrh"},
    "sk": {"kolko", "mame", "ukaz", "ako", "kedy", "kde", "prosim", "tento",
           "mesiac", "tyzden", "dnes", "zajtra", "klientov", "rozvrh"},
    "pl": {"ile", "mamy", "pokaz", "jak", "kiedy", "gdzie", "prosze", "ten",
           "tego", "miesiac", "tydzien", "dzisiaj", "jutro", "klientow", "nasze"},
    "de": {"wie", "viele", "haben", "wir", "zeige", "zeig", "bitte", "das", "der",
           "die", "ist", "sind", "was", "wann", "wo", "monat", "woche", "heute",
           "morgen", "und", "fur", "mir", "kunden", "mein", "unsere"},
    "ru": {"сколько", "покажи", "что", "как", "когда", "где", "мне", "нас", "наш",
           "этот", "месяц", "неделя", "сегодня", "завтра", "клиентов", "за",
           "пожалуйста", "дай", "есть", "расписание"},
    "uk": {"скільки", "покажи", "що", "як", "коли", "де", "мені", "нас", "наш",
           "цей", "місяць", "тиждень", "сьогодні", "завтра", "клієнтів",
           "будь", "ласка", "розклад"},
}

# Короткие реплики, которые язык ВСЁ-ТАКИ несут. Список маленький намеренно:
# ложное переключение языка раздражает сильнее, чем лишний ход на прежнем.
_STRONG_SHORT = {
    "ano": "cs", "нет": "ru", "так": "uk", "oui": "fr", "tak": "pl", "áno": "sk",
}
# Международные — не несут языка никогда, даже если словарь думает иначе.
_INTERNATIONAL = {
    "ok", "okay", "yes", "no", "vip", "crm", "revenue", "retention", "email",
    "sms", "online", "instagram", "telegram", "whatsapp", "google", "pdf",
}

# Явная просьба ответить на языке. Перебивает распознавание: человек сказал
# прямо, догадываться не о чем.
_EXPLICIT = {
    "en": ("in english", "по-английски", "по английски", "англійською", "anglicky",
           "auf englisch", "po angielsku"),
    "ru": ("in russian", "по-русски", "по русски", "російською", "rusky",
           "auf russisch", "po rosyjsku"),
    "uk": ("in ukrainian", "по-украински", "по украински", "українською",
           "ukrajinsky", "auf ukrainisch"),
    "cs": ("in czech", "по-чешски", "по чешски", "чеською", "cesky", "česky",
           "auf tschechisch"),
    "de": ("in german", "по-немецки", "по немецки", "німецькою", "nemecky",
           "německy", "auf deutsch", "po niemiecku"),
    "pl": ("in polish", "по-польски", "по польски", "польською", "polsky",
           "auf polnisch", "po polsku"),
    "sk": ("in slovak", "по-словацки", "по словацки", "slovensky", "auf slowakisch"),
    "fr": ("in french", "по-французски", "по французски", "francouzsky",
           "auf franzosisch", "auf französisch"),
}

# Что выбрасывается перед распознаванием: это не речь говорящего. Цитата
# клиента, скопированное письмо, имя, код, идентификатор — чужой текст, и
# длинная английская цитата не должна делать чешский вопрос английским.
_NOISE = (
    re.compile(r"```.*?```", re.S),                  # блоки кода
    re.compile(r"`[^`]*`"),                          # инлайн-код
    # Кавычки всех начертаний, включая нижнюю немецко-чешскую „…“: без
    # верхней закрывающей английская цитата оставалась в тексте и делала
    # русский вопрос английским.
    re.compile(r"[«\"„‚][^«\"„”»“]{0,400}[»\"”“‘]"),
    re.compile(r"https?://\S+"),                     # ссылки
    re.compile(r"\S+@\S+\.\w+"),                     # почта
    re.compile(r"\b[a-z_]+_[a-z_]+\b"),              # get_schedule, client_id
    re.compile(r"\+?\d[\d\s()\-]{6,}\d"),            # телефоны
    re.compile(r"\b\d[\d:.\-/]*\b"),                 # числа, даты, время
)

_CYRILLIC = re.compile(r"[Ѐ-ӿ]")
_LATIN = re.compile(r"[A-Za-zÀ-ɏ]")
_WORD = re.compile(r"[^\W\d_]+", re.U)

# Меньше трёх букв — сигнала нет вовсе: «OK», «?», «👍».
_MIN_LETTERS = 3
# Короче этого библиотеке доверяем только как слабому предположению: на двух
# словах любой статистический определитель гадает.
_CONFIDENT_LETTERS = 12

STRONG, WEAK, NONE = "strong", "weak", "none"


@dataclass(frozen=True)
class Detection:
    code: str | None
    confidence: str        # strong | weak | none


@dataclass(frozen=True)
class Language:
    """Разрешённый язык ответа и ПОЧЕМУ именно он."""
    code: str
    source: str            # explicit_request | latest_user_message
                           # | previous_user_message | settings_fallback
                           # | locale_fallback | default_fallback
    confidence: str = STRONG


def _clean(text: str) -> str:
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


def _library(text: str) -> str | None:
    """py3langid: офлайновая модель на 97 языков. Ленивый импорт — 45 мс уходят
    на первое обращение и не должны платиться при старте приложения."""
    try:
        import py3langid
    except ImportError:      # библиотеки нет — работают только первые два слоя
        logger.warning("py3langid не установлен, распознавание сузилось до слоя правил")
        return None
    try:
        return py3langid.classify(text)[0]
    except Exception:
        logger.exception("py3langid упал на разборе языка")
        return None


def classify(text: str) -> Detection:
    """Язык сообщения и насколько мы в нём уверены.

    NONE — полноценный ответ, а не неудача: «OK» и «2026-08-26 18:00?» языка не
    несут, и придумывать его для них значило бы менять язык разговора на каждой
    короткой реплике.
    """
    body = _clean(text or "")
    words = _WORD.findall(body)
    low = body.lower()
    letters = sum(len(w) for w in words)
    if letters < _MIN_LETTERS:
        return Detection(None, NONE)

    lowered = {w.lower() for w in words}

    # 0. Одинокое слово. Международные не значат ничего; известные короткие
    # ответы значат много; всё прочее — имя, термин или идентификатор.
    if len(words) == 1:
        only = words[0].lower()
        if only in _INTERNATIONAL:
            return Detection(None, NONE)
        if only in _STRONG_SHORT:
            return Detection(_STRONG_SHORT[only], STRONG)

    # 1. Уникальная буква — приговор.
    for lang, marks in _MARKERS.items():
        if any(ch in low for ch in marks):
            return Detection(lang, STRONG)

    # 2. Служебные слова по ВСЕМ языкам сразу: грамматику несут они, а не
    # содержательные существительные, и алфавитом здесь мерить нельзя.
    # Два совпадения, а не одно: одно служебное слово — слабая улика, и на ней
    # французский вопрос («clients») опознавался как английский. Два — уже
    # грамматический костяк. Ничья тоже не решает: пусть разбирает библиотека.
    hits = {lang: len(lowered & bag) for lang, bag in _STOPWORDS.items()}
    best = max(hits, key=lambda k: hits[k])
    if hits[best] >= 2 and list(hits.values()).count(hits[best]) == 1:
        return Detection(best, STRONG)

    # 2б. Ни одного служебного слова, а всё, что есть, — с большой буквы. Это
    # имя, название или подпись, а не речь: «Anna Nováková» опознавалась как
    # чешский по диакритике в фамилии и переводила весь разговор.
    if not hits[best] and len(words) <= 3 and all(w[:1].isupper() for w in words):
        return Detection(None, NONE)

    # 3. Всё остальное — библиотеке. Она знает польский, словацкий, французский
    # и ещё девяносто языков, которых у продукта нет в интерфейсе и знать там
    # не обязано: язык ОТВЕТА и язык интерфейса — разные вещи.
    found = _library(body.strip())
    if found:
        # Два независимых слабых признака, сошедшихся на одном языке, — уже
        # сильный: короткое «A co zítra?» иначе оставалось догадкой и не
        # возвращало разговор с английского обратно на чешский.
        agreed = hits.get(found, 0) >= 1
        confident = agreed or letters >= _CONFIDENT_LETTERS
        return Detection(found, STRONG if confident else WEAK)

    # 4. Ни правил, ни библиотеки: алфавит как последняя опора.
    if _CYRILLIC.search(low):
        return Detection("ru", WEAK)
    if _LATIN.search(low) and len(words) > 1:
        return Detection("en", WEAK)
    return Detection(None, NONE)


def detect(text: str) -> str | None:
    """Язык сообщения или None. Уверенность — в classify()."""
    return classify(text).code


def _user_texts(history) -> list[str]:
    """Реплики ЧЕЛОВЕКА, новые первыми.

    Ответы ассистента не берём никогда: он мог ошибиться языком в прошлом ходе,
    и тогда ошибка закрепилась бы навсегда.
    """
    return [m.text or "" for m in reversed(list(history or []))
            if getattr(m, "role", "") == "user"]


def resolve(history, *, settings_language: str | None = None,
            studio_language: str | None = None,
            previous_language: str | None = None) -> Language:
    """Язык ответа и причина выбора.

    Порядок:
      1. explicit_request     — прямая просьба в последней реплике;
      2. latest_user_message  — уверенно узнанный язык последней реплики;
      3. previous_user_message — язык предыдущей реплики ЧЕЛОВЕКА: для «ок»,
         «да», «?», а также когда распознавание неуверенно (лучше остаться на
         прежнем языке, чем переключиться наугад);
      4. settings_fallback    — язык, выбранный владельцем в настройках. Это
         ПРЕДПОЧТЕНИЕ, а не приказ: он применяется, только если в разговоре
         языка не видно. Стоял выше распознавания — и чешский тренер русской
         студии получал русские ответы;
      5. locale_fallback      — язык студии;
      6. default_fallback     — язык продукта.

    previous_language — язык прошлой реплики того же собеседника, если история
    в сообщениях недоступна (мессенджеры зовут агента по одному сообщению).
    """
    texts = _user_texts(history)

    if texts:
        asked = explicit_request(texts[0])
        if asked:
            return Language(asked, "explicit_request")

    weak: Language | None = None
    for i, text in enumerate(texts):
        found = classify(text)
        if found.code is None:
            continue
        source = "latest_user_message" if i == 0 else "previous_user_message"
        if found.confidence == STRONG:
            return Language(found.code, source, STRONG)
        # Слабое предположение придерживаем: если ниже по истории найдётся
        # уверенное, оно честнее случайного переключения на догадку.
        weak = weak or Language(found.code, source, WEAK)

    if previous_language:
        return Language(resolve_locale(previous_language), "previous_user_message")
    if weak:
        return weak

    pinned = (settings_language or "auto").strip().lower()
    if pinned and pinned != "auto":
        return Language(resolve_locale(pinned), "settings_fallback")
    if studio_language:
        return Language(resolve_locale(studio_language), "locale_fallback")
    return Language(DEFAULT_LANG, "default_fallback")


# Названия языков для строки в промпте: код модель поймёт, но слово рядом
# снимает последние сомнения и стоит четыре токена.
_NAMES = {
    "ru": "Russian", "en": "English", "uk": "Ukrainian", "cs": "Czech",
    "de": "German", "pl": "Polish", "sk": "Slovak", "fr": "French",
    "es": "Spanish", "it": "Italian", "pt": "Portuguese", "nl": "Dutch",
    "hu": "Hungarian", "ro": "Romanian", "sl": "Slovenian", "hr": "Croatian",
    "sr": "Serbian", "bg": "Bulgarian", "lt": "Lithuanian", "lv": "Latvian",
    "et": "Estonian", "tr": "Turkish", "el": "Greek", "he": "Hebrew",
}


def name(code: str) -> str:
    return _NAMES.get(code, code)


if __name__ == "__main__":
    strong = {
        "Kolik klientů máme tento měsíc?": "cs",
        "How many clients do we have this month?": "en",
        "Сколько у нас клиентов за этот месяц?": "ru",
        "Скільки в нас клієнтів цього місяця?": "uk",
        "Wie viele Kunden haben wir diesen Monat?": "de",
        "Ilu mamy klientów w tym miesiącu?": "pl",
        "Koľko klientov máme tento mesiac?": "sk",
        "Combien de clients avons-nous ce mois-ci?": "fr",
        # Термин на другом языке речь не меняет — решают служебные слова.
        "Покажи revenue за последний месяц.": "ru",
        "Pokaż revenue z tego miesiąca.": "pl",
        # …а здесь грамматику несёт английское «show me».
        "Show me загрузку тренеров": "en",
        # Чужой текст в кавычках — не язык говорящего.
        'Klient napsal "I want to cancel my booking". Co mám udělat?': "cs",
        "Клиент прислал «Zrušte mi rezervaci» — что делать?": "ru",
    }
    for text, want in strong.items():
        got = classify(text)
        assert got.code == want, (text, got)

    for empty in ("OK", "yes", "VIP", "Revenue?", "?", "👍", "123",
                  "2026-08-26 18:00?", "get_schedule"):
        assert classify(empty).code is None, empty

    assert classify("ano").code == "cs" and classify("нет").code == "ru"
    assert explicit_request("Answer in English: Kolik klientů máme?") == "en"
    assert explicit_request("Сколько у нас клиентов?") is None
    print("ALL PASS")

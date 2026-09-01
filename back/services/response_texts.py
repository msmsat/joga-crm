"""Слова ответов ассистента — на пяти языках продукта (P1.5).

Отдельный словарь, а не `notify_texts`: там письма и напоминания студии, здесь
живой разговор с клиентом в мессенджере. Правило то же, что во всём продукте:
таблица `{"ru", "en", "uk", "cs", "de"}`, читается через `i18n.pick`, забытый
язык ловит `tests/test_i18n_coverage.py`.

ТОН. Коротко, тепло, без восторгов и без канцелярита. Ассистент студии — не
робот и не менеджер по продажам: он отвечает так, как ответила бы внимательная
администраторша, у которой перед глазами расписание.

ТЕХНИЧЕСКИХ СЛОВ ЗДЕСЬ НЕТ. Человек не должен прочитать «TIMEZONE_UNVERIFIED»,
«AMBIGUOUS» или «валидация не прошла»: внутренние коды остаются внутри, наружу
идёт человеческая фраза.
"""

# ─── Нашлось ─────────────────────────────────────────────────────────────────

FOUND_ONE = {
    "ru": "Нашла один вариант:",
    "en": "Found one option:",
    "uk": "Знайшла один варіант:",
    "cs": "Našla jsem jednu možnost:",
    "de": "Eine Möglichkeit gefunden:",
}

FOUND_SEVERAL = {
    "ru": "Вот что есть:",
    "en": "Here's what we have:",
    "uk": "Ось що є:",
    "cs": "Tady je, co máme:",
    "de": "Das haben wir:",
}

# Пожелание не сбылось, и об этом надо сказать прямо — иначе ответ делает вид,
# что «лучше у Валерии» выполнено.
RELAXED = {
    "ru": "У {who} на это время занятий нет. Вот ближайшие другие варианты:",
    "en": "{who} has nothing at that time. Here are the closest alternatives:",
    "uk": "У {who} на цей час занять немає. Ось найближчі інші варіанти:",
    "cs": "{who} v tento čas nic nemá. Tady jsou nejbližší jiné možnosti:",
    "de": "{who} hat zu dieser Zeit nichts. Hier die nächsten Alternativen:",
}

NO_RESULTS = {
    "ru": "Не нашла занятий по этим условиям.",
    "en": "No classes match those conditions.",
    "uk": "Не знайшла занять за цими умовами.",
    "cs": "Podle těchto podmínek jsem nic nenašla.",
    "de": "Dazu habe ich keine Kurse gefunden.",
}

MORE = {
    "ru": "Всего вариантов: {total}.",
    "en": "{total} options in total.",
    "uk": "Усього варіантів: {total}.",
    "cs": "Celkem možností: {total}.",
    "de": "Insgesamt {total} Möglichkeiten.",
}

# ─── Уточнение ───────────────────────────────────────────────────────────────

CLARIFY_SERVICE = {
    "ru": "Какое именно направление вы имеете в виду?",
    "en": "Which class do you mean?",
    "uk": "Який саме напрямок ви маєте на увазі?",
    "cs": "Kterou lekci máte na mysli?",
    "de": "Welchen Kurs meinen Sie?",
}

CLARIFY_TRAINER = {
    "ru": "У нас несколько с таким именем. Кого вы имеете в виду?",
    "en": "We have more than one with that name. Who do you mean?",
    "uk": "У нас кілька з таким іменем. Кого ви маєте на увазі?",
    "cs": "Máme víc lektorů s tímto jménem. Koho myslíte?",
    "de": "Wir haben mehrere mit diesem Namen. Wen meinen Sie?",
}

CLARIFY_BRANCH = {
    "ru": "В каком филиале?",
    "en": "Which location?",
    "uk": "У якій філії?",
    "cs": "Na které pobočce?",
    "de": "In welchem Studio?",
}

# ─── Не нашлось такого ───────────────────────────────────────────────────────

SERVICE_NOT_FOUND = {
    "ru": "Такого направления в студии нет.",
    "en": "We don't have that class here.",
    "uk": "Такого напрямку в студії немає.",
    "cs": "Takovou lekci tu nemáme.",
    "de": "Diesen Kurs gibt es hier nicht.",
}

TRAINER_NOT_FOUND = {
    "ru": "Такого тренера в студии нет.",
    "en": "We don't have that trainer here.",
    "uk": "Такого тренера в студії немає.",
    "cs": "Takového lektora tu nemáme.",
    "de": "Diesen Trainer gibt es hier nicht.",
}

BRANCH_NOT_FOUND = {
    "ru": "Такого филиала у студии нет.",
    "en": "We don't have that location.",
    "uk": "Такої філії у студії немає.",
    "cs": "Takovou pobočku nemáme.",
    "de": "Dieses Studio gibt es nicht.",
}

# ─── Не сработало ────────────────────────────────────────────────────────────

# Часовой пояс студии не подтверждён. Человеку про IANA знать незачем — ему
# важно, что «завтра» посчитать нечем и надо назвать дату.
TIMEZONE_REQUIRED = {
    "ru": "Пока не могу посчитать «сегодня» и «завтра» для этой студии. "
          "Назовите, пожалуйста, дату — например «15 мая».",
    "en": "I can't work out \"today\" and \"tomorrow\" for this studio yet. "
          "Could you give a date — say \"15 May\"?",
    "uk": "Поки не можу порахувати «сьогодні» й «завтра» для цієї студії. "
          "Назвіть, будь ласка, дату — наприклад «15 травня».",
    "cs": "Zatím neumím určit „dnes“ a „zítra“ pro toto studio. "
          "Řekněte prosím datum — třeba „15. května“.",
    "de": "Ich kann „heute“ und „morgen“ für dieses Studio noch nicht bestimmen. "
          "Nennen Sie bitte ein Datum — etwa „15. Mai“.",
}

UNSUPPORTED = {
    "ru": "Так искать я пока не умею. Скажите, что подходит, — и я найду.",
    "en": "I can't search that way yet. Tell me what works for you and I'll look.",
    "uk": "Так шукати я поки не вмію. Скажіть, що вам підходить, — і я знайду.",
    "cs": "Takhle hledat zatím neumím. Řekněte, co vám vyhovuje, a najdu to.",
    "de": "So kann ich noch nicht suchen. Sagen Sie, was passt — ich schaue nach.",
}

PARSE_FAILED = {
    "ru": "Не поняла. Можно короче — например «стретчинг завтра вечером»?",
    "en": "I didn't get that. Could you try shorter — like \"stretching tomorrow evening\"?",
    "uk": "Не зрозуміла. Можна коротше — наприклад «стретчинг завтра ввечері»?",
    "cs": "Nerozuměla jsem. Zkuste to kratší — třeba „strečink zítra večer“.",
    "de": "Das habe ich nicht verstanden. Kürzer vielleicht — „Stretching morgen Abend“?",
}

# ─── Выбранный вариант ───────────────────────────────────────────────────────

OPTION_SELECTED = {
    "ru": "Вот это занятие:",
    "en": "Here's that class:",
    "uk": "Ось це заняття:",
    "cs": "Tady je ta lekce:",
    "de": "Hier ist der Kurs:",
}

OPTION_EXPIRED = {
    "ru": "Этот список уже устарел. Давайте посмотрю заново — на какой день?",
    "en": "That list is out of date. Let me look again — which day?",
    "uk": "Цей список уже застарів. Давайте подивлюся заново — на який день?",
    "cs": "Ten seznam už je starý. Podívám se znovu — na který den?",
    "de": "Die Liste ist nicht mehr aktuell. Ich schaue neu — welcher Tag?",
}

OPTION_SUPERSEDED = {
    "ru": "Список с тех пор изменился. Скажите, что ищем, — покажу заново.",
    "en": "The list has changed since then. Tell me what you're after and I'll show it again.",
    "uk": "Список відтоді змінився. Скажіть, що шукаємо, — покажу заново.",
    "cs": "Seznam se od té doby změnil. Řekněte, co hledáte, a ukážu znovu.",
    "de": "Die Liste hat sich geändert. Sagen Sie, was Sie suchen — ich zeige es neu.",
}

OPTION_UNKNOWN = {
    "ru": "Не поняла, какой из вариантов. Назовите номер из списка.",
    "en": "I'm not sure which option. Give me the number from the list.",
    "uk": "Не зрозуміла, який саме варіант. Назвіть номер зі списку.",
    "cs": "Nevím, kterou možnost. Řekněte číslo ze seznamu.",
    "de": "Ich weiß nicht, welche Option. Nennen Sie die Nummer aus der Liste.",
}

OPTION_NONE_SHOWN = {
    "ru": "Я ещё ничего не показывала. Что ищем?",
    "en": "I haven't shown anything yet. What are you looking for?",
    "uk": "Я ще нічого не показувала. Що шукаємо?",
    "cs": "Ještě jsem nic neukázala. Co hledáte?",
    "de": "Ich habe noch nichts gezeigt. Wonach suchen Sie?",
}

# ─── Не наше дело ────────────────────────────────────────────────────────────

# Вопросы, ответа на которые нет ни в одном каноническом поле: что взять с
# собой, есть ли парковка, можно ли беременным, подойдёт ли после травмы.
# Догадка тут стоит здоровья, поэтому — к человеку.
#
# «ПЕРЕДАМ ВАШ ВОПРОС» ЗДЕСЬ НЕ ПИШЕТСЯ. Передавать некому и нечем: механизма
# перевода разговора на сотрудника в продукте нет — ни режима «отвечает
# человек», ни входящих в CRM, ни уведомления владельцу о заданном вопросе
# (проверено поиском по репозиторию, P1.6 §39). Обещание, которого система не
# исполняет, хуже честного «спросите студию»: человек будет ждать ответа,
# который никто не готовит. Появится handoff — поменяется и эта строка.
NEED_HUMAN = {
    "ru": "Про это лучше спросить саму студию — у меня такого не записано.",
    "en": "That's one for the studio — I don't have it on file.",
    "uk": "Про це краще запитати саму студію — у мене такого не записано.",
    "cs": "Na to se zeptejte přímo studia — to u sebe nemám.",
    "de": "Das fragen Sie am besten direkt im Studio — dazu habe ich nichts.",
}

AI_UNAVAILABLE = {
    "ru": "Сейчас не могу ответить. Напишите чуть позже или прямо студии.",
    "en": "I can't answer right now. Try a bit later or message the studio directly.",
    "uk": "Зараз не можу відповісти. Напишіть трохи пізніше або прямо студії.",
    "cs": "Teď nemohu odpovědět. Zkuste to později nebo napište studiu.",
    "de": "Ich kann gerade nicht antworten. Bitte später oder direkt beim Studio.",
}

# ─── Справка о студии (P1.6) ─────────────────────────────────────────────────
#
# Каждая строка ниже — только ОБРАМЛЕНИЕ. Сам факт (адрес, часы, цена, имена)
# подставляет рендерер из того, что прочитал сервер; выдумать его здесь нечем.

INFO_LOCATION = {
    "ru": "Мы находимся здесь:",
    "en": "You'll find us here:",
    "uk": "Ми знаходимося тут:",
    "cs": "Najdete nás tady:",
    "de": "Sie finden uns hier:",
}

INFO_LOCATION_MANY = {
    "ru": "У нас несколько адресов:",
    "en": "We have several locations:",
    "uk": "У нас кілька адрес:",
    "cs": "Máme několik poboček:",
    "de": "Wir haben mehrere Standorte:",
}

INFO_BRANCHES = {
    "ru": "Наши филиалы:",
    "en": "Our locations:",
    "uk": "Наші філії:",
    "cs": "Naše pobočky:",
    "de": "Unsere Standorte:",
}

INFO_HOURS = {
    "ru": "Часы работы:",
    "en": "Opening hours:",
    "uk": "Години роботи:",
    "cs": "Otevírací doba:",
    "de": "Öffnungszeiten:",
}

INFO_OPEN_NOW = {
    "ru": "Сейчас:",
    "en": "Right now:",
    "uk": "Зараз:",
    "cs": "Právě teď:",
    "de": "Gerade jetzt:",
}

OPEN_NOW_YES = {
    "ru": "открыто", "en": "open", "uk": "відчинено",
    "cs": "otevřeno", "de": "geöffnet",
}

OPEN_NOW_NO = {
    "ru": "закрыто", "en": "closed", "uk": "зачинено",
    "cs": "zavřeno", "de": "geschlossen",
}

# Сегодня рабочего окна нет вовсе — это не «закрыто до вечера», это выходной.
DAY_OFF = {
    "ru": "сегодня выходной",
    "en": "closed today",
    "uk": "сьогодні вихідний",
    "cs": "dnes zavřeno",
    "de": "heute geschlossen",
}

TODAY_HOURS = {
    "ru": "сегодня {hours}",
    "en": "today {hours}",
    "uk": "сьогодні {hours}",
    "cs": "dnes {hours}",
    "de": "heute {hours}",
}

INFO_CONTACT = {
    "ru": "Связаться со студией:",
    "en": "How to reach the studio:",
    "uk": "Зв'язатися зі студією:",
    "cs": "Kontakt na studio:",
    "de": "So erreichen Sie das Studio:",
}

INFO_SERVICES = {
    "ru": "Вот наши направления:",
    "en": "Here are our classes:",
    "uk": "Ось наші напрямки:",
    "cs": "Tady jsou naše lekce:",
    "de": "Das sind unsere Kurse:",
}

INFO_TRAINERS = {
    "ru": "У нас ведут:",
    "en": "Our trainers:",
    "uk": "У нас ведуть:",
    "cs": "Naši lektoři:",
    "de": "Unsere Trainer:",
}

INFO_SERVICE_PRICE = {
    "ru": "Стоимость:",
    "en": "Prices:",
    "uk": "Вартість:",
    "cs": "Ceny:",
    "de": "Preise:",
}

# Дальше идёт текст ВЛАДЕЛЬЦА, и человеку об этом честно говорится: ответ
# написали в студии, а не мы.
INFO_SERVICE_INFO = {
    "ru": "Вот что пишет студия:",
    "en": "Here's what the studio says:",
    "uk": "Ось що пише студія:",
    "cs": "Studio k tomu píše:",
    "de": "Das schreibt das Studio dazu:",
}

# Продукт такой факт знает, а студия его не заполнила. Это ДРУГОЙ ответ, чем
# «Velora про такое вообще не знает»: тут есть чему появиться позже.
INFO_NOT_CONFIGURED = {
    "ru": "Этого у меня пока не записано.",
    "en": "I don't have that on file yet.",
    "uk": "Цього у мене поки не записано.",
    "cs": "To u sebe zatím nemám.",
    "de": "Das habe ich noch nicht hinterlegt.",
}

# Дни недели, коротко. Своя таблица, а не locale: серверная локаль на проде C,
# и strftime отдал бы «Mon» чешской студии. Порядок — 0=понедельник, как в БД.
WEEKDAYS = {
    "ru": ("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"),
    "en": ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"),
    "uk": ("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"),
    "cs": ("Po", "Út", "St", "Čt", "Pá", "So", "Ne"),
    "de": ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"),
}


# ─── Подписи кнопок ──────────────────────────────────────────────────────────

BUTTON_SHOW_MORE = {
    "ru": "Показать ещё", "en": "Show more", "uk": "Показати ще",
    "cs": "Zobrazit další", "de": "Mehr zeigen",
}

BUTTON_RESET = {
    "ru": "Начать заново", "en": "Start over", "uk": "Почати заново",
    "cs": "Začít znovu", "de": "Neu anfangen",
}

# ─── Единицы ─────────────────────────────────────────────────────────────────

MINUTES = {"ru": "мин", "en": "min", "uk": "хв", "cs": "min", "de": "Min."}

# Мест свободно. Три формы там, где язык их требует: «4 мест» вместо «4 места»
# читается машиной, а мы разговариваем с человеком.
#   [одно, 2-4, много]
SPOTS_FORMS = {
    "ru": ("{n} место", "{n} места", "{n} мест"),
    "uk": ("{n} місце", "{n} місця", "{n} місць"),
    "cs": ("{n} místo", "{n} místa", "{n} míst"),
    "en": ("{n} spot", "{n} spots", "{n} spots"),
    "de": ("{n} Platz", "{n} Plätze", "{n} Plätze"),
}

# Языки с тремя формами по славянскому правилу; остальным хватает «один/много».
_SLAVIC = ("ru", "uk", "cs")


def spots_form(n: int, lang: str) -> int:
    """Какую из трёх форм взять. Правило славянское и общеизвестное; для
    английского и немецкого хватает первых двух."""
    if lang not in _SLAVIC:
        return 0 if n == 1 else 1
    if n % 10 == 1 and n % 100 != 11:
        return 0
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return 1
    return 2

SPOTS_NONE = {
    "ru": "мест нет", "en": "full", "uk": "місць немає",
    "cs": "obsazeno", "de": "ausgebucht",
}


if __name__ == "__main__":
    from services.i18n import LANGS

    tables = {name: value for name, value in list(globals().items())
              if name.isupper() and isinstance(value, dict)}
    forms = tables.pop("SPOTS_FORMS")
    assert set(forms) == set(LANGS)
    assert all(len(v) == 3 for v in forms.values())
    for n, want in ((1, "1 место"), (2, "2 места"), (4, "4 места"), (5, "5 мест"),
                    (11, "11 мест"), (21, "21 место"), (22, "22 места")):
        assert forms["ru"][spots_form(n, "ru")].format(n=n) == want, (n, want)
    assert forms["en"][spots_form(1, "en")].format(n=1) == "1 spot"
    assert forms["en"][spots_form(4, "en")].format(n=4) == "4 spots"
    assert set(WEEKDAYS) == set(LANGS)
    assert all(len(v) == 7 for v in WEEKDAYS.values()), "дней в неделе семь"
    for name, table in tables.items():
        assert set(table) == set(LANGS), f"{name}: {sorted(set(LANGS) - set(table))}"
    # Технических слов в тексте для человека быть не может. Таблицы, где на язык
    # приходится несколько строк (дни недели), разворачиваем.
    for name, table in tables.items():
        for value in table.values():
            for text in (value if isinstance(value, tuple) else (value,)):
                low = text.lower()
                for banned in ("timezone", "iana", "parse", "ambiguous", "null", "error"):
                    assert banned not in low, f"{name}: техническое слово «{banned}»"
    print(f"response_texts self-check ok ({len(tables)} таблиц)")

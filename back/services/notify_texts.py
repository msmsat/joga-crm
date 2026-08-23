"""Тексты уведомлений (письмо и Telegram) — все 40 событий каталога на всех
пяти языках продукта: ru, en, uk, cs, de.

Почему отдельным модулем. Раньше они жили внутри `notifier._render` f-строками
по локальным переменным, и на двух языках это ещё читалось. На пяти таблица
переросла функцию, которая её печатает: диспетчер уведомлений — про «кому, куда
и когда», а не про то, как звучит «Абонемент на исходе» по-чешски. Соседний
модуль services/whatsapp_templates.py устроен так же — тексты отдельно от
отправки.

ФОРМА ТЕКСТА. Первая строка — что случилось, вторая — что это значит или что с
этим делать. Ссылку на раздел добавляет оболочка письма (email_layout.cta),
поэтому «перейдите в раздел X» в тексте не пишем — получилось бы две кнопки об
одном. Формулировки безличные там, где подставляется имя: «записался/отменил»
угадывают род клиента, а он в БД не хранится.

Подстановки — по имени (`{lesson}`, `{amount}`), значения собирает
`notifier._render` (см. `_values`). Ни одной фигурной скобки в самом тексте:
`str.format` принял бы её за поле и упал бы уже на живом уведомлении.

События-перечисления (`notifier._LIST_EVENTS` — сводки, отчёты, зарплата)
письмо разбирает построчно и превращает «Метка: значение» в карточку деталей,
поэтому в их переводах форма «Метка: значение» обязана сохраняться, а метка —
влезать в 20 символов.

Self-check:  python -m services.notify_texts
"""
from services.i18n import LANGS, pick

# ─── СЛОВАРНЫЕ СЛОВА И ЗАГЛУШКИ ───────────────────────────────────────────────
# Шаблон обязан рендериться при context={} (см. tests/test_notifier.py): часть
# вызовов приходит без части полей, а письмо с дырой вида «Клиенту  возвращено
# 0 ₽» или «Цель «» достигнута» выглядит как сбой продукта. Заглушка ставится
# ЗДЕСЬ, один раз на поле, а не в каждой из сорока строк шаблона.
#
# Тот же словарь берут шаблоны WhatsApp (services/whatsapp_templates): «занятие»
# в письме и «занятие» в мессенджере не должны расходиться.
WORDS: dict[str, dict[str, str]] = {
    "lesson": {"ru": "занятие", "en": "class", "uk": "заняття", "cs": "lekce", "de": "Kurs"},
    "lesson2": {"ru": "другое занятие", "en": "another class", "uk": "інше заняття",
                "cs": "jiná lekce", "de": "ein anderer Kurs"},
    "client": {"ru": "клиент", "en": "the client", "uk": "клієнт",
               "cs": "klient", "de": "die Kundschaft"},
    "staff": {"ru": "сотрудник", "en": "the staff member", "uk": "співробітник",
              "cs": "člen týmu", "de": "das Teammitglied"},
    "when": {"ru": "уточняется", "en": "to be confirmed", "uk": "уточнюється",
             "cs": "bude upřesněno", "de": "wird noch bestätigt"},
    "names": {"ru": "пока никого", "en": "nobody yet", "uk": "поки нікого",
              "cs": "zatím nikdo", "de": "noch niemand"},
    "goal": {"ru": "без названия", "en": "untitled", "uk": "без назви",
             "cs": "bez názvu", "de": "ohne Titel"},
    "kind": {"ru": "данные", "en": "data", "uk": "дані", "cs": "data", "de": "Daten"},
    "resource": {"ru": "ресурс", "en": "resource", "uk": "ресурс",
                 "cs": "zdroj", "de": "eine Ressource"},
    "role": {"ru": "без роли", "en": "unassigned", "uk": "без ролі",
             "cs": "bez role", "de": "ohne Rolle"},
    "device": {"ru": "неизвестное устройство", "en": "an unknown device",
               "uk": "невідомий пристрій", "cs": "neznámé zařízení",
               "de": "ein unbekanntes Gerät"},
    "count": {"ru": "несколько человек", "en": "a few", "uk": "кілька людей",
              "cs": "několik lidí", "de": "ein paar Leute"},
}

# Роль и общий ресурс приходят в контекст ключами ("admin", "hall"), а не словами.
ROLE_WORDS: dict[str, dict[str, str]] = {
    "owner": {"ru": "владелец", "en": "owner", "uk": "власник",
              "cs": "vlastník", "de": "Inhaber"},
    "admin": {"ru": "администратор", "en": "administrator", "uk": "адміністратор",
              "cs": "administrátor", "de": "Administrator"},
    "trainer": {"ru": "тренер", "en": "trainer", "uk": "тренер",
                "cs": "lektor", "de": "Trainer"},
}

RESOURCE_WORDS: dict[str, dict[str, str]] = {
    "hall": {"ru": "зал", "en": "hall", "uk": "зал", "cs": "sál", "de": "Raum"},
    "trainer": {"ru": "тренер", "en": "trainer", "uk": "тренер",
                "cs": "lektor", "de": "Trainer"},
}

# ─── ОБРЫВКИ ФРАЗ, КОТОРЫХ МОЖЕТ И НЕ БЫТЬ ───────────────────────────────────
# Каждый собирается вместе со своим пробелом или переносом: пустое значение
# должно исчезать бесследно, а не оставлять «Рядом: » или двойной пробел.

# Сколько времени осталось до занятия (c2). hours приходит из офсета напоминания.
LEFT_HOURS = {"ru": "через {hours} ч", "en": "in {hours}h", "uk": "через {hours} год",
              "cs": "za {hours} h", "de": "in {hours} Std."}
LEFT_SOON = {"ru": "уже скоро", "en": "soon", "uk": "вже скоро",
             "cs": "už brzy", "de": "schon bald"}

# Вчерашняя выручка в дневной сводке: без неё сегодняшняя цифра ни о чём не
# говорит. Приходит только из daily_notify — в остальных случаях молчим.
PREV_REVENUE = {"ru": " (вчера {amount})", "en": " (yesterday {amount})",
                "uk": " (вчора {amount})", "cs": " (včera {amount})",
                "de": " (gestern {amount})"}

# Поздравление без имени не должно начинаться с запятой.
BDAY_NAMED = {"ru": "{name}, поздравляем вас с днём рождения!",
              "en": "{name}, happy birthday!",
              "uk": "{name}, вітаємо вас із днем народження!",
              "cs": "{name}, všechno nejlepší k narozeninám!",
              "de": "{name}, alles Gute zum Geburtstag!"}
BDAY_PLAIN = {"ru": "Поздравляем вас с днём рождения!", "en": "Happy birthday!",
              "uk": "Вітаємо вас із днем народження!",
              "cs": "Všechno nejlepší k narozeninám!",
              "de": "Alles Gute zum Geburtstag!"}

# «Кофе после занятия» (c13). Места — необязательная часть: студия могла их не
# заводить, и «Рядом:» с пустотой после двоеточия читалось бы как сбой.
SPOTS = {"ru": "\nРядом: {spots}", "en": "\nNearby: {spots}", "uk": "\nПоруч: {spots}",
         "cs": "\nV okolí: {spots}", "de": "\nIn der Nähe: {spots}"}

# Подписи полей в карточке «Детали» письма (notifier._EXTRA_FACTS).
FACT_LABELS: dict[str, dict[str, str]] = {
    "trainer_name": {"ru": "Тренер", "en": "Trainer", "uk": "Тренер",
                     "cs": "Lektor", "de": "Trainer"},
    "hall_name": {"ru": "Зал", "en": "Room", "uk": "Зал", "cs": "Sál", "de": "Raum"},
    "price": {"ru": "Стоимость", "en": "Price", "uk": "Вартість",
              "cs": "Cena", "de": "Preis"},
}


# ─── ТЕКСТЫ СОБЫТИЙ ───────────────────────────────────────────────────────────

TEXTS: dict[str, dict[str, tuple[str, str]]] = {
    "c1": {
        "ru": ("Запись подтверждена",
               "Вы записаны на «{lesson}»{tail}.\n"
               "Если планы изменятся, отмените запись заранее — место достанется другому."),
        "en": ("Booking confirmed",
               "You're booked for “{lesson}”{tail}.\n"
               "If your plans change, cancel in advance so someone else can take the spot."),
        "uk": ("Запис підтверджено",
               "Ви записані на «{lesson}»{tail}.\n"
               "Якщо плани зміняться, скасуйте запис заздалегідь — місце дістанеться іншому."),
        "cs": ("Rezervace potvrzena",
               "Máte rezervovanou lekci „{lesson}“{tail}.\n"
               "Pokud se plány změní, zrušte rezervaci včas — místo dostane někdo další."),
        "de": ("Buchung bestätigt",
               "Sie sind für „{lesson}“ angemeldet{tail}.\n"
               "Wenn sich Ihre Pläne ändern, sagen Sie rechtzeitig ab — dann bekommt jemand anderes den Platz."),
    },
    "c3": {
        "ru": ("Занятие отменено",
               "«{lesson}»{paren} отменено. Приносим извинения.\n"
               "Другое время можно выбрать в расписании."),
        "en": ("Class cancelled",
               "“{lesson}”{paren} has been cancelled. We're sorry.\n"
               "You can pick another time in the schedule."),
        "uk": ("Заняття скасовано",
               "«{lesson}»{paren} скасовано. Перепрошуємо.\n"
               "Інший час можна обрати в розкладі."),
        "cs": ("Lekce zrušena",
               "Lekce „{lesson}“{paren} je zrušena. Omlouváme se.\n"
               "Jiný termín si můžete vybrat v rozvrhu."),
        "de": ("Kurs abgesagt",
               "„{lesson}“{paren} ist abgesagt. Wir bitten um Entschuldigung.\n"
               "Im Kursplan finden Sie andere Termine."),
    },
    "c4": {
        "ru": ("Оплата получена",
               "Оплата на {amount} прошла успешно.\n"
               "История платежей и абонемент — в вашем профиле."),
        "en": ("Payment received",
               "Your payment of {amount} went through.\n"
               "Payment history and your subscription are in your profile."),
        "uk": ("Оплату отримано",
               "Оплата на {amount} пройшла успішно.\n"
               "Історія платежів і абонемент — у вашому профілі."),
        "cs": ("Platba přijata",
               "Platba ve výši {amount} proběhla úspěšně.\n"
               "Historii plateb i permanentku najdete ve svém profilu."),
        "de": ("Zahlung erhalten",
               "Ihre Zahlung über {amount} war erfolgreich.\n"
               "Zahlungsverlauf und Karte finden Sie in Ihrem Profil."),
    },
    "c5": {
        "ru": ("Абонемент на исходе",
               "В абонементе осталось занятий: {remaining}.\n"
               "Продлите заранее, чтобы не прерывать занятия."),
        "en": ("Subscription running low",
               "Classes left on your subscription: {remaining}.\n"
               "Renew in advance so your training doesn't stop."),
        "uk": ("Абонемент добігає кінця",
               "В абонементі залишилося занять: {remaining}.\n"
               "Подовжіть заздалегідь, щоб не переривати заняття."),
        "cs": ("Permanentka dochází",
               "Na permanentce zbývá lekcí: {remaining}.\n"
               "Prodlužte ji včas, ať nemusíte tréninky přerušit."),
        "de": ("Guthaben geht zur Neige",
               "Verbleibende Einheiten auf Ihrer Karte: {remaining}.\n"
               "Verlängern Sie rechtzeitig, damit Ihr Training nicht pausiert."),
    },
    "c6": {
        "ru": ("Абонемент закончился",
               "Абонемент закончился — записаться по нему больше нельзя.\n"
               "Оформите новый, чтобы продолжить занятия."),
        "en": ("Subscription ended",
               "Your subscription has ended — you can no longer book with it.\n"
               "Get a new one to keep training."),
        "uk": ("Абонемент закінчився",
               "Абонемент закінчився — записатися за ним більше не можна.\n"
               "Оформіть новий, щоб продовжити заняття."),
        "cs": ("Permanentka vypršela",
               "Permanentka skončila — rezervovat na ni už nelze.\n"
               "Pořiďte si novou a pokračujte v lekcích."),
        "de": ("Karte abgelaufen",
               "Ihre Karte ist abgelaufen — damit können Sie nicht mehr buchen.\n"
               "Holen Sie sich eine neue und trainieren Sie weiter."),
    },
    "c2": {
        "ru": ("Напоминание о занятии",
               "«{lesson}»{paren} — {left}.\n"
               "Не сможете прийти? Отмените запись, чтобы место освободилось."),
        "en": ("Class reminder",
               "“{lesson}”{paren} — {left}.\n"
               "Can't make it? Cancel your booking so the spot frees up."),
        "uk": ("Нагадування про заняття",
               "«{lesson}»{paren} — {left}.\n"
               "Не зможете прийти? Скасуйте запис, щоб місце звільнилося."),
        "cs": ("Připomenutí lekce",
               "Lekce „{lesson}“{paren} — {left}.\n"
               "Nemůžete přijít? Zrušte rezervaci, ať se místo uvolní."),
        "de": ("Kurs-Erinnerung",
               "„{lesson}“{paren} — {left}.\n"
               "Sie können nicht kommen? Sagen Sie ab, damit der Platz frei wird."),
    },
    "c13": {
        "ru": ("Кофе после занятия",
               "Вы собирались на кофе — вас {count}: {names}.{spots}"),
        "en": ("Coffee after class",
               "You planned coffee together — {count} of you: {names}.{spots}"),
        "uk": ("Кава після заняття",
               "Ви збиралися на каву — вас {count}: {names}.{spots}"),
        "cs": ("Káva po lekci",
               "Chystali jste se na kávu — je vás {count}: {names}.{spots}"),
        "de": ("Kaffee nach dem Kurs",
               "Sie wollten zusammen Kaffee trinken — Sie sind zu {count}: {names}.{spots}"),
    },
    "t1": {
        "ru": ("Новая запись",
               "Новая запись на «{lesson}»{paren} — {client}.\n"
               "Полный состав группы придёт за 30 минут до начала."),
        "en": ("New booking",
               "New booking for “{lesson}”{paren} — {client}.\n"
               "The full roster arrives 30 minutes before the start."),
        "uk": ("Новий запис",
               "Новий запис на «{lesson}»{paren} — {client}.\n"
               "Повний склад групи надійде за 30 хвилин до початку."),
        "cs": ("Nová rezervace",
               "Nová rezervace na „{lesson}“{paren} — {client}.\n"
               "Celý seznam účastníků dorazí 30 minut před začátkem."),
        "de": ("Neue Buchung",
               "Neue Buchung für „{lesson}“{paren} — {client}.\n"
               "Die vollständige Teilnehmerliste kommt 30 Minuten vor Beginn."),
    },
    "t3": {
        "ru": ("Занятие через час",
               "«{lesson}»{paren} начнётся через час.\n"
               "Состав группы придёт отдельно, за 30 минут до начала."),
        "en": ("Class in an hour",
               "“{lesson}”{paren} starts in an hour.\n"
               "The roster comes separately, 30 minutes before the start."),
        "uk": ("Заняття за годину",
               "«{lesson}»{paren} почнеться за годину.\n"
               "Склад групи надійде окремо, за 30 хвилин до початку."),
        "cs": ("Lekce za hodinu",
               "Lekce „{lesson}“{paren} začíná za hodinu.\n"
               "Seznam účastníků dorazí zvlášť, 30 minut před začátkem."),
        "de": ("Kurs in einer Stunde",
               "„{lesson}“{paren} beginnt in einer Stunde.\n"
               "Die Teilnehmerliste kommt separat, 30 Minuten vor Beginn."),
    },
    # t4 — не второе напоминание, а состав группы (так он и подписан в матрице
    # уведомлений: «Список участников группы»). Формулировку «начнётся через
    # 30 минут» здесь держать нельзя: вместе с t3 это два письма об одном
    # занятии с разницей в полчаса, и тренер перестаёт читать оба.
    "t4": {
        "ru": ("Список участников", "Кто придёт на «{lesson}»{paren}:\n{names}"),
        "en": ("Class roster", "Who's coming to “{lesson}”{paren}:\n{names}"),
        "uk": ("Список учасників", "Хто прийде на «{lesson}»{paren}:\n{names}"),
        "cs": ("Seznam účastníků", "Kdo dorazí na „{lesson}“{paren}:\n{names}"),
        "de": ("Teilnehmerliste", "Wer zu „{lesson}“{paren} kommt:\n{names}"),
    },
    "c11": {
        "ru": ("Занятие перенесено",
               "«{lesson}» перенесено. Новое время: {when}.\n"
               "Запись сохранена — если время не подходит, отмените её."),
        "en": ("Class rescheduled",
               "“{lesson}” has been rescheduled. New time: {when}.\n"
               "Your booking is kept — cancel it if the new time doesn't work."),
        "uk": ("Заняття перенесено",
               "«{lesson}» перенесено. Новий час: {when}.\n"
               "Запис збережено — якщо час не підходить, скасуйте його."),
        "cs": ("Lekce přesunuta",
               "Lekce „{lesson}“ byla přesunuta. Nový čas: {when}.\n"
               "Rezervace zůstává — pokud vám čas nevyhovuje, zrušte ji."),
        "de": ("Kurs verschoben",
               "„{lesson}“ wurde verschoben. Neue Zeit: {when}.\n"
               "Ihre Buchung bleibt bestehen — sagen Sie ab, falls die Zeit nicht passt."),
    },
    "t6": {
        "ru": ("Выплачена зарплата",
               "Сумма: {amount}\nПериод: {period}\n"
               "Расчёт по занятиям — в разделе финансов."),
        "en": ("Salary paid",
               "Amount: {amount}\nPeriod: {period}\n"
               "The per-class breakdown is in the finances section."),
        "uk": ("Виплачено зарплату",
               "Сума: {amount}\nПеріод: {period}\n"
               "Розрахунок за заняттями — у розділі фінансів."),
        "cs": ("Mzda vyplacena",
               "Částka: {amount}\nObdobí: {period}\n"
               "Rozpis podle lekcí najdete v sekci finance."),
        "de": ("Gehalt ausgezahlt",
               "Betrag: {amount}\nZeitraum: {period}\n"
               "Die Abrechnung nach Kursen steht im Bereich Finanzen."),
    },
    "c7": {
        "ru": ("С днём рождения!",
               "{bday}\nБудем рады видеть вас на занятии — приходите, когда будет настроение."),
        "en": ("Happy Birthday!",
               "{bday}\nWe'd love to see you at a class whenever you feel like it."),
        "uk": ("З днем народження!",
               "{bday}\nБудемо раді бачити вас на занятті — приходьте, коли буде настрій."),
        "cs": ("Všechno nejlepší!",
               "{bday}\nBudeme rádi, když se u nás zastavíte na lekci."),
        "de": ("Alles Gute zum Geburtstag!",
               "{bday}\nWir freuen uns, Sie bald wieder im Kurs zu sehen."),
    },
    "t8": {
        "ru": ("Дни рождения клиентов",
               "Сегодня день рождения у: {names}.\n"
               "Хороший повод поздравить лично, если человек придёт на занятие."),
        "en": ("Client birthdays today",
               "Today's birthdays: {names}.\n"
               "A good reason to say it in person if they come to class."),
        "uk": ("Дні народження клієнтів",
               "Сьогодні день народження у: {names}.\n"
               "Гарний привід привітати особисто, якщо людина прийде на заняття."),
        "cs": ("Narozeniny klientů",
               "Dnes mají narozeniny: {names}.\n"
               "Hezká příležitost popřát osobně, pokud dorazí na lekci."),
        "de": ("Geburtstage Ihrer Kundschaft",
               "Heute haben Geburtstag: {names}.\n"
               "Eine gute Gelegenheit, persönlich zu gratulieren, wenn sie zum Kurs kommen."),
    },
    "t9": {
        "ru": ("Занятие отменено",
               "Ваше занятие «{lesson}»{paren} отменено.\n"
               "Записанные клиенты уведомлены — приходить не нужно."),
        "en": ("Class cancelled",
               "Your class “{lesson}”{paren} has been cancelled.\n"
               "The booked clients have been notified — you don't need to come in."),
        "uk": ("Заняття скасовано",
               "Ваше заняття «{lesson}»{paren} скасовано.\n"
               "Записаних клієнтів повідомлено — приходити не потрібно."),
        "cs": ("Lekce zrušena",
               "Vaše lekce „{lesson}“{paren} je zrušena.\n"
               "Přihlášené klienty jsme informovali — nemusíte přijít."),
        "de": ("Kurs abgesagt",
               "Ihr Kurs „{lesson}“{paren} wurde abgesagt.\n"
               "Die gebuchten Teilnehmer sind informiert — Sie müssen nicht kommen."),
    },
    "a1": {
        "ru": ("Новая онлайн-запись",
               "Через онлайн-запись оформлена запись на «{lesson}» — {client}.\n"
               "Занятие уже стоит в журнале."),
        "en": ("New online booking",
               "A booking for “{lesson}” came in online — {client}.\n"
               "It's already in the journal."),
        "uk": ("Новий онлайн-запис",
               "Через онлайн-запис оформлено запис на «{lesson}» — {client}.\n"
               "Заняття вже є в журналі."),
        "cs": ("Nová online rezervace",
               "Přes online rezervaci přibyla rezervace na „{lesson}“ — {client}.\n"
               "Lekce už je v deníku."),
        "de": ("Neue Online-Buchung",
               "Über die Online-Buchung kam eine Buchung für „{lesson}“ — {client}.\n"
               "Sie steht bereits im Journal."),
    },
    "a2": {
        "ru": ("Отмена менее чем за час",
               "Поздняя отмена на «{lesson}» — {client}, меньше чем за час до начала.\n"
               "Место освободилось: его ещё можно кому-то предложить."),
        "en": ("Cancellation under an hour",
               "Late cancellation for “{lesson}” — {client}, under an hour before start.\n"
               "The spot is free again and can still be offered to someone."),
        "uk": ("Скасування менш ніж за годину",
               "Пізнє скасування на «{lesson}» — {client}, менш ніж за годину до початку.\n"
               "Місце звільнилося: його ще можна комусь запропонувати."),
        "cs": ("Zrušení hodinu před začátkem",
               "Pozdní zrušení na „{lesson}“ — {client}, méně než hodinu před začátkem.\n"
               "Místo se uvolnilo: ještě ho můžete někomu nabídnout."),
        "de": ("Absage unter einer Stunde",
               "Späte Absage für „{lesson}“ — {client}, weniger als eine Stunde vor Beginn.\n"
               "Der Platz ist wieder frei und kann vergeben werden."),
    },
    "a3": {
        "ru": ("Новый клиент в системе",
               "Добавлен новый клиент: {client}.\n"
               "Проверьте телефон и email — без них напоминания о занятиях ему не уйдут."),
        "en": ("New client added",
               "A new client has been added: {client}.\n"
               "Check their phone and email — without those, reminders won't reach them."),
        "uk": ("Новий клієнт у системі",
               "Додано нового клієнта: {client}.\n"
               "Перевірте телефон і email — без них нагадування про заняття не надійдуть."),
        "cs": ("Nový klient v systému",
               "Přibyl nový klient: {client}.\n"
               "Zkontrolujte telefon a e-mail — bez nich mu připomínky nedorazí."),
        "de": ("Neue Kundin oder neuer Kunde",
               "Neu hinzugefügt: {client}.\n"
               "Prüfen Sie Telefon und E-Mail — ohne sie kommen keine Erinnerungen an."),
    },
    "a4": {
        "ru": ("Оплата получена",
               "Оплата {amount} от клиента {client}.\n"
               "Операция проведена и уже видна в финансах."),
        "en": ("Payment received",
               "Payment of {amount} from {client}.\n"
               "The operation is recorded and already visible in finances."),
        "uk": ("Оплату отримано",
               "Оплата {amount} від клієнта {client}.\n"
               "Операцію проведено, вона вже видима у фінансах."),
        "cs": ("Platba přijata",
               "Platba {amount} od klienta {client}.\n"
               "Operace je zaúčtovaná a vidíte ji ve financích."),
        "de": ("Zahlung erhalten",
               "Zahlung über {amount} von {client}.\n"
               "Der Vorgang ist erfasst und in den Finanzen sichtbar."),
    },
    "a6": {
        "ru": ("Абонемент клиента на исходе",
               "У клиента {client} осталось занятий: {remaining}.\n"
               "Хороший повод предложить продление до того, как абонемент кончится."),
        "en": ("Client's subscription running low",
               "Classes left for {client}: {remaining}.\n"
               "A good moment to offer a renewal before it runs out."),
        "uk": ("Абонемент клієнта добігає кінця",
               "У клієнта {client} залишилося занять: {remaining}.\n"
               "Гарний привід запропонувати подовження, поки абонемент не скінчився."),
        "cs": ("Klientovi dochází permanentka",
               "Klientovi {client} zbývá lekcí: {remaining}.\n"
               "Dobrá chvíle nabídnout prodloužení, než permanentka skončí."),
        "de": ("Karte geht zur Neige",
               "Bei {client} sind noch {remaining} Einheiten übrig.\n"
               "Ein guter Moment, eine Verlängerung anzubieten."),
    },
    "a8": {
        "ru": ("Отчёт за день",
               "Выручка: {revenue}{prev}\nЗанятий: {lessons}\nНовых клиентов: {new_clients}"),
        "en": ("Daily report",
               "Revenue: {revenue}{prev}\nClasses: {lessons}\nNew clients: {new_clients}"),
        "uk": ("Звіт за день",
               "Виручка: {revenue}{prev}\nЗанять: {lessons}\nНових клієнтів: {new_clients}"),
        "cs": ("Denní report",
               "Tržby: {revenue}{prev}\nLekcí: {lessons}\nNových klientů: {new_clients}"),
        "de": ("Tagesbericht",
               "Umsatz: {revenue}{prev}\nKurse: {lessons}\nNeue Kunden: {new_clients}"),
    },
    "a10": {
        "ru": ("Оформлен возврат",
               "Клиенту {client} возвращено {amount}.\n"
               "Возврат проведён в финансах — деньги уйдут тем же способом, каким платили."),
        "en": ("Refund issued",
               "{client} was refunded {amount}.\n"
               "It's recorded in finances — the money goes back the same way it came."),
        "uk": ("Оформлено повернення",
               "Клієнту {client} повернуто {amount}.\n"
               "Повернення проведено у фінансах — гроші підуть тим самим способом, яким платили."),
        "cs": ("Vrácení peněz",
               "Klientovi {client} jsme vrátili {amount}.\n"
               "Vrácení je zaúčtované — peníze půjdou stejnou cestou, jakou přišly."),
        "de": ("Rückerstattung erfasst",
               "{client} wurden {amount} zurückerstattet.\n"
               "Der Vorgang ist in den Finanzen erfasst — das Geld geht denselben Weg zurück."),
    },
    "c8": {
        "ru": ("Как прошло занятие?",
               "Как вам «{lesson}»?\n"
               "Оценка займёт полминуты и поможет тренеру понять, что стоит поправить."),
        "en": ("How was your class?",
               "How was “{lesson}”?\n"
               "Rating it takes half a minute and helps the instructor adjust."),
        "uk": ("Як минуло заняття?",
               "Як вам «{lesson}»?\n"
               "Оцінка займе пів хвилини й допоможе тренеру зрозуміти, що варто підправити."),
        "cs": ("Jaká byla lekce?",
               "Jaká byla lekce „{lesson}“?\n"
               "Hodnocení zabere půl minuty a lektorovi hodně pomůže."),
        "de": ("Wie war Ihr Kurs?",
               "Wie war „{lesson}“?\n"
               "Die Bewertung dauert eine halbe Minute und hilft beim Unterricht."),
    },
    "c9": {
        "ru": ("Возврат средств оформлен",
               "Возврат {amount} оформлен.\n"
               "Деньги вернутся тем же способом, каким была сделана оплата; срок зависит от банка."),
        "en": ("Refund issued",
               "A refund of {amount} has been issued.\n"
               "The money returns the same way you paid; timing depends on your bank."),
        "uk": ("Повернення коштів оформлено",
               "Повернення {amount} оформлено.\n"
               "Гроші повернуться тим самим способом, яким була зроблена оплата; строк залежить від банку."),
        "cs": ("Vrácení peněz",
               "Vrácení částky {amount} jsme vyřídili.\n"
               "Peníze se vrátí stejnou cestou, jakou jste platili; termín závisí na bance."),
        "de": ("Rückerstattung veranlasst",
               "Eine Rückerstattung über {amount} ist veranlasst.\n"
               "Das Geld kommt auf demselben Weg zurück; wie lange es dauert, hängt von der Bank ab."),
    },
    # c10 — тон намеренно спокойный: человек чаще всего просто забыл наличные,
    # а не уклоняется. Сумма и занятие — чтобы не пришлось выяснять, о чём речь;
    # способ оплаты не называем, его решает студия на месте.
    "c10": {
        "ru": ("Занятие не оплачено",
               "Спасибо, что были на «{lesson}»!\n"
               "За это занятие осталось оплатить {amount} — можно сделать это в студии."),
        "en": ("Class not paid yet",
               "Thanks for joining “{lesson}”!\n"
               "There's {amount} left to pay for it — you can settle up at the studio."),
        "uk": ("Заняття не оплачено",
               "Дякуємо, що були на «{lesson}»!\n"
               "За це заняття залишилося сплатити {amount} — зробити це можна в студії."),
        "cs": ("Lekce zatím nezaplacena",
               "Děkujeme, že jste byli na lekci „{lesson}“!\n"
               "Zbývá doplatit {amount} — stačí to vyřídit ve studiu."),
        "de": ("Kurs noch offen",
               "Danke, dass Sie bei „{lesson}“ dabei waren!\n"
               "Offen sind noch {amount} — Sie können an der Rezeption bezahlen."),
    },
    "o1": {
        "ru": ("Ежедневная сводка",
               "Выручка: {revenue}{prev}\nЗанятий: {lessons}\nНовых клиентов: {new_clients}"),
        "en": ("Daily summary",
               "Revenue: {revenue}{prev}\nClasses: {lessons}\nNew clients: {new_clients}"),
        "uk": ("Щоденне зведення",
               "Виручка: {revenue}{prev}\nЗанять: {lessons}\nНових клієнтів: {new_clients}"),
        "cs": ("Denní přehled",
               "Tržby: {revenue}{prev}\nLekcí: {lessons}\nNových klientů: {new_clients}"),
        "de": ("Tagesübersicht",
               "Umsatz: {revenue}{prev}\nKurse: {lessons}\nNeue Kunden: {new_clients}"),
    },
    "o2": {
        "ru": ("Еженедельный отчёт",
               "Выручка за неделю: {revenue}\nЗанятий: {lessons}\nНовых клиентов: {new_clients}"),
        "en": ("Weekly report",
               "Revenue this week: {revenue}\nClasses: {lessons}\nNew clients: {new_clients}"),
        "uk": ("Щотижневий звіт",
               "Виручка за тиждень: {revenue}\nЗанять: {lessons}\nНових клієнтів: {new_clients}"),
        "cs": ("Týdenní report",
               "Tržby za týden: {revenue}\nLekcí: {lessons}\nNových klientů: {new_clients}"),
        "de": ("Wochenbericht",
               "Umsatz der Woche: {revenue}\nKurse: {lessons}\nNeue Kunden: {new_clients}"),
    },
    "o3": {
        "ru": ("Крупный платёж",
               "Крупная оплата: {amount} от клиента {client}.\n"
               "Это заметно выше обычного чека."),
        "en": ("Large payment",
               "Large payment: {amount} from {client}.\n"
               "That's noticeably above the usual ticket."),
        "uk": ("Великий платіж",
               "Велика оплата: {amount} від клієнта {client}.\n"
               "Це помітно вище за звичайний чек."),
        "cs": ("Velká platba",
               "Velká platba: {amount} od klienta {client}.\n"
               "Je výrazně nad běžnou útratou."),
        "de": ("Große Zahlung",
               "Große Zahlung: {amount} von {client}.\n"
               "Das liegt deutlich über dem üblichen Betrag."),
    },
    "o4": {
        "ru": ("Резкое падение выручки",
               "Сегодня: {revenue}\nСреднее за неделю: {avg7}\n"
               "Падение больше чем вдвое — стоит посмотреть, что случилось с расписанием и записями."),
        "en": ("Revenue drop",
               "Today: {revenue}\nWeekly average: {avg7}\n"
               "More than a twofold drop — worth checking the schedule and bookings."),
        "uk": ("Різке падіння виручки",
               "Сьогодні: {revenue}\nСереднє за тиждень: {avg7}\n"
               "Падіння більш ніж удвічі — варто подивитися, що сталося з розкладом і записами."),
        "cs": ("Prudký pokles tržeb",
               "Dnes: {revenue}\nTýdenní průměr: {avg7}\n"
               "Pokles víc než na polovinu — stojí za to zkontrolovat rozvrh a rezervace."),
        "de": ("Deutlicher Umsatzrückgang",
               "Heute: {revenue}\nWochenschnitt: {avg7}\n"
               "Mehr als halbiert — ein Blick auf Kursplan und Buchungen lohnt sich."),
    },
    "o5": {
        "ru": ("Добавлен сотрудник",
               "В команду добавлен сотрудник: {staff}.\n"
               "Проверьте роль доступа — от неё зависит, какие разделы он видит."),
        "en": ("Staff member added",
               "A new staff member has been added: {staff}.\n"
               "Check their access role — it decides which sections they can see."),
        "uk": ("Додано співробітника",
               "До команди додано співробітника: {staff}.\n"
               "Перевірте роль доступу — від неї залежить, які розділи він бачить."),
        "cs": ("Nový člen týmu",
               "Do týmu přibyl: {staff}.\n"
               "Zkontrolujte přístupovou roli — určuje, které sekce uvidí."),
        "de": ("Neues Teammitglied",
               "Neu im Team: {staff}.\n"
               "Prüfen Sie die Zugriffsrolle — sie bestimmt die sichtbaren Bereiche."),
    },
    "o6": {
        "ru": ("Тариф истекает",
               "До конца оплаченного периода дней: {days}.\n"
               "После этого доступ к CRM закроется — продлите подписку заранее."),
        "en": ("Plan expiring soon",
               "Days left in your paid period: {days}.\n"
               "After that access closes — renew in advance."),
        "uk": ("Тариф спливає",
               "До кінця оплаченого періоду днів: {days}.\n"
               "Після цього доступ до CRM закриється — подовжіть підписку заздалегідь."),
        "cs": ("Tarif brzy vyprší",
               "Do konce zaplaceného období zbývá dní: {days}.\n"
               "Potom se přístup do CRM uzavře — předplatné prodlužte včas."),
        "de": ("Tarif läuft bald ab",
               "Verbleibende Tage im bezahlten Zeitraum: {days}.\n"
               "Danach wird der Zugang gesperrt — verlängern Sie rechtzeitig."),
    },
    "o7": {
        "ru": ("Изменены права доступа",
               "Роль доступа изменена: {staff} — теперь {role}.\n"
               "Если вы этого не делали — проверьте, у кого ещё есть доступ владельца."),
        "en": ("Access role changed",
               "Access role changed: {staff} is now {role}.\n"
               "If this wasn't you — check who else has owner access."),
        "uk": ("Змінено права доступу",
               "Роль доступу змінено: {staff} — тепер {role}.\n"
               "Якщо це були не ви — перевірте, у кого ще є доступ власника."),
        "cs": ("Změna přístupových práv",
               "Změna přístupové role: {staff} — nově {role}.\n"
               "Pokud jste to nebyli vy — zkontrolujte, kdo další má práva vlastníka."),
        "de": ("Zugriffsrechte geändert",
               "Zugriffsrolle geändert: {staff} — jetzt {role}.\n"
               "Waren Sie das nicht — prüfen Sie, wer sonst Inhaberrechte hat."),
    },
    "o8": {
        "ru": ("Финансовая цель достигнута",
               "Цель «{goal}» достигнута.\nМожно ставить следующую."),
        "en": ("Financial goal reached",
               "Goal “{goal}” has been reached.\nTime to set the next one."),
        "uk": ("Фінансову ціль досягнуто",
               "Ціль «{goal}» досягнуто.\nМожна ставити наступну."),
        "cs": ("Finanční cíl splněn",
               "Cíl „{goal}“ je splněný.\nMůžete si nastavit další."),
        "de": ("Finanzziel erreicht",
               "Das Ziel „{goal}“ ist erreicht.\nZeit für das nächste."),
    },
    "t2": {
        "ru": ("Отмена записи",
               "Отмена записи на «{lesson}»{paren} — {client}, меньше чем за 2 часа до начала.\n"
               "Состав группы изменился, проверьте его перед занятием."),
        "en": ("Booking cancelled",
               "Cancellation for “{lesson}”{paren} — {client}, under 2 hours before start.\n"
               "The roster changed — check it before the class."),
        "uk": ("Скасування запису",
               "Скасування запису на «{lesson}»{paren} — {client}, менш ніж за 2 години до початку.\n"
               "Склад групи змінився, перевірте його перед заняттям."),
        "cs": ("Zrušená rezervace",
               "Zrušení rezervace na „{lesson}“{paren} — {client}, méně než 2 hodiny před začátkem.\n"
               "Seznam účastníků se změnil, před lekcí ho zkontrolujte."),
        "de": ("Buchung storniert",
               "Stornierung für „{lesson}“{paren} — {client}, weniger als 2 Stunden vor Beginn.\n"
               "Die Teilnehmerliste hat sich geändert — bitte vor dem Kurs prüfen."),
    },
    "t5": {
        "ru": ("Изменение в расписании",
               "«{lesson}» перенесено. Новое время: {when}.\n"
               "Если новое время вам не подходит, скажите администратору."),
        "en": ("Schedule change",
               "“{lesson}” has been rescheduled. New time: {when}.\n"
               "Tell the administrator if the new time doesn't work for you."),
        "uk": ("Зміна в розкладі",
               "«{lesson}» перенесено. Новий час: {when}.\n"
               "Якщо новий час вам не підходить, скажіть адміністратору."),
        "cs": ("Změna v rozvrhu",
               "Lekce „{lesson}“ byla přesunuta. Nový čas: {when}.\n"
               "Pokud vám termín nevyhovuje, dejte vědět administrátorovi."),
        "de": ("Änderung im Kursplan",
               "„{lesson}“ wurde verschoben. Neue Zeit: {when}.\n"
               "Sagen Sie der Verwaltung Bescheid, falls die Zeit nicht passt."),
    },
    "a7": {
        "ru": ("Конфликт расписания",
               "Наложение: «{lesson}» и «{second}»{paren} — общий {resource}.\n"
               "Одно из занятий нужно перенести, иначе придут обе группы."),
        "en": ("Schedule conflict",
               "Overlap: “{lesson}” and “{second}”{paren} — shared {resource}.\n"
               "One of them has to move, or both groups will show up."),
        "uk": ("Конфлікт розкладу",
               "Накладання: «{lesson}» і «{second}»{paren} — спільний {resource}.\n"
               "Одне із занять треба перенести, інакше прийдуть обидві групи."),
        "cs": ("Konflikt v rozvrhu",
               "Překryv: „{lesson}“ a „{second}“{paren} — společný {resource}.\n"
               "Jednu z lekcí je potřeba přesunout, jinak dorazí obě skupiny."),
        "de": ("Konflikt im Kursplan",
               "Überschneidung: „{lesson}“ und „{second}“{paren} — gemeinsam: {resource}.\n"
               "Einer der Kurse muss verschoben werden, sonst kommen beide Gruppen."),
    },
    "a9": {
        "ru": ("Вход с нового устройства",
               "Вход в аккаунт {staff} с нового устройства: {device}.\n"
               "Если это были не вы — смените пароль и завершите чужие сессии."),
        "en": ("New device login",
               "{staff}'s account was accessed from a new device: {device}.\n"
               "If this wasn't you — change the password and end the other sessions."),
        "uk": ("Вхід із нового пристрою",
               "Вхід в акаунт {staff} з нового пристрою: {device}.\n"
               "Якщо це були не ви — змініть пароль і завершіть чужі сесії."),
        "cs": ("Přihlášení z nového zařízení",
               "Přihlášení k účtu {staff} z nového zařízení: {device}.\n"
               "Pokud jste to nebyli vy — změňte heslo a ukončete cizí relace."),
        "de": ("Anmeldung von neuem Gerät",
               "Anmeldung beim Konto {staff} von einem neuen Gerät: {device}.\n"
               "Waren Sie das nicht — ändern Sie das Passwort und beenden Sie fremde Sitzungen."),
    },
    "o9": {
        "ru": ("Экспорт данных",
               "Выгружены данные: {kind}. Инициатор — {staff}.\n"
               "Если это были не вы — проверьте активные сессии и ключи доступа."),
        "en": ("Data export",
               "Data exported: {kind}. Initiated by {staff}.\n"
               "If this wasn't you — review active sessions and access keys."),
        "uk": ("Експорт даних",
               "Вивантажено дані: {kind}. Ініціатор — {staff}.\n"
               "Якщо це були не ви — перевірте активні сесії та ключі доступу."),
        "cs": ("Export dat",
               "Exportovaná data: {kind}. Zadal: {staff}.\n"
               "Pokud jste to nebyli vy — zkontrolujte relace a přístupové klíče."),
        "de": ("Datenexport",
               "Exportierte Daten: {kind}. Ausgelöst von {staff}.\n"
               "Waren Sie das nicht — prüfen Sie Sitzungen und Zugriffsschlüssel."),
    },
    "c12": {
        "ru": ("Начислены бонусы",
               "Вам начислено баллов: {points}.{description}\n"
               "Потратить их можно при оплате занятий и абонементов."),
        "en": ("Bonus credited",
               "You've earned {points} points.{description}\n"
               "You can spend them on classes and subscriptions."),
        "uk": ("Нараховано бонуси",
               "Вам нараховано балів: {points}.{description}\n"
               "Витратити їх можна на заняття та абонементи."),
        "cs": ("Připsané body",
               "Na váš účet jsme připsali bodů: {points}.{description}\n"
               "Můžete je použít na lekce i permanentky."),
        "de": ("Bonuspunkte gutgeschrieben",
               "Ihnen wurden {points} Punkte gutgeschrieben.{description}\n"
               "Sie können sie für Kurse und Karten einlösen."),
    },
    # t7 — задел (N-9 границы): эндпоинта создания отзыва ещё нет, врезки тоже.
    "t7": {
        "ru": ("Новый отзыв",
               "Новая оценка занятия «{lesson}»: {rating}★ от клиента {client}."),
        "en": ("New review",
               "New rating for “{lesson}”: {rating}★ from {client}."),
        "uk": ("Новий відгук",
               "Нова оцінка заняття «{lesson}»: {rating}★ від клієнта {client}."),
        "cs": ("Nové hodnocení",
               "Nové hodnocení lekce „{lesson}“: {rating}★ od klienta {client}."),
        "de": ("Neue Bewertung",
               "Neue Bewertung für „{lesson}“: {rating}★ von {client}."),
    },
}


if __name__ == "__main__":
    import re

    _FIELD = re.compile(r"\{(\w+)\}")
    for _eid, _by_lang in TEXTS.items():
        assert set(_by_lang) == set(LANGS), f"{_eid}: языки {sorted(_by_lang)}"
        # Набор подстановок обязан совпадать во всех переводах: забытый {amount}
        # в чешском — это письмо без суммы, а лишний — KeyError на отправке.
        _fields = {lang: set(_FIELD.findall(text)) for lang, (_s, text) in _by_lang.items()}
        assert len(set(map(frozenset, _fields.values()))) == 1, f"{_eid}: подстановки разошлись — {_fields}"
        for _lang, (_subject, _text) in _by_lang.items():
            assert _subject and _text, f"{_eid}/{_lang}: пустой текст"
            assert "{{" not in _text and "}}" not in _text, f"{_eid}/{_lang}: двойная скобка"

    for _table in (WORDS, ROLE_WORDS, RESOURCE_WORDS, FACT_LABELS):
        for _key, _by_lang in _table.items():
            assert set(_by_lang) == set(LANGS), f"{_key}: языки {sorted(_by_lang)}"
    for _phrase in (LEFT_HOURS, LEFT_SOON, PREV_REVENUE, BDAY_NAMED, BDAY_PLAIN, SPOTS):
        assert set(_phrase) == set(LANGS), _phrase

    # Подписи «Деталей» письма — короткие: длинные ломают вёрстку карточки.
    assert max(len(v) for m in FACT_LABELS.values() for v in m.values()) <= 20

    assert pick(TEXTS["c1"], "cs")[0] == "Rezervace potvrzena"
    assert pick(TEXTS["c1"], "pl")[0] == "Booking confirmed", "язык без перевода — английский"
    print(f"notify texts self-check ok — {len(TEXTS)} событий x {len(LANGS)} языков")

"""Шаблоны WhatsApp для всех 40 событий каталога (services/notification_catalog)
на всех пяти языках продукта — ru, en, uk, cs, de.

ЗАЧЕМ. `_send_whatsapp` шлёт `type: "text"` — свободный текст, который Meta
доставляет ТОЛЬКО внутри 24-часового окна диалога. Всё, что уходит вне окна
(напоминания, подтверждения, отчёты), отклоняется — молча, `deliver()` просто
возвращает False. Единственный способ написать первым — шаблон, заранее
одобренный модерацией Meta.

ЧТО ВИДИТ ЧЕЛОВЕК. Не строку служебного текста, а карточку: эмодзи и жирный
заголовок события, факты по строкам (жирным — время, сумма, остаток), подпись
студии в подвале и кнопка «открыть раздел» — записи в мини-приложении клиенту,
нужную страницу CRM команде. Эмодзи заголовка — тот же, что у события в
Telegram (`notifier.EVENT_EMOJI`): одно событие — одна иконка во всех каналах.
Разметка WhatsApp понимает `*жирный*`, `_курсив_`; HTML — нет.

ПРАВИЛА, ЗАМЕРЕННЫЕ НА ЖИВОМ API (в документации их нет):
  - тело не может состоять из одних параметров (subcode 2388047);
  - на каждую переменную нужно достаточно статичных слов, иначе
    «Params Words Ratio Exceeds Limit» (subcode 2388293) — короткое
    «Занятие отменено: {{1}}» Meta отвергает;
  - не больше двух подряд идущих переносов строки;
  - переменная не может стоять в начале или в конце тела.
Отсюда щедрый статичный текст и максимум две переменные на шаблон, причём
переменные стоят в середине фразы, а не по краям.

Проверять формулировки надо не глазами, а `tests/test_whatsapp_templates.py`:
он держит все замеренные правила разом, на всех пяти языках.

Имя шаблона одно на все языки (`<префикс><event_id>`), под ним Meta хранит
отдельную версию на каждый language — поэтому смена языка студии не требует
других имён, только досоздания версии (services/whatsapp.sync_templates).

Self-check без сети:  python -m services.whatsapp_templates
"""
from dataclasses import dataclass
from typing import Any, Callable

from services import email_layout
from services.i18n import LANGS, pick, resolve
from services.notification_catalog import CATALOG
from services.notifier import EVENT_EMOJI, _fmt_amount
from services.notify_texts import ROLE_WORDS, WORDS

# Языки продукта (services/i18n). Meta принимает такие коды как language шаблона.
WA_LANGS = LANGS

# Префикс имени шаблона на WABA. Меняется, если имена оказались заблокированы:
# после удаления шаблона Meta надолго запрещает переиспользовать ИМЯ («Message
# template language is being deleted»), и единственный обходной путь — новый
# префикс. Был velora_ — сожжён валидацией через создание/удаление 06.08.2026.
# Стал vlr2_ вместе с переходом на пять языков и оформленные карточки: тексты
# под старыми именами уже лежат на WABA студий, а создание существующего имени
# Meta отвечает «already exists» — новый текст под старым именем не доехал бы.
_NAME_PREFIX = "vlr2_"

# Подвал карточки (компонент FOOTER, до 60 символов, без переменных). Нужен
# ровно затем, зачем в письме подпись: с первого взгляда видно, что это не
# личное сообщение администратора, а уведомление системы.
_FOOTER = {
    "ru": "Velora · автоматическое уведомление",
    "en": "Velora · automated notification",
    "uk": "Velora · автоматичне сповіщення",
    "cs": "Velora · automatické oznámení",
    "de": "Velora · automatische Benachrichtigung",
}


def resolve_lang(raw: str | None) -> str:
    """Язык шаблона по языку студии (Studio.language, может быть любым из 22).
    Правило общее для всех каналов, см. services/i18n.resolve."""
    return resolve(raw)


def _v(value: Any, fallback: str) -> str:
    """Непустое значение параметра: Meta отклоняет пустые строки в example и при
    отправке, а половина контекстов приходит без времени или имени."""
    text = "" if value is None else str(value).strip()
    return text or fallback


# ─── ЗАГЛУШКИ И СЛОВАРИ ПАРАМЕТРОВ ────────────────────────────────────────────

# Заглушки на пустой контекст и словарные слова — общие с письмом
# (services/notify_texts.WORDS): «занятие» в шаблоне WhatsApp и «занятие» в
# письме об одном и том же событии расходиться не должны.
def _word(key: str, lang: str) -> str:
    return pick(WORDS[key], lang)


def _when(context: dict, lang: str) -> str:
    # Тот же формат, что в письме и в Telegram («17 августа, 12:00»): человек,
    # получивший подтверждение в WhatsApp, а напоминание на почту, не должен
    # сверять два разных написания одного времени.
    from services.notifier import when_text

    return _v(when_text(context, lang), _word("when", lang))


# Один слот — один вид параметра: чем его заполнить из контекста и что показать
# модерации в качестве примера. Шаблон перечисляет слоты по порядку {{1}}, {{2}},
# а значения и примеры собираются отсюда — раньше и то и другое писалось руками
# в каждой из 40 строк, и разъехаться им было нечем помешать.
_SLOT_VALUE: dict[str, Callable[[dict, str, str], str]] = {
    "lesson": lambda c, lang, cur: _v(c.get("lesson_name"), _word("lesson", lang)),
    "lesson2": lambda c, lang, cur: _v(c.get("second_lesson_name"), _word("lesson2", lang)),
    "when": lambda c, lang, cur: _when(c, lang),
    "client": lambda c, lang, cur: _v(c.get("client_name"), _word("client", lang)),
    "staff": lambda c, lang, cur: _v(c.get("staff_name"), _word("staff", lang)),
    "names": lambda c, lang, cur: _v(c.get("names"), _word("names", lang)),
    "count": lambda c, lang, cur: _v(c.get("count"), "2"),
    "remaining": lambda c, lang, cur: _v(c.get("remaining"), "0"),
    "points": lambda c, lang, cur: _v(c.get("amount"), "0"),
    "lessons": lambda c, lang, cur: _v(c.get("lessons"), "0"),
    "days": lambda c, lang, cur: _v(c.get("days_left"), "0"),
    "money": lambda c, lang, cur: _v(_fmt_amount(c.get("amount"), cur), "—"),
    "revenue": lambda c, lang, cur: _v(_fmt_amount(c.get("revenue"), cur), "—"),
    "avg7": lambda c, lang, cur: _v(_fmt_amount(c.get("avg7"), cur), "—"),
    "goal": lambda c, lang, cur: _v(c.get("goal_name"), _word("goal", lang)),
    "kind": lambda c, lang, cur: _v(c.get("kind"), _word("kind", lang)),
    "role": lambda c, lang, cur: _v(
        (pick(ROLE_WORDS[str(c["role"])], lang) if c.get("role") in ROLE_WORDS else c.get("role")),
        _word("role", lang),
    ),
    "period": lambda c, lang, cur: _v(
        " — ".join(p for p in (c.get("period_start"), c.get("period_end")) if p), "—",
    ),
}

_SAMPLE: dict[str, dict[str, str]] = {
    "lesson": {"ru": "йога", "en": "yoga", "uk": "йога", "cs": "jóga", "de": "Yoga"},
    "lesson2": {"ru": "пилатес", "en": "pilates", "uk": "пілатес", "cs": "pilates", "de": "Pilates"},
    "when": {"ru": "12 мая, 10:00", "en": "12 May, 10:00", "uk": "12 травня, 10:00",
             "cs": "12. května, 10:00", "de": "12. Mai, 10:00"},
    "client": {"ru": "Анна", "en": "Anna", "uk": "Ганна", "cs": "Anna", "de": "Anna"},
    "staff": {"ru": "Пётр", "en": "Peter", "uk": "Петро", "cs": "Petr", "de": "Peter"},
    "names": {"ru": "Анна, Пётр", "en": "Anna, Peter", "uk": "Ганна, Петро",
              "cs": "Anna, Petr", "de": "Anna, Peter"},
    "count": {lang: "3" for lang in WA_LANGS},
    "remaining": {lang: "2" for lang in WA_LANGS},
    "points": {lang: "100" for lang in WA_LANGS},
    "lessons": {lang: "8" for lang in WA_LANGS},
    "days": {lang: "3" for lang in WA_LANGS},
    "money": {"ru": "3 000 ₽", "en": "$30", "uk": "1 200 ₴", "cs": "800 Kč", "de": "30 €"},
    "revenue": {"ru": "30 000 ₽", "en": "$300", "uk": "12 000 ₴", "cs": "8 000 Kč", "de": "300 €"},
    "avg7": {"ru": "25 000 ₽", "en": "$250", "uk": "10 000 ₴", "cs": "6 500 Kč", "de": "250 €"},
    "goal": {"ru": "Выручка за май", "en": "May revenue", "uk": "Виручка за травень",
             "cs": "Tržby za květen", "de": "Umsatz im Mai"},
    "kind": {"ru": "клиенты", "en": "clients", "uk": "клієнти", "cs": "klienti", "de": "Kunden"},
    "role": {"ru": "администратор", "en": "administrator", "uk": "адміністратор",
             "cs": "administrátor", "de": "Administrator"},
    "period": {"ru": "1 — 31 мая", "en": "May 1 — 31", "uk": "1 — 31 травня",
               "cs": "1. — 31. května", "de": "1. — 31. Mai"},
}


@dataclass(frozen=True)
class WaTemplate:
    category: str                     # UTILITY | MARKETING
    slots: tuple[str, ...]            # какие параметры и в каком порядке ({{1}}, {{2}})
    body: dict[str, str]              # lang -> текст карточки

    @property
    def example(self) -> dict[str, list[str]]:
        """Примеры значений для модерации Meta — по одному на слот и язык."""
        return {lang: [_SAMPLE[s][lang] for s in self.slots] for lang in WA_LANGS}

    def params(self, context: dict, lang: str, currency: str) -> list[str]:
        """Значения параметров из контекста события — в порядке слотов."""
        return [_SLOT_VALUE[s](context, lang, currency) for s in self.slots]


WA_TEMPLATES: dict[str, WaTemplate] = {
    # ─── Клиент ───────────────────────────────────────────────────────────────
    "c1": WaTemplate("UTILITY", ("lesson", "when"), {
        "ru": "✅ *Запись подтверждена*\n\n"
              "Вы записаны на занятие «{{1}}».\n🗓 Начало: *{{2}}*\n\n"
              "Если планы изменятся, отмените запись заранее — место достанется другому.",
        "en": "✅ *Booking confirmed*\n\n"
              "You are booked for the class “{{1}}”.\n🗓 Starts: *{{2}}*\n\n"
              "If your plans change, cancel in advance so someone else can take the spot.",
        "uk": "✅ *Запис підтверджено*\n\n"
              "Ви записані на заняття «{{1}}».\n🗓 Початок: *{{2}}*\n\n"
              "Якщо плани зміняться, скасуйте запис заздалегідь — місце дістанеться іншому.",
        "cs": "✅ *Rezervace potvrzena*\n\n"
              "Máte rezervovanou lekci „{{1}}“.\n🗓 Začátek: *{{2}}*\n\n"
              "Pokud se plány změní, zrušte rezervaci včas — místo dostane někdo další.",
        "de": "✅ *Buchung bestätigt*\n\n"
              "Sie sind für den Kurs „{{1}}“ angemeldet.\n🗓 Beginn: *{{2}}*\n\n"
              "Wenn sich Ihre Pläne ändern, sagen Sie rechtzeitig ab — dann bekommt jemand anderes den Platz.",
    }),
    "c2": WaTemplate("UTILITY", ("lesson", "when"), {
        "ru": "⏰ *Напоминание о занятии*\n\n"
              "Скоро ваше занятие «{{1}}».\n🗓 Начало: *{{2}}*\n\n"
              "Не сможете прийти? Отмените запись, чтобы место освободилось.",
        "en": "⏰ *Class reminder*\n\n"
              "Your class “{{1}}” is coming up.\n🗓 Starts: *{{2}}*\n\n"
              "Can’t make it? Cancel your booking so the spot frees up.",
        "uk": "⏰ *Нагадування про заняття*\n\n"
              "Скоро ваше заняття «{{1}}».\n🗓 Початок: *{{2}}*\n\n"
              "Не зможете прийти? Скасуйте запис, щоб місце звільнилося.",
        "cs": "⏰ *Připomenutí lekce*\n\n"
              "Brzy vás čeká lekce „{{1}}“.\n🗓 Začátek: *{{2}}*\n\n"
              "Nemůžete přijít? Zrušte rezervaci, ať se místo uvolní.",
        "de": "⏰ *Kurs-Erinnerung*\n\n"
              "Ihr Kurs „{{1}}“ steht bevor.\n🗓 Beginn: *{{2}}*\n\n"
              "Sie können nicht kommen? Sagen Sie ab, damit der Platz frei wird.",
    }),
    "c3": WaTemplate("UTILITY", ("lesson", "when"), {
        "ru": "❌ *Занятие отменено*\n\n"
              "К сожалению, занятие «{{1}}» не состоится.\n🗓 Планировалось на *{{2}}*\n\n"
              "Приносим извинения — другое время можно выбрать в расписании.",
        "en": "❌ *Class cancelled*\n\n"
              "Unfortunately the class “{{1}}” will not take place.\n🗓 It was planned for *{{2}}*\n\n"
              "We are sorry — you can pick another time in the schedule.",
        "uk": "❌ *Заняття скасовано*\n\n"
              "На жаль, заняття «{{1}}» не відбудеться.\n🗓 Планувалося на *{{2}}*\n\n"
              "Перепрошуємо — інший час можна обрати в розкладі.",
        "cs": "❌ *Lekce zrušena*\n\n"
              "Lekce „{{1}}“ se bohužel neuskuteční.\n🗓 Byla plánovaná na *{{2}}*\n\n"
              "Omlouváme se — jiný termín si můžete vybrat v rozvrhu.",
        "de": "❌ *Kurs abgesagt*\n\n"
              "Der Kurs „{{1}}“ findet leider nicht statt.\n🗓 Geplant war *{{2}}*\n\n"
              "Wir bitten um Entschuldigung — im Kursplan finden Sie andere Termine.",
    }),
    "c11": WaTemplate("UTILITY", ("lesson", "when"), {
        "ru": "🔄 *Занятие перенесено*\n\n"
              "Занятие «{{1}}» состоится в другое время.\n🗓 Новое начало: *{{2}}*\n\n"
              "Ваша запись сохранена — если время не подходит, отмените её.",
        "en": "🔄 *Class rescheduled*\n\n"
              "The class “{{1}}” has moved to another time.\n🗓 New start: *{{2}}*\n\n"
              "Your booking is kept — cancel it if the new time does not work.",
        "uk": "🔄 *Заняття перенесено*\n\n"
              "Заняття «{{1}}» відбудеться в інший час.\n🗓 Новий початок: *{{2}}*\n\n"
              "Ваш запис збережено — якщо час не підходить, скасуйте його.",
        "cs": "🔄 *Lekce přesunuta*\n\n"
              "Lekce „{{1}}“ se uskuteční v jiném čase.\n🗓 Nový začátek: *{{2}}*\n\n"
              "Rezervace zůstává — pokud vám čas nevyhovuje, zrušte ji.",
        "de": "🔄 *Kurs verschoben*\n\n"
              "Der Kurs „{{1}}“ findet zu einer anderen Zeit statt.\n🗓 Neuer Beginn: *{{2}}*\n\n"
              "Ihre Buchung bleibt bestehen — sagen Sie ab, falls die Zeit nicht passt.",
    }),
    "c5": WaTemplate("UTILITY", ("remaining",), {
        "ru": "⚠️ *Абонемент на исходе*\n\n"
              "В вашем абонементе осталось занятий: *{{1}}*.\n\n"
              "Продлите его заранее, чтобы не прерывать тренировки.",
        "en": "⚠️ *Subscription running low*\n\n"
              "Classes left on your subscription: *{{1}}*.\n\n"
              "Renew it in advance so your training does not stop.",
        "uk": "⚠️ *Абонемент добігає кінця*\n\n"
              "У вашому абонементі залишилося занять: *{{1}}*.\n\n"
              "Подовжіть його заздалегідь, щоб не переривати тренування.",
        "cs": "⚠️ *Permanentka dochází*\n\n"
              "Na vaší permanentce zbývá lekcí: *{{1}}*.\n\n"
              "Prodlužte ji včas, ať nemusíte tréninky přerušit.",
        "de": "⚠️ *Guthaben geht zur Neige*\n\n"
              "Verbleibende Einheiten auf Ihrer Karte: *{{1}}*.\n\n"
              "Verlängern Sie rechtzeitig, damit Ihr Training nicht pausiert.",
    }),
    # Без переменных: сообщение уходит самому клиенту, и называть его по имени
    # («абонемент клиента Анна закончился») в письме ему же — канцелярит.
    "c6": WaTemplate("UTILITY", (), {
        "ru": "🔕 *Абонемент закончился*\n\n"
              "Ваш абонемент закончился — записаться по нему больше нельзя.\n\n"
              "Оформите новый, чтобы продолжить занятия в студии.",
        "en": "🔕 *Subscription ended*\n\n"
              "Your subscription has ended — you can no longer book with it.\n\n"
              "Get a new one to keep training at the studio.",
        "uk": "🔕 *Абонемент закінчився*\n\n"
              "Ваш абонемент закінчився — записатися за ним більше не можна.\n\n"
              "Оформіть новий, щоб продовжити заняття в студії.",
        "cs": "🔕 *Permanentka vypršela*\n\n"
              "Vaše permanentka skončila — rezervovat na ni už nelze.\n\n"
              "Pořiďte si novou a pokračujte v lekcích.",
        "de": "🔕 *Karte abgelaufen*\n\n"
              "Ihre Karte ist abgelaufen — damit können Sie nicht mehr buchen.\n\n"
              "Holen Sie sich eine neue und trainieren Sie weiter.",
    }),
    "c7": WaTemplate("MARKETING", ("client",), {
        "ru": "🎉 *С днём рождения!*\n\n"
              "{{1}}, поздравляем вас и желаем здоровья и энергии!\n\n"
              "Будем рады видеть вас на занятии — приходите, когда будет настроение.",
        "en": "🎉 *Happy birthday!*\n\n"
              "{{1}}, we wish you health and energy on your day!\n\n"
              "We would love to see you at a class whenever you feel like it.",
        "uk": "🎉 *З днем народження!*\n\n"
              "{{1}}, вітаємо вас і бажаємо здоров’я та енергії!\n\n"
              "Будемо раді бачити вас на занятті — приходьте, коли буде настрій.",
        "cs": "🎉 *Všechno nejlepší!*\n\n"
              "{{1}}, přejeme vám hodně zdraví a energie!\n\n"
              "Budeme rádi, když se u nás zastavíte na lekci.",
        "de": "🎉 *Alles Gute zum Geburtstag!*\n\n"
              "{{1}}, wir wünschen Ihnen Gesundheit und Energie!\n\n"
              "Wir freuen uns, Sie bald wieder im Kurs zu sehen.",
    }),
    "c8": WaTemplate("MARKETING", ("lesson",), {
        "ru": "⭐ *Как прошло занятие?*\n\n"
              "Расскажите, как вам «{{1}}»?\n\n"
              "Оценка займёт полминуты и поможет тренеру понять, что стоит поправить.",
        "en": "⭐ *How was your class?*\n\n"
              "Tell us how “{{1}}” went.\n\n"
              "Rating it takes half a minute and helps the instructor adjust.",
        "uk": "⭐ *Як минуло заняття?*\n\n"
              "Розкажіть, як вам «{{1}}»?\n\n"
              "Оцінка займе пів хвилини й допоможе тренеру зрозуміти, що варто підправити.",
        "cs": "⭐ *Jaká byla lekce?*\n\n"
              "Dejte nám vědět, jak se vám líbila „{{1}}“.\n\n"
              "Hodnocení zabere půl minuty a lektorovi hodně pomůže.",
        "de": "⭐ *Wie war Ihr Kurs?*\n\n"
              "Erzählen Sie uns, wie Ihnen „{{1}}“ gefallen hat.\n\n"
              "Die Bewertung dauert eine halbe Minute und hilft beim Unterricht.",
    }),
    "c12": WaTemplate("UTILITY", ("points",), {
        "ru": "🎁 *Начислены бонусы*\n\n"
              "Вам начислено баллов: *{{1}}*.\n\n"
              "Потратить их можно при оплате занятий и абонементов.",
        "en": "🎁 *Bonus points credited*\n\n"
              "Points added to your account: *{{1}}*.\n\n"
              "You can spend them on classes and subscriptions.",
        "uk": "🎁 *Нараховано бонуси*\n\n"
              "Вам нараховано балів: *{{1}}*.\n\n"
              "Витратити їх можна на заняття та абонементи.",
        "cs": "🎁 *Připsané body*\n\n"
              "Na váš účet jsme připsali bodů: *{{1}}*.\n\n"
              "Můžete je použít na lekce i permanentky.",
        "de": "🎁 *Bonuspunkte gutgeschrieben*\n\n"
              "Auf Ihrem Konto gutgeschrieben: *{{1}}* Punkte.\n\n"
              "Sie können sie für Kurse und Karten einlösen.",
    }),
    # Кофе после занятия. Две переменные — сколько человек и их имена — стоят в
    # середине фразы, а вокруг щедрый статичный текст: иначе Meta заворачивает
    # шаблон по ratio (subcode 2388293). Мест здесь нет намеренно: третья
    # переменная с адресами упёрлась бы в тот же лимит.
    "c13": WaTemplate("UTILITY", ("count", "names"), {
        "ru": "☕ *Кофе после занятия*\n\n"
              "Вы собирались выпить кофе вместе — вас *{{1}}*, а именно: {{2}}.\n\n"
              "Хорошего вечера!",
        "en": "☕ *Coffee after class*\n\n"
              "You planned to grab a coffee together — *{{1}}* of you, namely: {{2}}.\n\n"
              "Have a lovely evening!",
        "uk": "☕ *Кава після заняття*\n\n"
              "Ви збиралися випити кави разом — вас *{{1}}*, а саме: {{2}}.\n\n"
              "Гарного вечора!",
        "cs": "☕ *Káva po lekci*\n\n"
              "Chystali jste se spolu na kávu — je vás *{{1}}*, konkrétně: {{2}}.\n\n"
              "Hezký večer!",
        "de": "☕ *Kaffee nach dem Kurs*\n\n"
              "Sie wollten zusammen Kaffee trinken — Sie sind zu *{{1}}*, nämlich: {{2}}.\n\n"
              "Einen schönen Abend!",
    }),
    "c4": WaTemplate("UTILITY", ("money",), {
        "ru": "💳 *Оплата получена*\n\n"
              "Ваша оплата на сумму *{{1}}* прошла успешно.\n\n"
              "История платежей и абонемент — в вашем профиле.",
        "en": "💳 *Payment received*\n\n"
              "Your payment of *{{1}}* went through.\n\n"
              "Payment history and your subscription are in your profile.",
        "uk": "💳 *Оплату отримано*\n\n"
              "Ваша оплата на суму *{{1}}* пройшла успішно.\n\n"
              "Історія платежів і абонемент — у вашому профілі.",
        "cs": "💳 *Platba přijata*\n\n"
              "Vaše platba ve výši *{{1}}* proběhla úspěšně.\n\n"
              "Historii plateb i permanentku najdete ve svém profilu.",
        "de": "💳 *Zahlung erhalten*\n\n"
              "Ihre Zahlung über *{{1}}* war erfolgreich.\n\n"
              "Zahlungsverlauf und Karte finden Sie in Ihrem Profil.",
    }),
    "c9": WaTemplate("UTILITY", ("money",), {
        "ru": "↩️ *Возврат средств оформлен*\n\n"
              "Возврат на сумму *{{1}}* оформлен.\n\n"
              "Деньги вернутся тем же способом, каким была сделана оплата; срок зависит от банка.",
        "en": "↩️ *Refund issued*\n\n"
              "A refund of *{{1}}* has been issued.\n\n"
              "The money returns the same way you paid; timing depends on your bank.",
        "uk": "↩️ *Повернення коштів оформлено*\n\n"
              "Повернення на суму *{{1}}* оформлено.\n\n"
              "Гроші повернуться тим самим способом, яким була зроблена оплата; строк залежить від банку.",
        "cs": "↩️ *Vrácení peněz*\n\n"
              "Vrácení částky *{{1}}* jsme vyřídili.\n\n"
              "Peníze se vrátí stejnou cestou, jakou jste platili; termín závisí na bance.",
        "de": "↩️ *Rückerstattung veranlasst*\n\n"
              "Eine Rückerstattung über *{{1}}* ist veranlasst.\n\n"
              "Das Geld kommt auf demselben Weg zurück; wie lange es dauert, hängt von der Bank ab.",
    }),
    "c10": WaTemplate("UTILITY", ("lesson", "money"), {
        "ru": "🧾 *Занятие не оплачено*\n\n"
              "Спасибо, что были на «{{1}}»!\nОсталось оплатить: *{{2}}*\n\n"
              "Сделать это можно на ресепшене студии.",
        "en": "🧾 *Class not paid yet*\n\n"
              "Thanks for joining “{{1}}”!\nLeft to pay: *{{2}}*\n\n"
              "You can settle up at the studio reception.",
        "uk": "🧾 *Заняття не оплачено*\n\n"
              "Дякуємо, що були на «{{1}}»!\nЗалишилося сплатити: *{{2}}*\n\n"
              "Зробити це можна на ресепшені студії.",
        "cs": "🧾 *Lekce zatím nezaplacena*\n\n"
              "Děkujeme, že jste byli na lekci „{{1}}“!\nZbývá doplatit: *{{2}}*\n\n"
              "Stačí to vyřídit na recepci studia.",
        "de": "🧾 *Kurs noch offen*\n\n"
              "Danke, dass Sie bei „{{1}}“ dabei waren!\nNoch offen: *{{2}}*\n\n"
              "Sie können an der Rezeption bezahlen.",
    }),
    # ─── Тренер ───────────────────────────────────────────────────────────────
    "t1": WaTemplate("UTILITY", ("client", "lesson"), {
        "ru": "📅 *Новая запись*\n\n"
              "Клиент {{1}} записался на ваше занятие «{{2}}».\n\n"
              "Полный состав группы придёт за 30 минут до начала.",
        "en": "📅 *New booking*\n\n"
              "The client {{1}} signed up for your class “{{2}}”.\n\n"
              "The full roster arrives 30 minutes before the start.",
        "uk": "📅 *Новий запис*\n\n"
              "Клієнт {{1}} записався на ваше заняття «{{2}}».\n\n"
              "Повний склад групи надійде за 30 хвилин до початку.",
        "cs": "📅 *Nová rezervace*\n\n"
              "Klient {{1}} se přihlásil na vaši lekci „{{2}}“.\n\n"
              "Celý seznam účastníků dorazí 30 minut před začátkem.",
        "de": "📅 *Neue Buchung*\n\n"
              "{{1}} hat sich für Ihren Kurs „{{2}}“ angemeldet.\n\n"
              "Die vollständige Teilnehmerliste kommt 30 Minuten vor Beginn.",
    }),
    "t2": WaTemplate("UTILITY", ("client", "lesson"), {
        "ru": "❌ *Отмена записи*\n\n"
              "Клиент {{1}} отменил запись на «{{2}}» меньше чем за два часа до начала.\n\n"
              "Состав группы изменился — проверьте его перед занятием.",
        "en": "❌ *Booking cancelled*\n\n"
              "The client {{1}} cancelled the booking for “{{2}}” under two hours before the start.\n\n"
              "The roster changed — check it before the class.",
        "uk": "❌ *Скасування запису*\n\n"
              "Клієнт {{1}} скасував запис на «{{2}}» менш ніж за дві години до початку.\n\n"
              "Склад групи змінився — перевірте його перед заняттям.",
        "cs": "❌ *Zrušená rezervace*\n\n"
              "Klient {{1}} zrušil rezervaci na „{{2}}“ méně než dvě hodiny před začátkem.\n\n"
              "Seznam účastníků se změnil — před lekcí ho zkontrolujte.",
        "de": "❌ *Buchung storniert*\n\n"
              "{{1}} hat die Buchung für „{{2}}“ weniger als zwei Stunden vor Beginn storniert.\n\n"
              "Die Teilnehmerliste hat sich geändert — bitte vor dem Kurs prüfen.",
    }),
    "t3": WaTemplate("UTILITY", ("lesson", "when"), {
        "ru": "⏰ *Занятие через час*\n\n"
              "Ваше занятие «{{1}}» начнётся через час.\n🗓 Начало: *{{2}}*\n\n"
              "Состав группы придёт отдельно, за 30 минут до начала.",
        "en": "⏰ *Class in an hour*\n\n"
              "Your class “{{1}}” starts in an hour.\n🗓 Starts: *{{2}}*\n\n"
              "The roster comes separately, 30 minutes before the start.",
        "uk": "⏰ *Заняття за годину*\n\n"
              "Ваше заняття «{{1}}» почнеться за годину.\n🗓 Початок: *{{2}}*\n\n"
              "Склад групи надійде окремо, за 30 хвилин до початку.",
        "cs": "⏰ *Lekce za hodinu*\n\n"
              "Vaše lekce „{{1}}“ začíná za hodinu.\n🗓 Začátek: *{{2}}*\n\n"
              "Seznam účastníků dorazí zvlášť, 30 minut před začátkem.",
        "de": "⏰ *Kurs in einer Stunde*\n\n"
              "Ihr Kurs „{{1}}“ beginnt in einer Stunde.\n🗓 Beginn: *{{2}}*\n\n"
              "Die Teilnehmerliste kommt separat, 30 Minuten vor Beginn.",
    }),
    "t4": WaTemplate("UTILITY", ("lesson", "names"), {
        "ru": "⏳ *Список участников*\n\n"
              "На занятие «{{1}}» записаны: {{2}}.\n\n"
              "Хорошего занятия!",
        "en": "⏳ *Class roster*\n\n"
              "Booked for the class “{{1}}”: {{2}}.\n\n"
              "Have a great session!",
        "uk": "⏳ *Список учасників*\n\n"
              "На заняття «{{1}}» записані: {{2}}.\n\n"
              "Гарного заняття!",
        "cs": "⏳ *Seznam účastníků*\n\n"
              "Na lekci „{{1}}“ jsou přihlášeni: {{2}}.\n\n"
              "Ať se lekce vydaří!",
        "de": "⏳ *Teilnehmerliste*\n\n"
              "Für den Kurs „{{1}}“ sind angemeldet: {{2}}.\n\n"
              "Viel Freude beim Unterrichten!",
    }),
    "t5": WaTemplate("UTILITY", ("lesson", "when"), {
        "ru": "🔄 *Изменение в расписании*\n\n"
              "Занятие «{{1}}» перенесено.\n🗓 Новое время: *{{2}}*\n\n"
              "Если новое время вам не подходит, скажите администратору.",
        "en": "🔄 *Schedule change*\n\n"
              "The class “{{1}}” has been moved.\n🗓 New time: *{{2}}*\n\n"
              "Tell the administrator if the new time does not work for you.",
        "uk": "🔄 *Зміна в розкладі*\n\n"
              "Заняття «{{1}}» перенесено.\n🗓 Новий час: *{{2}}*\n\n"
              "Якщо новий час вам не підходить, скажіть адміністратору.",
        "cs": "🔄 *Změna v rozvrhu*\n\n"
              "Lekce „{{1}}“ byla přesunuta.\n🗓 Nový čas: *{{2}}*\n\n"
              "Pokud vám termín nevyhovuje, dejte vědět administrátorovi.",
        "de": "🔄 *Änderung im Kursplan*\n\n"
              "Der Kurs „{{1}}“ wurde verschoben.\n🗓 Neue Zeit: *{{2}}*\n\n"
              "Sagen Sie der Verwaltung Bescheid, falls die Zeit nicht passt.",
    }),
    "t9": WaTemplate("UTILITY", ("lesson", "when"), {
        "ru": "❌ *Занятие отменено*\n\n"
              "Ваше занятие «{{1}}» отменено администратором.\n🗓 Планировалось на *{{2}}*\n\n"
              "Записанные клиенты уведомлены — приходить не нужно.",
        "en": "❌ *Class cancelled*\n\n"
              "Your class “{{1}}” was cancelled by the administrator.\n🗓 It was planned for *{{2}}*\n\n"
              "The booked clients have been notified — you do not need to come in.",
        "uk": "❌ *Заняття скасовано*\n\n"
              "Ваше заняття «{{1}}» скасував адміністратор.\n🗓 Планувалося на *{{2}}*\n\n"
              "Записаних клієнтів повідомлено — приходити не потрібно.",
        "cs": "❌ *Lekce zrušena*\n\n"
              "Vaši lekci „{{1}}“ zrušil administrátor.\n🗓 Byla plánovaná na *{{2}}*\n\n"
              "Přihlášené klienty jsme informovali — nemusíte přijít.",
        "de": "❌ *Kurs abgesagt*\n\n"
              "Ihr Kurs „{{1}}“ wurde von der Verwaltung abgesagt.\n🗓 Geplant war *{{2}}*\n\n"
              "Die gebuchten Teilnehmer sind informiert — Sie müssen nicht kommen.",
    }),
    "t7": WaTemplate("UTILITY", ("client", "lesson"), {
        "ru": "⭐ *Новый отзыв*\n\n"
              "Клиент {{1}} оценил ваше занятие «{{2}}».\n\n"
              "Посмотреть отзыв можно в карточке занятия.",
        "en": "⭐ *New review*\n\n"
              "The client {{1}} rated your class “{{2}}”.\n\n"
              "You can read the review in the class card.",
        "uk": "⭐ *Новий відгук*\n\n"
              "Клієнт {{1}} оцінив ваше заняття «{{2}}».\n\n"
              "Переглянути відгук можна в картці заняття.",
        "cs": "⭐ *Nové hodnocení*\n\n"
              "Klient {{1}} ohodnotil vaši lekci „{{2}}“.\n\n"
              "Hodnocení najdete v detailu lekce.",
        "de": "⭐ *Neue Bewertung*\n\n"
              "{{1}} hat Ihren Kurs „{{2}}“ bewertet.\n\n"
              "Die Bewertung finden Sie in der Kursansicht.",
    }),
    "t8": WaTemplate("UTILITY", ("names",), {
        "ru": "🎂 *Дни рождения клиентов*\n\n"
              "Сегодня день рождения у ваших клиентов: {{1}}.\n\n"
              "Хороший повод поздравить лично, если человек придёт на занятие.",
        "en": "🎂 *Client birthdays today*\n\n"
              "Today is the birthday of your clients: {{1}}.\n\n"
              "A good reason to say it in person if they come to class.",
        "uk": "🎂 *Дні народження клієнтів*\n\n"
              "Сьогодні день народження у ваших клієнтів: {{1}}.\n\n"
              "Гарний привід привітати особисто, якщо людина прийде на заняття.",
        "cs": "🎂 *Narozeniny klientů*\n\n"
              "Dnes mají narozeniny vaši klienti: {{1}}.\n\n"
              "Hezká příležitost popřát osobně, pokud dorazí na lekci.",
        "de": "🎂 *Geburtstage Ihrer Kundschaft*\n\n"
              "Heute haben Geburtstag: {{1}}.\n\n"
              "Eine gute Gelegenheit, persönlich zu gratulieren, wenn sie zum Kurs kommen.",
    }),
    "t6": WaTemplate("UTILITY", ("money", "period"), {
        "ru": "💰 *Выплачена зарплата*\n\n"
              "Вам выплачено *{{1}}* за период {{2}}.\n\n"
              "Расчёт по занятиям — в разделе финансов.",
        "en": "💰 *Salary paid*\n\n"
              "You were paid *{{1}}* for the period {{2}}.\n\n"
              "The per-class breakdown is in the finances section.",
        "uk": "💰 *Виплачено зарплату*\n\n"
              "Вам виплачено *{{1}}* за період {{2}}.\n\n"
              "Розрахунок за заняттями — у розділі фінансів.",
        "cs": "💰 *Mzda vyplacena*\n\n"
              "Bylo vám vyplaceno *{{1}}* za období {{2}}.\n\n"
              "Rozpis podle lekcí najdete v sekci finance.",
        "de": "💰 *Gehalt ausgezahlt*\n\n"
              "Ihnen wurden *{{1}}* für den Zeitraum {{2}} ausgezahlt.\n\n"
              "Die Abrechnung nach Kursen steht im Bereich Finanzen.",
    }),
    # ─── Администратор ────────────────────────────────────────────────────────
    "a1": WaTemplate("UTILITY", ("client", "lesson"), {
        "ru": "🌐 *Новая онлайн-запись*\n\n"
              "Клиент {{1}} записался на занятие «{{2}}» через приложение.\n\n"
              "Занятие уже стоит в журнале.",
        "en": "🌐 *New online booking*\n\n"
              "The client {{1}} signed up for the class “{{2}}” through the app.\n\n"
              "It is already in the journal.",
        "uk": "🌐 *Новий онлайн-запис*\n\n"
              "Клієнт {{1}} записався на заняття «{{2}}» через застосунок.\n\n"
              "Заняття вже є в журналі.",
        "cs": "🌐 *Nová online rezervace*\n\n"
              "Klient {{1}} se přihlásil na lekci „{{2}}“ přes aplikaci.\n\n"
              "Lekce už je v deníku.",
        "de": "🌐 *Neue Online-Buchung*\n\n"
              "{{1}} hat den Kurs „{{2}}“ über die App gebucht.\n\n"
              "Die Buchung steht bereits im Journal.",
    }),
    "a2": WaTemplate("UTILITY", ("client", "lesson"), {
        "ru": "⚠️ *Отмена менее чем за час*\n\n"
              "Клиент {{1}} отменил запись на «{{2}}» меньше чем за час до начала.\n\n"
              "Место освободилось — его ещё можно кому-то предложить.",
        "en": "⚠️ *Cancellation under an hour*\n\n"
              "The client {{1}} cancelled the booking for “{{2}}” under an hour before the start.\n\n"
              "The spot is free again and can still be offered to someone.",
        "uk": "⚠️ *Скасування менш ніж за годину*\n\n"
              "Клієнт {{1}} скасував запис на «{{2}}» менш ніж за годину до початку.\n\n"
              "Місце звільнилося — його ще можна комусь запропонувати.",
        "cs": "⚠️ *Zrušení hodinu před začátkem*\n\n"
              "Klient {{1}} zrušil rezervaci na „{{2}}“ méně než hodinu předem.\n\n"
              "Místo se uvolnilo — ještě ho můžete někomu nabídnout.",
        "de": "⚠️ *Absage unter einer Stunde*\n\n"
              "{{1}} hat die Buchung für „{{2}}“ weniger als eine Stunde vor Beginn storniert.\n\n"
              "Der Platz ist wieder frei und kann vergeben werden.",
    }),
    "a3": WaTemplate("UTILITY", ("client",), {
        "ru": "👤 *Новый клиент в системе*\n\n"
              "В базу студии добавлен клиент {{1}}.\n\n"
              "Проверьте телефон и email — без них напоминания о занятиях ему не уйдут.",
        "en": "👤 *New client added*\n\n"
              "The client {{1}} was added to the studio database.\n\n"
              "Check their phone and email — without those, reminders will not reach them.",
        "uk": "👤 *Новий клієнт у системі*\n\n"
              "До бази студії додано клієнта {{1}}.\n\n"
              "Перевірте телефон і email — без них нагадування про заняття не надійдуть.",
        "cs": "👤 *Nový klient v systému*\n\n"
              "Do databáze studia byl přidán klient {{1}}.\n\n"
              "Zkontrolujte telefon a e-mail — bez nich mu připomínky nedorazí.",
        "de": "👤 *Neue Kundin oder neuer Kunde*\n\n"
              "Zur Datenbank des Studios wurde {{1}} hinzugefügt.\n\n"
              "Prüfen Sie Telefon und E-Mail — ohne sie kommen keine Erinnerungen an.",
    }),
    "a4": WaTemplate("UTILITY", ("money", "client"), {
        "ru": "💳 *Оплата получена*\n\n"
              "Поступила оплата *{{1}}* от клиента {{2}}.\n\n"
              "Операция проведена и уже видна в финансах.",
        "en": "💳 *Payment received*\n\n"
              "A payment of *{{1}}* came in from {{2}}.\n\n"
              "The operation is recorded and already visible in finances.",
        "uk": "💳 *Оплату отримано*\n\n"
              "Надійшла оплата *{{1}}* від клієнта {{2}}.\n\n"
              "Операцію проведено, вона вже видима у фінансах.",
        "cs": "💳 *Platba přijata*\n\n"
              "Přišla platba *{{1}}* od klienta {{2}}.\n\n"
              "Operace je zaúčtovaná a vidíte ji ve financích.",
        "de": "💳 *Zahlung erhalten*\n\n"
              "Es ist eine Zahlung über *{{1}}* von {{2}} eingegangen.\n\n"
              "Der Vorgang ist erfasst und in den Finanzen sichtbar.",
    }),
    "a6": WaTemplate("UTILITY", ("client", "remaining"), {
        "ru": "⚠️ *Абонемент клиента на исходе*\n\n"
              "У клиента {{1}} осталось занятий: *{{2}}*.\n\n"
              "Хороший повод предложить продление до того, как абонемент кончится.",
        "en": "⚠️ *Client subscription running low*\n\n"
              "Classes left for {{1}}: *{{2}}*.\n\n"
              "A good moment to offer a renewal before it runs out.",
        "uk": "⚠️ *Абонемент клієнта добігає кінця*\n\n"
              "У клієнта {{1}} залишилося занять: *{{2}}*.\n\n"
              "Гарний привід запропонувати подовження, поки абонемент не скінчився.",
        "cs": "⚠️ *Klientovi dochází permanentka*\n\n"
              "Klientovi {{1}} zbývá lekcí: *{{2}}*.\n\n"
              "Dobrá chvíle nabídnout prodloužení, než permanentka skončí.",
        "de": "⚠️ *Karte geht zur Neige*\n\n"
              "Bei {{1}} sind noch *{{2}}* Einheiten übrig.\n\n"
              "Ein guter Moment, eine Verlängerung anzubieten.",
    }),
    "a7": WaTemplate("UTILITY", ("lesson", "lesson2"), {
        "ru": "🔀 *Конфликт расписания*\n\n"
              "Занятия «{{1}}» и «{{2}}» делят один общий ресурс.\n\n"
              "Одно из них нужно перенести, иначе придут обе группы.",
        "en": "🔀 *Schedule conflict*\n\n"
              "The classes “{{1}}” and “{{2}}” share the same resource.\n\n"
              "One of them has to move, or both groups will show up.",
        "uk": "🔀 *Конфлікт розкладу*\n\n"
              "Заняття «{{1}}» і «{{2}}» ділять один спільний ресурс.\n\n"
              "Одне з них треба перенести, інакше прийдуть обидві групи.",
        "cs": "🔀 *Konflikt v rozvrhu*\n\n"
              "Lekce „{{1}}“ a „{{2}}“ sdílejí stejný zdroj.\n\n"
              "Jednu z nich je potřeba přesunout, jinak dorazí obě skupiny.",
        "de": "🔀 *Konflikt im Kursplan*\n\n"
              "Die Kurse „{{1}}“ und „{{2}}“ belegen dieselbe Ressource.\n\n"
              "Einer muss verschoben werden, sonst kommen beide Gruppen.",
    }),
    "a8": WaTemplate("UTILITY", ("revenue", "lessons"), {
        "ru": "📊 *Отчёт за день*\n\n"
              "Выручка за день: *{{1}}*\nПроведено занятий: *{{2}}*\n\n"
              "Подробности — в разделе отчётов.",
        "en": "📊 *Daily report*\n\n"
              "Revenue for the day: *{{1}}*\nClasses held: *{{2}}*\n\n"
              "The details are in the reports section.",
        "uk": "📊 *Звіт за день*\n\n"
              "Виручка за день: *{{1}}*\nПроведено занять: *{{2}}*\n\n"
              "Подробиці — у розділі звітів.",
        "cs": "📊 *Denní report*\n\n"
              "Tržby za den: *{{1}}*\nProběhlo lekcí: *{{2}}*\n\n"
              "Podrobnosti najdete v reportech.",
        "de": "📊 *Tagesbericht*\n\n"
              "Umsatz des Tages: *{{1}}*\nDurchgeführte Kurse: *{{2}}*\n\n"
              "Die Details stehen im Bereich Berichte.",
    }),
    "a9": WaTemplate("UTILITY", ("staff",), {
        "ru": "🔐 *Вход с нового устройства*\n\n"
              "Выполнен вход в аккаунт {{1}} с нового устройства.\n\n"
              "Если это были не вы — смените пароль и завершите чужие сессии.",
        "en": "🔐 *New device login*\n\n"
              "The account {{1}} was accessed from a new device.\n\n"
              "If this was not you — change the password and end the other sessions.",
        "uk": "🔐 *Вхід із нового пристрою*\n\n"
              "Виконано вхід в акаунт {{1}} з нового пристрою.\n\n"
              "Якщо це були не ви — змініть пароль і завершіть чужі сесії.",
        "cs": "🔐 *Přihlášení z nového zařízení*\n\n"
              "K účtu {{1}} se někdo přihlásil z nového zařízení.\n\n"
              "Pokud jste to nebyli vy — změňte heslo a ukončete cizí relace.",
        "de": "🔐 *Anmeldung von neuem Gerät*\n\n"
              "Auf das Konto {{1}} wurde von einem neuen Gerät zugegriffen.\n\n"
              "Waren Sie das nicht — ändern Sie das Passwort und beenden Sie fremde Sitzungen.",
    }),
    "a10": WaTemplate("UTILITY", ("client", "money"), {
        "ru": "↩️ *Оформлен возврат*\n\n"
              "Клиенту {{1}} возвращено *{{2}}*.\n\n"
              "Возврат проведён в финансах — деньги уйдут тем же способом, каким платили.",
        "en": "↩️ *Refund issued*\n\n"
              "{{1}} was refunded *{{2}}*.\n\n"
              "It is recorded in finances — the money goes back the same way it came.",
        "uk": "↩️ *Оформлено повернення*\n\n"
              "Клієнту {{1}} повернуто *{{2}}*.\n\n"
              "Повернення проведено у фінансах — гроші підуть тим самим способом, яким платили.",
        "cs": "↩️ *Vrácení peněz*\n\n"
              "Klientovi {{1}} jsme vrátili *{{2}}*.\n\n"
              "Vrácení je zaúčtované — peníze půjdou stejnou cestou, jakou přišly.",
        "de": "↩️ *Rückerstattung erfasst*\n\n"
              "{{1}} wurden *{{2}}* zurückerstattet.\n\n"
              "Der Vorgang ist in den Finanzen erfasst — das Geld geht denselben Weg zurück.",
    }),
    # ─── Владелец ─────────────────────────────────────────────────────────────
    "o1": WaTemplate("UTILITY", ("revenue", "lessons"), {
        "ru": "📊 *Сводка за день*\n\n"
              "Выручка: *{{1}}*\nПроведено занятий: *{{2}}*\n\n"
              "Подробности по студии — в разделе отчётов.",
        "en": "📊 *Daily summary*\n\n"
              "Revenue: *{{1}}*\nClasses held: *{{2}}*\n\n"
              "The studio details are in the reports section.",
        "uk": "📊 *Зведення за день*\n\n"
              "Виручка: *{{1}}*\nПроведено занять: *{{2}}*\n\n"
              "Подробиці по студії — у розділі звітів.",
        "cs": "📊 *Denní přehled*\n\n"
              "Tržby: *{{1}}*\nProběhlo lekcí: *{{2}}*\n\n"
              "Podrobnosti o studiu najdete v reportech.",
        "de": "📊 *Tagesübersicht*\n\n"
              "Umsatz: *{{1}}*\nDurchgeführte Kurse: *{{2}}*\n\n"
              "Die Studio-Details stehen im Bereich Berichte.",
    }),
    "o2": WaTemplate("UTILITY", ("revenue", "lessons"), {
        "ru": "📈 *Отчёт за неделю*\n\n"
              "Выручка за неделю: *{{1}}*\nВсего занятий: *{{2}}*\n\n"
              "Подробности по студии — в разделе отчётов.",
        "en": "📈 *Weekly report*\n\n"
              "Revenue this week: *{{1}}*\nClasses in total: *{{2}}*\n\n"
              "The studio details are in the reports section.",
        "uk": "📈 *Звіт за тиждень*\n\n"
              "Виручка за тиждень: *{{1}}*\nУсього занять: *{{2}}*\n\n"
              "Подробиці по студії — у розділі звітів.",
        "cs": "📈 *Týdenní report*\n\n"
              "Tržby za týden: *{{1}}*\nLekcí celkem: *{{2}}*\n\n"
              "Podrobnosti o studiu najdete v reportech.",
        "de": "📈 *Wochenbericht*\n\n"
              "Umsatz der Woche: *{{1}}*\nKurse insgesamt: *{{2}}*\n\n"
              "Die Studio-Details stehen im Bereich Berichte.",
    }),
    "o3": WaTemplate("UTILITY", ("money", "client"), {
        "ru": "💎 *Крупный платёж*\n\n"
              "Поступила крупная оплата *{{1}}* от клиента {{2}}.\n\n"
              "Это заметно выше обычного чека — операция уже в финансах.",
        "en": "💎 *Large payment*\n\n"
              "A large payment of *{{1}}* came in from {{2}}.\n\n"
              "That is noticeably above the usual ticket — it is already in finances.",
        "uk": "💎 *Великий платіж*\n\n"
              "Надійшла велика оплата *{{1}}* від клієнта {{2}}.\n\n"
              "Це помітно вище за звичайний чек — операція вже у фінансах.",
        "cs": "💎 *Velká platba*\n\n"
              "Přišla velká platba *{{1}}* od klienta {{2}}.\n\n"
              "Je výrazně nad běžnou útratou — už je ve financích.",
        "de": "💎 *Große Zahlung*\n\n"
              "Eine große Zahlung über *{{1}}* von {{2}} ist eingegangen.\n\n"
              "Das liegt deutlich über dem üblichen Betrag — sie steht in den Finanzen.",
    }),
    "o4": WaTemplate("UTILITY", ("revenue", "avg7"), {
        "ru": "📉 *Резкое падение выручки*\n\n"
              "Сегодня: *{{1}}*\nСреднее за неделю: *{{2}}*\n\n"
              "Стоит посмотреть, что случилось с расписанием и записями.",
        "en": "📉 *Revenue drop*\n\n"
              "Today: *{{1}}*\nWeekly average: *{{2}}*\n\n"
              "Worth checking what happened to the schedule and the bookings.",
        "uk": "📉 *Різке падіння виручки*\n\n"
              "Сьогодні: *{{1}}*\nСереднє за тиждень: *{{2}}*\n\n"
              "Варто подивитися, що сталося з розкладом і записами.",
        "cs": "📉 *Prudký pokles tržeb*\n\n"
              "Dnes: *{{1}}*\nTýdenní průměr: *{{2}}*\n\n"
              "Stojí za to zkontrolovat rozvrh a rezervace.",
        "de": "📉 *Deutlicher Umsatzrückgang*\n\n"
              "Heute: *{{1}}*\nWochendurchschnitt: *{{2}}*\n\n"
              "Ein Blick auf Kursplan und Buchungen lohnt sich.",
    }),
    "o6": WaTemplate("UTILITY", ("days",), {
        "ru": "⏳ *Тариф истекает*\n\n"
              "До конца оплаченного периода осталось дней: *{{1}}*.\n\n"
              "После этого доступ к CRM закроется — продлите подписку заранее.",
        "en": "⏳ *Plan expiring soon*\n\n"
              "Days left in your paid period: *{{1}}*.\n\n"
              "After that access closes — renew the subscription in advance.",
        "uk": "⏳ *Тариф спливає*\n\n"
              "До кінця оплаченого періоду залишилося днів: *{{1}}*.\n\n"
              "Після цього доступ до CRM закриється — подовжіть підписку заздалегідь.",
        "cs": "⏳ *Tarif brzy vyprší*\n\n"
              "Do konce zaplaceného období zbývá dní: *{{1}}*.\n\n"
              "Potom se přístup do CRM uzavře — předplatné prodlužte včas.",
        "de": "⏳ *Tarif läuft bald ab*\n\n"
              "Verbleibende Tage im bezahlten Zeitraum: *{{1}}*.\n\n"
              "Danach wird der Zugang gesperrt — verlängern Sie rechtzeitig.",
    }),
    "o8": WaTemplate("UTILITY", ("goal",), {
        "ru": "🏆 *Финансовая цель достигнута*\n\n"
              "Цель «{{1}}» достигнута — поздравляем!\n\n"
              "Следующую можно поставить в разделе финансов.",
        "en": "🏆 *Financial goal reached*\n\n"
              "The goal “{{1}}” has been reached — congratulations!\n\n"
              "You can set the next one in the finances section.",
        "uk": "🏆 *Фінансову ціль досягнуто*\n\n"
              "Ціль «{{1}}» досягнуто — вітаємо!\n\n"
              "Наступну можна поставити в розділі фінансів.",
        "cs": "🏆 *Finanční cíl splněn*\n\n"
              "Cíl „{{1}}“ je splněný — gratulujeme!\n\n"
              "Další si můžete nastavit v sekci finance.",
        "de": "🏆 *Finanzziel erreicht*\n\n"
              "Das Ziel „{{1}}“ ist erreicht — herzlichen Glückwunsch!\n\n"
              "Das nächste können Sie im Bereich Finanzen setzen.",
    }),
    "o5": WaTemplate("UTILITY", ("staff",), {
        "ru": "👥 *Добавлен сотрудник*\n\n"
              "В команду студии добавлен сотрудник {{1}}.\n\n"
              "Проверьте роль доступа — от неё зависит, какие разделы он видит.",
        "en": "👥 *Staff member added*\n\n"
              "The staff member {{1}} has been added to your team.\n\n"
              "Check their access role — it decides which sections they can see.",
        "uk": "👥 *Додано співробітника*\n\n"
              "До команди студії додано співробітника {{1}}.\n\n"
              "Перевірте роль доступу — від неї залежить, які розділи він бачить.",
        "cs": "👥 *Nový člen týmu*\n\n"
              "Do týmu studia byl přidán {{1}}.\n\n"
              "Zkontrolujte přístupovou roli — určuje, které sekce uvidí.",
        "de": "👥 *Neues Teammitglied*\n\n"
              "{{1}} wurde zum Team des Studios hinzugefügt.\n\n"
              "Prüfen Sie die Zugriffsrolle — sie bestimmt die sichtbaren Bereiche.",
    }),
    "o7": WaTemplate("UTILITY", ("staff", "role"), {
        "ru": "🔑 *Изменены права доступа*\n\n"
              "У сотрудника {{1}} новая роль в системе — *{{2}}*.\n\n"
              "Если вы этого не делали — проверьте, у кого ещё есть доступ владельца.",
        "en": "🔑 *Access role changed*\n\n"
              "The staff member {{1}} now has the role *{{2}}*.\n\n"
              "If this was not you — check who else has owner access.",
        "uk": "🔑 *Змінено права доступу*\n\n"
              "У співробітника {{1}} нова роль у системі — *{{2}}*.\n\n"
              "Якщо це були не ви — перевірте, у кого ще є доступ власника.",
        "cs": "🔑 *Změna přístupových práv*\n\n"
              "Člen týmu {{1}} má nově roli *{{2}}*.\n\n"
              "Pokud jste to nebyli vy — zkontrolujte, kdo další má práva vlastníka.",
        "de": "🔑 *Zugriffsrechte geändert*\n\n"
              "{{1}} hat jetzt die Rolle *{{2}}*.\n\n"
              "Waren Sie das nicht — prüfen Sie, wer sonst Inhaberrechte hat.",
    }),
    "o9": WaTemplate("UTILITY", ("kind", "staff"), {
        "ru": "📤 *Экспорт данных*\n\n"
              "Выгружены данные: {{1}}. Инициатор — {{2}}.\n\n"
              "Если это были не вы — проверьте активные сессии и ключи доступа.",
        "en": "📤 *Data export*\n\n"
              "Data exported: {{1}}. Initiated by {{2}}.\n\n"
              "If this was not you — review active sessions and access keys.",
        "uk": "📤 *Експорт даних*\n\n"
              "Вивантажено дані: {{1}}. Ініціатор — {{2}}.\n\n"
              "Якщо це були не ви — перевірте активні сесії та ключі доступу.",
        "cs": "📤 *Export dat*\n\n"
              "Exportovaná data: {{1}}. Zadal: {{2}}.\n\n"
              "Pokud jste to nebyli vy — zkontrolujte relace a přístupové klíče.",
        "de": "📤 *Datenexport*\n\n"
              "Exportierte Daten: {{1}}. Ausgelöst von {{2}}.\n\n"
              "Waren Sie das nicht — prüfen Sie Sitzungen und Zugriffsschlüssel.",
    }),
}

assert WA_TEMPLATES.keys() == CATALOG.keys(), (
    "whatsapp_templates.WA_TEMPLATES разошёлся с notification_catalog.CATALOG — "
    "у каждого события должен быть шаблон WhatsApp, иначе канал молча не доставит"
)


def template_name(event_id: str) -> str:
    """Имя шаблона на WABA. Одно на все языки — Meta хранит версии под одним именем."""
    return f"{_NAME_PREFIX}{event_id}"


def event_from_template_name(name: str) -> str:
    """Обратное к template_name: «vlr2_c1» -> «c1». Чужое имя возвращаем как есть —
    на WABA студии могут лежать и её собственные шаблоны."""
    return name[len(_NAME_PREFIX):] if name.startswith(_NAME_PREFIX) else name


def is_our_template(name: str) -> bool:
    """Наш ли это шаблон. Нужно, чтобы сводка по шаблонам считала только их:
    на WABA лежат и собственные шаблоны студии, и версии под старым префиксом."""
    return name.startswith(_NAME_PREFIX)


def url_button(event_id: str, lang: str, studio_id: int | None) -> dict | None:
    """Кнопка «открыть раздел» под карточкой, либо None — кнопки не будет.

    Адрес и подпись общие с письмом (email_layout.section_url/section_label):
    клиента ведём во вкладку мини-приложения, команду — на страницу CRM.

    Кнопки нет, если адрес не публичный https: на localhost (дев-окружение)
    Meta заворачивает ВЕСЬ шаблон, а не только кнопку, — и студия осталась бы
    вообще без уведомления ради ссылки, по которой всё равно никто не пройдёт.
    """
    if studio_id is None:
        return None
    url = email_layout.section_url(event_id, studio_id)
    label = email_layout.section_label(event_id, lang)
    if not url or not label or not url.startswith("https://"):
        return None
    return {"type": "URL", "text": label, "url": url}


def build_payload(event_id: str, lang: str, studio_id: int | None = None) -> dict:
    """Тело POST /{waba_id}/message_templates для одного события и языка.

    studio_id нужен только кнопке: адрес раздела свой у каждой студии. Без него
    шаблон создаётся без кнопки — так работает самопроверка и любой вызов, где
    студия неизвестна.
    """
    tpl = WA_TEMPLATES[event_id]
    body: dict[str, Any] = {"type": "BODY", "text": tpl.body[lang]}
    if tpl.slots:  # шаблон без переменных примера не имеет, и пустой Meta не примет
        body["example"] = {"body_text": [tpl.example[lang]]}
    components: list[dict] = [body, {"type": "FOOTER", "text": _FOOTER[lang]}]
    button = url_button(event_id, lang, studio_id)
    if button:
        components.append({"type": "BUTTONS", "buttons": [button]})
    return {
        "name": template_name(event_id),
        "category": tpl.category,
        "language": lang,
        "components": components,
    }


def message_payload(event_id: str, context: dict, lang: str, currency: str) -> dict | None:
    """Блок `template` сообщения Cloud API, либо None — если шаблона под событие
    или язык нет (тогда вызывающий останется на свободном тексте)."""
    tpl = WA_TEMPLATES.get(event_id)
    if tpl is None or lang not in tpl.body:
        return None
    payload: dict[str, Any] = {"name": template_name(event_id), "language": {"code": lang}}
    components = build_components(event_id, context, lang, currency)
    if components:  # у шаблона без переменных components не бывает вовсе, даже пустых
        payload["components"] = components
    return payload


def build_components(event_id: str, context: dict, lang: str, currency: str) -> list[dict]:
    """Параметры для отправки: components сообщения `type: "template"`.

    Только BODY: подвал и кнопка статичны — их текст утверждён вместе с шаблоном
    и параметров не принимает. Шаблон без переменных уходит с пустым списком.
    """
    values = WA_TEMPLATES[event_id].params(context, lang, currency)
    if not values:
        return []
    return [{
        "type": "body",
        "parameters": [{"type": "text", "text": value} for value in values],
    }]


if __name__ == "__main__":
    # Самопроверка без сети: у каждого шаблона все пять языков, число параметров
    # совпадает с числом плейсхолдеров, и ни один параметр не пустой даже на
    # пустом контексте (Meta отклоняет пустые значения при отправке).
    import re

    for _eid, _tpl in WA_TEMPLATES.items():
        for _lang in WA_LANGS:
            assert _lang in _tpl.body, f"{_eid}: нет текста на {_lang}"
            _body = _tpl.body[_lang]
            _placeholders = {int(n) for n in re.findall(r"\{\{(\d+)\}\}", _body)}
            assert _placeholders == set(range(1, len(_placeholders) + 1)), (
                f"{_eid}/{_lang}: плейсхолдеры не по порядку — {sorted(_placeholders)}"
            )
            assert len(_placeholders) == len(_tpl.slots), (
                f"{_eid}/{_lang}: слотов {len(_tpl.slots)}, плейсхолдеров {len(_placeholders)}"
            )
            assert _body.startswith(f"{EVENT_EMOJI[_eid]} *"), (
                f"{_eid}/{_lang}: карточка должна начинаться с эмодзи события и жирного заголовка"
            )
            assert _body.count("*") % 2 == 0, f"{_eid}/{_lang}: непарная звёздочка жирного"
            assert len(_body) <= 1024, f"{_eid}/{_lang}: тело длиннее 1024 символов"
            assert "\n\n\n" not in _body, f"{_eid}/{_lang}: три переноса подряд"
            # Замеренное правило Meta: «Variables can't be at the start or end of
            # the template». Хвостовая точка статикой НЕ считается — «…{{2}}.»
            # отклоняется, поэтому сравниваем по тексту без пунктуации на краях.
            _stripped = _body.strip(" .!?…\n*")
            assert not _stripped.startswith("{{"), f"{_eid}/{_lang}: тело начинается с переменной"
            assert not _stripped.endswith("}}"), f"{_eid}/{_lang}: тело заканчивается переменной"

            _values = _tpl.params({}, _lang, "RUB")
            assert len(_values) == len(_placeholders), (
                f"{_eid}/{_lang}: params() вернул {len(_values)}, нужно {len(_placeholders)}"
            )
            assert all(v.strip() for v in _values), (
                f"{_eid}/{_lang}: на пустом контексте получился пустой параметр — {_values}"
            )
            assert all(v.strip() for v in _tpl.example[_lang]), f"{_eid}/{_lang}: пустой пример"
        assert len(_FOOTER[_lang]) <= 60, f"{_lang}: подвал длиннее 60 символов"

    assert resolve_lang("cs") == "cs" and resolve_lang("de-DE") == "de"
    assert resolve_lang("pl") == "en", "языка без шаблонов ведём в английский"
    assert resolve_lang(None) == "ru" and resolve_lang("") == "ru"

    assert template_name("c1") == "vlr2_c1"
    assert event_from_template_name(template_name("o3")) == "o3"
    assert event_from_template_name("чужой_шаблон") == "чужой_шаблон"
    assert is_our_template("vlr2_c1") and not is_our_template("vlr_c1")

    _payload = build_payload("c1", "cs")
    assert _payload["language"] == "cs" and _payload["components"][0]["type"] == "BODY"
    assert _payload["components"][1] == {"type": "FOOTER", "text": _FOOTER["cs"]}
    assert len(_payload["components"]) == 2, "без studio_id кнопки быть не должно"
    assert "example" not in build_payload("c6", "ru")["components"][0], "шаблон без переменных"

    # Кнопка появляется только при публичном адресе — на дев-URL её нет.
    email_layout.MINIAPP_URL = "https://app.velora.cz"
    _with_button = build_payload("c1", "de", studio_id=42)["components"][-1]
    assert _with_button["type"] == "BUTTONS"
    assert _with_button["buttons"][0]["url"] == "https://app.velora.cz/s/42?tab=my"
    assert _with_button["buttons"][0]["text"] == "Meine Buchungen"
    assert len(_with_button["buttons"][0]["text"]) <= 25

    assert build_components("c1", {"lesson_name": "Йога"}, "ru", "RUB")[0]["parameters"][0]["text"] == "Йога"
    assert build_components("c6", {}, "ru", "RUB") == []
    assert message_payload("o7", {"role": "admin"}, "de", "EUR")["components"][0]["parameters"][1] == {
        "type": "text", "text": "Administrator",
    }
    print(f"whatsapp templates self-check ok — {len(WA_TEMPLATES)} шаблонов x {len(WA_LANGS)} языков")

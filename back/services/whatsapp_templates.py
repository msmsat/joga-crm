"""Шаблоны WhatsApp для всех 38 событий каталога (services/notification_catalog).

ЗАЧЕМ. `_send_whatsapp` шлёт `type: "text"` — свободный текст, который Meta
доставляет ТОЛЬКО внутри 24-часового окна диалога. Всё, что уходит вне окна
(напоминания, подтверждения, отчёты), отклоняется — молча, `deliver()` просто
возвращает False. Единственный способ написать первым — шаблон, заранее
одобренный модерацией Meta.

ПРАВИЛА, ЗАМЕРЕННЫЕ НА ЖИВОМ API (в документации их нет):
  - тело не может состоять из одних параметров (subcode 2388047);
  - на каждую переменную нужно достаточно статичных слов, иначе
    «Params Words Ratio Exceeds Limit» (subcode 2388293) — короткое
    «Занятие отменено: {{1}}» Meta отвергает;
  - не больше двух подряд идущих переносов строки.
Отсюда щедрый статичный текст и максимум две переменные на шаблон, причём
переменные стоят в середине фразы, а не по краям.

Проверять формулировки надо не глазами, а `tests/test_whatsapp_templates.py`:
он гоняет все 38 через настоящую валидацию Meta (создать → прочитать статус →
удалить), поэтому нарушение ratio всплывает сразу, а не после выката.

Имя шаблона одно на все языки (`velora_<event_id>`), под ним Meta хранит
отдельную версию на каждый language — поэтому смена языка студии не требует
других имён.
"""
from dataclasses import dataclass
from typing import Any, Callable

from services.notification_catalog import CATALOG
from services.notifier import _fmt_amount

# Meta принимает язык как код локали; студия хранит ru/en (Studio.language).
WA_LANGS = ("ru", "en")

# Префикс имени шаблона на WABA. Меняется, если имена оказались заблокированы:
# после удаления шаблона Meta надолго запрещает переиспользовать ИМЯ («Message
# template language is being deleted»), и единственный обходной путь — новый
# префикс. Был velora_ — сожжён валидацией через создание/удаление 06.08.2026.
_NAME_PREFIX = "vlr_"


def _v(value: Any, fallback: str) -> str:
    """Непустое значение параметра: Meta отклоняет пустые строки в example и при
    отправке, а половина контекстов приходит без времени или имени."""
    text = "" if value is None else str(value).strip()
    return text or fallback


@dataclass(frozen=True)
class WaTemplate:
    category: str                                   # UTILITY | MARKETING
    body: dict[str, str]                            # lang -> текст с {{1}}, {{2}}
    example: dict[str, list[str]]                   # lang -> пример значений для модерации
    params: Callable[[dict, str, str], list[str]]   # (context, lang, currency) -> значения


def _lesson(context: dict, lang: str) -> str:
    return _v(context.get("lesson_name"), "занятие" if lang == "ru" else "class")


def _when(context: dict, lang: str) -> str:
    # Тот же формат, что в письме и в Telegram («17 августа, 12:00»): человек,
    # получивший подтверждение в WhatsApp, а напоминание на почту, не должен
    # сверять два разных написания одного времени.
    from services.notifier import when_text

    return _v(when_text(context, lang), "по расписанию" if lang == "ru" else "as scheduled")


def _client(context: dict, lang: str) -> str:
    return _v(context.get("client_name"), "клиент" if lang == "ru" else "client")


def _staff(context: dict, lang: str) -> str:
    return _v(context.get("staff_name"), "сотрудник" if lang == "ru" else "staff member")


WA_TEMPLATES: dict[str, WaTemplate] = {
    # ─── Клиент ───────────────────────────────────────────────────────────────
    "c1": WaTemplate(
        "UTILITY",
        {"ru": "Вы записаны на занятие «{{1}}». Начало: {{2}}. Ждём вас в студии!",
         "en": 'You are booked for the class "{{1}}". It starts at {{2}}. See you at the studio!'},
        {"ru": ["йога", "12 мая, 10:00"], "en": ["yoga", "May 12, 10:00"]},
        lambda c, lang, cur: [_lesson(c, lang), _when(c, lang)],
    ),
    "c2": WaTemplate(
        "UTILITY",
        {"ru": "Напоминаем о вашем занятии «{{1}}». Оно начнётся {{2}}. Пожалуйста, не опаздывайте.",
         "en": 'A reminder about your class "{{1}}". It starts {{2}}. Please arrive on time.'},
        {"ru": ["йога", "12 мая, 10:00"], "en": ["yoga", "May 12, 10:00"]},
        lambda c, lang, cur: [_lesson(c, lang), _when(c, lang)],
    ),
    "c3": WaTemplate(
        "UTILITY",
        {"ru": "К сожалению, ваше занятие «{{1}}» отменено. Время начала было {{2}}. Приносим извинения за неудобства.",
         "en": 'Unfortunately your class "{{1}}" has been cancelled. It was due to start at {{2}}. We apologize for the inconvenience.'},
        {"ru": ["йога", "12 мая, 10:00"], "en": ["yoga", "May 12, 10:00"]},
        lambda c, lang, cur: [_lesson(c, lang), _when(c, lang)],
    ),
    "c11": WaTemplate(
        "UTILITY",
        {"ru": "Занятие «{{1}}» перенесено на другое время. Новое время начала: {{2}}. Пожалуйста, обратите внимание.",
         "en": 'Your class "{{1}}" has been rescheduled. The new start time is {{2}}. Please take note.'},
        {"ru": ["йога", "13 мая, 11:00"], "en": ["yoga", "May 13, 11:00"]},
        lambda c, lang, cur: [_lesson(c, lang), _when(c, lang)],
    ),
    "c5": WaTemplate(
        "UTILITY",
        {"ru": "В вашем абонементе осталось совсем немного занятий: {{1}}. Продлите абонемент, чтобы продолжить тренировки без перерыва.",
         "en": "Your subscription is running low with only {{1}} classes left. Renew it to keep training without a break."},
        {"ru": ["2"], "en": ["2"]},
        lambda c, lang, cur: [_v(c.get("remaining"), "0")],
    ),
    "c6": WaTemplate(
        "UTILITY",
        {"ru": "Сообщаем, что абонемент клиента {{1}} закончился и больше не действует. Оформите новый, чтобы продолжить занятия в студии.",
         "en": "We are letting you know that the subscription for {{1}} has ended. Get a new one to continue attending classes."},
        {"ru": ["Анна"], "en": ["Anna"]},
        lambda c, lang, cur: [_client(c, lang)],
    ),
    "c7": WaTemplate(
        "MARKETING",
        {"ru": "Поздравляем вас с днём рождения, {{1}}! Желаем здоровья и энергии, будем рады видеть вас на занятиях.",
         "en": "Happy birthday, {{1}}! We wish you health and energy, and we would love to see you at a class."},
        {"ru": ["Анна"], "en": ["Anna"]},
        lambda c, lang, cur: [_client(c, lang)],
    ),
    "c8": WaTemplate(
        "MARKETING",
        {"ru": "Расскажите, как вам занятие «{{1}}»? Будем рады короткому отзыву — это помогает нам становиться лучше.",
         "en": 'How was your class "{{1}}"? We would love a short review, it really helps us improve.'},
        {"ru": ["йога"], "en": ["yoga"]},
        lambda c, lang, cur: [_lesson(c, lang)],
    ),
    "c12": WaTemplate(
        "UTILITY",
        {"ru": "На ваш счёт начислены бонусные баллы в количестве {{1}}. Потратить их можно на занятия и абонементы студии.",
         "en": "Bonus points have been credited to your account: {{1}}. You can spend them on classes and subscriptions."},
        {"ru": ["100"], "en": ["100"]},
        lambda c, lang, cur: [_v(c.get("amount"), "0")],
    ),
    # Кофе после занятия. Две переменные — сколько человек и их имена — стоят в
    # середине фразы, а вокруг щедрый статичный текст: иначе Meta заворачивает
    # шаблон по ratio (subcode 2388293). Мест здесь нет намеренно: третья
    # переменная с адресами упёрлась бы в тот же лимит.
    "c13": WaTemplate(
        "UTILITY",
        {"ru": "После занятия вы собирались выпить кофе вместе — вас {{1}}, а именно {{2}}. Хорошего вечера!",
         "en": "You planned to grab a coffee together after class — {{1}} of you, namely {{2}}. Have a lovely evening!"},
        {"ru": ["3", "Аня, Марина"], "en": ["3", "Anna, Marina"]},
        lambda c, lang, cur: [_v(c.get("count"), "2"), _v(c.get("names"), "—")],
    ),
    "c4": WaTemplate(
        "UTILITY",
        {"ru": "Мы получили вашу оплату на сумму {{1}}. Спасибо! Чек и детали платежа отправлены на вашу почту.",
         "en": "We have received your payment of {{1}}. Thank you! The receipt has been sent to your email."},
        {"ru": ["3 000 ₽"], "en": ["$30"]},
        lambda c, lang, cur: [_v(_fmt_amount(c.get("amount"), cur), "—")],
    ),
    "c9": WaTemplate(
        "UTILITY",
        {"ru": "Возврат средств на сумму {{1}} оформлен и поступит на ваш счёт в ближайшее время.",
         "en": "A refund of {{1}} has been issued and will reach your account shortly."},
        {"ru": ["3 000 ₽"], "en": ["$30"]},
        lambda c, lang, cur: [_v(_fmt_amount(c.get("amount"), cur), "—")],
    ),
    # ─── Тренер ───────────────────────────────────────────────────────────────
    "t1": WaTemplate(
        "UTILITY",
        {"ru": "Клиент {{1}} записался на ваше занятие «{{2}}». Состав группы можно посмотреть в журнале студии.",
         "en": 'The client {{1}} has booked your class "{{2}}". You can see the full group in the studio journal.'},
        {"ru": ["Анна", "йога"], "en": ["Anna", "yoga"]},
        lambda c, lang, cur: [_client(c, lang), _lesson(c, lang)],
    ),
    "t2": WaTemplate(
        "UTILITY",
        {"ru": "Клиент {{1}} отменил запись на занятие «{{2}}» менее чем за два часа до начала.",
         "en": 'The client {{1}} cancelled their booking for "{{2}}" less than two hours before the start.'},
        {"ru": ["Анна", "йога"], "en": ["Anna", "yoga"]},
        lambda c, lang, cur: [_client(c, lang), _lesson(c, lang)],
    ),
    "t3": WaTemplate(
        "UTILITY",
        {"ru": "Ваше занятие «{{1}}» начнётся через час, время начала {{2}}. Пожалуйста, подготовьте зал.",
         "en": 'Your class "{{1}}" starts in an hour at {{2}}. Please get the studio room ready.'},
        {"ru": ["йога", "10:00"], "en": ["yoga", "10:00"]},
        lambda c, lang, cur: [_lesson(c, lang), _when(c, lang)],
    ),
    "t4": WaTemplate(
        "UTILITY",
        {"ru": "Занятие «{{1}}» начнётся через тридцать минут. Записаны на него: {{2}} — хорошего занятия!",
         "en": 'Your class "{{1}}" starts in thirty minutes. The people booked are: {{2}} — have a great session!'},
        {"ru": ["йога", "Анна, Пётр"], "en": ["yoga", "Anna, Peter"]},
        lambda c, lang, cur: [_lesson(c, lang), _v(c.get("names"), "—")],
    ),
    "t5": WaTemplate(
        "UTILITY",
        {"ru": "В расписании изменение: занятие «{{1}}» перенесено, новое время начала {{2}} — обратите внимание.",
         "en": 'Schedule change: your class "{{1}}" has been moved, the new start time is {{2}} — please take note.'},
        {"ru": ["йога", "13 мая, 11:00"], "en": ["yoga", "May 13, 11:00"]},
        lambda c, lang, cur: [_lesson(c, lang), _when(c, lang)],
    ),
    "t9": WaTemplate(
        "UTILITY",
        {"ru": "Ваше занятие «{{1}}» отменено администратором студии. Время начала было {{2}} — расписание уже обновлено.",
         "en": 'Your class "{{1}}" has been cancelled by the studio administrator. It was due at {{2}} — the schedule is updated.'},
        {"ru": ["йога", "12 мая, 10:00"], "en": ["yoga", "May 12, 10:00"]},
        lambda c, lang, cur: [_lesson(c, lang), _when(c, lang)],
    ),
    "t7": WaTemplate(
        "UTILITY",
        {"ru": "Клиент {{1}} оставил новый отзыв о вашем занятии «{{2}}». Посмотреть его можно в карточке занятия.",
         "en": 'The client {{1}} left a new review about your class "{{2}}". You can read it in the class card.'},
        {"ru": ["Анна", "йога"], "en": ["Anna", "yoga"]},
        lambda c, lang, cur: [_client(c, lang), _lesson(c, lang)],
    ),
    "t8": WaTemplate(
        "UTILITY",
        {"ru": "Сегодня день рождения у ваших клиентов: {{1}}. Хороший повод поздравить их на занятии.",
         "en": "Today is the birthday of your clients: {{1}}. A good reason to congratulate them at class."},
        {"ru": ["Анна, Пётр"], "en": ["Anna, Peter"]},
        lambda c, lang, cur: [_v(c.get("names"), "—")],
    ),
    "t6": WaTemplate(
        "UTILITY",
        {"ru": "Вам выплачена заработная плата в размере {{1}} за отработанный период {{2}} — детали в разделе финансов.",
         "en": "Your salary of {{1}} has been paid for the period {{2}} — the breakdown is in the finances section."},
        {"ru": ["30 000 ₽", "1 — 31 мая"], "en": ["$300", "May 1 — 31"]},
        lambda c, lang, cur: [
            _v(_fmt_amount(c.get("amount"), cur), "—"),
            _v(f"{c.get('period_start') or ''} — {c.get('period_end') or ''}".strip(" —"), "—"),
        ],
    ),
    # ─── Администратор ────────────────────────────────────────────────────────
    "a1": WaTemplate(
        "UTILITY",
        {"ru": "Новая онлайн-запись: клиент {{1}} записался на занятие «{{2}}» через приложение студии.",
         "en": 'New online booking: {{1}} signed up for the class "{{2}}" through the studio app.'},
        {"ru": ["Анна", "йога"], "en": ["Anna", "yoga"]},
        lambda c, lang, cur: [_client(c, lang), _lesson(c, lang)],
    ),
    "a2": WaTemplate(
        "UTILITY",
        {"ru": "Клиент {{1}} отменил запись на занятие «{{2}}» менее чем за час до начала. Нужно среагировать.",
         "en": 'The client {{1}} cancelled the booking for "{{2}}" less than an hour before the start. Please take a look.'},
        {"ru": ["Анна", "йога"], "en": ["Anna", "yoga"]},
        lambda c, lang, cur: [_client(c, lang), _lesson(c, lang)],
    ),
    "a3": WaTemplate(
        "UTILITY",
        {"ru": "В систему студии добавлен новый клиент {{1}}. Карточка уже доступна в разделе клиентов.",
         "en": "A new client {{1}} has been added to the studio. Their profile is available in the clients section."},
        {"ru": ["Анна"], "en": ["Anna"]},
        lambda c, lang, cur: [_client(c, lang)],
    ),
    "a4": WaTemplate(
        "UTILITY",
        {"ru": "Получена оплата на сумму {{1}} от клиента {{2}}. Операция уже отражена в финансах студии.",
         "en": "A payment of {{1}} has been received from {{2}}. It is already recorded in the studio finances."},
        {"ru": ["3 000 ₽", "Анна"], "en": ["$30", "Anna"]},
        lambda c, lang, cur: [_v(_fmt_amount(c.get("amount"), cur), "—"), _client(c, lang)],
    ),
    "a6": WaTemplate(
        "UTILITY",
        {"ru": "У клиента {{1}} заканчивается абонемент, осталось занятий: {{2}}. Хороший повод предложить продление.",
         "en": "The subscription of {{1}} is running out with {{2}} classes left. A good moment to offer a renewal."},
        {"ru": ["Анна", "2"], "en": ["Anna", "2"]},
        lambda c, lang, cur: [_client(c, lang), _v(c.get("remaining"), "0")],
    ),
    "a7": WaTemplate(
        "UTILITY",
        {"ru": "Обнаружено наложение в расписании: занятия «{{1}}» и «{{2}}» делят один общий ресурс.",
         "en": 'A schedule conflict was found: the classes "{{1}}" and "{{2}}" share the same resource.'},
        {"ru": ["йога", "пилатес"], "en": ["yoga", "pilates"]},
        lambda c, lang, cur: [_lesson(c, lang), _v(c.get("second_lesson_name"), "—")],
    ),
    "a8": WaTemplate(
        "UTILITY",
        {"ru": "Отчёт студии за день готов. Выручка составила {{1}}, проведено занятий: {{2}} — подробности в отчётах.",
         "en": "The daily studio report is ready. Revenue was {{1}} and classes held: {{2}} — details are in the reports."},
        {"ru": ["30 000 ₽", "8"], "en": ["$300", "8"]},
        lambda c, lang, cur: [_v(_fmt_amount(c.get("revenue"), cur), "—"), _v(c.get("lessons"), "0")],
    ),
    "a9": WaTemplate(
        "UTILITY",
        {"ru": "Выполнен вход в аккаунт {{1}} с нового устройства. Если это были не вы, смените пароль.",
         "en": "The account {{1}} was accessed from a new device. If this was not you, please change the password."},
        {"ru": ["Анна"], "en": ["Anna"]},
        lambda c, lang, cur: [_staff(c, lang)],
    ),
    "a10": WaTemplate(
        "UTILITY",
        {"ru": "Оформлен возврат средств на сумму {{1}} клиенту {{2}}. Операция отражена в финансах студии.",
         "en": "A refund of {{1}} has been issued to {{2}}. The operation is recorded in the studio finances."},
        {"ru": ["3 000 ₽", "Анна"], "en": ["$30", "Anna"]},
        lambda c, lang, cur: [_v(_fmt_amount(c.get("amount"), cur), "—"), _client(c, lang)],
    ),
    # ─── Владелец ─────────────────────────────────────────────────────────────
    "o1": WaTemplate(
        "UTILITY",
        {"ru": "Сводка за день по вашей студии: выручка {{1}}, проведено занятий {{2}} — подробности в отчётах.",
         "en": "Daily summary for your studio: revenue was {{1}} and classes held: {{2}} — details are in the reports."},
        {"ru": ["30 000 ₽", "8"], "en": ["$300", "8"]},
        lambda c, lang, cur: [_v(_fmt_amount(c.get("revenue"), cur), "—"), _v(c.get("lessons"), "0")],
    ),
    "o2": WaTemplate(
        "UTILITY",
        {"ru": "Отчёт за неделю по вашей студии: выручка {{1}}, всего занятий {{2}} — подробности в отчётах.",
         "en": "Weekly report for your studio: revenue was {{1}} and total classes: {{2}} — details are in the reports."},
        {"ru": ["200 000 ₽", "40"], "en": ["$2000", "40"]},
        lambda c, lang, cur: [_v(_fmt_amount(c.get("revenue"), cur), "—"), _v(c.get("lessons"), "0")],
    ),
    "o3": WaTemplate(
        "UTILITY",
        {"ru": "В студию поступил крупный платёж на сумму {{1}} от клиента {{2}} — операция уже в финансах.",
         "en": "Your studio received a large payment of {{1}} from the client {{2}} — it is recorded in finances."},
        {"ru": ["30 000 ₽", "Анна"], "en": ["$300", "Anna"]},
        lambda c, lang, cur: [_v(_fmt_amount(c.get("amount"), cur), "—"), _client(c, lang)],
    ),
    "o4": WaTemplate(
        "UTILITY",
        {"ru": "Выручка студии заметно снизилась: сегодня {{1}} против среднего за неделю {{2}} — стоит посмотреть отчёты.",
         "en": "Studio revenue dropped noticeably: today it is {{1}} against a weekly average of {{2}} — worth a look."},
        {"ru": ["5 000 ₽", "30 000 ₽"], "en": ["$50", "$300"]},
        lambda c, lang, cur: [
            _v(_fmt_amount(c.get("revenue"), cur), "—"),
            _v(_fmt_amount(c.get("avg7"), cur), "—"),
        ],
    ),
    "o6": WaTemplate(
        "UTILITY",
        {"ru": "Ваш тариф истекает совсем скоро, осталось дней: {{1}}. Продлите подписку, чтобы не потерять доступ.",
         "en": "Your plan expires very soon, with {{1}} days left. Renew the subscription to keep your access."},
        {"ru": ["3"], "en": ["3"]},
        lambda c, lang, cur: [_v(c.get("days_left"), "0")],
    ),
    "o8": WaTemplate(
        "UTILITY",
        {"ru": "Поздравляем, финансовая цель «{{1}}» достигнута! Подробности доступны в разделе финансов студии.",
         "en": 'Congratulations, the financial goal "{{1}}" has been reached! Details are in the studio finances section.'},
        {"ru": ["Выручка за май"], "en": ["May revenue"]},
        lambda c, lang, cur: [_v(c.get("goal_name"), "—")],
    ),
    "o5": WaTemplate(
        "UTILITY",
        {"ru": "В команду вашей студии добавлен новый сотрудник {{1}}. Профиль доступен в разделе сотрудников.",
         "en": "A new staff member {{1}} has been added to your studio team. The profile is in the staff section."},
        {"ru": ["Пётр"], "en": ["Peter"]},
        lambda c, lang, cur: [_staff(c, lang)],
    ),
    "o7": WaTemplate(
        "UTILITY",
        {"ru": "Изменены права доступа сотрудника {{1}}, новая роль в системе — {{2}}. Проверьте настройки команды.",
         "en": "The access rights of {{1}} have changed, the new role is {{2}}. Please review the team settings."},
        {"ru": ["Пётр", "администратор"], "en": ["Peter", "administrator"]},
        lambda c, lang, cur: [_staff(c, lang), _v(c.get("role"), "—")],
    ),
    "o9": WaTemplate(
        "UTILITY",
        {"ru": "Выполнен экспорт данных студии, тип выгрузки {{1}}, инициатор {{2}} — запись есть в журнале безопасности.",
         "en": "A data export was performed for your studio, of type {{1}}, initiated by {{2}} — it is in the security log."},
        {"ru": ["клиенты", "Пётр"], "en": ["clients", "Peter"]},
        lambda c, lang, cur: [_v(c.get("kind"), "—"), _staff(c, lang)],
    ),
}

assert WA_TEMPLATES.keys() == CATALOG.keys(), (
    "whatsapp_templates.WA_TEMPLATES разошёлся с notification_catalog.CATALOG — "
    "у каждого события должен быть шаблон WhatsApp, иначе канал молча не доставит"
)


def template_name(event_id: str) -> str:
    """Имя шаблона на WABA. Одно на все языки — Meta хранит версии под одним именем."""
    return f"{_NAME_PREFIX}{event_id}"


def event_from_template_name(name: str) -> str:
    """Обратное к template_name: «vlr_c1» -> «c1». Чужое имя возвращаем как есть —
    на WABA студии могут лежать и её собственные шаблоны."""
    return name[len(_NAME_PREFIX):] if name.startswith(_NAME_PREFIX) else name


def build_payload(event_id: str, lang: str) -> dict:
    """Тело POST /{waba_id}/message_templates для одного события и языка."""
    tpl = WA_TEMPLATES[event_id]
    return {
        "name": template_name(event_id),
        "category": tpl.category,
        "language": lang,
        "components": [{
            "type": "BODY",
            "text": tpl.body[lang],
            "example": {"body_text": [tpl.example[lang]]},
        }],
    }


def message_payload(event_id: str, context: dict, lang: str, currency: str) -> dict | None:
    """Блок `template` сообщения Cloud API, либо None — если шаблона под событие
    или язык нет (тогда вызывающий останется на свободном тексте)."""
    tpl = WA_TEMPLATES.get(event_id)
    if tpl is None or lang not in tpl.body:
        return None
    return {
        "name": template_name(event_id),
        "language": {"code": lang},
        "components": build_components(event_id, context, lang, currency),
    }


def build_components(event_id: str, context: dict, lang: str, currency: str) -> list[dict]:
    """Параметры для отправки: components сообщения `type: "template"`."""
    tpl = WA_TEMPLATES[event_id]
    values = tpl.params(context, lang, currency)
    return [{
        "type": "body",
        "parameters": [{"type": "text", "text": value} for value in values],
    }]


if __name__ == "__main__":
    # Самопроверка без сети: у каждого шаблона оба языка, число параметров совпадает
    # с числом плейсхолдеров, и ни один параметр не пустой даже на пустом контексте
    # (Meta отклоняет пустые значения при отправке).
    import re

    for _eid, _tpl in WA_TEMPLATES.items():
        for _lang in WA_LANGS:
            assert _lang in _tpl.body, f"{_eid}: нет текста на {_lang}"
            _placeholders = {int(n) for n in re.findall(r"\{\{(\d+)\}\}", _tpl.body[_lang])}
            assert _placeholders == set(range(1, len(_placeholders) + 1)), (
                f"{_eid}/{_lang}: плейсхолдеры не по порядку — {sorted(_placeholders)}"
            )
            assert len(_tpl.example[_lang]) == len(_placeholders), (
                f"{_eid}/{_lang}: пример на {len(_tpl.example[_lang])} значений, "
                f"плейсхолдеров {len(_placeholders)}"
            )
            assert all(v.strip() for v in _tpl.example[_lang]), f"{_eid}/{_lang}: пустой пример"
            assert "\n\n\n" not in _tpl.body[_lang], f"{_eid}/{_lang}: три переноса подряд"
            # Замеренное правило Meta: «Variables can't be at the start or end of
            # the template». Хвостовая точка статикой НЕ считается — «…{{2}}.»
            # отклоняется, поэтому сравниваем по тексту без пунктуации на краях.
            _stripped = _tpl.body[_lang].strip(" .!?…\n")
            assert not _stripped.startswith("{{"), f"{_eid}/{_lang}: тело начинается с переменной"
            assert not _stripped.endswith("}}"), f"{_eid}/{_lang}: тело заканчивается переменной"

            _values = _tpl.params({}, _lang, "RUB")
            assert len(_values) == len(_placeholders), (
                f"{_eid}/{_lang}: params() вернул {len(_values)}, нужно {len(_placeholders)}"
            )
            assert all(v.strip() for v in _values), (
                f"{_eid}/{_lang}: на пустом контексте получился пустой параметр — {_values}"
            )

    assert template_name("c1") == "vlr_c1"
    assert event_from_template_name(template_name("o3")) == "o3"
    assert event_from_template_name("чужой_шаблон") == "чужой_шаблон"
    assert build_payload("c1", "ru")["components"][0]["type"] == "BODY"
    assert build_components("c1", {"lesson_name": "Йога"}, "ru", "RUB")[0]["parameters"][0]["text"] == "Йога"
    print(f"whatsapp templates self-check ok — {len(WA_TEMPLATES)} шаблонов x {len(WA_LANGS)} языка")

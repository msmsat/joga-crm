"""План ответа -> канонический смысл сообщения (P1.5).

Здесь и только здесь факты превращаются в слова. Правило одно: КАЖДЫЙ символ,
который человек прочтёт про время, тренера, филиал, длительность и места,
приходит из `ResponseOption` — то есть из каталога, — а формулировка вокруг
берётся по `CopyIntent` из таблицы переводов. Текста модели в этой функции нет
и взяться ему неоткуда: в плане нет ни одного поля со свободной строкой.

ЧТО РЕШАЕТ РЕНДЕРЕР: переносы строк, порядок строк в карточке, сколько
вариантов поместится, как выглядит кнопка, чем заменить кнопки там, где их нет.

ЧТО ОН НЕ РЕШАЕТ: что правда. Какие занятия подходят, какой тренер выбран,
сколько мест, в каком порядке — всё это уже решено сервером выше.

ФОРМАТЫ ЖИВУТ В ОДНОМ МЕСТЕ. «60 хв» и «13 травня, 18:30» собираются здесь, а
не в трёх отправщиках: разъехавшись, они дают один и тот же факт в двух видах.
Названия месяцев берём из `notifier._MONTHS` — второй такой таблицы в продукте
быть не должно.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from services import response_texts as T
from services.i18n import pick, resolve
from services.notifier import _MONTHS
from services.response_plan import (
    ActionKind, CopyIntent, PlanKind, ResponseAction, ResponseOption, ResponsePlan,
)

# Один и тот же смысл — одна и та же таблица. Отдельная ветка на каждый исход
# была бы четвёртым местом, где эти соответствия можно перепутать.
_COPY: dict[CopyIntent, dict] = {
    CopyIntent.SEARCH_FOUND_ONE: T.FOUND_ONE,
    CopyIntent.SEARCH_FOUND_SEVERAL: T.FOUND_SEVERAL,
    CopyIntent.SEARCH_RELAXED_PREFERENCE: T.RELAXED,
    CopyIntent.SEARCH_NO_RESULTS: T.NO_RESULTS,
    CopyIntent.CLARIFY_SERVICE: T.CLARIFY_SERVICE,
    CopyIntent.CLARIFY_TRAINER: T.CLARIFY_TRAINER,
    CopyIntent.CLARIFY_BRANCH: T.CLARIFY_BRANCH,
    CopyIntent.SERVICE_NOT_FOUND: T.SERVICE_NOT_FOUND,
    CopyIntent.TRAINER_NOT_FOUND: T.TRAINER_NOT_FOUND,
    CopyIntent.BRANCH_NOT_FOUND: T.BRANCH_NOT_FOUND,
    CopyIntent.TIMEZONE_REQUIRED: T.TIMEZONE_REQUIRED,
    CopyIntent.SEARCH_UNSUPPORTED: T.UNSUPPORTED,
    CopyIntent.SEARCH_PARSE_FAILED: T.PARSE_FAILED,
    CopyIntent.OPTION_SELECTED: T.OPTION_SELECTED,
    CopyIntent.OPTION_EXPIRED: T.OPTION_EXPIRED,
    CopyIntent.OPTION_SUPERSEDED: T.OPTION_SUPERSEDED,
    CopyIntent.OPTION_UNKNOWN: T.OPTION_UNKNOWN,
    CopyIntent.OPTION_NONE_SHOWN: T.OPTION_NONE_SHOWN,
    CopyIntent.NEED_HUMAN: T.NEED_HUMAN,
    CopyIntent.AI_UNAVAILABLE: T.AI_UNAVAILABLE,
}

_BUTTON = {
    ActionKind.SHOW_MORE: T.BUTTON_SHOW_MORE,
    ActionKind.RESET_SEARCH: T.BUTTON_RESET,
}

# Каналы, где кнопок нет вовсе: там варианты нумеруются, и человек называет
# номер словами. Смысл ответа от этого не меняется — меняется только вид.
_NO_BUTTONS = ("whatsapp", "instagram")


# ─── Форматирование фактов ───────────────────────────────────────────────────

def fmt_day(day: date, lang: str) -> str:
    """«13 мая». Года нет намеренно: разговор идёт про ближайшие дни, и год в
    каждой строке — шум."""
    return f"{day.day} {pick(_MONTHS, lang)[day.month - 1]}"


def fmt_time(when: datetime) -> str:
    """«18:30». Двадцатичетырёхчасовой формат: во всех пяти странах продукта
    расписание пишут так."""
    return when.strftime("%H:%M")


def fmt_duration(minutes: int, lang: str) -> str:
    return f"{minutes} {pick(T.MINUTES, lang)}"


def fmt_spots(free: int, lang: str) -> str:
    """«4 места» либо «мест нет». Число — из каталога, слово — из перевода.

    Форма множественного числа выбирается по языку: «4 мест» выдаёт машину, а
    ответ должен читаться так, будто его написал человек.
    """
    if free <= 0:
        return pick(T.SPOTS_NONE, lang)
    forms = pick(T.SPOTS_FORMS, lang)
    return forms[T.spots_form(free, lang)].format(n=free)


def option_lines(option: ResponseOption, lang: str, *, numbered: bool) -> str:
    """Карточка одного варианта. Две строки — время и подробности.

    Всё, что здесь подставляется, пришло из каталога: ни одного значения,
    которое сервер не прочитал бы в базе.
    """
    head = f"{fmt_day(option.local_start.date(), lang)}, {fmt_time(option.local_start)}"
    head = f"{head} · {option.service_name}"
    if numbered:
        head = f"{option.ordinal}. {head}"
    tail = [option.trainer_name, fmt_duration(option.duration_min, lang)]
    if option.branch_name:
        tail.append(option.branch_name)
    tail.append(fmt_spots(option.available_spots, lang))
    return f"{head}\n{' · '.join(t for t in tail if t)}"


# ─── Сборка сообщения ────────────────────────────────────────────────────────

def render(plan: ResponsePlan, *, lang: str, channel: str = "telegram") -> dict:
    """План -> канонический смысл исходящего сообщения (`OutboundMessage.payload`).

    Возвращает ту же форму, что уже понимает слой доставки: текст плюс, если
    есть, кнопки. Провайдерское тело собирает `services/channels` — здесь про
    Telegram и Graph не знают ничего.
    """
    lang = resolve(lang)
    numbered = channel in _NO_BUTTONS or plan.kind is PlanKind.SEARCH_RESULTS
    parts: list[str] = [_headline(plan, lang)]

    if plan.options:
        parts.append("")
        parts.append("\n\n".join(
            option_lines(o, lang, numbered=numbered) for o in plan.options))
    if plan.candidates:
        # Подписи кандидатов собрал сервер из каталога — это имена тренеров и
        # названия услуг, а не текст модели.
        parts.append("")
        parts.append("\n".join(f"{i}. {c.label}"
                               for i, c in enumerate(plan.candidates, start=1)))
    if plan.has_more and plan.total_count:
        parts.append("")
        parts.append(pick(T.MORE, lang).format(total=plan.total_count))

    payload: dict = {"text": "\n".join(parts).strip()}
    buttons = _buttons(plan, lang, channel)
    if buttons:
        payload["options"] = buttons
    return payload


def _headline(plan: ResponsePlan, lang: str) -> str:
    template = _COPY[plan.copy_intent]
    text = pick(template, lang)
    if plan.copy_intent is CopyIntent.SEARCH_RELAXED_PREFERENCE:
        # Имя тренера — из каталога через состояние поиска, не из текста модели.
        who = ", ".join(plan.relaxed) or ""
        return text.format(who=who) if who else pick(T.FOUND_SEVERAL, lang)
    return text


def _buttons(plan: ResponsePlan, lang: str, channel: str) -> list[dict]:
    """Кнопки как данные: непрозрачная ссылка плюс действие из закрытого списка.

    Ни `lesson_id`, ни `service_id` наружу не уходят — только токен, который
    без своего треда и своей студии не значит ничего.
    """
    if channel in _NO_BUTTONS:
        # Канал кнопок не показывает: варианты уже пронумерованы в тексте, и
        # человек называет номер словами. Смысл тот же.
        return []
    out: list[dict] = []
    for candidate in plan.candidates:
        out.append({"action": candidate.kind.value, "ref": candidate.ref,
                    "label": candidate.label})
    for option in plan.options:
        out.append({"action": ActionKind.VIEW_OPTION.value, "ref": option.ref,
                    "label": f"{option.ordinal}. {fmt_time(option.local_start)}"})
    for action in plan.actions:
        if action.kind in _BUTTON:
            out.append({"action": action.kind.value, "ref": None,
                        "label": pick(_BUTTON[action.kind], lang)})
    return out


if __name__ == "__main__":
    from services.response_plan import ResponsePlan as P

    option = ResponseOption(
        ref="opt_abc", ordinal=1, lesson_id=7,
        local_start=datetime(2027, 5, 13, 18, 30), service_name="Стретчинг",
        trainer_name="Валерия Ким", branch_name="Вацлавская", duration_min=60,
        available_spots=4, temporal_exact=True)

    plan = P(PlanKind.SEARCH_RESULTS, CopyIntent.SEARCH_FOUND_ONE, options=[option],
             actions=[ResponseAction(ActionKind.VIEW_OPTION, ref="opt_abc")],
             total_count=1)
    text = render(plan, lang="uk")["text"]
    assert "13 травня, 18:30" in text, text
    assert "Стретчинг" in text and "Валерия Ким" in text
    assert "60 хв" in text and "4 місця" in text
    assert "Вацлавская" in text

    # Тот же факт на другом языке — те же числа, другие слова.
    de = render(plan, lang="de")["text"]
    assert "13 Mai, 18:30" in de and "60 Min." in de and "4 Plätze" in de

    # Канал без кнопок: варианты пронумерованы, кнопок нет, смысл тот же.
    wa = render(plan, lang="ru", channel="whatsapp")
    assert "options" not in wa and wa["text"].count("1. ") == 1

    # Мест нет — это слово, а не «0 мест».
    empty = P(PlanKind.SEARCH_RESULTS, CopyIntent.SEARCH_FOUND_ONE,
              options=[ResponseOption(**{**option.__dict__, "available_spots": 0})])
    assert "мест нет" in render(empty, lang="ru")["text"]

    # Ни один исход не остался без слов.
    for intent in CopyIntent:
        assert intent in _COPY, intent
        assert pick(_COPY[intent], "cs"), intent

    print("response_render self-check ok")

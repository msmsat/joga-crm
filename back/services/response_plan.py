"""План ответа: что сервер сообщает человеку — до всякого канала и языка (P1.5).

ГЛАВНОЕ СВОЙСТВО ЭТОГО ФАЙЛА. В плане нет ни одного поля для свободного текста.
Ни `lead`, ни `intro`, ни `summary`, ни `comment` — ничего, куда модель могла бы
положить предложение. Это не запрет в промпте и не фильтр на выходе, это
отсутствие места: модели физически нечем сказать «осталось два места».

Отсюда и граница: модель ПОНИМАЕТ вопрос, сервер РЕШАЕТ и УТВЕРЖДАЕТ, канал
ГОВОРИТ. Всё, что человек прочтёт про время, тренера, филиал и места, приходит
из каталога через типизированный факт, а формулировку выбирает `copy_intent` —
тоже сервер, по исходу поиска, а не по вкусу модели.

ПОЧЕМУ НЕ ПРОВЕРКОЙ ТЕКСТА. Соблазн — пропустить ответ модели через фильтр «нет
цифр, нет времени, нет валюты». Он не работает: «занятие завтра вечером, места
ещё есть» не содержит ни одной цифры и целиком выдумано. Граница обязана быть
структурной, и она структурная.

ЧЕГО ЗДЕСЬ НЕТ. Ни модели, ни сети, ни базы: план собирается из уже полученного
исхода поиска. Это чистая функция, и её легко проверить.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Sequence

from services import catalog, information, search_state
from services.information import InfoKind, InfoOutcome, InfoResult
from services.search_resolver import EntityKind, Outcome, SearchResult

# Версия представления. Сохранённый план старого выпуска должен остаться
# читаемым, когда рендерер изменится, — поэтому число, а не «как-нибудь».
PLAN_VERSION = 1


class PlanKind(str, Enum):
    """Разные БИЗНЕС-СМЫСЛЫ ответа, а не разные формулировки."""
    SEARCH_RESULTS = "search_results"
    CLARIFICATION = "clarification"
    NO_RESULTS = "no_results"
    ENTITY_NOT_FOUND = "entity_not_found"
    UNSUPPORTED = "unsupported"
    TIMEZONE_REQUIRED = "timezone_required"
    PARSE_FAILURE = "parse_failure"
    OPTION_DETAILS = "option_details"
    OPTION_UNAVAILABLE = "option_unavailable"
    NEED_HUMAN = "need_human"
    AI_UNAVAILABLE = "ai_unavailable"
    # Справка о студии: адрес, часы, контакты, цена, перечни (P1.6).
    INFORMATION = "information"
    # Факт такого вида продукт знает, а студия его не заполнила. Отдельный вид,
    # а не NEED_HUMAN: тут владельцу есть что поправить, а человеку — что
    # услышать вместо «спросите студию».
    INFO_UNAVAILABLE = "info_unavailable"


class CopyIntent(str, Enum):
    """Что именно сказать. Выводит СЕРВЕР из исхода поиска — модель к этому
    выбору не допускается и после поиска тоже."""
    SEARCH_FOUND_ONE = "search.found_one"
    SEARCH_FOUND_SEVERAL = "search.found_several"
    SEARCH_RELAXED_PREFERENCE = "search.relaxed_preference"
    SEARCH_NO_RESULTS = "search.no_results"
    CLARIFY_SERVICE = "search.clarify_service"
    CLARIFY_TRAINER = "search.clarify_trainer"
    CLARIFY_BRANCH = "search.clarify_branch"
    SERVICE_NOT_FOUND = "search.service_not_found"
    TRAINER_NOT_FOUND = "search.trainer_not_found"
    BRANCH_NOT_FOUND = "search.branch_not_found"
    TIMEZONE_REQUIRED = "search.timezone_required"
    SEARCH_UNSUPPORTED = "search.unsupported"
    SEARCH_PARSE_FAILED = "search.parse_failed"
    OPTION_SELECTED = "option.selected"
    OPTION_EXPIRED = "option.expired"
    OPTION_SUPERSEDED = "option.superseded"
    OPTION_UNKNOWN = "option.unknown"
    OPTION_NONE_SHOWN = "option.none_shown"
    NEED_HUMAN = "need_human"
    AI_UNAVAILABLE = "ai_unavailable"
    # Справка (P1.6). Вид ответа выводится из ИСХОДА чтения канонического
    # источника — модель к этому выбору не допускается и здесь.
    INFO_LOCATION = "info.location"
    INFO_LOCATION_MANY = "info.location_many"
    INFO_BRANCHES = "info.branches"
    INFO_HOURS = "info.hours"
    INFO_OPEN_NOW = "info.open_now"
    INFO_CONTACT = "info.contact"
    INFO_SERVICES = "info.services"
    INFO_TRAINERS = "info.trainers"
    INFO_SERVICE_PRICE = "info.service_price"
    INFO_SERVICE_INFO = "info.service_info"
    INFO_NOT_CONFIGURED = "info.not_configured"


class ActionKind(str, Enum):
    """Кнопки. Закрытый список: «действие, которое написала модель» — это
    произвольный код на кнопке у человека в мессенджере."""
    VIEW_OPTION = "view_option"
    SHOW_MORE = "show_more"
    RESET_SEARCH = "reset_search"
    PICK_CANDIDATE = "pick_candidate"


@dataclass(frozen=True)
class ResponseOption:
    """Один показанный вариант — фактами, а не строками.

    Форматирование локальное и делается рендерером: одно и то же занятие
    выглядит по-разному для украинской и немецкой студии, но фактом остаётся
    одним. `lesson_id` — серверное поле; в канал и к модели оно не уходит,
    наружу едет только `ref`.
    """
    ref: str
    ordinal: int
    lesson_id: int
    local_start: datetime
    service_name: str
    trainer_name: str
    branch_name: Optional[str]
    duration_min: int
    available_spots: int
    # Момент занятия известен точно (есть снимок зоны, P1.2). False — говорить
    # «через два часа» нельзя, местное время показать можно.
    temporal_exact: bool


@dataclass(frozen=True)
class ResponseAction:
    kind: ActionKind
    # Непрозрачная ссылка на вариант либо идентификатор кандидата уточнения.
    ref: Optional[str] = None
    # Подпись, которую собрал СЕРВЕР из каталога (имя тренера, название услуги).
    # Для кнопок без подписи — None, рендерер возьмёт перевод по ActionKind.
    label: Optional[str] = None


@dataclass(frozen=True)
class ResponsePlan:
    """Ответ как СМЫСЛ. Ни телеграмного, ни инстаграмного здесь ничего нет."""
    kind: PlanKind
    copy_intent: CopyIntent
    options: list[ResponseOption] = field(default_factory=list)
    actions: list[ResponseAction] = field(default_factory=list)
    # Сколько нашлось всего и сколько показано — для «показать ещё».
    total_count: int = 0
    has_more: bool = False
    # Условия, которые сервер снял, чтобы хоть что-то нашлось. Человеку про это
    # надо сказать: иначе ответ делает вид, что «лучше у Валерии» выполнено.
    relaxed: list[str] = field(default_factory=list)
    # Что не нашлось и что не поддержано — для уточняющего ответа.
    missing_terms: list[str] = field(default_factory=list)
    # Что показать в вопросе «которая из них». Подписи собрал сервер.
    candidates: list[ResponseAction] = field(default_factory=list)
    # Справочный факт (P1.6) — ТИПИЗИРОВАННЫЙ: адрес, часы, контакты, цена,
    # перечень имён или текст владельца. Не `dict[str, Any]`: словарь принял бы
    # {"parking": "free"} из ответа модели и донёс бы его человеку, а тип
    # «парковка» в продукте не существует и появиться здесь не может.
    facts: Optional[information.Facts] = None
    plan_version: int = PLAN_VERSION

    def shown(self) -> list[tuple[str, int]]:
        """Пары «ссылка → занятие» для записи в БД. Ровно то, что человек
        увидит: шестого варианта, которого в ответе нет, не должно быть и в
        состоянии разговора."""
        return [(o.ref, o.lesson_id) for o in self.options]


_NOT_FOUND_COPY = {
    EntityKind.SERVICE: CopyIntent.SERVICE_NOT_FOUND,
    EntityKind.TRAINER: CopyIntent.TRAINER_NOT_FOUND,
    EntityKind.BRANCH: CopyIntent.BRANCH_NOT_FOUND,
}
_CLARIFY_COPY = {
    EntityKind.SERVICE: CopyIntent.CLARIFY_SERVICE,
    EntityKind.TRAINER: CopyIntent.CLARIFY_TRAINER,
    EntityKind.BRANCH: CopyIntent.CLARIFY_BRANCH,
}
_OPTION_COPY = {
    "expired": CopyIntent.OPTION_EXPIRED,
    "superseded": CopyIntent.OPTION_SUPERSEDED,
    "gone": CopyIntent.OPTION_SUPERSEDED,
    "none_shown": CopyIntent.OPTION_NONE_SHOWN,
}


def build(result: SearchResult, *, refs: Optional[Sequence[str]] = None,
          show_branch: bool = True) -> ResponsePlan:
    """Исход поиска -> план ответа. Чисто, детерминированно, без базы и модели.

    `refs` — заранее выданные непрозрачные ссылки (по одной на показанный
    вариант). Их генерирует вызывающий, потому что записывать их он будет той
    же транзакцией, что и само сообщение.
    """
    if result.outcome is Outcome.PARSE_FAILED:
        return ResponsePlan(PlanKind.PARSE_FAILURE, CopyIntent.SEARCH_PARSE_FAILED)

    if result.outcome is Outcome.TIMEZONE_UNVERIFIED:
        return ResponsePlan(PlanKind.TIMEZONE_REQUIRED, CopyIntent.TIMEZONE_REQUIRED)

    if result.outcome is Outcome.UNSUPPORTED_CONSTRAINT:
        # Причину показываем словами человека — это его же фраза, не выдумка.
        return ResponsePlan(PlanKind.UNSUPPORTED, CopyIntent.SEARCH_UNSUPPORTED,
                            missing_terms=list(result.unsupported))

    if result.outcome is Outcome.AMBIGUOUS:
        first = result.ambiguities[0]
        return ResponsePlan(
            PlanKind.CLARIFICATION, _CLARIFY_COPY[first.kind],
            missing_terms=[first.term],
            candidates=[ResponseAction(ActionKind.PICK_CANDIDATE,
                                       ref=f"{first.kind.value}:{c.id}", label=c.label)
                        for c in first.candidates],
        )

    if result.outcome is Outcome.NOT_FOUND:
        kind = result.not_found[0].kind if result.not_found else EntityKind.SERVICE
        return ResponsePlan(PlanKind.ENTITY_NOT_FOUND, _NOT_FOUND_COPY[kind],
                            missing_terms=[n.term for n in result.not_found])

    if result.outcome is Outcome.SELECTION_NOT_AVAILABLE:
        return ResponsePlan(
            PlanKind.OPTION_UNAVAILABLE,
            _OPTION_COPY.get(result.selection_reason or "", CopyIntent.OPTION_UNKNOWN),
            actions=[ResponseAction(ActionKind.RESET_SEARCH)],
        )

    if result.outcome is Outcome.SELECTION:
        facts = result.selected
        option = _option(facts, 1, (refs or search_state.new_tokens(1))[0], show_branch)
        return ResponsePlan(PlanKind.OPTION_DETAILS, CopyIntent.OPTION_SELECTED,
                            options=[option], total_count=1)

    if result.outcome is Outcome.NO_RESULTS:
        # Причину («всё занято», «тренер занят») не выдумываем: сервер её не
        # знает, а догадка здесь читается как факт.
        return ResponsePlan(PlanKind.NO_RESULTS, CopyIntent.SEARCH_NO_RESULTS,
                            relaxed=list(result.relaxed),
                            actions=[ResponseAction(ActionKind.RESET_SEARCH)])

    tokens = list(refs or search_state.new_tokens(len(result.lessons)))
    options = [_option(f, i, tokens[i - 1], show_branch)
               for i, f in enumerate(result.lessons, start=1)]
    if result.relaxed:
        copy = CopyIntent.SEARCH_RELAXED_PREFERENCE
    elif len(options) == 1:
        copy = CopyIntent.SEARCH_FOUND_ONE
    else:
        copy = CopyIntent.SEARCH_FOUND_SEVERAL
    actions = [ResponseAction(ActionKind.VIEW_OPTION, ref=o.ref) for o in options]
    if result.has_more:
        actions.append(ResponseAction(ActionKind.SHOW_MORE))
    return ResponsePlan(
        PlanKind.SEARCH_RESULTS, copy, options=options, actions=actions,
        total_count=result.total_matched, has_more=result.has_more,
        relaxed=list(result.relaxed),
    )


def _option(facts: catalog.LessonFacts, ordinal: int, ref: str,
            show_branch: bool) -> ResponseOption:
    """Факт каталога -> вариант ответа. Ни одного нового поля не появляется."""
    return ResponseOption(
        ref=ref, ordinal=ordinal, lesson_id=facts.lesson_id,
        local_start=facts.local_start,
        # Название — то, что видит клиент в расписании (снимок услуги на момент
        # создания), ровно как в мини-приложении.
        service_name=facts.display_name,
        trainer_name=facts.trainer_name,
        branch_name=facts.branch_name if show_branch else None,
        duration_min=facts.duration_min,
        available_spots=facts.available_spots,
        temporal_exact=facts.temporal_exact,
    )


def needs_branch(lessons: Sequence[catalog.LessonFacts]) -> bool:
    """Показывать ли филиал.

    Показываем, когда в ответе он не один: человек может приехать не туда, и
    «19:00 Стретчинг» без адреса — это ошибка, а не краткость. Один и тот же
    филиал у всех вариантов повторять в каждой строке незачем.
    """
    seen = {f.branch_id for f in lessons}
    return len(seen) > 1


def informational(kind: PlanKind, copy: CopyIntent) -> ResponsePlan:
    """План без вариантов: справка о студии, передача человеку, отказ ИИ."""
    return ResponsePlan(kind, copy)


# ─── Справка (P1.6) ──────────────────────────────────────────────────────────

_INFO_COPY = {
    InfoKind.BRANCHES: CopyIntent.INFO_BRANCHES,
    InfoKind.HOURS: CopyIntent.INFO_HOURS,
    InfoKind.OPEN_NOW: CopyIntent.INFO_OPEN_NOW,
    InfoKind.CONTACT: CopyIntent.INFO_CONTACT,
    InfoKind.SERVICES: CopyIntent.INFO_SERVICES,
    InfoKind.TRAINERS: CopyIntent.INFO_TRAINERS,
    InfoKind.SERVICE_PRICE: CopyIntent.INFO_SERVICE_PRICE,
    InfoKind.SERVICE_INFO: CopyIntent.INFO_SERVICE_INFO,
}


def build_info(result: InfoResult) -> ResponsePlan:
    """Исход справки -> план ответа. Тоже чисто: ни базы, ни модели.

    КНОПОК ЗДЕСЬ НЕТ НИ ОДНОЙ, и это осознанно. Нажатие на inline-кнопку
    приходит в Telegram отдельным обновлением `callback_query`, а входящего
    обработчика для него в продукте ещё нет (проверено поиском: `callback_query`
    не встречается нигде). Кнопка, которая ничего не делает, — обещание
    интерфейса, которого система не исполняет; уточнения печатаем списком, и
    человек отвечает словом.
    """
    kind, outcome = result.kind, result.outcome

    if outcome is InfoOutcome.PARSE_FAILED:
        return ResponsePlan(PlanKind.PARSE_FAILURE, CopyIntent.SEARCH_PARSE_FAILED)

    if outcome is InfoOutcome.TIMEZONE_UNVERIFIED:
        return ResponsePlan(PlanKind.TIMEZONE_REQUIRED, CopyIntent.TIMEZONE_REQUIRED)

    if outcome is InfoOutcome.AMBIGUOUS:
        found = result.ambiguity
        return ResponsePlan(
            PlanKind.CLARIFICATION, _CLARIFY_COPY[found.kind],
            missing_terms=[found.term] if found.term else [],
            facts=information.NameListFacts(tuple(c.label for c in found.candidates)),
        )

    if outcome is InfoOutcome.NOT_FOUND:
        entity = EntityKind.BRANCH if kind in (InfoKind.LOCATION, InfoKind.BRANCHES,
                                               InfoKind.HOURS, InfoKind.OPEN_NOW) \
            else EntityKind.SERVICE
        return ResponsePlan(PlanKind.ENTITY_NOT_FOUND, _NOT_FOUND_COPY[entity],
                            missing_terms=list(result.missing))

    if outcome is InfoOutcome.UNSUPPORTED:
        # Продукт такого факта не знает. Ни общих знаний, ни догадок — только
        # честное «спросите студию» и, если известно, как именно.
        return ResponsePlan(PlanKind.NEED_HUMAN, CopyIntent.NEED_HUMAN,
                            facts=_contact_or_none(result))

    if outcome is InfoOutcome.NOT_CONFIGURED:
        return ResponsePlan(PlanKind.INFO_UNAVAILABLE, CopyIntent.INFO_NOT_CONFIGURED,
                            facts=_contact_or_none(result))

    copy = _INFO_COPY.get(kind)
    if copy is None:                       # LOCATION: один адрес или несколько
        places = result.facts.places if isinstance(result.facts, information.LocationFacts) else ()
        copy = CopyIntent.INFO_LOCATION if len(places) <= 1 else CopyIntent.INFO_LOCATION_MANY
    return ResponsePlan(PlanKind.INFORMATION, copy, facts=result.facts)


def _contact_or_none(result: InfoResult):
    return result.contact if (result.contact and result.contact.known()) else None

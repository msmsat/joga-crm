"""Серверное разрешение поиска занятий: слова -> идентификаторы и даты (P1.4/P1.5).

    сообщение человека
      -> модель: НАМЕРЕНИЕ (services/search_intent), дословные куски текста
      -> ПРОИСХОЖДЕНИЕ: сказал ли человек это на самом деле
      -> РАЗРЕШЕНИЕ ЗДЕСЬ: текст -> id, «завтра» -> дата, «вечером» -> часы
      -> слияние с условиями разговора (services/search_state)
      -> catalog.LessonQuery -> catalog.lessons()
      -> детерминированный результат

Модель интерпретирует НАМЕРЕНИЕ. Сервер определяет ФАКТЫ. Ни одной строчки
здесь модель не пишет: студия берётся из контекста разговора, идентификаторы —
из справочников каталога, даты — из календаря студии, порядок — из правила ниже.

ДВА РАЗНЫХ ВОПРОСА. Проверка происхождения отвечает только на «человек
действительно это назвал?». На «какая это сущность в базе?» она не отвечает
вовсе — на него отвечает разрешение по каталогу, и оно по-прежнему вправе
сказать «таких двое» или «такой нет».

ЧЕГО ЗДЕСЬ НЕТ. Сети — никакой: база и только база. Своих запросов к расписанию
— тоже: занятия отдаёт `services/catalog`, второй SQL про то же самое разъехался
бы с витриной (за это и был весь P1.3).

ОДНО «СЕЙЧАС». `reference_now` снимается ОДИН раз на весь разбор. Вопрос в
23:59:59 «что завтра» не должен посреди резолва переехать на сутки оттого, что
`today()` позвали второй раз уже после полуночи.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from enum import Enum
from types import SimpleNamespace
from typing import NamedTuple, Optional, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from services import catalog, search_state, studio_time
from services.booking_rules import is_bookable, load_rules
from services.search_intent import (
    CalendarDate, Daypart, DateIntent, Importance, Mention, UserSearchIntent,
)
from services.search_state import CanonicalState

logger = logging.getLogger(__name__)

UTC = timezone.utc

# Сколько занятий уезжает наверх за раз. Не «сколько нашлось»: полное число едет
# отдельным полем, а страница листается тем же детерминированным порядком.
MAX_RESULTS = search_state.PAGE_SIZE

# Насколько далеко вперёд смотрит поиск, когда человек не назвал период вовсе.
DEFAULT_HORIZON_DAYS = 14
# Жёсткий предел диапазона. Модель на него влиять не может — ни полем, ни
# намерением.
MAX_RANGE_DAYS = 92

# Части дня. В продукте их не было — это ПЕРВОЕ определение, и оно осознанно
# грубое: рабочий день виджета по умолчанию 09:00–21:00, граница в 17:00
# отделяет «после работы». Меняется здесь, одним местом на весь продукт.
DAYPARTS: dict[Daypart, tuple[time, time]] = {
    Daypart.MORNING: (time(6, 0), time(12, 0)),
    Daypart.AFTERNOON: (time(12, 0), time(17, 0)),
    Daypart.EVENING: (time(17, 0), time(23, 59)),
}

# Слова исключения. Схема отрицание выразить не умеет, и молча выбросить «не» —
# худшее, что можно сделать: человек просил НЕ Валерию, а получил именно её.
_NEGATIONS = ("не", "нi", "ні", "кроме", "крім", "окрім", "без", "not", "except", "without")
_WORD = re.compile(r"[^\W_]+", re.UNICODE)


class Outcome(str, Enum):
    OK = "OK"
    NO_RESULTS = "NO_RESULTS"
    AMBIGUOUS = "AMBIGUOUS"
    NOT_FOUND = "NOT_FOUND"
    UNSUPPORTED_CONSTRAINT = "UNSUPPORTED_CONSTRAINT"
    TIMEZONE_UNVERIFIED = "TIMEZONE_UNVERIFIED"
    PARSE_FAILED = "PARSE_FAILED"
    # Человек выбрал вариант из показанного списка.
    SELECTION = "SELECTION"
    # …но выбрать нечего: список устарел, сменился или такого номера не было.
    SELECTION_NOT_AVAILABLE = "SELECTION_NOT_AVAILABLE"


class EntityKind(str, Enum):
    SERVICE = "service"
    TRAINER = "trainer"
    BRANCH = "branch"


class Candidate(NamedTuple):
    """Вариант для уточняющего вопроса. `label` собирает сервер — он же знает,
    чем два тёзки различаются."""
    id: int
    label: str


class Ambiguity(NamedTuple):
    kind: EntityKind
    term: str
    candidates: list[Candidate]


class NotFound(NamedTuple):
    kind: EntityKind
    term: str


@dataclass(frozen=True)
class SearchResult:
    """Ответ поиска. Никаких обещаний — только факты на момент чтения."""
    outcome: Outcome
    # Что реально было исполнено. None — до каталога не дошли.
    query: Optional[catalog.LessonQuery] = None
    lessons: list[catalog.LessonFacts] = field(default_factory=list)
    # Сколько подошло ВСЕГО (до обрезки до страницы).
    total_matched: int = 0
    page: int = 0
    has_more: bool = False
    ambiguities: list[Ambiguity] = field(default_factory=list)
    not_found: list[NotFound] = field(default_factory=list)
    unsupported: list[str] = field(default_factory=list)
    # Какие НЕобязательные условия пришлось снять, чтобы хоть что-то нашлось.
    # Обязательные не снимаются никогда.
    relaxed: list[str] = field(default_factory=list)
    # Условия разговора после этого хода — их и сохраняет вызывающий.
    state: Optional[CanonicalState] = None
    # Новый список вариантов: старые ссылки после этого недействительны.
    new_search: bool = False
    # Для SELECTION: выбранное занятие, перечитанное из каталога СЕЙЧАС.
    selected: Optional[catalog.LessonFacts] = None
    selection_reason: Optional[str] = None
    reference_now: Optional[datetime] = None


# ─── Нормализация ────────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    """Строка к сравнимому виду: регистр, юникод, пунктуация, пробелы.

    Что делаем: NFKC (одна и та же буква одним кодом), casefold (сильнее
    lower() — важно для немецкого ß), ё -> е, пунктуацию в пробел, пробелы
    схлопываем.

    Чего НЕ делаем: стемминга, перевода и словарей синонимов. Всё это меняет
    слово человека на другое, а именно этого нельзя ни при проверке
    происхождения, ни при разрешении сущности.
    """
    folded = unicodedata.normalize("NFKC", text or "").casefold().replace("ё", "е")
    return " ".join(_WORD.findall(folded))


def _words(text: str) -> list[str]:
    return normalize(text).split()


# ─── Происхождение условия ───────────────────────────────────────────────────

def check_provenance(user_text: str, intent: UserSearchIntent) -> list[str]:
    """Какие упоминания человек НЕ произносил. Пусто — всё доказано.

    Модель обязана присылать дословный кусок сообщения. Сравниваем после
    безопасной нормализации (регистр, юникод, пунктуация, пробелы) — и только
    после неё: «Валерии,» и «валерии» это одно слово, а «пилатес» вместо «йоги»
    — не одно.

    Проверка отвечает ровно на один вопрос: человек это назвал? Чем названное
    окажется в базе — не её дело: там по-прежнему бывают «таких двое» и
    «такой нет».
    """
    haystack = normalize(user_text)
    bad: list[str] = []
    # Контакт (P2) проверяется здесь же и по тому же правилу: «мой email
    # такой-то» обязано быть сказано человеком, иначе код улетит по адресу,
    # который придумала модель.
    named = [intent.contact] if intent.contact is not None else []
    for mention in (*intent.service_mentions, *intent.trainer_mentions,
                    *intent.branch_mentions, *named):
        surface = normalize(mention.surface)
        if not surface or surface not in haystack:
            bad.append(mention.surface)
    return bad


def _hit(haystack: str, query_words: Sequence[str], *, stem: bool = False) -> bool:
    """Все слова запроса нашлись в строке кандидата.

    Порядок не важен: «Валерия Ким» и «Ким Валерия» — один человек. `stem`
    режет слова запроса до трёх букв и включается ТОЛЬКО когда точный проход не
    нашёл никого: так «стретчнг» доходит до «стретчинга», но «Валерия Ким» не
    тянет за собой всех Валерий студии. Правило и его границы — те же, что уже
    работают на поиске сотрудников в ai_tools (`_by_name`).
    """
    words = [w[:3] if stem else w for w in query_words]
    return bool(words) and all(word in haystack for word in words)


def _match(term: str, haystacks: dict[int, str]) -> list[int]:
    """Идентификаторы кандидатов под слово человека. Пусто — не нашли."""
    words = _words(term)
    if not words:
        return []
    exact = [key for key, text in haystacks.items() if _hit(text, words)]
    return exact or [key for key, text in haystacks.items() if _hit(text, words, stem=True)]


# ─── Разрешение сущностей ────────────────────────────────────────────────────

class _Resolved(NamedTuple):
    required_ids: list[int]
    preferred_ids: list[int]
    ambiguities: list[Ambiguity]
    not_found: list[NotFound]
    # Слова, которые действительно стали пожеланиями. Ненайденное пожелание
    # сюда не попадает: снять можно только то, что было применено.
    applied: list[str]
    # Было ли о сущностях этого вида сказано в ЭТОМ ходе.
    touched: bool


def _resolve_mentions(kind: EntityKind, items: Sequence[Mention],
                      haystacks: dict[int, str], labels: dict[int, str]) -> _Resolved:
    """Слова одного вида -> идентификаторы.

    Несколько слов одного вида — это ИЛИ: «пилатес или стретчинг» значит
    занятие по любому из двух, а не занятие, которое одновременно и то и другое
    (такого не бывает, у занятия одна услуга).

    Под одно слово подошло несколько сущностей — это НЕ повод выбрать первую.
    Две услуги с одним названием различаются длительностью и ценой, две Валерии
    — это два разных человека; выбрав за человека, мы приведём его не туда, и
    узнает он об этом у двери. Возвращаем неоднозначность.
    """
    required: list[int] = []
    preferred: list[int] = []
    applied: list[str] = []
    ambiguities: list[Ambiguity] = []
    missing: list[NotFound] = []
    for mention in items:
        found = _match(mention.surface, haystacks)
        if not found:
            missing.append(NotFound(kind, mention.surface))
        elif len(found) > 1:
            ambiguities.append(Ambiguity(
                kind, mention.surface,
                [Candidate(i, labels[i]) for i in sorted(found)[:5]],
            ))
        elif mention.importance is Importance.REQUIRED:
            required.append(found[0])
        else:
            preferred.append(found[0])
            applied.append(mention.surface)
    return _Resolved(required, preferred, ambiguities, missing, applied, bool(items))


def _service_haystacks(rows: Sequence[catalog.ServiceRef]) -> tuple[dict, dict]:
    hay = {s.id: normalize(f"{s.name} {s.category or ''}") for s in rows}
    labels = {s.id: f"{s.name}, {s.duration_min} мин" for s in rows}
    return hay, labels


def _trainer_haystacks(rows: Sequence[catalog.TrainerRef]) -> tuple[dict, dict]:
    return ({t.id: normalize(t.name) for t in rows}, {t.id: t.name for t in rows})


def _branch_haystacks(rows: Sequence[catalog.BranchRef]) -> tuple[dict, dict]:
    # Город и адрес — реальные поля филиала, по ним человек его и называет
    # («в Праге», «на Вацлавской»). Ничего геопоискового здесь нет и не будет.
    hay = {b.id: normalize(f"{b.name} {b.city or ''} {b.address or ''}") for b in rows}
    labels = {b.id: ", ".join(p for p in (b.name, b.city) if p) for b in rows}
    return hay, labels


# ─── Разрешение времени ──────────────────────────────────────────────────────

def _year_for(day: int, month: int, today: date) -> Optional[date]:
    """Год для даты, названной без года: БЛИЖАЙШАЯ БУДУЩАЯ.

    «29 августа», сказанное 30 августа, означает следующий год, а не вчера:
    записаться в прошлое нельзя, и переспрашивать про год того, кто назвал день
    и месяц, — грубость. 29 февраля в невисокосном году не существует — идём
    дальше по годам, а не подменяем датой.
    """
    for year in range(today.year, today.year + 5):
        try:
            candidate = date(year, month, day)
        except ValueError:
            continue
        if candidate >= today:
            return candidate
    return None


def _explicit(part: Optional[CalendarDate], today: date) -> Optional[date]:
    if part is None:
        return None
    if part.year is not None:
        try:
            return date(part.year, part.month, part.day)
        except ValueError:
            return None
    return _year_for(part.day, part.month, today)


def _bounds(intent: UserSearchIntent, today: date) -> Optional[tuple[date, date]]:
    """Намерение о датах -> местные календарные границы студии. None — дату
    назвали, но её не существует (31 февраля)."""
    if intent.date is DateIntent.TODAY:
        return today, today
    if intent.date is DateIntent.TOMORROW:
        return today + timedelta(days=1), today + timedelta(days=1)
    if intent.date is DateIntent.THIS_WEEK:
        monday = today - timedelta(days=today.weekday())
        # Прошедшие дни недели не показываем: «что на этой неделе» в пятницу
        # означает пятницу и выходные, а не понедельник.
        return max(monday, today), monday + timedelta(days=6)
    if intent.date is DateIntent.NEXT_WEEK:
        monday = today - timedelta(days=today.weekday()) + timedelta(days=7)
        return monday, monday + timedelta(days=6)
    if intent.date is DateIntent.WEEKEND:
        saturday = today + timedelta(days=(5 - today.weekday()) % 7)
        return saturday, saturday + timedelta(days=1)
    if intent.date in (DateIntent.ON, DateIntent.BETWEEN):
        start = _explicit(intent.date_from, today)
        if start is None:
            return None
        if intent.date is DateIntent.ON:
            return start, start
        end = _explicit(intent.date_to, today)
        if end is None or end < start:
            return None
        return start, end
    # ANY либо период не назван — ближайшие дни, начиная с сегодня.
    return today, today + timedelta(days=DEFAULT_HORIZON_DAYS)


def _needs_clock(intent: UserSearchIntent, previous: Optional[CanonicalState]) -> bool:
    """Нужны ли для ответа ЧАСЫ студии.

    Две причины, и обе настоящие:
      * относительный период («сегодня», «на выходных», дата без года) нельзя
        посчитать, не зная, какое у студии число;
      * ответ про время суток человек читает как «когда мне прийти», и без зоны
        мы не отличим уже начавшееся занятие от предстоящего (P1.2:
        `has_started` возвращает None) — предложить прошедшее хуже, чем
        признаться, что часы студии не настроены.

    Полностью названная дата с годом и без времени суток часам не требует:
    стенное время занятия сравнивается со стенной датой напрямую.
    """
    if intent.only_bookable:
        return True
    if intent.daypart is not None or intent.time_from is not None or intent.time_to is not None:
        return True
    if intent.date is None:
        # Про период сейчас не говорили: если он уже посчитан — часы не нужны.
        return previous is None or previous.date_from is None
    if intent.date not in (DateIntent.ON, DateIntent.BETWEEN):
        return True
    if intent.date_from is not None and intent.date_from.year is None:
        return True
    if intent.date is DateIntent.BETWEEN and (
            intent.date_to is None or intent.date_to.year is None):
        return True
    return False


def negation_near(text: str, intent: UserSearchIntent) -> list[str]:
    """Исключения, которые модель не отметила сама.

    Пояс поверх подтяжек: главная защита — поле `unsupported`, куда модель
    обязана положить «не у Валерии». Но цена промаха здесь несимметрична —
    выброшенное «не» переворачивает ответ, — поэтому сервер ещё раз смотрит
    исходный текст сам.

    Ищем узко: слово-исключение НЕПОСРЕДСТВЕННО перед тем, что модель приняла за
    условие (или перед частью дня). «Не знаю, что есть завтра» так не
    срабатывает — за «не» не идёт ни одного условия; «не у Валерии» и «кроме
    утра» срабатывают.
    """
    words = _words(text)
    if not words:
        return []
    targets = {w for m in (*intent.service_mentions, *intent.trainer_mentions,
                           *intent.branch_mentions) for w in _words(m.surface)}
    targets |= {"утра", "утром", "утро", "вечера", "вечером", "вечер",
                "дня", "днем", "ранку", "вранці", "ввечері"}
    hits: list[str] = []
    for i, word in enumerate(words):
        if word not in _NEGATIONS:
            continue
        # Предлог между словами допустим: «не У Валерии». Сравниваем началами
        # слов — падежное окончание не должно пропускать отрицание мимо.
        window = words[i + 1:i + 3]
        if any(w[:4] == t[:4] for w in window for t in targets):
            hits.append(" ".join(words[i:i + 3]))
    return hits


# ─── Граница с моделью ───────────────────────────────────────────────────────

def parse_intent(raw) -> Optional[UserSearchIntent]:
    """Ответ модели -> намерение. None — не разобралось, и это конец пути.

    Частично разобранный ответ не исполняется НИКОГДА: лишнее поле, выдуманное
    значение перечисления, оборванный JSON — всё это значит, что мы не знаем,
    чего человек хотел. Догадываться регулярным выражением здесь нельзя: regex,
    вытащивший «Валерия» из «не Валерия», меняет смысл на противоположный.
    """
    if raw is None:
        return None
    try:
        if isinstance(raw, (str, bytes)):
            return UserSearchIntent.model_validate_json(raw)
        return UserSearchIntent.model_validate(raw)
    except Exception:
        logger.info("search_parse_failed reason=schema")
        return None


async def search(db: AsyncSession, studio_id: int, raw, *, user_text: str = "",
                 reference_now: Optional[datetime] = None,
                 previous: Optional[CanonicalState] = None,
                 thread_id: Optional[int] = None) -> SearchResult:
    """Полный путь: сырой ответ модели -> занятия.

    Модель не ответила (таймаут) или ответила мимо схемы — до базы дело не
    доходит вовсе.
    """
    intent = parse_intent(raw)
    if intent is None:
        return SearchResult(Outcome.PARSE_FAILED,
                            reference_now=reference_now or datetime.now(UTC))
    return await resolve(db, studio_id, intent, user_text=user_text,
                         reference_now=reference_now, previous=previous,
                         thread_id=thread_id)


# ─── Разбор ──────────────────────────────────────────────────────────────────

async def resolve(
    db: AsyncSession,
    studio_id: int,
    intent: UserSearchIntent,
    *,
    user_text: str = "",
    reference_now: Optional[datetime] = None,
    previous: Optional[CanonicalState] = None,
    thread_id: Optional[int] = None,
) -> SearchResult:
    """Намерение -> занятия. `studio_id` приходит из доверенного контекста
    разговора и НИКОГДА из ответа модели — в схеме такого поля нет вовсе.

    `previous` — условия разговора, уже разрешённые сервером. Намерение
    применяется к ним как ИЗМЕНЕНИЕ: незаполненное поле оставляет прежнее
    условие, и «а после 18?» не теряет ни услугу, ни тренера.
    """
    now = reference_now or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)

    # ── Происхождение: сказал ли человек то, что модель принесла условием.
    invented = check_provenance(user_text, intent)
    if invented:
        logger.info("search_provenance_rejected studio_id=%s mentions=%s",
                    studio_id, len(invented))
        return SearchResult(Outcome.PARSE_FAILED, state=previous, reference_now=now)

    unsupported = list(intent.unsupported) + negation_near(user_text, intent)
    if unsupported:
        # Не ищем вовсе: показать «вот занятия Валерии» тому, кто просил не
        # Валерию, хуже, чем сказать «так я не умею».
        return SearchResult(Outcome.UNSUPPORTED_CONSTRAINT, unsupported=unsupported,
                            state=previous, reference_now=now)

    ref = await catalog.studio(db, studio_id)
    if ref is None:
        return SearchResult(Outcome.NO_RESULTS, reference_now=now)

    # ── Выбор варианта из показанного списка: поиска нет, есть перечитывание.
    if intent.selection is not None:
        return await _select(db, studio_id, thread_id, intent.selection.ordinal,
                             now=now, previous=previous)

    if _needs_clock(intent, previous) and not ref.timezone_verified:
        # Жёсткий запрет, а не пожелание в промпте: без подтверждённой зоны
        # «завтра» и «вечером» — догадка, и никакой поиск её не исправит.
        return SearchResult(Outcome.TIMEZONE_UNVERIFIED, state=previous, reference_now=now)

    zone = SimpleNamespace(tz_iana=ref.timezone, timezone=None)
    today = studio_time.to_local(now, zone).date()
    base = CanonicalState() if (previous is None or intent.reset) else previous

    # ── Три маленьких справочника одним заходом каждый — не по запросу на слово.
    services, trainers, branches = (
        await catalog.services(db, studio_id),
        await catalog.trainers(db, studio_id),
        await catalog.branches(db, studio_id),
    )
    resolved = [
        _resolve_mentions(EntityKind.SERVICE, intent.service_mentions,
                          *_service_haystacks(services)),
        _resolve_mentions(EntityKind.TRAINER, intent.trainer_mentions,
                          *_trainer_haystacks(trainers)),
        _resolve_mentions(EntityKind.BRANCH, intent.branch_mentions,
                          *_branch_haystacks(branches)),
    ]
    ambiguities = [a for r in resolved for a in r.ambiguities]
    if ambiguities:
        # Уточняющий вопрос задаст следующий слой; выбирать за человека здесь
        # нельзя ни при каких обстоятельствах. Условия разговора при этом не
        # меняются: человек ещё ничего не уточнил.
        logger.info("search_ambiguous studio_id=%s kinds=%s", studio_id,
                    [a.kind.value for a in ambiguities])
        return SearchResult(Outcome.AMBIGUOUS, ambiguities=ambiguities,
                            not_found=[n for r in resolved for n in r.not_found],
                            state=previous, reference_now=now)
    missing = [n for r in resolved for n in r.not_found]
    if any(_is_required(intent, n) for n in missing):
        return SearchResult(Outcome.NOT_FOUND, not_found=missing, state=previous,
                            reference_now=now)

    state, bad_date = _merge(base, intent, resolved, today)
    if bad_date:
        return SearchResult(Outcome.NOT_FOUND, state=previous, reference_now=now,
                            unsupported=["дата не существует"])

    # Новый список нужен всегда, кроме «покажи ещё» — там мы листаем прежний.
    new_search = not intent.more
    if intent.more:
        state = _replace(state, page=base.page + 1)

    rules = await load_rules(db, studio_id) if state.only_bookable else None
    local_now = studio_time.to_local(now, zone).replace(tzinfo=None)

    async def run(with_preferred: bool):
        query = catalog.LessonQuery(
            studio_id=studio_id, date_from=state.date_from, date_to=state.date_to,
            service_ids=list(state.service_ids)
            + (list(state.preferred_service_ids) if with_preferred else []),
            trainer_ids=list(state.trainer_ids)
            + (list(state.preferred_trainer_ids) if with_preferred else []),
            branch_ids=list(state.branch_ids),
        )
        found = await catalog.lessons(db, query)
        return query, [f for f in found if _passes(f, state, rules, local_now)]

    preferred_ids = list(state.preferred_service_ids) + list(state.preferred_trainer_ids)
    query, found = await run(with_preferred=bool(preferred_ids))
    relaxed: list[str] = []
    if not found and preferred_ids:
        # Снимаем ТОЛЬКО пожелания и только когда с ними пусто. Обязательное не
        # снимается никогда — иначе на «стретчинг» приходит ответ про йогу.
        query, found = await run(with_preferred=False)
        relaxed = list(state.preferred_trainer_names)

    ranked = _rank(found, state)
    start = state.page * MAX_RESULTS
    if start >= len(ranked) and ranked:
        # «Покажи ещё», когда больше нечего: остаёмся на последней странице.
        state = _replace(state, page=max(0, (len(ranked) - 1) // MAX_RESULTS))
        start = state.page * MAX_RESULTS
    page = ranked[start:start + MAX_RESULTS]
    outcome = Outcome.OK if page else Outcome.NO_RESULTS
    logger.info(
        "search_done studio_id=%s outcome=%s services=%s trainers=%s branches=%s "
        "days=%s matched=%s shown=%s relaxed=%s",
        studio_id, outcome.value, len(state.service_ids), len(state.trainer_ids),
        len(state.branch_ids),
        (state.date_to - state.date_from).days + 1 if state.date_from else 0,
        len(ranked), len(page), len(relaxed),
    )
    return SearchResult(
        outcome=outcome, query=query, lessons=page, total_matched=len(ranked),
        page=state.page, has_more=start + len(page) < len(ranked),
        not_found=missing, relaxed=relaxed, state=state, new_search=new_search,
        reference_now=now,
    )


async def _select(db, studio_id: int, thread_id: Optional[int], ordinal: int, *,
                  now: datetime, previous) -> SearchResult:
    """«Второй» — из ПОСЛЕДНЕГО показанного списка, и занятие перечитывается.

    Сохранённая строка помнит только `lesson_id`; всё остальное — места, время,
    тренер — берётся из каталога СЕЙЧАС. Снимок часовой давности не может быть
    основанием ни для чего.
    """
    if thread_id is None:
        return SearchResult(Outcome.SELECTION_NOT_AVAILABLE, selection_reason="none_shown",
                            state=previous, reference_now=now)
    pick = await search_state.by_ordinal(
        db, studio_id=studio_id, thread_id=thread_id, ordinal=ordinal, now=now)
    if pick.lesson_id is None:
        logger.info("selection_unavailable studio_id=%s reason=%s", studio_id, pick.reason)
        return SearchResult(Outcome.SELECTION_NOT_AVAILABLE, selection_reason=pick.reason,
                            state=previous, reference_now=now)
    facts = await catalog.lesson(db, studio_id, pick.lesson_id)
    if facts is None:
        # Занятие отменили или удалили после показа. Это не «выбрано», а
        # «выбирать больше нечего».
        return SearchResult(Outcome.SELECTION_NOT_AVAILABLE, selection_reason="gone",
                            state=previous, reference_now=now)
    return SearchResult(Outcome.SELECTION, selected=facts, state=previous, reference_now=now)


async def select_token(db, studio_id: int, thread_id: int, token: str, *,
                       now: Optional[datetime] = None, previous=None) -> SearchResult:
    """Нажатая кнопка. Детерминированно, без модели: смысл сервер уже знает."""
    now = now or datetime.now(UTC)
    pick = await search_state.by_token(
        db, studio_id=studio_id, thread_id=thread_id, token=token, now=now)
    if pick.lesson_id is None:
        return SearchResult(Outcome.SELECTION_NOT_AVAILABLE, selection_reason=pick.reason,
                            state=previous, reference_now=now)
    facts = await catalog.lesson(db, studio_id, pick.lesson_id)
    if facts is None:
        return SearchResult(Outcome.SELECTION_NOT_AVAILABLE, selection_reason="gone",
                            state=previous, reference_now=now)
    return SearchResult(Outcome.SELECTION, selected=facts, state=previous, reference_now=now)


# ─── Слияние с условиями разговора ───────────────────────────────────────────

def _replace(state: CanonicalState, **kw) -> CanonicalState:
    return CanonicalState(**{**state.__dict__, **kw})


def _merge(base: CanonicalState, intent: UserSearchIntent,
           resolved: Sequence[_Resolved], today: date) -> tuple[CanonicalState, bool]:
    """Прежние условия + изменение = новые условия.

    Главное правило: о чём человек сейчас НЕ говорил, то не меняется. «А после
    18?» добавляет час, а не отменяет стретчинг и Валерию — молча потерянное
    обязательное условие и есть та ошибка, ради которой состояние живёт на
    сервере, а не в памяти модели.
    """
    service, trainer, branch = resolved
    values = dict(base.__dict__)
    if service.touched:
        values.update(service_ids=tuple(service.required_ids),
                      preferred_service_ids=tuple(service.preferred_ids))
    if trainer.touched:
        values.update(trainer_ids=tuple(trainer.required_ids),
                      preferred_trainer_ids=tuple(trainer.preferred_ids),
                      preferred_trainer_names=tuple(trainer.applied))
    if branch.touched:
        values.update(branch_ids=tuple(branch.required_ids))

    if intent.date is not None or base.date_from is None:
        bounds = _bounds(intent, today)
        if bounds is None:
            return base, True
        date_from, date_to = bounds
        values.update(date_from=date_from,
                      date_to=min(date_to, date_from + timedelta(days=MAX_RANGE_DAYS)))

    if intent.daypart is not None:
        low, high = (None, None) if intent.daypart is Daypart.ANY else DAYPARTS[intent.daypart]
        values.update(time_from=low, time_to=high)
    if intent.time_from is not None:
        values["time_from"] = intent.time_from
    if intent.time_to is not None:
        values["time_to"] = intent.time_to
    if intent.only_with_free_spots is not None:
        values["only_with_free_spots"] = intent.only_with_free_spots
    if intent.only_bookable is not None:
        values["only_bookable"] = intent.only_bookable
    # Любое изменение условий начинает список заново — иначе «а после 18»
    # показало бы вторую страницу нового поиска.
    values["page"] = 0
    return CanonicalState(**values), False


def _is_required(intent: UserSearchIntent, missing: NotFound) -> bool:
    """Ненайденное ПОЖЕЛАНИЕ поиску не мешает — его и так было можно снять.
    Ненайденное ОБЯЗАТЕЛЬНОЕ означает, что искать нечего."""
    by_kind = {EntityKind.SERVICE: intent.service_mentions,
               EntityKind.TRAINER: intent.trainer_mentions,
               EntityKind.BRANCH: intent.branch_mentions}
    return any(m.surface == missing.term and m.importance is Importance.REQUIRED
               for m in by_kind[missing.kind])


def _passes(facts: catalog.LessonFacts, state: CanonicalState, rules,
            local_now: datetime) -> bool:
    """Условия, которых каталог пока не принимает запросом.

    Их три, и все они по СТЕННОМУ времени занятия: «после 18» означает 18:00 на
    часах студии, а не момент в UTC. Диапазон дат каталог уже ограничил, так что
    фильтруется десяток-другой строк, а не таблица.
    """
    at = facts.local_start.time()
    if state.time_from is not None and at < state.time_from:
        return False
    if state.time_to is not None and at > state.time_to:
        return False
    if state.only_with_free_spots and facts.available_spots <= 0:
        return False
    if rules is not None:
        # Часы передаются явно: время студии, не процесса (P1.2/P1.4 §24).
        if not is_bookable(rules, SimpleNamespace(start_time=facts.local_start), local_now):
            return False
    return True


def _rank(found: Sequence[catalog.LessonFacts], state: CanonicalState) -> list[catalog.LessonFacts]:
    """Порядок задаёт СЕРВЕР и всегда один и тот же.

    Сначала попавшие в пожелание («лучше у Валерии» — её занятия выше), затем по
    времени начала, затем по идентификатору. Последнее — чтобы два занятия,
    начинающиеся в одну минуту, не менялись местами между запросами и чтобы
    вторая страница продолжала первую, а не пересобиралась.
    """
    wanted_s = set(state.preferred_service_ids)
    wanted_t = set(state.preferred_trainer_ids)

    def key(f: catalog.LessonFacts):
        matched = (f.service_id in wanted_s) + (f.trainer_id in wanted_t)
        return (-matched, f.local_start, f.lesson_id)

    return sorted(found, key=key)

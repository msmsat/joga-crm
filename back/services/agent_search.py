"""Ход ассистента по расписанию: один вызов модели и дальше только сервер (P1.5).

    сообщение -> МОДЕЛЬ (один раз, структурно) -> происхождение -> разрешение
              -> план ответа -> рендер -> строка в очереди исходящих

ОДИН ВЫЗОВ МОДЕЛИ. Второго — «а теперь напиши красивый ответ» — здесь нет и не
будет. Он стоил бы денег и задержки, но главное: он вернул бы модели право
писать про время и места, ради отнятия которого всё это и строилось. Ответ
собирает сервер из фактов каталога, и красив он композицией, а не фантазией.

ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ МОДУЛЬ. `client_agent` — прежний путь с инструментами и
свободным текстом; он остаётся для всего, что не про расписание, и продолжает
работать при выключенном флаге. Смешивать их в одном файле значило бы получить
две границы доверия в одной функции.
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from services import (
    ai_language, booking, booking_payment, catalog, identity, information, llm,
    personal, proposals, response_plan, response_render, search_intent,
    search_resolver, search_state,
)
from services.ai_usage import record_usage
from services.search_state import CanonicalState

logger = logging.getLogger(__name__)

UTC = timezone.utc

# Инструмент, которым модель отдаёт разобранное намерение. Схема собирается из
# Pydantic-модели — руками её здесь не переписываем, иначе описание и проверка
# разъедутся.
_TOOL_NAME = "search_schedule"

# Промпт короткий намеренно. Объяснять модели двести правил бизнес-истины больше
# не нужно: писать цену и число мест ей нечем — таких полей в схеме нет.
# Архитектура сильнее промпта, и промпт после P1.5 стал МЕНЬШЕ, а не больше.
_SYSTEM = (
    "Разбери сообщение клиента фитнес-студии в структуру поиска занятий.\n"
    "Заполняй ТОЛЬКО то, о чём человек сказал в ЭТОМ сообщении; остальное "
    "оставь пустым — прежние условия разговора помнит сервер.\n"
    "surface — ДОСЛОВНЫЙ кусок сообщения человека: не название услуги из "
    "каталога, не перевод, не исправленная опечатка. Не нашёл слова в "
    "сообщении — не пиши его вовсе.\n"
    "Даты не вычисляй: скажи словом (today, tomorrow, weekend...), их посчитает "
    "сервер по календарю студии.\n"
    "Отрицание («не у Валерии», «кроме утра») и всё, чего схема не выражает, "
    "клади дословно в unsupported и не пытайся выразить остальными полями.\n"
    "Спрашивают не про расписание, а про саму студию (адрес, часы, контакты, "
    "цену, перечень направлений или тренеров) — заполни info.kind и больше "
    "ничего про поиск. Ответа не пиши: факты подставит сервер. Всё, чего в "
    "info.kind нет (парковка, что взять с собой, здоровье, «подойдёт ли мне»), "
    "— это info.kind=unsupported.\n"
    "Спрашивают про СЕБЯ («мои записи», «сколько занятий осталось», «это я») "
    "— заполни personal.kind. Названный человеком email клади в contact "
    "ДОСЛОВНО. Никаких выводов о том, кто это: личность устанавливает сервер."
)

# Как считается расход этого хода в общем журнале (`ai_usage.tools`). Второго
# счётчика в продукте нет; различать пути надо, потому что справка и поиск
# стоят одинаково, а приносят разное — и «модель не разобралась» тоже надо
# уметь посчитать, иначе непонятно, за что заплачено.
ROUTE_SEARCH = "search"
ROUTE_INFO = "information"
ROUTE_NEED_HUMAN = "need_human"
ROUTE_PARSE_FAILED = "parse_failed"
ROUTE_PERSONAL = "personal"
ROUTE_BOOKING = "booking"


@dataclass(frozen=True)
class Turn:
    """Результат хода: что отправить и что запомнить.

    Отправка и память записываются ОДНОЙ транзакцией выше (agent_jobs): иначе
    возможен список вариантов, который человеку не отправили.
    """
    payload: Optional[dict] = None
    state: Optional[CanonicalState] = None
    shown: list[tuple[str, int]] = field(default_factory=list)
    new_search: bool = False
    # Для логов и телеметрии. Текста человека здесь нет.
    plan_kind: Optional[str] = None
    outcome: Optional[str] = None
    # Один момент на весь ход: по нему считаны даты и по нему же истечёт срок
    # показанных вариантов.
    reference_now: Optional[datetime] = None


def tool_schema() -> dict:
    return {
        "type": "function",
        "function": {
            "name": _TOOL_NAME,
            "description": "Разобрать сообщение клиента в структуру поиска занятий.",
            "parameters": search_intent.json_schema(),
        },
    }


async def parse(text: str, *, studio_id: int, surface: str = "telegram",
                sender_ref: Optional[str] = None,
                history: Optional[list] = None) -> Optional[dict]:
    """Единственный вызов модели за ход. None — не ответила или ответила мимо.

    Историю показываем, чтобы модель поняла «а после 18?», но условия из неё она
    восстанавливать НЕ должна: их помнит сервер. Её дело — сказать, что нового
    прозвучало сейчас.

    Расход пишется в общий журнал (`ai_usage`) — второго счётчика в продукте
    нет и не будет. Один ход = ОДНА строка: цикла инструментов здесь не бывает,
    и стоимость ответа считается умножением, а не выгрузкой. В поле `tools`
    едет не имя инструмента (оно одно на все ходы и ничего не различает), а
    ПУТЬ хода: поиск, справка, «к человеку», «не разобрались».
    """
    if not llm.is_configured():
        return None
    messages = [{"role": "system", "content": _SYSTEM}]
    for item in (history or [])[-6:]:
        messages.append({"role": item["role"], "content": item["text"]})
    messages.append({"role": "user", "content": text})
    started = time.monotonic()
    try:
        reply = await llm.chat(messages, tools=[tool_schema()], think=False)
    except Exception:
        logger.exception("search parse: модель не ответила")
        return None
    latency_ms = int((time.monotonic() - started) * 1000)
    call = next((c for c in (reply.tool_calls or []) if c.name == _TOOL_NAME), None)
    raw = None
    if call is not None:
        try:
            raw = (json.loads(call.arguments)
                   if isinstance(call.arguments, str) else call.arguments)
        except (TypeError, ValueError):
            raw = None
    if reply.usage is not None:
        await record_usage(studio_id, reply.usage, surface=surface, billable=True,
                           sender_ref=sender_ref, tools=route_of(raw), iterations=1)
    logger.info("search_parse studio_id=%s parsed=%s route=%s latency_ms=%s",
                studio_id, raw is not None, route_of(raw), latency_ms)
    return raw


def route_of(raw) -> str:
    """Каким путём пошёл ход — для журнала расхода. Текста человека здесь нет."""
    intent = search_resolver.parse_intent(raw)
    if intent is None:
        return ROUTE_PARSE_FAILED
    if intent.personal is not None:
        if intent.personal.kind in (search_intent.PersonalKind.BOOK_LESSON,
                                    search_intent.PersonalKind.CONFIRM):
            return ROUTE_BOOKING
        return ROUTE_PERSONAL
    if intent.info is None:
        return ROUTE_SEARCH
    return (ROUTE_NEED_HUMAN if intent.info.kind is search_intent.InfoKind.UNSUPPORTED
            else ROUTE_INFO)


async def turn(db, *, studio_id: int, thread_id: Optional[int], channel: str,
               text: str, raw, lang: Optional[str] = None,
               now: Optional[datetime] = None,
               identity_id: Optional[int] = None) -> Turn:
    """Сырой ответ модели -> готовое сообщение и память разговора.

    Ни строчки текста модели дальше этой функции не проходит: `raw` — только
    структура, а слова берутся из таблиц переводов по решению сервера.
    """
    now = now or datetime.now(UTC)

    # Язык ответа — тем же резолвером, что и везде в продукте: вторая копия
    # правила разошлась бы с первой.
    async def language() -> str:
        if lang is not None:
            return lang
        ref = await catalog.studio(db, studio_id)
        # `.code`, а не сам ответ: `resolve` возвращает решение ВМЕСТЕ с
        # причиной, и передать его дальше как строку значит уронить рендер на
        # первом же боевом сообщении — в тестах язык всегда задавали явно, и
        # эта ветка ни разу не исполнялась.
        return ai_language.resolve(
            [{"role": "user", "text": text}],
            studio_language=ref.language if ref else None).code

    # МАРШРУТИЗАЦИЯ РЕШАЕТСЯ ЗДЕСЬ, А НЕ МОДЕЛЬЮ. Модель лишь называет вид
    # вопроса; куда идти — справка или расписание — определяет сервер по
    # структуре разбора. Ошибись модель, худшее, что случится, — человек
    # получит уточнение или «спросите студию», но не выдуманный факт.
    intent = search_resolver.parse_intent(raw)
    if intent is not None and intent.personal is not None             and intent.personal.kind is search_intent.PersonalKind.BOOK_LESSON:
        return await _booking_turn(db, studio_id, thread_id, identity_id, channel,
                                   intent, await language(), now)
    if intent is not None and intent.personal is not None             and intent.personal.kind is search_intent.PersonalKind.CONFIRM:
        return await _confirm_turn(db, studio_id, thread_id, channel,
                                   await language(), now)
    if intent is not None and intent.personal is not None:
        return await _personal_turn(db, studio_id, identity_id, channel,
                                    intent, text, await language(), now)
    if intent is not None and intent.info is not None:
        return await _info_turn(db, studio_id, thread_id, channel,
                                intent, text, await language(), now)

    result = await search_resolver.search(
        db, studio_id, raw, user_text=text, reference_now=now,
        previous=(await search_state.load(db, thread_id, now=now)).state
        if thread_id is not None else None,
        thread_id=thread_id,
    )

    show_branch = response_plan.needs_branch(result.lessons)
    refs = search_state.new_tokens(len(result.lessons) or (1 if result.selected else 0))
    plan = response_plan.build(result, refs=refs, show_branch=show_branch)
    payload = response_render.render(plan, lang=await language(), channel=channel)

    logger.info(
        "response_plan_built studio_id=%s thread_id=%s kind=%s copy=%s "
        "options=%s outcome=%s new_search=%s",
        studio_id, thread_id, plan.kind.value, plan.copy_intent.value,
        len(plan.options), result.outcome.value, result.new_search,
    )
    # Запоминаем только то, что человек РЕАЛЬНО увидит: показанные варианты и
    # условия, по которым они найдены. Ссылка на шестой вариант, не попавший в
    # ответ, не должна существовать вовсе.
    shown = plan.shown() if plan.kind is response_plan.PlanKind.SEARCH_RESULTS else []
    return Turn(
        payload=payload, state=result.state, shown=shown,
        new_search=result.new_search and bool(shown),
        plan_kind=plan.kind.value, outcome=result.outcome.value,
        reference_now=now.replace(tzinfo=None),
    )


async def _info_turn(db, studio_id: int, thread_id, channel: str,
                     intent, text: str, lang: str, now: datetime) -> Turn:
    """Справочный ход: адрес, часы, цена, перечни — или честное «не знаю».

    СОСТОЯНИЕ ПОИСКА НЕ ТРОГАЕТСЯ ВОВСЕ. Ни применяется — вопрос «где вы
    находитесь» не должен отфильтроваться по вчерашнему «стретчинг вечером», —
    ни сбрасывается: человек, спросивший посреди подбора про адрес, не
    отказался от найденного списка и вправе следом сказать «второй». Поэтому
    `state=None` и `shown=()`: транзакция выше просто не станет их писать.
    """
    result = await information.resolve(db, studio_id, intent,
                                       user_text=text, reference_now=now)
    plan = response_plan.build_info(result)
    logger.info(
        "info_plan_built studio_id=%s thread_id=%s kind=%s copy=%s outcome=%s",
        studio_id, thread_id, plan.kind.value, plan.copy_intent.value,
        result.outcome.value,
    )
    return Turn(payload=response_render.render(plan, lang=lang, channel=channel),
                plan_kind=plan.kind.value, outcome=result.outcome.value,
                reference_now=now.replace(tzinfo=None))


# ─── Нажатия: закрытый реестр действий ───────────────────────────────────────
#
# ПРАВИЛО В ОБЕ СТОРОНЫ. Кнопка, которую умеет нарисовать рендерер, обязана
# иметь здесь обработчик; действие, у которого обработчик есть, обязано быть
# нарисуемым. Именно эта симметрия и была нарушена до сих пор: варианты
# рисовались кнопками, а входящего пути для нажатия не существовало вовсе —
# человек жал, и не происходило ничего. Держится тестом, а не вниманием.
#
# Тело нажатия — «действие» либо «действие:ссылка», и ничего кроме. Ни
# `lesson_id`, ни `service_id`, ни `studio_id` в нём нет: студию и разговор
# сервер знает из принятого события, а ссылка непрозрачна и без своей студии и
# своего треда не значит ничего.

_SEPARATOR = ":"


def parse_action(data: str) -> Optional[tuple[response_plan.ActionKind, Optional[str]]]:
    """Тело нажатия -> действие и ссылка. None — такого действия у нас нет.

    Разбираем СТРОГО: неизвестное слово, лишние части, пустая ссылка — всё это
    не «похожее действие», а мусор, и угадывать по нему нечего.
    """
    if not data:
        return None
    head, _, ref = data.partition(_SEPARATOR)
    try:
        kind = response_plan.ActionKind(head)
    except ValueError:
        return None
    if kind in (response_plan.ActionKind.VIEW_OPTION,
                response_plan.ActionKind.CONFIRM_BOOKING):
        return (kind, ref) if ref and _SEPARATOR not in ref else None
    return (kind, None) if not ref else None


async def _view_option(db, *, studio_id, thread_id, ref, now, lang, channel) -> Turn:
    """«Показать этот вариант». Занятие ПЕРЕЧИТЫВАЕТСЯ из каталога: снимок
    часовой давности не основание ни для чего."""
    result = await search_resolver.select_token(db, studio_id, thread_id, ref, now=now)
    plan = response_plan.build(result, refs=[ref])
    return _turn(plan, result.outcome.value, now, lang=lang, channel=channel)


async def _show_more(db, *, studio_id, thread_id, ref, now, lang, channel) -> Turn:
    """«Показать ещё» — следующая страница ТОГО ЖЕ поиска.

    Никакого нового запроса: условия разговора уже разрешены сервером, и
    листание — это они же со следующей страницей. Версия поиска не растёт,
    поэтому прежние ссылки остаются действительными.
    """
    previous = (await search_state.load(db, thread_id, now=now)).state
    if previous is None:
        # Список протух или его не было. Оживлять вчерашние условия нельзя.
        plan = response_plan.build(search_resolver.SearchResult(
            search_resolver.Outcome.SELECTION_NOT_AVAILABLE, selection_reason="expired"))
        return _turn(plan, "SELECTION_NOT_AVAILABLE", now, lang=lang, channel=channel)

    result = await search_resolver.resolve(
        db, studio_id, search_intent.UserSearchIntent(more=True),
        user_text="", reference_now=now, previous=previous, thread_id=thread_id)
    refs = search_state.new_tokens(len(result.lessons))
    plan = response_plan.build(result, refs=refs,
                               show_branch=response_plan.needs_branch(result.lessons))
    shown = plan.shown() if plan.kind is response_plan.PlanKind.SEARCH_RESULTS else []
    return _turn(plan, result.outcome.value, now, lang=lang, channel=channel,
                 state=result.state, shown=shown, new_search=False)


async def _reset_search(db, *, studio_id, thread_id, ref, now, lang, channel) -> Turn:
    """«Начать заново». Условия стираются, показанные ссылки обесцениваются.

    Это ЕДИНСТВЕННЫЙ явный сброс со стороны человека наравне со словом
    «покажи всё заново»: по любому уточнению условия не теряются.
    """
    plan = response_plan.informational(response_plan.PlanKind.NO_RESULTS,
                                       response_plan.CopyIntent.SEARCH_RESET)
    return _turn(plan, "RESET", now, lang=lang, channel=channel,
                 state=CanonicalState(), shown=[], new_search=True)


def _turn(plan, outcome: str, now: datetime, *, lang: str, channel: str,
          state=None, shown=(), new_search: bool = False) -> Turn:
    return Turn(payload=response_render.render(plan, lang=lang, channel=channel),
                state=state, shown=list(shown), new_search=new_search,
                plan_kind=plan.kind.value, outcome=outcome,
                reference_now=now.replace(tzinfo=None) if now.tzinfo else now)


async def callback(db, *, studio_id: int, thread_id: int, data: str, channel: str,
                   lang: str, now: Optional[datetime] = None) -> Turn:
    """Нажатая кнопка. Модель не зовём вовсе: смысл сервер уже знает.

    Это и есть главный операционный выигрыш этого пути: «показать вариант»,
    «показать ещё» и «начать заново» не стоят ни токена и не могут ничего
    выдумать. Флага здесь нет намеренно — кнопку, которую человек уже видит,
    выключение флага не должно превращать в мёртвую.
    """
    now = now or datetime.now(UTC)
    parsed = parse_action(data)
    if parsed is None:
        logger.info("callback_unknown studio_id=%s thread_id=%s", studio_id, thread_id)
        plan = response_plan.build(search_resolver.SearchResult(
            search_resolver.Outcome.SELECTION_NOT_AVAILABLE, selection_reason="unknown"))
        return _turn(plan, "SELECTION_NOT_AVAILABLE", now, lang=lang, channel=channel)

    kind, ref = parsed
    turn = await HANDLERS[kind](db, studio_id=studio_id, thread_id=thread_id, ref=ref,
                                now=now, lang=lang, channel=channel)
    logger.info("deterministic_callback_handled studio_id=%s thread_id=%s action=%s "
                "outcome=%s", studio_id, thread_id, kind.value, turn.outcome)
    return turn


# ─── Личный ход (P2) ─────────────────────────────────────────────────────────

# Что человек просит — в терминах ПРАВА, а не в терминах модели. Перевод один и
# здесь: дальше по коду ходит только `Capability`, и «модель попросила показать
# абонемент» нигде не превращается в «модель разрешила показать абонемент».
_CAPABILITY = {
    search_intent.PersonalKind.MY_BOOKINGS: identity.Capability.VIEW_OWN_BOOKINGS,
    search_intent.PersonalKind.MY_SUBSCRIPTION: identity.Capability.VIEW_OWN_SUBSCRIPTION,
}

# Код подтверждения глазами сервера: ровно шесть цифр и ничего больше.
_CODE = re.compile(r"^\s*(\d{6})\s*$")


def looks_like_code(text: str) -> bool:
    """Человек прислал шесть цифр. Спрашивать об этом модель незачем: у неё
    нет ни одного факта, которого нет у регулярного выражения, а вызов стоит
    денег и задержки на самом чувствительном шаге разговора."""
    return bool(_CODE.match(text or ""))


async def code_turn(db, *, studio_id: int, identity_id: Optional[int], channel: str,
                    text: str, lang: str, now: Optional[datetime] = None) -> Turn:
    """Ввод кода подтверждения. Детерминированно, без модели.

    После успеха ход ПРОДОЛЖАЕТ то, что человек просил до подтверждения:
    спросил про абонемент — увидит абонемент, а не «чем помочь». Продолжается
    именно ЧТЕНИЕ: намерение, сохранённое до проверки, ничего в бизнесе не
    меняет и меняться не может — мутаций в продукте на этом этапе нет вовсе.
    """
    now = now or datetime.now(UTC)
    match = _CODE.match(text or "")
    row = (await identity.load(db, studio_id=studio_id, identity_id=identity_id)
           if identity_id is not None else None)
    if match is None or row is None:
        plan = response_plan.build_verified(
            identity.Verified(identity.VerifyOutcome.INVALID))
        return _turn(plan, "VERIFICATION_INVALID", now, lang=lang, channel=channel)

    result = await identity.submit_code(db, row, match.group(1))
    if result.outcome is not identity.VerifyOutcome.VERIFIED:
        plan = response_plan.build_verified(result)
        return _turn(plan, result.outcome.value, now, lang=lang, channel=channel)

    payload = response_render.render(response_plan.build_verified(result),
                                     lang=lang, channel=channel)
    if result.resume is not None:
        # Продолжение с того же места. Право спрашиваем ЗАНОВО и у базы — то,
        # что мы сами секунду назад его выдали, доказательством не является.
        follow = await _read_personal(db, studio_id, identity_id, result.resume,
                                      lang, channel, now)
        joined = payload["text"] + "\n\n" + follow.payload["text"]
        payload = {"text": joined}
    return _turn_payload(payload, "VERIFIED", now)


async def _personal_turn(db, studio_id: int, identity_id: Optional[int], channel: str,
                         intent, text: str, lang: str, now: datetime) -> Turn:
    """Личный вопрос: сперва право, потом данные. Никогда наоборот.

    СОСТОЯНИЕ ПОИСКА НЕ ТРОГАЕТСЯ — как и в справочном ходе: вопрос «мои
    записи» посреди подбора занятия не отменяет найденный список.
    """
    kind = intent.personal.kind
    if kind is search_intent.PersonalKind.VERIFY_ME or intent.contact is not None:
        return await _verify_turn(db, studio_id, identity_id, channel, intent,
                                  lang, now)

    capability = _CAPABILITY[kind]
    allowed = await identity.require(db, studio_id=studio_id,
                                     identity_id=identity_id, capability=capability)
    if allowed.decision is not identity.Decision.OK:
        # Права нет. Запоминаем ЧТО просили — но только намерение, и только
        # если личность вообще есть: продолжить после подтверждения лучше, чем
        # заставить человека повторять вопрос.
        row = (await identity.load(db, studio_id=studio_id, identity_id=identity_id)
               if identity_id is not None else None)
        if row is not None and row.revoked_at is None:
            await identity.remember_intent(db, row, capability)
            await db.commit()
        logger.info("identity_authorization_denied studio_id=%s capability=%s "
                    "decision=%s", studio_id, capability.value, allowed.decision.value)
        plan = response_plan.build_auth(allowed.decision)
        return _turn(plan, allowed.decision.value, now, lang=lang, channel=channel)

    return await _read_personal(db, studio_id, identity_id, capability, lang,
                                channel, now)


async def _read_personal(db, studio_id: int, identity_id, capability, lang: str,
                         channel: str, now: datetime) -> Turn:
    """Прочитать личные данные. Право проверяется ЗДЕСЬ, у базы, ещё раз.

    Повторная проверка не перестраховка: между разрешением и чтением проходит
    время, а сотрудник мог отозвать связь именно в этот промежуток. Читать по
    праву, выданному раньше, — это и есть «кэш вместо базы».
    """
    allowed = await identity.require(db, studio_id=studio_id,
                                     identity_id=identity_id, capability=capability)
    if allowed.decision is not identity.Decision.OK:
        plan = response_plan.build_auth(allowed.decision)
        return _turn(plan, allowed.decision.value, now, lang=lang, channel=channel)

    if capability is identity.Capability.VIEW_OWN_BOOKINGS:
        facts = await personal.bookings(db, studio_id=studio_id,
                                        client_id=allowed.client_id,
                                        now=now.replace(tzinfo=None))
    else:
        facts = await personal.subscription(db, studio_id=studio_id,
                                            client_id=allowed.client_id,
                                            today=now.date())
    plan = response_plan.build_personal(facts)
    logger.info("personal_plan_built studio_id=%s capability=%s items=%s",
                studio_id, capability.value, len(facts.items))
    return _turn(plan, "OK", now, lang=lang, channel=channel)


async def _verify_turn(db, studio_id: int, identity_id: Optional[int], channel: str,
                       intent, lang: str, now: datetime) -> Turn:
    """«Это я, моя почта такая-то» -> код на почту КАРТОЧКИ.

    Названный адрес не доказывает ничего и никого не связывает: он только
    определяет, куда отправить код. Доказательством станет введённый код — то
    есть доступ к ящику, а не знание адреса.
    """
    row = (await identity.load(db, studio_id=studio_id, identity_id=identity_id)
           if identity_id is not None else None)
    if row is None:
        plan = response_plan.build_auth(identity.Decision.IDENTITY_REQUIRED)
        return _turn(plan, "IDENTITY_REQUIRED", now, lang=lang, channel=channel)
    if intent.contact is None:
        plan = response_plan.build_auth(identity.Decision.IDENTITY_REQUIRED)
        return _turn(plan, "CONTACT_NEEDED", now, lang=lang, channel=channel)

    outgoing: list = []
    result = await identity.start_challenge(
        db, row, email=intent.contact.surface,
        capability=identity.Capability.VIEW_OWN_BOOKINGS,
        send=lambda code, address: outgoing.append((code, address)))
    await db.commit()

    # Письмо уходит ПОСЛЕ коммита и вне транзакции: сеть внутри открытой
    # транзакции — тот самый запрет, на котором стоит весь P0. Не ушло —
    # человек попросит код заново, а не останется с записью «выдан» без письма.
    for code, address in outgoing:
        await _send_code(db, studio_id, address, code, lang)

    plan = response_plan.build_challenge(result)
    return _turn(plan, result.outcome.value, now, lang=lang, channel=channel)


async def _send_code(db, studio_id: int, address: str, code: str, lang: str) -> None:
    """Отправить код тем же письмом, каким продукт логинит клиента по почте.

    Второго письма с кодом в продукте не заводим: человек получает ровно то же
    сообщение, что и при входе в мини-приложение, и по нему понятно, что
    происходит.
    """
    from routers.booking.miniapp_email_auth import _CODE_BODY, _CODE_SUBJECT, CODE_TTL
    from services.email_layout import code_block
    from services.i18n import pick
    from services.mailer import send_email

    ref = await catalog.studio(db, studio_id)
    name = ref.name if ref else ""
    try:
        await send_email(
            address,
            pick(_CODE_SUBJECT, lang).format(studio=name),
            pick(_CODE_BODY, lang).format(
                code=code_block(code), minutes=int(CODE_TTL.total_seconds() // 60)),
            brand=name, lang=lang,
        )
    except Exception:
        # Письмо не ушло — это не повод уронить ход: код живёт своей жизнью,
        # и человек попросит его заново по истечении паузы.
        logger.exception("identity: код не отправлен studio_id=%s", studio_id)


def _turn_payload(payload: dict, outcome: str, now: datetime) -> Turn:
    return Turn(payload=payload, plan_kind=response_plan.PlanKind.VERIFICATION.value,
                outcome=outcome,
                reference_now=now.replace(tzinfo=None) if now.tzinfo else now)


# ─── Запись через ассистента (P3) ────────────────────────────────────────────
#
# ПУТЬ ЦЕЛИКОМ:
#
#   «что есть завтра после 18»  -> поиск (P1.4) -> варианты с ссылками (P1.5)
#   «запиши на второй»          -> ссылка/номер -> занятие  (СЕРВЕР)
#                               -> право (P2)   -> условия  (booking.quote)
#                               -> ПРЕДЛОЖЕНИЕ (ничего не меняет)
#   «да» / кнопка               -> подтверждение без модели
#                               -> право заново, условия заново
#                               -> booking.create
#
# Модель на этом пути называет ровно две вещи: «человек просит записаться» и
# «человек согласен». Ни занятия, ни клиента, ни цены она не выбирает — их
# определяет сервер по показанному списку и по своей базе.


async def _lesson_from_reference(db, *, studio_id: int, thread_id: Optional[int],
                                 intent, now: datetime) -> Optional[int]:
    """Какое занятие человек имеет в виду. Только по СЕРВЕРНОЙ ссылке.

    Два законных источника, и оба серверные: порядковый номер из показанного
    списка («второй») и непрозрачный токен нажатой кнопки. Названия занятия
    модель дать не может — в схеме такого поля нет.
    """
    if thread_id is None or intent.selection is None:
        return None
    pick = await search_state.by_ordinal(
        db, studio_id=studio_id, thread_id=thread_id,
        ordinal=intent.selection.ordinal, now=now)
    return pick.lesson_id


async def _booking_turn(db, studio_id: int, thread_id: Optional[int],
                        identity_id: Optional[int], channel: str, intent,
                        lang: str, now: datetime) -> Turn:
    """«Запиши меня» -> предложение с условиями. НИЧЕГО НЕ БРОНИРУЕТ.

    Порядок проверок не случаен: сперва право (P2), потом условия. Человеку,
    который ещё не подтвердил личность, показывать занятия его карточки нельзя
    — а условия записи это уже про него, а не про расписание.
    """
    allowed = await identity.require(db, studio_id=studio_id, identity_id=identity_id,
                                     capability=identity.Capability.BOOK_WITH_CREDIT)
    if allowed.decision is not identity.Decision.OK:
        row = (await identity.load(db, studio_id=studio_id, identity_id=identity_id)
               if identity_id is not None else None)
        if row is not None and row.revoked_at is None:
            await identity.remember_intent(db, row,
                                           identity.Capability.BOOK_WITH_CREDIT)
            await db.commit()
        plan = response_plan.build_auth(allowed.decision)
        return _turn(plan, allowed.decision.value, now, lang=lang, channel=channel)

    lesson_id = await _lesson_from_reference(
        db, studio_id=studio_id, thread_id=thread_id, intent=intent, now=now)
    if lesson_id is None:
        # Не на что записываться: списка не показывали либо он устарел.
        plan = response_plan.build_confirm_problem(
            response_plan.CopyIntent.BOOKING_NOTHING_TO_CONFIRM)
        return _turn(plan, "NO_REFERENCE", now, lang=lang, channel=channel)

    offered = await booking.quote(db, studio_id=studio_id, client_id=allowed.client_id,
                                  lesson_id=lesson_id, now=now)
    if offered.outcome is not booking.Outcome.OK:
        plan = response_plan.build_booking(booking.Result(offered.outcome))
        return _turn(plan, offered.outcome.value, now, lang=lang, channel=channel)

    offer = await proposals.offer_booking(
        db, studio_id=studio_id, thread_id=thread_id, identity_id=identity_id,
        client_id=allowed.client_id, lesson_id=lesson_id, terms=offered.terms, now=now)
    await db.commit()
    plan = response_plan.build_offer(offered.terms, ref=offer.token)
    logger.info("proposal_offered studio_id=%s thread_id=%s lesson_id=%s approval=%s",
                studio_id, thread_id, lesson_id, offered.terms.approval_required)
    return _turn(plan, "OFFERED", now, lang=lang, channel=channel)


async def _payments_enabled(db, studio_id: int) -> bool:
    """Можно ли ЗАВОДИТЬ новые карточные оплаты записи. Только чтение, без сети.

    Три условия, и каждое о своём: раскатка этапа (флаг), подключённый аккаунт
    студии и настроенный ключ платформы. Спрашиваем ДО того, как занять место:
    иначе бронь встала бы в `hold` под оплату, которой негде случиться, и
    держала бы коврик до разбора.

    Флаг гейтит ТОЛЬКО это. Ни проведение уже начатых оплат, ни их сверку, ни
    возвраты он не выключает (services/booking_payment.sweep).
    """
    from services import feature_flags, stripe_connect

    if not stripe_connect.configured():
        return False
    if not await feature_flags.is_enabled(
            db, studio_id, feature_flags.StudioFeature.AGENT_PAYMENTS):
        return False
    return await booking_payment.account_for(db, studio_id) is not None


async def _payment_turn(db, *, studio_id: int, thread_id: int, reservation_id: int,
                        client_id: int, terms, channel: str, lang: str,
                        now: datetime):
    """Место занято под оплату -> ссылка человеку. None — платить уже нечем.

    Сеть живёт ЗДЕСЬ и только здесь, вне транзакции подтверждения: она уже
    закоммичена ходом выше. Ссылку собирает платёжный домен из состояния
    заявки — ни модель, ни этот модуль адрес платёжной страницы не составляют.
    """
    payable = await booking_payment.pay_link(
        db, studio_id=studio_id, reservation_id=reservation_id,
        client_id=client_id, channel=channel, thread_id=thread_id)
    if payable.outcome is booking_payment.PayOutcome.STALE:
        return None
    if payable.outcome is booking_payment.PayOutcome.OPEN:
        plan = response_plan.build_payment(
            terms, response_plan.CopyIntent.BOOKING_PAYMENT_OPEN, url=payable.url)
        return _turn(plan, "PAYMENT_OPEN", now, lang=lang, channel=channel)
    # PENDING и UNAVAILABLE: форма уже открыта либо Stripe не ответил. В обоих
    # случаях деньги могли двинуться, и «оплата не прошла» было бы неправдой —
    # место держится, разбор доведёт (services/booking_payment.sweep).
    plan = response_plan.build_payment(
        terms, response_plan.CopyIntent.BOOKING_PAYMENT_PENDING)
    return _turn(plan, payable.outcome.value, now, lang=lang, channel=channel)


async def _confirm_turn(db, studio_id: int, thread_id: Optional[int], channel: str,
                        lang: str, now: datetime,
                        token: Optional[str] = None) -> Turn:
    """Согласие: нажатием кнопки либо словом. Модель на этом шаге не участвует.

    Слово «да» исполняет предложение, только если оно ОДНО. Двух живых не
    бывает по построению (`offer_booking` гасит прежние), но если они как-то
    оказались — сервер не угадывает: цена ошибки здесь чужая бронь.

    ПЛАТНОЕ ЗАНЯТИЕ. Место занимается статусом `hold`, и только если оплату
    вообще есть где провести (`_payments_enabled`). Записью это ещё не
    является: «вы записаны» скажет проведение оплаты, а не согласие.
    """
    if thread_id is None:
        plan = response_plan.build_confirm_problem(
            response_plan.CopyIntent.BOOKING_NOTHING_TO_CONFIRM)
        return _turn(plan, "NO_THREAD", now, lang=lang, channel=channel)

    paying = await _payments_enabled(db, studio_id)
    if token is not None:
        done = await proposals.confirm_by_token(
            db, studio_id=studio_id, thread_id=thread_id, token=token, now=now,
            allow_hold=paying)
    else:
        done = await proposals.confirm_only_live(
            db, studio_id=studio_id, thread_id=thread_id, now=now,
            allow_hold=paying)

    if done.outcome is proposals.ConfirmOutcome.DONE:
        await db.commit()
        if done.status == "hold":
            paid = await _payment_turn(
                db, studio_id=studio_id, thread_id=thread_id,
                reservation_id=done.reservation_id, client_id=done.client_id,
                terms=done.terms, channel=channel, lang=lang, now=now)
            if paid is not None:
                return paid
        plan = response_plan.build_booking(booking.Result(
            booking.Outcome.OK, done.reservation_id, done.status, done.terms))
        return _turn(plan, "BOOKED", now, lang=lang, channel=channel)

    if done.outcome is proposals.ConfirmOutcome.REJECTED:
        await db.commit()          # исход предложения записан, брони нет
        plan = response_plan.build_booking(booking.Result(done.reason, terms=done.terms))
        return _turn(plan, done.reason.value, now, lang=lang, channel=channel)

    if done.outcome is proposals.ConfirmOutcome.AUTH_REQUIRED:
        await db.commit()
        plan = response_plan.build_auth(identity.Decision.VERIFICATION_REQUIRED)
        return _turn(plan, "AUTH_REQUIRED", now, lang=lang, channel=channel)

    await db.commit()
    if (done.outcome is proposals.ConfirmOutcome.ALREADY_RESOLVED
            and done.reservation_id is not None):
        # Повтор согласия по броне, которая всё ещё ждёт оплаты: переиздаём
        # ссылку вместо «подтверждать нечего». Оборванная оплата обязана иметь
        # способ возобновиться — второй формы при этом не заводится, ключ
        # попытки детерминирован.
        again = await _payment_turn(
            db, studio_id=studio_id, thread_id=thread_id,
            reservation_id=done.reservation_id, client_id=done.client_id,
            terms=None, channel=channel, lang=lang, now=now)
        if again is not None:
            return again
    copy = {
        proposals.ConfirmOutcome.EXPIRED: response_plan.CopyIntent.BOOKING_EXPIRED,
        proposals.ConfirmOutcome.AMBIGUOUS: response_plan.CopyIntent.BOOKING_AMBIGUOUS,
        proposals.ConfirmOutcome.ALREADY_RESOLVED:
            response_plan.CopyIntent.BOOKING_NOTHING_TO_CONFIRM,
        proposals.ConfirmOutcome.UNKNOWN:
            response_plan.CopyIntent.BOOKING_NOTHING_TO_CONFIRM,
    }[done.outcome]
    plan = response_plan.build_confirm_problem(copy)
    return _turn(plan, done.outcome.value, now, lang=lang, channel=channel)


async def _confirm_booking_action(db, *, studio_id, thread_id, ref, now, lang,
                                  channel) -> Turn:
    """Нажатая кнопка «Записаться». Детерминированно, без модели."""
    if not ref:
        plan = response_plan.build_confirm_problem(
            response_plan.CopyIntent.BOOKING_NOTHING_TO_CONFIRM)
        return _turn(plan, "NO_REF", now, lang=lang, channel=channel)
    return await _confirm_turn(db, studio_id, thread_id, channel, lang, now, token=ref)


# Реестр действий собирается в КОНЦЕ файла: обработчик подтверждения записи
# определён ниже поиска, и словарь наверху ссылался бы на ещё не созданное имя.
# Полнота реестра проверяется тестом (tests/test_callbacks) — кнопки без
# обработчика в продукте быть не может.
HANDLERS = {
    response_plan.ActionKind.VIEW_OPTION: _view_option,
    response_plan.ActionKind.SHOW_MORE: _show_more,
    response_plan.ActionKind.RESET_SEARCH: _reset_search,
    response_plan.ActionKind.CONFIRM_BOOKING: _confirm_booking_action,
}

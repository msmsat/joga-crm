"""Язык ответа выбирает человек, а не студия.

До этого язык брался из настроек ассистента, а при «auto» — из языка студии.
То есть из свойства СТУДИИ: чешский тренер в студии с русским интерфейсом
получал русский ответ.

Здесь проверяется резолвер и то, что его решение доезжает до модели ровно одним
непротиворечивым сигналом. Живой модели не требуется: распознавание
детерминированное, а «модель послушалась» — вопрос отдельный, для набора
оценки.
"""
import asyncio
import warnings
from types import SimpleNamespace

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext
from models import Studio, StudioAISettings, StudioBillingPlan, StudioMember, User
from services import ai_language
from services.ai_language import detect, explicit_request, resolve
from services.assistant import build_messages

_OWNER = "ai-lang-owner@test.local"


def _hist(*pairs):
    """История как её видит агент: ('user'|'assistant', текст), старые первыми."""
    return [SimpleNamespace(role=role, text=text) for role, text in pairs]


def _lang(*pairs, settings="auto", studio=None):
    return resolve(_hist(*pairs), settings_language=settings, studio_language=studio)


# ── Базовые языки ─────────────────────────────────────────────────────────────

def test_each_supported_language_is_recognised():
    cases = {
        "cs": "Kolik klientů máme tento měsíc?",
        "en": "How many clients do we have this month?",
        "ru": "Сколько у нас клиентов за этот месяц?",
        "uk": "Скільки в нас клієнтів цього місяця?",
        "de": "Wie viele Kunden haben wir diesen Monat?",
    }
    for code, text in cases.items():
        assert detect(text) == code, (code, text)
        assert _lang(("user", text)).code == code


def test_source_says_where_the_language_came_from():
    got = _lang(("user", "Kolik klientů máme?"))
    assert (got.code, got.source) == ("cs", "latest_user_message")


# ── Локаль не перебивает человека ─────────────────────────────────────────────

def test_studio_locale_never_wins_over_a_clear_message():
    """Главный баг, ради которого всё и делалось."""
    assert _lang(("user", "How many clients do we have?"), studio="cs").code == "en"
    assert _lang(("user", "Kolik klientů máme?"), studio="en").code == "cs"
    # Студия в Чехии, человек пишет по-русски — русский, а не чешский.
    assert _lang(("user", "Сколько у нас клиентов?"), studio="cs").code == "ru"


def test_locale_is_used_only_when_the_message_says_nothing():
    got = _lang(("user", "OK"), studio="cs")
    assert (got.code, got.source) == ("cs", "locale_fallback")
    # Языка студии тоже нет — язык продукта по умолчанию.
    assert _lang(("user", "123")).code == "ru"
    assert _lang(("user", "123")).source == "default_fallback"


def test_settings_are_a_preference_not_an_order():
    """ГЛАВНАЯ регрессия задачи. Настройка стояла ВЫШЕ распознавания, и
    владелец, однажды выбравший русский, обрекал своего чешского тренера на
    русские ответы. Настройка — предпочтение: она работает, только когда в
    разговоре языка не видно вовсе."""
    assert _lang(("user", "Ukaž mi dnešní rozvrh."), settings="ru").code == "cs"
    assert _lang(("user", "How many clients do we have?"), settings="cs").code == "en"
    assert _lang(("user", "Скільки в нас клієнтів?"), settings="en").code == "uk"
    # Языка в реплике не видно — вот теперь настройка и пригодилась.
    got = _lang(("user", "OK"), settings="en", studio="ru")
    assert (got.code, got.source) == ("en", "settings_fallback")
    # …и всё равно уступает прямой просьбе.
    assert _lang(("user", "Ответь по-чешски: сколько клиентов?"), settings="en").code == "cs"


def test_every_precedence_step_beats_the_next_one():
    """Порядок приоритетов целиком, ступень за ступенью."""
    # explicit > latest
    assert _lang(("user", "Answer in English: Kolik klientů máme?")).source == "explicit_request"
    # latest > previous
    assert _lang(("user", "Kolik klientů máme?"), ("user", "Сколько у нас клиентов?")).code == "ru"
    # previous > settings
    got = _lang(("user", "Kolik klientů máme?"), ("user", "OK"), settings="ru")
    assert (got.code, got.source) == ("cs", "previous_user_message")
    # settings > locale
    got = _lang(("user", "OK"), settings="de", studio="ru")
    assert (got.code, got.source) == ("de", "settings_fallback")
    # locale > default
    got = _lang(("user", "OK"), studio="cs")
    assert (got.code, got.source) == ("cs", "locale_fallback")
    # default последний
    assert _lang(("user", "OK")).source == "default_fallback"


# ── Смешанная лексика ─────────────────────────────────────────────────────────

def test_technical_terms_do_not_switch_the_language():
    assert detect("Покажи revenue за последний месяц.") == "ru"
    assert detect("Můžeš mi ukázat retention za poslední měsíc?") == "cs"
    assert detect("Zeige mir das revenue für diesen Monat") == "de"


def test_grammar_decides_a_mixed_sentence_not_letter_count():
    """Язык несут служебные слова, а не содержательные существительные.
    «Show me загрузку тренеров» — английская команда с русским термином,
    «Покажи revenue» — русская с английским. Считать буквы здесь нельзя: в
    обоих случаях их поровну, а ответы разные."""
    assert detect("Show me загрузку тренеров по неделям") == "en"
    assert detect("Покажи revenue за последний месяц.") == "ru"
    assert detect("Show me the trainer load") == "en"


# ── Чужой текст внутри сообщения ──────────────────────────────────────────────

def test_quoted_text_does_not_change_the_language():
    assert detect('Klient napsal "I want to cancel my booking". Co mám udělat?') == "cs"
    assert detect('Клиент прислал «Zrušte mi rezervaci» — что делать?') == "ru"
    assert detect("Клиент пишет „Please cancel my class“, что ответить?") == "ru"


def test_code_ids_and_dates_are_not_language():
    for noise in ("get_schedule", "client_id=68542", "request_id",
                  "2026-08-26 18:00?", "https://velora.app/dashboard"):
        assert detect(noise) is None, noise


def test_identifiers_inside_a_sentence_do_not_win():
    assert detect("Проверь request_id и get_team_report за август") == "ru"


# ── Короткие реплики ──────────────────────────────────────────────────────────

def test_short_followups_keep_the_previous_user_language():
    for short in ("OK", "yes", "да", "?", "👍", "123", "+"):
        got = _lang(("user", "Ukaž mi dnešní rozvrh."), ("assistant", "Dnes máte…"),
                    ("user", short), studio="ru")
        assert got.code == "cs", (short, got)
        assert got.source == "previous_user_message"


def test_the_assistant_answer_is_never_a_language_source():
    """Иначе одна ошибка модели закрепилась бы навсегда: каждый следующий ход
    подтверждал бы язык предыдущего ответа."""
    got = _lang(("user", "Kolik klientů máme?"),
                ("assistant", "У вас 60 клиентов."),
                ("user", "OK"))
    assert got.code == "cs", got


def test_first_message_without_a_signal_falls_back_to_locale():
    got = _lang(("user", "OK"), studio="de")
    assert (got.code, got.source) == ("de", "locale_fallback")


# ── Явная просьба ─────────────────────────────────────────────────────────────

def test_explicit_request_beats_detection():
    assert explicit_request("Answer in English: Kolik klientů máme?") == "en"
    got = _lang(("user", "Answer in English: Kolik klientů máme?"))
    assert (got.code, got.source) == ("en", "explicit_request")
    got = _lang(("user", "Ответь по-чешски: сколько у меня клиентов?"))
    assert (got.code, got.source) == ("cs", "explicit_request")


def test_an_ordinary_question_is_not_an_explicit_request():
    for plain in ("Сколько у нас клиентов?", "Kolik klientů máme?",
                  "Покажи клиентов из Германии", "Show me the English speaking clients"):
        assert explicit_request(plain) is None, plain


def test_switching_language_takes_effect_immediately_and_switches_back():
    talk = [("user", "Ukaž mi dnešní rozvrh."), ("assistant", "Dnes…")]
    assert _lang(*talk).code == "cs"
    talk += [("user", "Can you explain that in English?"), ("assistant", "Sure…")]
    assert _lang(*talk).code == "en"
    talk += [("user", "A co zítra?")]
    # Разговор не залипает на языке, выбранном один раз.
    assert _lang(*talk).code == "cs"


# ── Один непротиворечивый сигнал в промпте ────────────────────────────────────

async def _seed(studio_lang: str) -> dict:
    async with async_session_maker() as db:
        studio = Studio(name="TEST-AI-LANG", timezone="UTC+0", currency="EUR",
                        language=studio_lang)
        db.add(studio)
        await db.flush()
        owner = User(email=_OWNER, hashed_password="x", name="Ольга")
        db.add(owner)
        await db.flush()
        db.add_all([
            StudioBillingPlan(studio_id=studio.id, plan_name="pro"),
            StudioAISettings(studio_id=studio.id),
            StudioMember(studio_id=studio.id, user_id=owner.id, role="owner",
                         status="active", name="Ольга"),
        ])
        await db.commit()
        return {"sid": studio.id, "owner_id": owner.id}


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(StudioAISettings).where(StudioAISettings.studio_id == sid))
        await db.execute(delete(StudioMember).where(StudioMember.studio_id == sid))
        await db.execute(delete(StudioBillingPlan).where(StudioBillingPlan.studio_id == sid))
        await db.execute(delete(User).where(User.email == _OWNER))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _prompt(ids: dict, *pairs, studio_lang: str) -> str:
    async with async_session_maker() as db:
        user = (await db.execute(
            select(User).where(User.id == ids["owner_id"]))).scalar_one()
        ctx = StudioContext(user=user, studio_id=ids["sid"], role="owner")
        settings = (await db.execute(
            select(StudioAISettings).where(StudioAISettings.studio_id == ids["sid"])
        )).scalar_one()
        messages = await build_messages(ctx, db, settings, _hist(*pairs), studio_lang)
        return messages[2]["content"]


async def _run_single_signal() -> None:
    ids = await _seed("ru")
    try:
        text = await _prompt(ids, ("user", "Kolik klientů máme?"), studio_lang="ru")
        assert "Response language: Czech (cs)." in text, text
        # Ровно ОДИН сигнал о языке: прежняя строка «Язык ответа: ru» ушла целиком.
        assert "Язык ответа" not in text
        assert text.count("Response language") == 1
        # Язык студии в промпте больше не упоминается как язык ответа.
        assert "Russian (ru)" not in text
    finally:
        await _cleanup(ids["sid"])


def test_prompt_carries_exactly_one_language_signal():
    asyncio.run(_run_single_signal())


async def _run_rule_present() -> None:
    ids = await _seed("ru")
    try:
        from services.assistant import _RULES
        assert "RESPONSE LANGUAGE" in _RULES
        # Правило запрещает переключаться из-за служебных текстов — именно этот
        # запрет и отличает его от «отвечай на языке пользователя». Якоря без
        # пробелов на границе строк: правило свёрстано по 80 колонок.
        assert "Do not switch because" in _RULES
        assert "quoted client message" in _RULES
        text = await _prompt(ids, ("user", "Show me today's schedule"), studio_lang="cs")
        assert "Response language: English (en)." in text
    finally:
        await _cleanup(ids["sid"])


def test_rule_is_in_the_cached_prefix_and_state_in_the_context():
    asyncio.run(_run_rule_present())


# ── Язык переживает весь ход ──────────────────────────────────────────────────

async def _run_survives_the_turn() -> None:
    """Инструменты, ошибки бэкенда и смена модели язык менять не могут: он
    состояние ХОДА, посчитанное до первого вызова модели."""
    import asyncio as _a

    from services import llm
    from services.assistant import run_agent

    ids = await _seed("ru")
    real_chat = llm.chat
    try:
        replies = [
            llm.LLMReply(text=None, tool_calls=[{"id": "c0", "name": "get_lesson",
                                                 "arguments": {"lesson_id": 999_000_777}}],
                         usage=llm.LLMUsage("google/gemini-3.7-flash", 1, 0, 1, 1)),
            llm.LLMReply(text="Dnes nemáte žádné lekce.", tool_calls=[],
                         usage=llm.LLMUsage("anthropic/claude-sonnet-5", 1, 0, 1, 1)),
        ]

        async def _chat(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0, **_):
            return replies.pop(0) if replies else llm.LLMReply(
                text="…", tool_calls=[], usage=llm.LLMUsage("m", 0, 0, 0, 0))

        llm.chat = _chat
        async with async_session_maker() as db:
            user = (await db.execute(
                select(User).where(User.id == ids["owner_id"]))).scalar_one()
            ctx = StudioContext(user=user, studio_id=ids["sid"], role="owner")
            settings = (await db.execute(
                select(StudioAISettings).where(StudioAISettings.studio_id == ids["sid"])
            )).scalar_one()
            result = await run_agent(
                ctx, db, settings, _hist(("user", "Ukaž mi dnešní rozvrh.")),
                studio_language="ru")
        # Инструмент упал, ход ушёл на другую модель — язык тот же.
        assert result.response_language == "cs", result.response_language
        assert result.language_source == "latest_user_message"
    finally:
        llm.chat = real_chat
        await _cleanup(ids["sid"])


def test_language_survives_tools_errors_and_escalation():
    asyncio.run(_run_survives_the_turn())


# ── Контекст и язык независимы ────────────────────────────────────────────────

def test_entity_context_and_language_are_independent():
    """«Ukaž její rozvrh» и «Show her schedule» — одна и та же сущность, разный
    язык ответа. Контекст отвечает «кто», язык — «на чём»."""
    assert _lang(("user", "Ukaž její rozvrh.")).code == "cs"
    assert _lang(("user", "Show her schedule.")).code == "en"
    assert _lang(("user", "Покажи её расписание.")).code == "ru"


# ── Состязательные ────────────────────────────────────────────────────────────

def test_adversarial_short_and_noisy_messages():
    czech = [("user", "Ukaž mi dnešní rozvrh."), ("assistant", "Dnes…")]
    # Короткое с термином — чешское слово в начале решает.
    assert detect("OK, ukaž revenue.") == "cs"
    # Одно английское слово-термин: сигнала нет, держим прежний язык человека.
    assert _lang(*czech, ("user", "Revenue?")).code == "cs"
    assert _lang(*czech, ("user", "VIP klient Anna Nováková")).code == "cs"
    assert _lang(*czech, ("user", "2026-08-26 18:00?")).code == "cs"
    assert _lang(*czech, ("user", "get_schedule")).code == "cs"


def test_names_are_not_a_language_signal_on_their_own():
    russian = [("user", "Покажи расписание на завтра.")]
    assert _lang(*russian, ("user", "Anna Nováková")).code == "ru"


def test_no_diacritics_still_resolves_by_stopwords():
    """Люди часто пишут без диакритики — «Kolik mame klientu» обязано остаться
    чешским, а не стать английским по алфавиту."""
    assert detect("Kolik mame klientu za tento mesic") == "cs"
    assert detect("Wie viele Kunden haben wir") == "de"


def test_empty_and_missing_input_never_crash():
    assert detect("") is None and detect(None) is None
    assert resolve([]).source == "default_fallback"
    assert resolve(None).code == "ru"
    assert ai_language.name("cs") == "Czech" and ai_language.name("zz") == "zz"


# ── Мессенджеры: то же правило, тот же резолвер ───────────────────────────────
#
# У клиентского агента правило про язык было и раньше, но только словами в
# промпте и без разрешённого значения. Теперь оба канала считают язык одним
# модулем: две копии правила разошлись бы, и «почему в директе отвечает иначе»
# стало бы отдельным багом.

async def _run_messenger_language() -> None:
    from services import client_agent, llm
    from models import StudioAISettings as _S

    ids = await _seed("ru")
    real_chat = llm.chat
    seen: dict = {}
    try:
        async def _chat(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0, **_):
            seen["messages"] = messages
            return llm.LLMReply(text="Ano.", tool_calls=[],
                                usage=llm.LLMUsage("m", 1, 0, 1, 1))

        llm.chat = _chat
        async with async_session_maker() as db:
            settings = (await db.execute(
                select(_S).where(_S.studio_id == ids["sid"]))).scalar_one()
            await client_agent.reply(
                db, ids["sid"], settings, None,
                "Kolik stojí lekce pilates?", "instagram", sender_ref="igsid-lang")

        systems = " ".join(m["content"] for m in seen["messages"] if m["role"] == "system")
        # Язык взят из сообщения клиента, а не из языка студии (она русская).
        assert "Response language: Czech (cs)." in systems, systems[:400]
        assert "Response language: Russian" not in systems
    finally:
        llm.chat = real_chat
        await _cleanup(ids["sid"])


def test_messenger_answers_in_the_clients_language_not_the_studios():
    asyncio.run(_run_messenger_language())


def test_messenger_ignores_the_crm_assistant_language_pin():
    """Язык, выбранный студией для СВОЕГО ассистента, не имеет отношения к
    постороннему человеку в директе: он пишет на своём."""
    from services.ai_language import resolve as _resolve
    got = _resolve(_hist(("user", "Kolik stojí lekce?")), studio_language="ru")
    assert got.code == "cs" and got.source == "latest_user_message"


# ── Языки шире набора локалей интерфейса ──────────────────────────────────────
#
# У продукта нет польских и словацких словарей интерфейса — и это не повод
# отвечать польскому клиенту по-английски. Язык ОТВЕТА и язык интерфейса разные
# вещи: модель говорит на большем числе языков, чем продукт переведён.

def test_languages_without_a_ui_translation_still_work():
    beyond = {
        "pl": "Ilu mamy klientów w tym miesiącu?",
        "sk": "Koľko klientov máme tento mesiac?",
        "fr": "Combien de clients avons-nous ce mois-ci?",
        "it": "Quanti clienti abbiamo questo mese?",
    }
    for code, text in beyond.items():
        assert detect(text) == code, (code, text, detect(text))
        assert _lang(("user", text)).code == code


def test_polish_short_followup_keeps_polish():
    got = _lang(("user", "Ilu mamy klientów w tym miesiącu?"), ("user", "?"), studio="ru")
    assert (got.code, got.source) == ("pl", "previous_user_message")


def test_a_name_alone_never_switches_the_language():
    """Диакритика в фамилии — не язык говорящего."""
    assert detect("Anna Nováková") is None
    got = _lang(("user", "Покажи расписание на завтра."), ("user", "Anna Nováková"))
    assert got.code == "ru", got


def test_confidence_is_reported():
    assert ai_language.classify("Kolik klientů máme tento měsíc?").confidence == "strong"
    assert ai_language.classify("OK").confidence == "none"


# ── Мессенджеры: непрерывность языка внутри ОДНОГО разговора ──────────────────

async def _run_messenger_continuity() -> None:
    """«ОК» после чешского вопроса обязано остаться чешским, а язык одного
    клиента не должен протекать в разговор другого."""
    from models import AIUsage
    from services import client_agent

    ids = await _seed("ru")
    sid = ids["sid"]
    try:
        async with async_session_maker() as db:
            db.add_all([
                AIUsage(studio_id=sid, surface="instagram", sender_ref="igsid-cz",
                        model="m", cost_micro=1, billable=True,
                        response_language="cs", language_source="latest_user_message"),
                AIUsage(studio_id=sid, surface="instagram", sender_ref="igsid-en",
                        model="m", cost_micro=1, billable=True,
                        response_language="en", language_source="latest_user_message"),
            ])
            await db.commit()

            # Каждый клиент помнит СВОЙ язык.
            assert await client_agent._last_language(db, sid, "instagram", "igsid-cz") == "cs"
            assert await client_agent._last_language(db, sid, "instagram", "igsid-en") == "en"
            # Незнакомый отправитель чужого не получает.
            assert await client_agent._last_language(db, sid, "instagram", "igsid-new") is None
            # Другой канал — другой разговор.
            assert await client_agent._last_language(db, sid, "telegram", "igsid-cz") is None
            # Без отправителя выборки нет вовсе: иначе один клиент навязал бы
            # свой язык всей студии.
            assert await client_agent._last_language(db, sid, "instagram", None) is None

            # И вот теперь «ОК» от чешского клиента остаётся чешским.
            got = resolve(_hist(("user", "OK")), studio_language="ru",
                          previous_language=await client_agent._last_language(
                              db, sid, "instagram", "igsid-cz"))
            assert (got.code, got.source) == ("cs", "previous_user_message")

            await db.execute(delete(AIUsage).where(AIUsage.studio_id == sid))
            await db.commit()
    finally:
        await _cleanup(sid)


def test_messenger_language_is_scoped_to_one_conversation():
    asyncio.run(_run_messenger_continuity())


async def _run_messenger_fallback_not_remembered() -> None:
    """Запоминаем только язык, УЗНАННЫЙ из речи. Умолчание студии — не «язык
    разговора», и закреплять его значило бы навсегда зафиксировать первую
    случайность."""
    from models import AIUsage
    from services import client_agent

    ids = await _seed("ru")
    sid = ids["sid"]
    try:
        async with async_session_maker() as db:
            db.add(AIUsage(studio_id=sid, surface="instagram", sender_ref="igsid-x",
                           model="m", cost_micro=1, billable=True,
                           response_language="ru", language_source="locale_fallback"))
            await db.commit()
            assert await client_agent._last_language(db, sid, "instagram", "igsid-x") is None
            await db.execute(delete(AIUsage).where(AIUsage.studio_id == sid))
            await db.commit()
    finally:
        await _cleanup(sid)


def test_messenger_does_not_remember_a_fallback_as_conversation_language():
    asyncio.run(_run_messenger_fallback_not_remembered())


# ── Неудачные пути: язык не течёт из ошибок и обрывов ─────────────────────────

async def _run_truncation_language() -> None:
    from services import llm
    from services.assistant import run_agent

    ids = await _seed("ru")
    sid = ids["sid"]
    real_chat = llm.chat
    try:
        async def _cut(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0, **_):
            return llm.LLMReply(text="Mamy 60 klientów i", tool_calls=[],
                                usage=llm.LLMUsage("m", 1, 0, 1, 1), finish_reason="length")

        llm.chat = _cut
        async with async_session_maker() as db:
            user = (await db.execute(
                select(User).where(User.id == ids["owner_id"]))).scalar_one()
            ctx = StudioContext(user=user, studio_id=sid, role="owner")
            settings = (await db.execute(
                select(StudioAISettings).where(StudioAISettings.studio_id == sid)
            )).scalar_one()
            got = await run_agent(ctx, db, settings,
                                  _hist(("user", "Ilu mamy klientów w tym miesiącu?")),
                                  studio_language="ru")
        # Приписка об обрыве — на языке ответа, а не английская в конце
        # польского текста.
        assert got.response_language == "pl", got.response_language
        assert "ucięta" in got.text, got.text
        assert "cut off" not in got.text
    finally:
        llm.chat = real_chat
        await _cleanup(sid)


def test_truncation_notice_follows_the_response_language():
    asyncio.run(_run_truncation_language())


async def _run_concurrent_turns() -> None:
    """Два одновременных разговора на разных языках. Язык — состояние ХОДА, а не
    модуля: общий изменяемый глобал означал бы чешский ответ англичанину раз в
    сто вопросов, и поймать это в проде было бы нечем."""
    from services import llm
    from services.assistant import run_agent

    ids = await _seed("ru")
    sid = ids["sid"]
    real_chat = llm.chat
    barrier = asyncio.Barrier(2)
    try:
        async def _chat(messages, tools=None, tier=llm.TIER_FAST, cache_prefix_len=0, **_):
            await barrier.wait()
            return llm.LLMReply(text="Готово.", tool_calls=[],
                                usage=llm.LLMUsage("m", 1, 0, 1, 1))

        llm.chat = _chat

        async def one(text: str):
            async with async_session_maker() as db:
                user = (await db.execute(
                    select(User).where(User.id == ids["owner_id"]))).scalar_one()
                ctx = StudioContext(user=user, studio_id=sid, role="owner")
                settings = (await db.execute(
                    select(StudioAISettings).where(StudioAISettings.studio_id == sid)
                )).scalar_one()
                return await run_agent(ctx, db, settings, _hist(("user", text)),
                                       studio_language="ru")

        czech, english = await asyncio.wait_for(asyncio.gather(
            one("Kolik klientů máme tento měsíc?"),
            one("How many clients do we have this month?"),
        ), timeout=30)
        assert czech.response_language == "cs", czech.response_language
        assert english.response_language == "en", english.response_language
    finally:
        llm.chat = real_chat
        await _cleanup(sid)


def test_two_simultaneous_turns_keep_their_own_languages():
    asyncio.run(_run_concurrent_turns())

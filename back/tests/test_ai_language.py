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


def test_settings_pin_is_an_explicit_choice_and_wins_over_detection():
    """«auto» — умолчание, и тогда решает человек. Владелец, выбравший язык
    руками, тоже дал прямое указание — просто в настройках, а не в реплике."""
    got = _lang(("user", "Kolik klientů máme?"), settings="en")
    assert (got.code, got.source) == ("en", "settings_pin")
    # …но прямая просьба в самой реплике сильнее настройки.
    assert _lang(("user", "Ответь по-чешски: сколько клиентов?"), settings="en").code == "cs"


# ── Смешанная лексика ─────────────────────────────────────────────────────────

def test_technical_terms_do_not_switch_the_language():
    assert detect("Покажи revenue за последний месяц.") == "ru"
    assert detect("Můžeš mi ukázat retention za poslední měsíc?") == "cs"
    assert detect("Zeige mir das revenue für diesen Monat") == "de"


def test_dominant_script_decides_a_mixed_sentence():
    """«Show me загрузку тренеров» — букв кириллицы больше, речь русская.
    Правило одно и объяснимое, а не «как повезёт»."""
    assert detect("Show me загрузку тренеров по неделям") == "ru"
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
        assert "Never switch language" in _RULES
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
    assert resolve([]).source == "locale_fallback"
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

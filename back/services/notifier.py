"""Диспетчер уведомлений (эпик N-1, N-9) — единая точка отправки для всего
приложения. Вызывающий код нигде сам не решает, слать ли и куда: он лишь
описывает событие через notify(db, studio_id, role, event_id, context), а
notify() сам решает:
  - To (кому): клиент из context["client_id"] (роль "client"), сотрудники по
    роли (trainer/admin/owner) или точечный адресат context["to_email"] —
    все приводятся к списку Recipient (задача N-9.2);
  - From (от кого): сама студия — токены каналов берутся из её StudioIntegration;
  - Message (что): _render(event_id, context, lang, currency) — текст на языке
    студии (Studio.language) и в её валюте (Studio.currency). Языков пять —
    ru, en, uk, cs, de (services/i18n); сами тексты в services/notify_texts,
    шаблоны WhatsApp — в services/whatsapp_templates;
  - Network (куда): NOTIFY_CHANNELS = ("email", "telegram", "whatsapp") —
    только каналы, включённые и глобально (StudioNotificationSettings), и в
    матрице события (NotificationEventToggle); sms/push не участвуют.

Instagram проактивным каналом БОЛЬШЕ НЕ ЯВЛЯЕТСЯ. Meta доставляет в Direct
только внутри 24-часового окна диалога, а системное уведомление (напоминание,
день рождения) по определению приходит вне его — доставляемость такого канала
0%, а галочка в матрице обещала владельцу студии рассылку, которой нет.
Реактивная сторона цела: ИИ-агент отвечает на входящие в Директе как раньше
(routers/ai/instagram.py, интеграция ig_dm).

notify не должен валить основной запрос: вся отправка в try/except с логом.
Возвращает True, если хотя бы один канал реально доставил сообщение.

send_telegram(chat_id, text, token=None, parse_mode=None) — прямая отправка по
tg_id (CL-5.4, бонусы лояльности). Bot API не умеет писать по номеру телефона,
только по chat_id, поэтому это не часть матрицы notify(), а точечный вызов из
мест, где у клиента уже есть Client.tg_id. token — бот студии; не передан —
fallback на общий env TG_BOT_TOKEN.

Каждая отправка через deliver() попадает в журнал (services/outbox.py): строка
«кому, когда, по какому событию, чем кончилось» плюс ключ дедупликации, который
не даёт заплатить дважды за одно и то же сообщение.

deliver(db, channel, recipient, subject, text, html, *, studio_id, tg_text=None)
— диспетчер каналов для сценариев лояльности (V5-5, задача 6) и фан-аута
notify(): email, telegram и whatsapp реально шлют по реквизитам студии из
StudioIntegration (N-2). recipient — Recipient(id, email, tg_id, phone);
Client/User подходят под этот интерфейс напрямую. Нет токена канала или нужного
поля у получателя (email/tg_id/phone) → False.
tg_text — готовая Telegram-версия сообщения (эмодзи + жирный заголовок,
tg_format()); передана → шлём с parse_mode=HTML, нет → канал получает голый
text как раньше (путь сценариев лояльности, где текст пишет владелец).
"""
import asyncio
import logging
import os
from datetime import datetime
from html import escape
from typing import Any, NamedTuple

import aiohttp
from aiogram import Bot
from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from contact_format import to_e164
from models import Client, Hall, Lesson, Studio, StudioIntegration, StudioMember, User
from services import email_layout, notify_texts, outbox
from services.i18n import pick, resolve
from services.mailer import send_email

load_dotenv()
logger = logging.getLogger(__name__)

NOTIFY_CHANNELS = ("email", "telegram", "whatsapp")
_CURRENCY_SIGNS = {"RUB": "₽", "USD": "$", "EUR": "€", "KZT": "₸", "BYN": "Br", "UAH": "₴",
                   "CZK": "Kč", "PLN": "zł", "GBP": "£", "HUF": "Ft", "RON": "lei"}
GRAPH = "https://graph.facebook.com/v23.0"
# ponytail: фикс-порог для события "крупный платёж" (o3), настройка в UI владельца — после MVP
LARGE_PAYMENT = 10_000

# Единый список event_id, для которых есть текст в services/notify_texts.TEXTS —
# сверяется с services.notification_catalog.CATALOG (EPIC 3, Задача 1). Новое
# событие в TEXTS → сразу добавить и сюда, иначе импорт модуля упадёт на assert.
KNOWN_EVENT_IDS = frozenset({
    "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11", "c12", "c13",
    "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9",
    "a1", "a2", "a3", "a4", "a6", "a7", "a8", "a9", "a10",
    "o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "o9",
})

# Эмодзи заголовка Telegram-сообщения (tg_format). Только для мессенджера: в
# интерфейсе эмодзи запрещены (CLAUDE.md §5), а в чате иконка — единственный
# способ отличить уведомление от обычного сообщения бота на пролистывании.
EVENT_EMOJI: dict[str, str] = {
    "c1": "✅", "c2": "⏰", "c3": "❌", "c4": "💳", "c5": "⚠️", "c6": "🔕",
    "c7": "🎉", "c8": "⭐", "c9": "↩️", "c10": "🧾", "c11": "🔄", "c12": "🎁", "c13": "☕",
    "t1": "📅", "t2": "❌", "t3": "⏰", "t4": "⏳", "t5": "🔄", "t6": "💰",
    "t7": "⭐", "t8": "🎂", "t9": "❌",
    "a1": "🌐", "a2": "⚠️", "a3": "👤", "a4": "💳", "a6": "⚠️", "a7": "🔀",
    "a8": "📊", "a9": "🔐", "a10": "↩️",
    "o1": "📊", "o2": "📈", "o3": "💎", "o4": "📉", "o5": "👥", "o6": "⏳",
    "o7": "🔑", "o8": "🏆", "o9": "📤",
}
assert EVENT_EMOJI.keys() == KNOWN_EVENT_IDS, "notifier.EVENT_EMOJI разошёлся с KNOWN_EVENT_IDS"


def tg_format(event_id: str, subject: str, text: str) -> str:
    """Telegram-версия сообщения: эмодзи + жирный заголовок + тело через пустую
    строку. Уходит с parse_mode=HTML, поэтому и заголовок, и тело экранируются:
    в них подставлены имена клиентов, названия занятий и описания — символ `<`
    или `&` там сломал бы разбор и Telegram вернул бы 400 вместо сообщения.
    quote=False — Telegram понимает только &lt; &gt; &amp;, `&quot;` он показал
    бы как есть, а кавычки в шаблонах есть (en: "Hatha")."""
    body = escape(text, quote=False)
    return f"{EVENT_EMOJI.get(event_id, '🔔')} <b>{escape(subject, quote=False)}</b>\n\n{body}"


class Recipient(NamedTuple):
    """Лёгкий получатель уведомления — общий для клиента и сотрудника (N-9.2).
    id — для логов; email/tg_id/phone — реквизиты каналов, любое может быть
    None (канал просто не сработает). Client и User обоих совместимы по
    атрибутам, поэтому deliver() принимает и живой Client напрямую.

    name — имя для обращения в письме («Матвей, здравствуйте!»). Последним и с
    дефолтом: Recipient собирается позиционно в нескольких местах, и добавить
    поле в середину значило бы молча переставить телефон с почтой."""
    id: int | None
    email: str | None
    tg_id: int | None
    phone: str | None
    name: str | None = None


async def _studio_prefs(db: AsyncSession, studio_id: int) -> tuple[str, str]:
    """(язык, валюта) студии; дефолты ("ru", "RUB") — поля nullable.

    Язык — один на все каналы и из пяти языков продукта (services/i18n): письма,
    Telegram, шаблоны WhatsApp и выгрузки переведены на один и тот же набор.
    Язык студии вне набора (pl, fr) приводится к английскому, а не к русскому.
    """
    row = (await db.execute(
        select(Studio.language, Studio.currency).where(Studio.id == studio_id)
    )).first()
    return resolve(row.language if row else None), (row.currency if row else None) or "RUB"


async def _wa_lang(db: AsyncSession, studio_id: int) -> str:
    """Язык шаблонов WhatsApp студии — он же язык всех остальных её уведомлений."""
    lang, _currency = await _studio_prefs(db, studio_id)
    return lang


def _fmt_amount(amount: float | int | None, currency: str) -> str:
    sign = _CURRENCY_SIGNS.get(currency, currency)
    return f"{amount or 0:,.0f} {sign}".replace(",", " ")


# Месяцы прописью: у клиента в письме «17 августа, 12:00», а не «17.08 12:00».
# Своя таблица, а не locale: серверная локаль на проде — C, и strftime отдал бы
# английские названия русской студии (а на Windows — вообще кракозябры).
#
# Языков пять — столько же, сколько у текстов (services/i18n): время внутри
# чешского уведомления обязано быть чешским, иначе «12 мая» приезжает в
# немецкую студию посреди немецкой фразы.
_MONTHS = {
    "ru": ("января", "февраля", "марта", "апреля", "мая", "июня",
           "июля", "августа", "сентября", "октября", "ноября", "декабря"),
    "en": ("January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"),
    "uk": ("січня", "лютого", "березня", "квітня", "травня", "червня",
           "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"),
    "cs": ("ledna", "února", "března", "dubna", "května", "června",
           "července", "srpna", "září", "října", "listopadu", "prosince"),
    "de": ("Januar", "Februar", "März", "April", "Mai", "Juni",
           "Juli", "August", "September", "Oktober", "November", "Dezember"),
}
# Языки, где число дня пишется с точкой: «12. května», «12. Mai».
_DAY_DOT = ("cs", "de")


def when_text(context: dict[str, Any], lang: str) -> str:
    """Время занятия человеческим языком. Нет ISO-времени в контексте (старые
    вызовы, ручные события) — отдаём как передали, «17.08 12:00»."""
    raw = context.get("start_at")
    if not raw:
        return context.get("start_time") or ""
    try:
        at = datetime.fromisoformat(str(raw))
    except ValueError:
        return context.get("start_time") or ""
    month = _MONTHS.get(lang, _MONTHS["ru"])[at.month - 1]
    day = f"{at.day}." if lang in _DAY_DOT else str(at.day)
    return f"{day} {month}, {at:%H:%M}"


async def lesson_context(db: AsyncSession, lesson: "Lesson") -> dict[str, Any]:
    """Стандартный контекст занятия для notify() — один на все места, где о
    занятии сообщают (запись, перенос, отмена, напоминание).

    Собирает разом и то, что попадёт в текст (`lesson_name`, `start_time`), и то,
    из чего письмо строит «Детали»: тренер, зал, стоимость. `start_at`/
    `duration_min`/`lesson_id` нужны файлу календаря — из строки «12.08 18:00»
    встречу не создать, там нет ни года, ни длительности.

    Раньше каждое место писало этот словарь руками из двух полей, и письмо про
    запись знало о занятии меньше, чем строка в журнале.
    """
    hall_name = None
    if lesson.hall_id is not None:
        hall_name = (await db.execute(
            select(Hall.name).where(Hall.id == lesson.hall_id)
        )).scalar_one_or_none()
    return {
        "lesson_id": lesson.id,
        "lesson_name": lesson.name,
        "start_time": lesson.start_time.strftime("%d.%m %H:%M"),
        "start_at": lesson.start_time.isoformat(),
        "duration_min": lesson.duration_min,
        "trainer_name": lesson.teacher_name,
        "hall_name": hall_name,
        "price": lesson.price,
    }


async def send_telegram(
    chat_id: int, text: str, token: str | None = None, parse_mode: str | None = None,
) -> bool:
    """Возвращает True, только если сообщение реально ушло. Нет токена или
    Telegram упал — False, лог, вызывающий запрос не падает.
    token — токен бота студии (StudioIntegration); не передан — fallback на
    общий env TG_BOT_TOKEN (до подключения токена в N-2).
    parse_mode="HTML" — для форматированных уведомлений (tg_format); None —
    голый текст, как шлют сценарии лояльности.
    ponytail: новый Bot() на вызов, без переиспользуемой сессии — после MVP,
    если объём отправок вырастет."""
    token = token or os.getenv("TG_BOT_TOKEN")
    if not token:
        return False
    bot = Bot(token=token)
    try:
        await bot.send_message(chat_id, text, parse_mode=parse_mode)
        return True
    except Exception:
        logger.exception("send_telegram failed: chat_id=%s", chat_id)
        return False
    finally:
        await bot.session.close()


async def _integration_config(db: AsyncSession, studio_id: int, kind: str) -> dict:
    """config подключённой StudioIntegration(studio_id, integration_type=kind) или {}."""
    config = (await db.execute(
        select(StudioIntegration.config).where(
            StudioIntegration.studio_id == studio_id,
            StudioIntegration.integration_type == kind,
            StudioIntegration.is_connected == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    return config or {}


async def _send_whatsapp(
    cfg: dict, recipient: "Recipient | Client", text: str, template: dict | None = None,
) -> bool:
    """Отправка через WhatsApp Cloud API (N-2, задача 4). Нет токена/номера
    получателя → False.

    template задан → шлём `type: "template"`. Это единственный способ написать
    первым: свободный текст Meta доставляет ТОЛЬКО внутри 24-часового окна
    диалога, а уведомление по определению приходит вне его (ошибка 131047).
    Свободный текст остаётся фолбэком для событий без шаблона.

    Номер приводим к E.164 и на кривом отказываемся отправлять. Раньше здесь
    просто выбрасывались не-цифры, и «8 999 123-45-67» уходил как 89991234567 —
    для Meta это ДРУГОЙ номер: сообщение платное, а получателя нет. Записанные до
    нормализации на входе строки лежат в БД до сих пор, поэтому проверка нужна
    именно здесь, у самого списания денег.

    ponytail: код страны проверяется только по форме E.164, не по списку реальных
    кодов — локальные 10 цифр «9991234567» станут «+9991234567» и уедут в Meta.
    Ошибиться ПОЛУЧАТЕЛЕМ так нельзя (несуществующий код = недоставлено, разговор
    не открывается и деньги не списываются), поэтому живём с этим; настоящая
    проверка страны — это libphonenumber, и она нужна не раньше, чем появится
    страна студии в профиле.
    """
    phone_number_id = cfg.get("phone_number_id")
    token = cfg.get("token")
    if not phone_number_id or not token or not recipient.phone:
        return False
    try:
        e164 = to_e164(recipient.phone)
    except ValueError:
        logger.warning("whatsapp: номер получателя %s не в формате E.164 — не отправляем", recipient.id)
        return False
    if not e164:
        return False
    to = e164.lstrip("+")
    if template is not None:
        payload = {"messaging_product": "whatsapp", "to": to, "type": "template", "template": template}
    else:
        payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": text}}
    headers = {"Authorization": f"Bearer {token}"}
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{GRAPH}/{phone_number_id}/messages", json=payload, headers=headers) as resp:
            if resp.status != 200:
                # Причина отказа («шаблон не одобрен», «вне окна», «нет оплаты»)
                # написана только в теле — она же попадает в журнал отправок и
                # становится доказательством в споре о списании.
                raise ProviderRejected(f"Graph {resp.status}: {(await resp.text())[:400]}")
            return True


# Повтор ТОЛЬКО при неустановленном соединении (см. deliver ниже).
_RETRY_BACKOFF_SECONDS = (0.5, 2.0)


class ProviderRejected(Exception):
    """Провайдер ОТВЕТИЛ отказом: сообщение не ушло, денег не списано.

    Отдельно от сетевого сбоя намеренно — это два разных ответа на «списались ли
    деньги», и журнал отправок обязан их различать (services/outbox.py). Раньше
    оба сводились к False, и в споре со студией отличить «Meta отклонила шаблон»
    от «мы не дозвонились до Meta» было нельзя.
    """


async def deliver(
    db: AsyncSession, channel: str, recipient: "Recipient | Client", subject: str, text: str, html: str,
    *, studio_id: int, tg_text: str | None = None, wa_template: dict | None = None,
    event_id: str | None = None, context: dict[str, Any] | None = None,
) -> bool:
    """Единый диспетчер каналов доставки (V5-5, задача 6; N-2, задача 4; N-9,
    задача 2): email, telegram и whatsapp реально шлют по реквизитам студии.
    recipient — Recipient или любой объект с .id/.email/.tg_id/.phone (Client,
    User). tg_text — форматированная версия для Telegram
    (tg_format); не передана — в Telegram уходит тот же голый text.
    Возвращает True, только если сообщение реально ушло; исключения не
    пробрасывает.

    Повторяет отправку ТОЛЬКО если соединение не установилось
    (ClientConnectorError): сервер запроса не видел, поэтому повтор физически
    не может задвоить сообщение. Таймауты и 5xx сюда сознательно НЕ включены —
    там запрос мог дойти, и слепой повтор списал бы деньги за второе платное
    сообщение WhatsApp.

    Каждая попытка проходит через журнал отправок (services/outbox.py):
    claim до отправки — он же отсекает дубль по ключу, finish после — с реальным
    исходом. event_id и context нужны только журналу: из них считается ключ
    дедупликации и по ним потом отвечают студии, что и когда ей уходило.
    """
    log_id = await outbox.claim(studio_id, event_id, channel, recipient, context)
    if log_id is None:
        # Уже доставлено либо уходит прямо сейчас в соседнем процессе. True, а не
        # False: для вызывающего (clients_notified) сообщение состоялось, и
        # показывать «не отправлено» из-за собственной защиты от дубля — врать.
        return True

    for attempt in range(len(_RETRY_BACKOFF_SECONDS) + 1):
        try:
            ok = await _deliver_once(
                db, channel, recipient, subject, text, html,
                studio_id=studio_id, tg_text=tg_text, wa_template=wa_template,
                event_id=event_id, context=context,
            )
            # False здесь — не отказ провайдера, а «слать было нечем»: нет адреса
            # у получателя, канал не подключён, шаблон не одобрен. Денег такое не
            # стоит, и в журнале это должно выглядеть иначе, чем отказ Meta.
            await outbox.finish(log_id, outbox.SENT if ok else outbox.REJECTED,
                                None if ok else "не отправлено: нет реквизитов канала или получателя")
            return ok
        except ProviderRejected as exc:
            logger.warning("deliver: провайдер отклонил, channel=%s recipient=%s: %s",
                           channel, recipient.id, exc)
            await outbox.finish(log_id, outbox.REJECTED, str(exc))
            return False
        except aiohttp.ClientConnectorError:
            if attempt >= len(_RETRY_BACKOFF_SECONDS):
                logger.exception(
                    "deliver: не удалось соединиться после %s попыток, channel=%s recipient=%s",
                    attempt + 1, channel, recipient.id,
                )
                await outbox.finish(log_id, outbox.ERROR,
                                    f"нет соединения после {attempt + 1} попыток")
                return False
            logger.warning(
                "deliver: нет соединения, повтор %s/%s через %sс, channel=%s",
                attempt + 1, len(_RETRY_BACKOFF_SECONDS), _RETRY_BACKOFF_SECONDS[attempt], channel,
            )
            await asyncio.sleep(_RETRY_BACKOFF_SECONDS[attempt])
        except Exception as exc:
            logger.exception("deliver failed: channel=%s recipient=%s", channel, recipient.id)
            # Ответа не было — списание НЕИЗВЕСТНО, и в споре это надо видеть как есть.
            await outbox.finish(log_id, outbox.ERROR, f"{type(exc).__name__}: {exc}")
            return False
    return False


# События с занятием в календаре: подтверждение и перенос кладут занятие в
# календарь, отмена — вычёркивает его оттуда (STATUS:CANCELLED по тому же UID).
# Напоминание (c2) файл не прикладывает: занятие уже в календаре с c1, второй
# файл создал бы дубль встречи.
_CALENDAR_EVENTS = {"c1": False, "c11": False, "c3": True}


def _calendar_for(event_id: str | None, context: dict[str, Any], studio) -> bytes | None:
    """Вложение .ics для событий занятия. Нет ISO-времени в контексте — нет и
    файла: строка «12.08 18:00» для календаря бесполезна, а угадывать год и
    часовой пояс за студию нельзя."""
    if event_id not in _CALENDAR_EVENTS or not context.get("start_at"):
        return None
    try:
        start = datetime.fromisoformat(str(context["start_at"]))
    except ValueError:
        logger.warning("calendar: start_at=%r не разобран, .ics не приложен", context.get("start_at"))
        return None
    place = getattr(studio, "name", "") or ""
    address = getattr(studio, "address", "") or ""
    return email_layout.calendar_ics(
        # UID по занятию, а не по письму: отмена обязана попасть в ту же встречу,
        # которую создало подтверждение, иначе календарь оставит её висеть.
        uid=f"lesson-{context.get('lesson_id') or start.strftime('%Y%m%d%H%M')}@velora",
        summary=context.get("lesson_name") or place,
        start=start,
        minutes=int(context.get("duration_min") or 60),
        location=", ".join(filter(None, [place, address])),
        tz=getattr(studio, "timezone", None),
        cancelled=_CALENDAR_EVENTS[event_id],
    )


def _event_markup(event_id: str | None, context: dict[str, Any], studio, studio_id: int) -> str:
    """schema.org-разметка подтверждённой брони — из неё Gmail рисует над письмом
    карточку занятия с датой, кнопкой «в календарь» и маршрутом до студии.

    Только подтверждение и перенос: у отменённого занятия карточка с маршрутом —
    приглашение съездить зря."""
    if event_id not in ("c1", "c11") or not context.get("start_at"):
        return ""
    try:
        start = datetime.fromisoformat(str(context["start_at"]))
    except ValueError:
        return ""
    return email_layout.ld_json(
        summary=context.get("lesson_name") or "",
        start=start,
        minutes=int(context.get("duration_min") or 60),
        place=getattr(studio, "name", "") or "",
        address=getattr(studio, "address", "") or "",
        url=email_layout.section_url(event_id, studio_id) or "",
    )


async def _deliver_once(
    db: AsyncSession, channel: str, recipient: "Recipient | Client", subject: str, text: str, html: str,
    *, studio_id: int, tg_text: str | None = None, wa_template: dict | None = None,
    event_id: str | None = None, context: dict[str, Any] | None = None,
) -> bool:
    """Одна попытка отправки. Исключения НЕ глушит — их разбирает deliver()."""
    if channel == "email":
        if not recipient.email:
            return False
        cfg = await _integration_config(db, studio_id, "email_sender")
        sender = cfg.get("email") if cfg.get("verified") else None
        # Всё, чем письмо подписано, — одной строкой: имя в шапке (клиент
        # записывался в студию, а не в CRM), контакты в подвале и часовой пояс
        # для календаря. Отдельный select по первичному ключу рядом с походом на
        # SMTP не стоит ничего, зато не заставляет всех вызывающих таскать
        # карточку студии с собой.
        studio = (await db.execute(
            select(Studio.name, Studio.address, Studio.phone, Studio.email,
                   Studio.timezone, Studio.language)
            .where(Studio.id == studio_id)
        )).first()
        lang = resolve(studio.language if studio else None)
        name = getattr(recipient, "name", None)
        return await send_email(
            recipient.email, subject,
            html + (email_layout.studio_card(
                studio.name, studio.address, studio.phone, studio.email, lang,
            ) if studio else "") + _event_markup(event_id, context or {}, studio, studio_id),
            sender=sender,
            brand=studio.name if studio else None,
            greeting=email_layout.greeting(name, lang),
            lang=lang,
            calendar=_calendar_for(event_id, context or {}, studio),
        )
    if channel == "telegram":
        if not recipient.tg_id:
            return False
        token = (await _integration_config(db, studio_id, "tg_notify")).get("token")
        return await send_telegram(
            recipient.tg_id, tg_text or text, token, parse_mode="HTML" if tg_text else None,
        )
    if channel == "whatsapp":
        cfg = await _integration_config(db, studio_id, "wa_notify")
        if not cfg:
            return False
        # Локальный импорт по той же причине, что и whatsapp_templates в notify():
        # цикл notifier <- whatsapp_templates <- services.whatsapp.
        from services.whatsapp import template_approved

        if not await template_approved(db, studio_id, cfg, wa_template):
            return False  # Meta отклонила шаблон — отправка всё равно не дошла бы
        return await _send_whatsapp(cfg, recipient, text, wa_template)
    return False


def _render(
    event_id: str, context: dict[str, Any], lang: str, currency: str,
) -> tuple[str, str, str] | None:
    """event_id → (subject, text, html). text — для Telegram/WhatsApp, html — для email
    (обёртка `<p>{text}</p>`). None — для события нет шаблона (пропускаем).

    Сами тексты — в services/notify_texts, на всех пяти языках продукта; здесь
    только сборка значений из контекста. Нет перевода на язык студии — берётся
    английский (i18n.pick), а не русский. Чистая функция без БД: язык и валюту
    передаёт вызывающий notify().
    """
    by_lang = notify_texts.TEXTS.get(event_id)
    if by_lang is None:
        return None
    subject, template = pick(by_lang, lang)
    text = template.format(**_values(context, lang, currency))
    return subject, text, _html_body(event_id, text, context, lang, currency)


def _values(context: dict[str, Any], lang: str, currency: str) -> dict[str, str]:
    """Подстановки для текста события — по одной на поле, уже на языке `lang`.

    Заглушка на каждое поле обязательна: шаблон обязан рендериться при
    context={} (см. tests/test_notifier.py), часть вызовов приходит без части
    полей, а письмо с дырой вида «Клиенту  возвращено 0 ₽» или «Цель «»
    достигнута» выглядит как сбой продукта. Слова заглушек — в notify_texts.WORDS,
    один раз на поле, а не в каждой из сорока строк шаблона.
    """
    def word(key: str) -> str:
        return pick(notify_texts.WORDS[key], lang)

    def num(value: Any) -> str:
        return "—" if value is None else str(value)

    when = when_text(context, lang)
    client_name = context.get("client_name") or ""
    hours = context.get("hours")            # офсет напоминания (c2)
    prev = context.get("revenue_prev")      # вчерашняя выручка в дневной сводке
    spots = context.get("spots") or ""      # места для кофе (c13) — необязательны
    description = context.get("description") or ""
    count = context.get("count")
    role = str(context.get("role") or "")
    resource = str(context.get("resource") or "")
    # Устройство и город приходят порознь и любое может быть пустым — «, Москва»
    # или «Chrome, » в письме о безопасности читаются как баг.
    device = ", ".join(p for p in (context.get("device") or "", context.get("city") or "") if p)
    period = " — ".join(p for p in (context.get("period_start") or "",
                                    context.get("period_end") or "") if p)

    return {
        "lesson": context.get("lesson_name") or word("lesson"),
        "second": context.get("second_lesson_name") or word("lesson2"),
        # tail — время в КОНЦЕ фразы («Вы записаны на «Хатха» — 12.08 18:00.»).
        # paren — то же время в СЕРЕДИНЕ, когда после него идут ещё слова: с тире
        # получалось ««Хатха» — 12.08 18:00 — через 24 ч» с тремя тире подряд.
        "tail": f" — {when}" if when else "",
        "paren": f" ({when})" if when else "",
        "when": when or word("when"),
        "client": client_name or word("client"),
        "staff": context.get("staff_name") or word("staff"),
        "names": context.get("names") or word("names"),
        "goal": context.get("goal_name") or word("goal"),
        "kind": context.get("kind") or word("kind"),
        "device": device or word("device"),
        "period": period or "—",
        "count": num(count) if count is not None else word("count"),
        "role": pick(notify_texts.ROLE_WORDS[role], lang) if role in notify_texts.ROLE_WORDS
                else (role or word("role")),
        "resource": pick(notify_texts.RESOURCE_WORDS[resource], lang)
                    if resource in notify_texts.RESOURCE_WORDS else (resource or word("resource")),
        "amount": _fmt_amount(context.get("amount"), currency),
        "revenue": _fmt_amount(context.get("revenue"), currency),
        "avg7": _fmt_amount(context.get("avg7"), currency),
        "rating": num(context.get("rating")),
        "remaining": num(context.get("remaining")),
        "days": num(context.get("days_left")),
        "lessons": num(context.get("lessons")),
        "new_clients": num(context.get("new_clients")),
        "points": num(context.get("amount")),  # сырое число баллов, не денежный формат
        # Обрывки фраз, которых может и не быть: пустое значение исчезает
        # бесследно, вместе со своим пробелом или переносом строки.
        "left": (pick(notify_texts.LEFT_HOURS, lang).format(hours=hours) if hours is not None
                 else pick(notify_texts.LEFT_SOON, lang)),
        "prev": (pick(notify_texts.PREV_REVENUE, lang).format(amount=_fmt_amount(prev, currency))
                 if prev is not None else ""),
        "bday": (pick(notify_texts.BDAY_NAMED, lang).format(name=client_name) if client_name
                 else pick(notify_texts.BDAY_PLAIN, lang)),
        "spots": pick(notify_texts.SPOTS, lang).format(spots=spots) if spots else "",
        "description": f" {description}" if description else "",
    }

# Поля контекста, которых НЕТ в тексте сообщения, но которые человек ищет в
# письме глазами: с кем занятие, в каком зале, сколько стоит. В мессенджере они
# раздули бы короткое уведомление, в письме — это «Детали записи», из-за которых
# письмо и открывают. Нет значения в контексте — строки просто не будет.
_EXTRA_FACTS: dict[str, tuple[str, ...]] = {
    "c1": ("trainer_name", "hall_name", "price"),
    "c2": ("trainer_name", "hall_name"),
    "c11": ("trainer_name", "hall_name"),
    "c8": ("trainer_name",),
    "t1": ("hall_name",),
    "t3": ("hall_name",),
    "t4": ("hall_name",),
    "a1": ("hall_name",),
}

# События, чей текст НАПИСАН как перечисление «поле: значение» — сводки, отчёты,
# выплата, состав группы. Только у них строки текста превращаются в таблицу; на
# остальных разбор не запускается вовсе, иначе фраза «Отменена: запись к тренеру
# (18:00) — менее чем за 2 часа» стала бы строкой таблицы.
_LIST_EVENTS = frozenset({"t4", "t6", "a8", "o1", "o2", "o4", "c13"})

# Даже внутри перечисления первая строка бывает фразой («Вы собирались на кофе —
# вас 3: Анна, Ольга»), поэтому ярлык и значение ограничены длиной: факт короток
# по определению, предложение — нет.
_FACT_LABEL_MAX = 20
_FACT_VALUE_MAX = 40


def _html_body(
    event_id: str, text: str, context: dict[str, Any], lang: str, currency: str,
) -> str:
    """Тело письма из текста сообщения: фразы остаются абзацем, перечисления
    («Выручка: 30 000 ₽») становятся карточкой деталей.

    Разбор текста, а не второй набор шаблонов под письмо: сводки и отчёты УЖЕ
    написаны как список «поле: значение», и держать те же цифры в двух местах
    значит однажды их разойтись. escape — по той же причине, что и в tg_format:
    в тексте подставлены имена клиентов и названия занятий.
    """
    lead: list[str] = []
    rows: list[tuple[str, str]] = []
    for line in text.split("\n"):
        label, sep, value = line.partition(": ")
        is_fact = (
            event_id in _LIST_EVENTS and sep
            and len(label) <= _FACT_LABEL_MAX and len(value) <= _FACT_VALUE_MAX
            and not value.endswith(".") and ". " not in value
        )
        if is_fact:
            rows.append((label, value))
        else:
            lead.append(line)

    for key in _EXTRA_FACTS.get(event_id, ()):
        value = context.get(key)
        if not value:
            continue
        rows.append((
            pick(notify_texts.FACT_LABELS[key], lang),
            _fmt_amount(value, currency) if key == "price" else str(value),
        ))

    body = "<p>{}</p>".format(escape("\n".join(lead), quote=False).replace("\n", "<br>")) if lead else ""
    return body + email_layout.facts(rows)


# Стартовая проверка (EPIC 3, Задача 1): выполняется один раз при импорте модуля, вне
# try/except notify() — если тексты и KNOWN_EVENT_IDS разошлись, импорт падает сразу
# при старте приложения, а не тихо глотается где-то в проде.
assert notify_texts.TEXTS.keys() == KNOWN_EVENT_IDS, "notify_texts.TEXTS / KNOWN_EVENT_IDS out of sync"
_render("c1", {}, "ru", "RUB")


def _user_recipient(user: User) -> Recipient:
    return Recipient(user.id, user.email, user.tg_id, user.phone, user.name)


# События-близнецы: у владельца есть СВОЯ версия того же письма — a8 «Отчёт за
# день» и o1 «Ежедневная сводка» отличаются только заголовком, цифры в теле те же.
# Для них fallback «нет администраторов → шлём владельцу» превращал пару в два
# одинаковых письма в 21:00 (у студии без отдельного админа — а это норма).
# Админов нет → admin-версию просто не шлём: владельца накрывает его собственная.
#
# Пара a4 «Оплата получена» ↔ o3 «Крупный платёж» — тот же случай, но условный:
# o3 уходит только на суммах от LARGE_PAYMENT, и списком по event_id это не
# выражается — на обычном платеже владелец без администратора обязан получить a4.
# Такие пары гасит вызывающий через notify(..., owner_fallback=False)
# (см. routers/finances/operations.py).
_NO_OWNER_FALLBACK = frozenset({"a8"})


async def _recipient(
    db: AsyncSession, studio_id: int, role: str, context: dict[str, Any],
    event_id: str | None = None, owner_fallback: bool = True,
) -> list[Recipient]:
    """Приводит "кому" к списку Recipient — одинаково для клиента и сотрудника
    (N-9, задача 2). Сотрудник получает свой tg_id/phone наравне с клиентом,
    гейт "только email у сотрудников" снят:
      - role == "client" → [Recipient(клиент)] по context["client_id"], либо
        [] если клиент не найден;
      - context["to_email"] задан → точечный адресат (например, тренер при
        зарплате t6): подтягиваем всю строку User по email, чтобы отдать его
        tg_id/phone, а не только email; нет такого User — fallback на голый
        email (канал доставки — только email);
      - role == "trainer" и context["trainer_id"] задан (событие конкретного
        занятия, напр. t1) → только тренер этого занятия, не вся команда;
      - role == "trainer"/"admin" без trainer_id → все сотрудники студии с
        этой ролью; "admin" без админов — fallback на владельца (в маленькой
        студии администратора может не быть), кроме событий из
        _NO_OWNER_FALLBACK, у которых владельцу и так уходит своя версия;
      - role == "owner" → владелец студии."""
    client_id = context.get("client_id")
    if role == "client":
        if client_id is None:
            return []
        client = (await db.execute(
            select(Client).where(Client.id == client_id, Client.studio_id == studio_id)
        )).scalar_one_or_none()
        if client is None:
            return []
        return [Recipient(client.id, client.email, client.tg_id, client.phone, client.name)]

    to_email = context.get("to_email")
    if to_email:
        user = (await db.execute(select(User).where(User.email == to_email))).scalar_one_or_none()
        return [_user_recipient(user) if user else Recipient(None, to_email, None, None)]

    if role == "trainer":
        # Событие конкретного занятия (t1 «новая запись») → только тренеру этого
        # занятия, не всей команде. context["trainer_id"] = Lesson.teacher_id.
        trainer_id = context.get("trainer_id")
        if trainer_id is not None:
            user = (await db.execute(select(User).where(User.id == trainer_id))).scalar_one_or_none()
            return [_user_recipient(user)] if user else []
        users = (await db.execute(
            select(User)
            .join(StudioMember, StudioMember.user_id == User.id)
            .where(StudioMember.studio_id == studio_id, StudioMember.role == "trainer")
        )).scalars().all()
        return [_user_recipient(u) for u in users]

    if role == "admin":
        users = (await db.execute(
            select(User)
            .join(StudioMember, StudioMember.user_id == User.id)
            .where(StudioMember.studio_id == studio_id, StudioMember.role == "admin")
        )).scalars().all()
        if users:
            return [_user_recipient(u) for u in users]
        if event_id in _NO_OWNER_FALLBACK or not owner_fallback:
            return []
        # fallback: маленькая студия без отдельного администратора

    owner = (await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id, StudioMember.role == "owner")
    )).scalars().first()
    if owner is None:
        return []
    # Подстановка владельца вместо отсутствующего администратора отменяется,
    # если он же ведёт это занятие: тренерскую версию того же факта (t1 к a1,
    # t2 к a2) он получает отдельным письмом, и в маленькой студии, где владелец
    # сам и админ, и тренер, одна запись клиента приходила ему дважды.
    # Настоящий администратор в студии эту ветку не проходит вовсе — он найден
    # выше и получает a1/a2 как раньше.
    if role == "admin" and context.get("trainer_id") == owner.id:
        return []
    return [_user_recipient(owner)]


async def notify(
    db: AsyncSession,
    studio_id: int,
    role: str,
    event_id: str,
    context: dict[str, Any] | None = None,
    owner_fallback: bool = True,
) -> bool:
    """Единая точка отправки: сама решает кому (To — клиент или владелец/адресат
    из context["to_email"]), от кого (From — студия), что (Message — _render на
    языке/валюте студии) и куда (Network — по включённым каналам и матрице).
    Возвращает True, если хотя бы один канал реально доставил сообщение; любой
    ранний выход (все каналы выключены, нет шаблона, некому слать, ошибка) —
    False. Вызывающий код использует это для честного clients_notified (задача 3).

    owner_fallback=False снимает подстановку владельца вместо отсутствующего
    администратора для ЭТОГО вызова — когда вызывающий тут же шлёт владельцу
    собственную версию того же факта и без этого владелец получил бы два письма
    об одном событии (см. _NO_OWNER_FALLBACK)."""
    context = context or {}
    try:
        from services.notification_resolver import resolve_channels  # локальный импорт — иначе цикл notifier<->resolver

        lang, currency = await _studio_prefs(db, studio_id)
        rendered = _render(event_id, context, lang, currency)
        if rendered is None:
            return False  # нет шаблона под событие
        subject, text, html = rendered
        # Кнопка «открыть раздел» — в письме своя, у шаблона WhatsApp своя
        # (утверждённая вместе с ним, см. whatsapp_templates.url_button). В
        # Telegram уходит голый text, туда ссылка не попадает.
        html += email_layout.cta(event_id, studio_id, lang)
        tg = tg_format(event_id, subject, text)  # эмодзи + жирный заголовок, HTML
        # Локальный импорт по той же причине, что и resolve_channels выше: цикл
        # notifier <- notification_catalog <- whatsapp_templates.
        from services.whatsapp_templates import message_payload

        wa_template = message_payload(event_id, context, lang, currency)

        recipients = await _recipient(db, studio_id, role, context, event_id, owner_fallback)
        if not recipients:
            return False  # некому слать ни на один канал

        sent = False
        for r in recipients:
            recipient_user_id = r.id if role != "client" else None  # личный слой — только у staff
            channels, forced = await resolve_channels(db, studio_id, role, event_id, recipient_user_id)
            if forced:
                logger.warning("notify: forced fallback studio=%s role=%s event=%s", studio_id, role, event_id)
            # event_id/context идут дальше только ради журнала отправок: по ним
            # считается ключ дедупликации и по ним же студии потом отвечают,
            # что именно ей уходило (services/outbox.py).
            log = {"event_id": event_id, "context": context}
            if "email" in channels and r.email:
                sent = await deliver(db, "email", r, subject, text, html, studio_id=studio_id, **log) or sent
            if "telegram" in channels and r.tg_id:
                sent = await deliver(db, "telegram", r, subject, text, html, studio_id=studio_id, tg_text=tg, **log) or sent
            if "whatsapp" in channels and r.phone:
                sent = await deliver(
                    db, "whatsapp", r, subject, text, html, studio_id=studio_id, wa_template=wa_template, **log,
                ) or sent
        return sent
    except Exception:
        logger.exception("notify failed: studio=%s role=%s event=%s", studio_id, role, event_id)
        return False


async def notify_payment(
    db: AsyncSession, studio_id: int, client_id: int | None, amount: float | int | None,
) -> None:
    """c4 клиенту + a4 админу об успешной оплате — единая врезка для всех
    платёжных потоков (checkout, продажа абонемента, сертификат, депозит; ручная
    операция в Финансах шлёт c4/a4 сама). Зовётся ПОСЛЕ commit транзакции оплаты.
    Тихо выходит при пустом client_id или неположительной сумме (оплата 0 —
    товар погашен депозитом/сертификатом, отдельного «оплата получена» не надо)."""
    if not client_id or not amount or amount <= 0:
        return
    row = (await db.execute(
        select(Client.name, Client.last_name).where(Client.id == client_id)
    )).first()
    client_name = f"{row.name} {row.last_name or ''}".strip() if row else ""
    await notify(db, studio_id, "client", "c4", {"client_id": client_id, "amount": amount})
    await notify(db, studio_id, "admin", "a4", {"client_name": client_name, "amount": amount})

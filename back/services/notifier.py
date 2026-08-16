"""Диспетчер уведомлений (эпик N-1, N-9) — единая точка отправки для всего
приложения. Вызывающий код нигде сам не решает, слать ли и куда: он лишь
описывает событие через notify(db, studio_id, role, event_id, context), а
notify() сам решает:
  - To (кому): клиент из context["client_id"] (роль "client"), сотрудники по
    роли (trainer/admin/owner) или точечный адресат context["to_email"] —
    все приводятся к списку Recipient (задача N-9.2);
  - From (от кого): сама студия — токены каналов берутся из её StudioIntegration;
  - Message (что): _render(event_id, context, lang, currency) — текст на языке
    студии (Studio.language, ru/en) и в её валюте (Studio.currency);
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
from services import email_layout, outbox
from services.mailer import send_email

load_dotenv()
logger = logging.getLogger(__name__)

NOTIFY_CHANNELS = ("email", "telegram", "whatsapp")
_CURRENCY_SIGNS = {"RUB": "₽", "USD": "$", "EUR": "€", "KZT": "₸", "BYN": "Br", "UAH": "₴",
                   "CZK": "Kč", "PLN": "zł", "GBP": "£", "HUF": "Ft", "RON": "lei"}
GRAPH = "https://graph.facebook.com/v23.0"
# ponytail: фикс-порог для события "крупный платёж" (o3), настройка в UI владельца — после MVP
LARGE_PAYMENT = 10_000

# Единый список event_id, для которых есть шаблон в TEMPLATES (см. _render ниже) —
# сверяется с services.notification_catalog.CATALOG (EPIC 3, Задача 1). Новый event_id
# в TEMPLATES → сразу добавить и сюда, иначе _render упадёт на assert.
KNOWN_EVENT_IDS = frozenset({
    "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c11", "c12", "c13",
    "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9",
    "a1", "a2", "a3", "a4", "a6", "a7", "a8", "a9", "a10",
    "o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "o9",
})

# Эмодзи заголовка Telegram-сообщения (tg_format). Только для мессенджера: в
# интерфейсе эмодзи запрещены (CLAUDE.md §5), а в чате иконка — единственный
# способ отличить уведомление от обычного сообщения бота на пролистывании.
EVENT_EMOJI: dict[str, str] = {
    "c1": "✅", "c2": "⏰", "c3": "❌", "c4": "💳", "c5": "⚠️", "c6": "🔕",
    "c7": "🎉", "c8": "⭐", "c9": "↩️", "c11": "🔄", "c12": "🎁", "c13": "☕",
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
    """(language, currency) студии; дефолты ("ru", "RUB") — поля nullable."""
    row = (await db.execute(
        select(Studio.language, Studio.currency).where(Studio.id == studio_id)
    )).first()
    lang = ((row.language if row else None) or "ru").split("-")[0]
    return (lang if lang in ("ru", "en") else "ru"), (row.currency if row else None) or "RUB"


def _fmt_amount(amount: float | int | None, currency: str) -> str:
    sign = _CURRENCY_SIGNS.get(currency, currency)
    return f"{amount or 0:,.0f} {sign}".replace(",", " ")


# Месяцы прописью: у клиента в письме «17 августа, 12:00», а не «17.08 12:00».
# Своя таблица, а не locale: серверная локаль на проде — C, и strftime отдал бы
# английские названия русской студии (а на Windows — вообще кракозябры).
_MONTHS = {
    "ru": ("января", "февраля", "марта", "апреля", "мая", "июня",
           "июля", "августа", "сентября", "октября", "ноября", "декабря"),
    "en": ("January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"),
}


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
    return f"{at.day} {month}, {at:%H:%M}"


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
        lang = ((studio.language if studio else None) or "ru")[:2]
        lang = lang if lang in ("ru", "en") else "ru"
        name = getattr(recipient, "name", None)
        return await send_email(
            recipient.email, subject,
            html + (email_layout.studio_card(
                studio.name, studio.address, studio.phone, studio.email, lang,
            ) if studio else "") + _event_markup(event_id, context or {}, studio, studio_id),
            sender=sender,
            brand=studio.name if studio else None,
            greeting=email_layout.greeting(name, lang),
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
    Fallback на ru, если для lang перевода нет. Чистая функция без БД — язык
    и валюту передаёт вызывающий notify()."""
    lesson_ru = context.get("lesson_name") or "занятие"
    lesson_en = context.get("lesson_name") or "class"
    when = when_text(context, lang)
    amount_str = _fmt_amount(context.get("amount"), currency)
    remaining = context.get("remaining")
    # tail — время в КОНЦЕ фразы («Вы записаны на «Хатха» — 12.08 18:00.»).
    # paren — то же время в СЕРЕДИНЕ, когда после него идут ещё слова: с тире
    # получалось ««Хатха» — 12.08 18:00 — через 24 ч» с тремя тире подряд.
    tail_ru = f" — {when}" if when else ""
    tail_en = f" — {when}" if when else ""
    paren_ru = f" ({when})" if when else ""
    paren_en = f" ({when})" if when else ""

    client_name = context.get("client_name") or ""
    staff_name = context.get("staff_name") or ""
    period_start = context.get("period_start") or ""
    period_end = context.get("period_end") or ""
    names = context.get("names") or ""
    revenue_str = _fmt_amount(context.get("revenue"), currency)
    avg7_str = _fmt_amount(context.get("avg7"), currency)
    lessons = context.get("lessons")
    new_clients = context.get("new_clients")
    goal_name = context.get("goal_name") or ""
    days_left = context.get("days_left")
    role_ru = {"admin": "администратор", "trainer": "тренер", "owner": "владелец"}.get(context.get("role"), context.get("role") or "")
    role_en = context.get("role") or ""
    hours = context.get("hours")

    second_lesson = context.get("second_lesson_name") or ""
    resource_ru = {"hall": "зал", "trainer": "тренер"}.get(context.get("resource"), context.get("resource") or "")
    resource_en = {"hall": "hall", "trainer": "trainer"}.get(context.get("resource"), context.get("resource") or "")
    device = context.get("device") or ""
    city = context.get("city") or ""
    kind = context.get("kind") or ""
    rating = context.get("rating")
    amount_raw = context.get("amount")  # сырое число (баллы), не денежный формат
    description = context.get("description") or ""

    # ── Заглушки на пустой контекст ──────────────────────────────────────────
    # Шаблон обязан рендериться при context={} (см. tests/test_notifier.py): часть
    # вызовов приходит без части полей, а письмо с дырой вида «Клиенту  возвращено
    # 0 ₽» или «Цель «» достигнута» выглядит как сбой продукта. Дефолт ставится
    # ЗДЕСЬ, один раз на поле, а не в каждой из сорока строк шаблона.
    def _or(value: str, ru: str, en: str) -> str:
        return value or (ru if lang == "ru" else en)

    client_txt = _or(client_name, "клиент", "the client")
    staff_txt = _or(staff_name, "сотрудник", "the staff member")
    goal_txt = _or(goal_name, "без названия", "untitled")
    kind_txt = _or(kind, "данные", "data")
    names_txt = _or(names, "пока никого", "nobody yet")
    when_txt = _or(when, "уточняется", "to be confirmed")
    second_txt = _or(second_lesson, "другое занятие", "another class")
    resource_txt = _or(resource_ru if lang == "ru" else resource_en, "ресурс", "resource")
    role_txt = _or(role_ru if lang == "ru" else role_en, "без роли", "unassigned")
    rating_txt = "—" if rating is None else str(rating)
    remaining_txt = "—" if remaining is None else str(remaining)
    days_txt = "—" if days_left is None else str(days_left)
    points_txt = "—" if amount_raw is None else str(amount_raw)
    lessons_txt = "—" if lessons is None else str(lessons)
    new_clients_txt = "—" if new_clients is None else str(new_clients)
    # Устройство и город приходят порознь и любое может быть пустым — «, Москва»
    # или «Chrome, » в письме о безопасности читаются как баг.
    device_txt = ", ".join(p for p in (device, city) if p) or (
        "неизвестное устройство" if lang == "ru" else "an unknown device")
    period_txt = " — ".join(p for p in (period_start, period_end) if p) or "—"
    # Сколько времени осталось до занятия (c2). hours приходит из офсета
    # напоминания, но на пустом контексте его нет.
    left_ru = f"через {hours} ч" if hours is not None else "уже скоро"
    left_en = f"in {hours}h" if hours is not None else "soon"
    # Вчерашняя выручка в дневной сводке: без неё сегодняшняя цифра ни о чём не
    # говорит. Приходит только из daily_notify — в остальных случаях молчим.
    prev = context.get("revenue_prev")
    prev_ru = f" (вчера {_fmt_amount(prev, currency)})" if prev is not None else ""
    prev_en = f" (yesterday {_fmt_amount(prev, currency)})" if prev is not None else ""
    # Поздравление без имени не должно начинаться с запятой.
    bday_ru = f"{client_name}, поздравляем вас с днём рождения!" if client_name else "Поздравляем вас с днём рождения!"
    bday_en = f"{client_name}, happy birthday!" if client_name else "Happy birthday!"

    # «Кофе после занятия» (c13). Места — необязательная часть: студия могла их
    # не заводить, и «Рядом:» с пустотой после двоеточия читалось бы как сбой.
    people_count = context.get("count")
    count_txt = _or("" if people_count is None else str(people_count), "несколько человек", "a few")
    spots = context.get("spots") or ""
    spots_ru = f"\nРядом: {spots}" if spots else ""
    spots_en = f"\nNearby: {spots}" if spots else ""

    # ФОРМА ТЕКСТА. Первая строка — что случилось, вторая — что это значит или
    # что с этим делать. Ссылку на раздел добавляет оболочка письма
    # (email_layout.cta), поэтому «перейдите в раздел X» в тексте не пишем —
    # получилось бы две кнопки об одном.
    # Формулировки безличные там, где подставляется имя: «записался/отменил»
    # угадывают род клиента, а он в БД не хранится.
    TEMPLATES: dict[str, dict[str, tuple[str, str]]] = {
        "c1": {
            "ru": ("Запись подтверждена",
                   f"Вы записаны на «{lesson_ru}»{tail_ru}.\n"
                   f"Если планы изменятся, отмените запись заранее — место достанется другому."),
            "en": ("Booking confirmed",
                   f'You\'re booked for "{lesson_en}"{tail_en}.\n'
                   f"If your plans change, cancel in advance so someone else can take the spot."),
        },
        "c3": {
            "ru": ("Занятие отменено",
                   f"«{lesson_ru}»{paren_ru} отменено. Приносим извинения.\n"
                   f"Другое время можно выбрать в расписании."),
            "en": ("Class cancelled",
                   f'"{lesson_en}"{paren_en} has been cancelled. We\'re sorry.\n'
                   f"You can pick another time in the schedule."),
        },
        "c4": {
            "ru": ("Оплата получена",
                   f"Оплата на {amount_str} прошла успешно.\n"
                   f"История платежей и абонемент — в вашем профиле."),
            "en": ("Payment received",
                   f"Your payment of {amount_str} went through.\n"
                   f"Payment history and your subscription are in your profile."),
        },
        "c5": {
            "ru": ("Абонемент на исходе",
                   f"В абонементе осталось занятий: {remaining_txt}.\n"
                   f"Продлите заранее, чтобы не прерывать занятия."),
            "en": ("Subscription running low",
                   f"Classes left on your subscription: {remaining_txt}.\n"
                   f"Renew in advance so your training doesn't stop."),
        },
        "c6": {
            "ru": ("Абонемент закончился",
                   "Абонемент закончился — записаться по нему больше нельзя.\n"
                   "Оформите новый, чтобы продолжить занятия."),
            "en": ("Subscription ended",
                   "Your subscription has ended — you can no longer book with it.\n"
                   "Get a new one to keep training."),
        },
        "c2": {
            "ru": ("Напоминание о занятии",
                   f"«{lesson_ru}»{paren_ru} — {left_ru}.\n"
                   f"Не сможете прийти? Отмените запись, чтобы место освободилось."),
            "en": ("Class reminder",
                   f'"{lesson_en}"{paren_en} — {left_en}.\n'
                   f"Can't make it? Cancel your booking so the spot frees up."),
        },
        "c13": {
            "ru": ("Кофе после занятия",
                   f"Вы собирались на кофе — вас {count_txt}: {names_txt}.{spots_ru}"),
            "en": ("Coffee after class",
                   f"You planned coffee together — {count_txt} of you: {names_txt}.{spots_en}"),
        },
        "t1": {
            "ru": ("Новая запись",
                   f"Новая запись на «{lesson_ru}»{paren_ru} — {client_txt}.\n"
                   f"Полный состав группы придёт за 30 минут до начала."),
            "en": ("New booking",
                   f'New booking for "{lesson_en}"{paren_en} — {client_txt}.\n'
                   f"The full roster arrives 30 minutes before the start."),
        },
        "t3": {
            "ru": ("Занятие через час",
                   f"«{lesson_ru}»{paren_ru} начнётся через час.\n"
                   f"Состав группы придёт отдельно, за 30 минут до начала."),
            "en": ("Class in an hour",
                   f'"{lesson_en}"{paren_en} starts in an hour.\n'
                   f"The roster comes separately, 30 minutes before the start."),
        },
        # t4 — не второе напоминание, а состав группы (так он и подписан в матрице
        # уведомлений: «Список участников группы»). Формулировку «начнётся через
        # 30 минут» здесь держать нельзя: вместе с t3 это два письма об одном
        # занятии с разницей в полчаса, и тренер перестаёт читать оба.
        "t4": {
            "ru": ("Список участников",
                   f"Кто придёт на «{lesson_ru}»{paren_ru}:\n{names_txt}"),
            "en": ("Class roster",
                   f'Who\'s coming to "{lesson_en}"{paren_en}:\n{names_txt}'),
        },
        "c11": {
            "ru": ("Занятие перенесено",
                   f"«{lesson_ru}» перенесено. Новое время: {when_txt}.\n"
                   f"Запись сохранена — если время не подходит, отмените её."),
            "en": ("Class rescheduled",
                   f'"{lesson_en}" has been rescheduled. New time: {when_txt}.\n'
                   f"Your booking is kept — cancel it if the new time doesn't work."),
        },
        "t6": {
            "ru": ("Выплачена зарплата",
                   f"Сумма: {amount_str}\nПериод: {period_txt}\n"
                   f"Расчёт по занятиям — в разделе финансов."),
            "en": ("Salary paid",
                   f"Amount: {amount_str}\nPeriod: {period_txt}\n"
                   f"The per-class breakdown is in the finances section."),
        },
        "c7": {
            "ru": ("С днём рождения!",
                   f"{bday_ru}\nБудем рады видеть вас на занятии — приходите, когда будет настроение."),
            "en": ("Happy Birthday!",
                   f"{bday_en}\nWe'd love to see you at a class whenever you feel like it."),
        },
        "t8": {
            "ru": ("Дни рождения клиентов",
                   f"Сегодня день рождения у: {names_txt}.\n"
                   f"Хороший повод поздравить лично, если человек придёт на занятие."),
            "en": ("Client birthdays today",
                   f"Today's birthdays: {names_txt}.\n"
                   f"A good reason to say it in person if they come to class."),
        },
        "t9": {
            "ru": ("Занятие отменено",
                   f"Ваше занятие «{lesson_ru}»{paren_ru} отменено.\n"
                   f"Записанные клиенты уведомлены — приходить не нужно."),
            "en": ("Class cancelled",
                   f'Your class "{lesson_en}"{paren_en} has been cancelled.\n'
                   f"The booked clients have been notified — you don't need to come in."),
        },
        "a1": {
            "ru": ("Новая онлайн-запись",
                   f"Через онлайн-запись оформлена запись на «{lesson_ru}» — {client_txt}.\n"
                   f"Занятие уже стоит в журнале."),
            "en": ("New online booking",
                   f'A booking for "{lesson_en}" came in online — {client_txt}.\n'
                   f"It's already in the journal."),
        },
        "a2": {
            "ru": ("Отмена менее чем за час",
                   f"Поздняя отмена на «{lesson_ru}» — {client_txt}, меньше чем за час до начала.\n"
                   f"Место освободилось: его ещё можно кому-то предложить."),
            "en": ("Cancellation under an hour",
                   f'Late cancellation for "{lesson_en}" — {client_txt}, under an hour before start.\n'
                   f"The spot is free again and can still be offered to someone."),
        },
        "a3": {
            "ru": ("Новый клиент в системе",
                   f"Добавлен новый клиент: {client_txt}.\n"
                   f"Проверьте телефон и email — без них напоминания о занятиях ему не уйдут."),
            "en": ("New client added",
                   f"A new client has been added: {client_txt}.\n"
                   f"Check their phone and email — without those, reminders won't reach them."),
        },
        "a4": {
            "ru": ("Оплата получена",
                   f"Оплата {amount_str} от клиента {client_txt}.\n"
                   f"Операция проведена и уже видна в финансах."),
            "en": ("Payment received",
                   f"Payment of {amount_str} from {client_txt}.\n"
                   f"The operation is recorded and already visible in finances."),
        },
        "a6": {
            "ru": ("Абонемент клиента на исходе",
                   f"У клиента {client_txt} осталось занятий: {remaining_txt}.\n"
                   f"Хороший повод предложить продление до того, как абонемент кончится."),
            "en": ("Client's subscription running low",
                   f"Classes left for {client_txt}: {remaining_txt}.\n"
                   f"A good moment to offer a renewal before it runs out."),
        },
        "a8": {
            "ru": ("Отчёт за день",
                   f"Выручка: {revenue_str}{prev_ru}\nЗанятий: {lessons_txt}\nНовых клиентов: {new_clients_txt}"),
            "en": ("Daily report",
                   f"Revenue: {revenue_str}{prev_en}\nClasses: {lessons_txt}\nNew clients: {new_clients_txt}"),
        },
        "a10": {
            "ru": ("Оформлен возврат",
                   f"Клиенту {client_txt} возвращено {amount_str}.\n"
                   f"Возврат проведён в финансах — деньги уйдут тем же способом, каким платили."),
            "en": ("Refund issued",
                   f"{client_txt} was refunded {amount_str}.\n"
                   f"It's recorded in finances — the money goes back the same way it came."),
        },
        "c8": {
            "ru": ("Как прошло занятие?",
                   f"Как вам «{lesson_ru}»?\n"
                   f"Оценка займёт полминуты и поможет тренеру понять, что стоит поправить."),
            "en": ("How was your class?",
                   f'How was "{lesson_en}"?\n'
                   f"Rating it takes half a minute and helps the instructor adjust."),
        },
        "c9": {
            "ru": ("Возврат средств оформлен",
                   f"Возврат {amount_str} оформлен.\n"
                   f"Деньги вернутся тем же способом, каким была сделана оплата; срок зависит от банка."),
            "en": ("Refund issued",
                   f"A refund of {amount_str} has been issued.\n"
                   f"The money returns the same way you paid; timing depends on your bank."),
        },
        "o1": {
            "ru": ("Ежедневная сводка",
                   f"Выручка: {revenue_str}{prev_ru}\nЗанятий: {lessons_txt}\nНовых клиентов: {new_clients_txt}"),
            "en": ("Daily summary",
                   f"Revenue: {revenue_str}{prev_en}\nClasses: {lessons_txt}\nNew clients: {new_clients_txt}"),
        },
        "o2": {
            "ru": ("Еженедельный отчёт",
                   f"Выручка за неделю: {revenue_str}\nЗанятий: {lessons_txt}\nНовых клиентов: {new_clients_txt}"),
            "en": ("Weekly report",
                   f"Revenue this week: {revenue_str}\nClasses: {lessons_txt}\nNew clients: {new_clients_txt}"),
        },
        "o3": {
            "ru": ("Крупный платёж",
                   f"Крупная оплата: {amount_str} от клиента {client_txt}.\n"
                   f"Это заметно выше обычного чека."),
            "en": ("Large payment",
                   f"Large payment: {amount_str} from {client_txt}.\n"
                   f"That's noticeably above the usual ticket."),
        },
        "o4": {
            "ru": ("Резкое падение выручки",
                   f"Сегодня: {revenue_str}\nСреднее за неделю: {avg7_str}\n"
                   f"Падение больше чем вдвое — стоит посмотреть, что случилось с расписанием и записями."),
            "en": ("Revenue drop",
                   f"Today: {revenue_str}\nWeekly average: {avg7_str}\n"
                   f"More than a twofold drop — worth checking the schedule and bookings."),
        },
        "o5": {
            "ru": ("Добавлен сотрудник",
                   f"В команду добавлен сотрудник: {staff_txt}.\n"
                   f"Проверьте роль доступа — от неё зависит, какие разделы он видит."),
            "en": ("Staff member added",
                   f"A new staff member has been added: {staff_txt}.\n"
                   f"Check their access role — it decides which sections they can see."),
        },
        "o6": {
            "ru": ("Тариф истекает",
                   f"До конца оплаченного периода дней: {days_txt}.\n"
                   f"После этого доступ к CRM закроется — продлите подписку заранее."),
            "en": ("Plan expiring soon",
                   f"Days left in your paid period: {days_txt}.\n"
                   f"After that access closes — renew in advance."),
        },
        "o7": {
            "ru": ("Изменены права доступа",
                   f"Роль доступа изменена: {staff_txt} — теперь {role_txt}.\n"
                   f"Если вы этого не делали — проверьте, у кого ещё есть доступ владельца."),
            "en": ("Access role changed",
                   f"Access role changed: {staff_txt} is now {role_txt}.\n"
                   f"If this wasn't you — check who else has owner access."),
        },
        "o8": {
            "ru": ("Финансовая цель достигнута",
                   f"Цель «{goal_txt}» достигнута.\nМожно ставить следующую."),
            "en": ("Financial goal reached",
                   f'Goal "{goal_txt}" has been reached.\nTime to set the next one.'),
        },
        "t2": {
            "ru": ("Отмена записи",
                   f"Отмена записи на «{lesson_ru}»{paren_ru} — {client_txt}, меньше чем за 2 часа до начала.\n"
                   f"Состав группы изменился, проверьте его перед занятием."),
            "en": ("Booking cancelled",
                   f'Cancellation for "{lesson_en}"{paren_en} — {client_txt}, under 2 hours before start.\n'
                   f"The roster changed — check it before the class."),
        },
        "t5": {
            "ru": ("Изменение в расписании",
                   f"«{lesson_ru}» перенесено. Новое время: {when_txt}.\n"
                   f"Если новое время вам не подходит, скажите администратору."),
            "en": ("Schedule change",
                   f'"{lesson_en}" has been rescheduled. New time: {when_txt}.\n'
                   f"Tell the administrator if the new time doesn't work for you."),
        },
        "a7": {
            "ru": ("Конфликт расписания",
                   f"Наложение: «{lesson_ru}» и «{second_txt}»{paren_ru} — общий {resource_txt}.\n"
                   f"Одно из занятий нужно перенести, иначе придут обе группы."),
            "en": ("Schedule conflict",
                   f'Overlap: "{lesson_en}" and "{second_txt}"{paren_en} — shared {resource_txt}.\n'
                   f"One of them has to move, or both groups will show up."),
        },
        "a9": {
            "ru": ("Вход с нового устройства",
                   f"Вход в аккаунт {staff_txt} с нового устройства: {device_txt}.\n"
                   f"Если это были не вы — смените пароль и завершите чужие сессии."),
            "en": ("New device login",
                   f"{staff_txt}'s account was accessed from a new device: {device_txt}.\n"
                   f"If this wasn't you — change the password and end the other sessions."),
        },
        "o9": {
            "ru": ("Экспорт данных",
                   f"Выгружены данные: {kind_txt}. Инициатор — {staff_txt}.\n"
                   f"Если это были не вы — проверьте активные сессии и ключи доступа."),
            "en": ("Data export",
                   f"Data exported: {kind_txt}. Initiated by {staff_txt}.\n"
                   f"If this wasn't you — review active sessions and access keys."),
        },
        "c12": {
            "ru": ("Начислены бонусы",
                   f"Вам начислено баллов: {points_txt}. {description}".strip()
                   + "\nПотратить их можно при оплате занятий и абонементов."),
            "en": ("Bonus credited",
                   f"You've earned {points_txt} points. {description}".strip()
                   + "\nYou can spend them on classes and subscriptions."),
        },
        # t7 — задел (N-9 границы): эндпоинта создания отзыва ещё нет, врезки тоже.
        "t7": {
            "ru": ("Новый отзыв",
                   f"Новая оценка занятия «{lesson_ru}»: {rating_txt}★ от клиента {client_txt}."),
            "en": ("New review",
                   f'New rating for "{lesson_en}": {rating_txt}★ from {client_txt}.'),
        },
    }

    assert TEMPLATES.keys() == KNOWN_EVENT_IDS, "notifier.TEMPLATES / KNOWN_EVENT_IDS out of sync"

    by_lang = TEMPLATES.get(event_id)
    if by_lang is None:
        return None
    subject, text = by_lang.get(lang) or by_lang["ru"]
    return subject, text, _html_body(event_id, text, context, lang, currency)


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

_FACT_LABELS: dict[str, tuple[str, str]] = {
    "trainer_name": ("Тренер", "Trainer"),
    "hall_name": ("Зал", "Room"),
    "price": ("Стоимость", "Price"),
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

    i = 0 if lang == "ru" else 1
    for key in _EXTRA_FACTS.get(event_id, ()):
        value = context.get(key)
        if not value:
            continue
        rows.append((
            _FACT_LABELS[key][i],
            _fmt_amount(value, currency) if key == "price" else str(value),
        ))

    body = "<p>{}</p>".format(escape("\n".join(lead), quote=False).replace("\n", "<br>")) if lead else ""
    return body + email_layout.facts(rows)


# Стартовая проверка (EPIC 3, Задача 1): выполняется один раз при импорте модуля, вне
# try/except notify() — если TEMPLATES и KNOWN_EVENT_IDS разошлись, импорт падает сразу
# при старте приложения, а не тихо глотается где-то в проде.
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
        # Кнопка «открыть раздел» — только в письме: у него есть место под неё, а
        # в Telegram/WhatsApp уходит text, и туда ссылка не попадает (шаблоны WA
        # утверждены Meta в утверждённом виде, самодеятельность их ломает).
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

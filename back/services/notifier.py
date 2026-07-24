"""Диспетчер уведомлений (эпик N-1) — единая точка отправки для всего приложения.
Вызывающий код нигде сам не решает, слать ли и куда: он лишь описывает событие
через notify(db, studio_id, role, event_id, context), а notify() сам решает:
  - To (кому): клиент из context["client_id"] (роль "client"), иначе владелец
    студии или явный адресат context["to_email"] (сотрудник, например тренер);
  - From (от кого): сама студия — токены каналов берутся из её StudioIntegration;
  - Message (что): _render(event_id, context, lang, currency) — текст на языке
    студии (Studio.language, ru/en) и в её валюте (Studio.currency);
  - Network (куда): NOTIFY_CHANNELS = ("email", "telegram", "whatsapp") —
    только каналы, включённые и глобально (StudioNotificationSettings), и в
    матрице события (NotificationEventToggle); sms/push/instagram не участвуют.

notify не должен валить основной запрос: вся отправка в try/except с логом.
Возвращает True, если хотя бы один канал реально доставил сообщение.

send_telegram(chat_id, text, token=None) — прямая отправка по tg_id (CL-5.4,
бонусы лояльности). Bot API не умеет писать по номеру телефона, только по
chat_id, поэтому это не часть матрицы notify(), а точечный вызов из мест, где
у клиента уже есть Client.tg_id. token — бот студии; не передан — fallback
на общий env TG_BOT_TOKEN.

deliver(db, channel, client, subject, text, html, *, studio_id) — диспетчер
каналов для сценариев лояльности (V5-5, задача 6) и фан-аута notify(): email,
telegram и whatsapp реально шлют по реквизитам студии из StudioIntegration
(N-2). Нет токена канала или нужного поля у клиента (email/tg_id/phone) → False.
"""
import logging
import os
import re
from typing import Any

import aiohttp
from aiogram import Bot
from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Client, NotificationEventToggle, Studio, StudioIntegration, StudioNotificationSettings, StudioMember, User,
)
from services.mailer import send_email

load_dotenv()
logger = logging.getLogger(__name__)

NOTIFY_CHANNELS = ("email", "telegram", "whatsapp")
_CURRENCY_SIGNS = {"RUB": "₽", "USD": "$", "EUR": "€", "KZT": "₸", "BYN": "Br", "UAH": "₴"}
GRAPH = "https://graph.facebook.com/v20.0"
# ponytail: фикс-порог для события "крупный платёж" (o3), настройка в UI владельца — после MVP
LARGE_PAYMENT = 10_000


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


async def send_telegram(chat_id: int, text: str, token: str | None = None) -> bool:
    """Возвращает True, только если сообщение реально ушло. Нет токена или
    Telegram упал — False, лог, вызывающий запрос не падает.
    token — токен бота студии (StudioIntegration); не передан — fallback на
    общий env TG_BOT_TOKEN (до подключения токена в N-2).
    ponytail: новый Bot() на вызов, без переиспользуемой сессии — после MVP,
    если объём отправок вырастет."""
    token = token or os.getenv("TG_BOT_TOKEN")
    if not token:
        return False
    bot = Bot(token=token)
    try:
        await bot.send_message(chat_id, text)
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


async def _send_whatsapp(cfg: dict, client: Client, text: str) -> bool:
    """Отправка через WhatsApp Cloud API (N-2, задача 4). Нет токена/номера
    клиента → False. Свободный текст доставляется только в 24-часовом окне
    диалога — на стороне Meta, здесь не проверяется (MVP)."""
    phone_number_id = cfg.get("phone_number_id")
    token = cfg.get("token")
    if not phone_number_id or not token or not client.phone:
        return False
    to = re.sub(r"\D", "", client.phone)
    payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": text}}
    headers = {"Authorization": f"Bearer {token}"}
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{GRAPH}/{phone_number_id}/messages", json=payload, headers=headers) as resp:
            return resp.status == 200


async def deliver(
    db: AsyncSession, channel: str, client: Client, subject: str, text: str, html: str,
    *, studio_id: int,
) -> bool:
    """Единый диспетчер каналов доставки (V5-5, задача 6; N-2, задача 4): email,
    telegram и whatsapp реально шлют по реквизитам студии. Возвращает True,
    только если сообщение реально ушло; исключения не пробрасывает."""
    try:
        if channel == "email":
            if not client.email:
                return False
            cfg = await _integration_config(db, studio_id, "email_sender")
            sender = cfg.get("email") if cfg.get("verified") else None
            await send_email(client.email, subject, html, sender=sender)
            return True
        if channel == "telegram":
            if not client.tg_id:
                return False
            token = (await _integration_config(db, studio_id, "tg_notify")).get("token")
            return await send_telegram(client.tg_id, text, token)
        if channel == "whatsapp":
            cfg = await _integration_config(db, studio_id, "wa_notify")
            if not cfg:
                return False
            return await _send_whatsapp(cfg, client, text)
        return False
    except Exception:
        logger.exception("deliver failed: channel=%s client=%s", channel, client.id)
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
    when = context.get("start_time") or ""
    amount_str = _fmt_amount(context.get("amount"), currency)
    remaining = context.get("remaining")
    tail_ru = f" — {when}" if when else ""
    tail_en = f" — {when}" if when else ""

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

    TEMPLATES: dict[str, dict[str, tuple[str, str]]] = {
        "c1": {
            "ru": ("Запись подтверждена", f"Вы записаны на «{lesson_ru}»{tail_ru}. Ждём вас!"),
            "en": ("Booking confirmed", f'You\'re booked for "{lesson_en}"{tail_en}. See you there!'),
        },
        "c3": {
            "ru": ("Занятие отменено", f"К сожалению, «{lesson_ru}»{tail_ru} отменено. Приносим извинения."),
            "en": ("Class cancelled", f'Unfortunately, "{lesson_en}"{tail_en} has been cancelled. We apologize.'),
        },
        "c4": {
            "ru": ("Оплата получена", f"Оплата на {amount_str} прошла успешно. Спасибо!"),
            "en": ("Payment received", f"Your payment of {amount_str} was successful. Thank you!"),
        },
        "c5": {
            "ru": ("Абонемент на исходе", f"В вашем абонементе осталось {remaining} занятий. Пора продлить."),
            "en": ("Subscription running low", f"You have {remaining} classes left. Time to renew."),
        },
        "c6": {
            "ru": ("Абонемент закончился", "Ваш абонемент завершён. Оформите новый, чтобы продолжить занятия."),
            "en": ("Subscription ended", "Your subscription has ended. Get a new one to keep training."),
        },
        "c2": {
            "ru": ("Напоминание о занятии", f"Напоминаем: «{lesson_ru}»{tail_ru} через {hours} ч."),
            "en": ("Class reminder", f'Reminder: "{lesson_en}"{tail_en} in {hours}h.'),
        },
        "t3": {
            "ru": ("Занятие через час", f"«{lesson_ru}»{tail_ru} начнётся через час."),
            "en": ("Class in an hour", f'"{lesson_en}"{tail_en} starts in an hour.'),
        },
        "t4": {
            "ru": ("Занятие через 30 минут", f"«{lesson_ru}»{tail_ru} через 30 минут. Записаны: {names}."),
            "en": ("Class in 30 minutes", f'"{lesson_en}"{tail_en} in 30 minutes. Attendees: {names}.'),
        },
        "c11": {
            "ru": ("Занятие изменено", f"Занятие «{lesson_ru}» перенесено — новое время: {when}."),
            "en": ("Class rescheduled", f'"{lesson_en}" has been rescheduled — new time: {when}.'),
        },
        "t6": {
            "ru": ("Выплачена зарплата", f"Выплачена зарплата {amount_str} за период {period_start} — {period_end}."),
            "en": ("Salary paid", f"Salary of {amount_str} paid for the period {period_start} — {period_end}."),
        },
        "c7": {
            "ru": ("С днём рождения!", f"{client_name}, поздравляем вас с днём рождения! Ждём вас на занятиях — будем рады видеть."),
            "en": ("Happy Birthday!", f"{client_name}, happy birthday! We'd love to see you at a class soon."),
        },
        "t8": {
            "ru": ("Дни рождения клиентов", f"Сегодня день рождения у: {names}."),
            "en": ("Client birthdays today", f"Today's birthdays: {names}."),
        },
        "a1": {
            "ru": ("Новая онлайн-запись", f"Новая запись клиента {client_name} на «{lesson_ru}»."),
            "en": ("New online booking", f'New booking from {client_name} for "{lesson_en}".'),
        },
        "a2": {
            "ru": ("Отмена менее чем за час", f"Клиент {client_name} отменил запись на «{lesson_ru}» менее чем за час до начала."),
            "en": ("Cancellation under an hour", f'{client_name} cancelled "{lesson_en}" less than an hour before start.'),
        },
        "a3": {
            "ru": ("Новый клиент в системе", f"В систему добавлен новый клиент: {client_name}."),
            "en": ("New client added", f"A new client has been added: {client_name}."),
        },
        "a4": {
            "ru": ("Оплата получена", f"Оплата {amount_str} от клиента {client_name}."),
            "en": ("Payment received", f"Payment of {amount_str} from {client_name}."),
        },
        "a6": {
            "ru": ("Абонемент на исходе", f"У клиента {client_name} осталось {remaining} занятий по абонементу."),
            "en": ("Subscription running low", f"{client_name} has {remaining} classes left on their subscription."),
        },
        "a8": {
            "ru": ("Отчёт за день", f"Выручка: {revenue_str}, занятий: {lessons}, новых клиентов: {new_clients}."),
            "en": ("Daily report", f"Revenue: {revenue_str}, classes: {lessons}, new clients: {new_clients}."),
        },
        "a10": {
            "ru": ("Оформлен возврат", f"Оформлен возврат {amount_str} клиенту {client_name}."),
            "en": ("Refund issued", f"Refund of {amount_str} issued to {client_name}."),
        },
        "c8": {
            "ru": ("Как прошло занятие?", f"Как вам «{lesson_ru}»? Будем рады отзыву — это поможет нам стать лучше."),
            "en": ("How was your class?", f'How was "{lesson_en}"? We\'d love your feedback.'),
        },
        "c9": {
            "ru": ("Возврат средств оформлен", f"Возврат {amount_str} оформлен и поступит в ближайшее время."),
            "en": ("Refund issued", f"A refund of {amount_str} has been issued and is on its way."),
        },
        "o1": {
            "ru": ("Ежедневная сводка", f"Выручка: {revenue_str}, занятий: {lessons}, новых клиентов: {new_clients}."),
            "en": ("Daily summary", f"Revenue: {revenue_str}, classes: {lessons}, new clients: {new_clients}."),
        },
        "o2": {
            "ru": ("Еженедельный отчёт", f"За неделю: выручка {revenue_str}, занятий {lessons}, новых клиентов {new_clients}."),
            "en": ("Weekly report", f"This week: revenue {revenue_str}, classes {lessons}, new clients {new_clients}."),
        },
        "o3": {
            "ru": ("Крупный платёж", f"Крупный платёж {amount_str} от клиента {client_name}."),
            "en": ("Large payment", f"Large payment of {amount_str} from {client_name}."),
        },
        "o4": {
            "ru": ("Резкое падение выручки", f"Выручка за сегодня ({revenue_str}) заметно ниже среднего за неделю ({avg7_str})."),
            "en": ("Revenue drop", f"Today's revenue ({revenue_str}) is notably below the weekly average ({avg7_str})."),
        },
        "o5": {
            "ru": ("Добавлен сотрудник", f"В команду добавлен новый сотрудник: {staff_name}."),
            "en": ("Staff member added", f"A new staff member has been added: {staff_name}."),
        },
        "o6": {
            "ru": ("Тариф истекает", f"Тариф истекает через {days_left} дн. Продлите подписку, чтобы не потерять доступ."),
            "en": ("Plan expiring soon", f"Your plan expires in {days_left} days. Renew to keep access."),
        },
        "o7": {
            "ru": ("Изменены права доступа", f"Изменены права доступа сотрудника {staff_name}: новая роль — {role_ru}."),
            "en": ("Access role changed", f"{staff_name}'s access role has been changed to {role_en}."),
        },
        "o8": {
            "ru": ("Финансовая цель достигнута", f"Цель «{goal_name}» достигнута!"),
            "en": ("Financial goal reached", f'Goal "{goal_name}" has been reached!'),
        },
    }

    by_lang = TEMPLATES.get(event_id)
    if by_lang is None:
        return None
    subject, text = by_lang.get(lang) or by_lang["ru"]
    return subject, text, f"<p>{text}</p>"


async def _recipient(
    db: AsyncSession, studio_id: int, role: str, context: dict[str, Any],
) -> tuple[Client | None, list[str]]:
    """Клиентские события → (Client, [email клиента]) — Client нужен для tg_id.
    Остальные роли — точечный адресат или список email по роли:
      - context["to_email"] задан → (None, [to_email]) — приоритет над всем
        остальным (например, конкретный тренер при зарплате);
      - role == "trainer" → email всех тренеров студии (fallback — пусто,
        владельцу чужие события не шлём);
      - role == "admin" → email всех админов, fallback — владелец (в
        маленькой студии администратора может не быть);
      - role == "owner" → email владельца.
    Каналы telegram/whatsapp работают только при наличии Client — у
    сотрудников нет tg_id/привязанного номера, их канал доставки — только
    email (осознанное MVP-ограничение)."""
    client_id = context.get("client_id")
    if role == "client" and client_id is not None:
        client = (await db.execute(
            select(Client).where(Client.id == client_id, Client.studio_id == studio_id)
        )).scalar_one_or_none()
        return client, ([client.email] if client and client.email else [])

    to_email = context.get("to_email")
    if to_email:
        return None, [to_email]

    if role == "trainer":
        emails = (await db.execute(
            select(User.email)
            .join(StudioMember, StudioMember.user_id == User.id)
            .where(StudioMember.studio_id == studio_id, StudioMember.role == "trainer")
        )).scalars().all()
        return None, list(emails)

    if role == "admin":
        emails = (await db.execute(
            select(User.email)
            .join(StudioMember, StudioMember.user_id == User.id)
            .where(StudioMember.studio_id == studio_id, StudioMember.role == "admin")
        )).scalars().all()
        if emails:
            return None, list(emails)
        # fallback: маленькая студия без отдельного администратора

    owner_email = (await db.execute(
        select(User.email)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id, StudioMember.role == "owner")
    )).scalars().first()
    return None, ([owner_email] if owner_email else [])


async def notify(
    db: AsyncSession,
    studio_id: int,
    role: str,
    event_id: str,
    context: dict[str, Any] | None = None,
) -> bool:
    """Единая точка отправки: сама решает кому (To — клиент или владелец/адресат
    из context["to_email"]), от кого (From — студия), что (Message — _render на
    языке/валюте студии) и куда (Network — по включённым каналам и матрице).
    Возвращает True, если хотя бы один канал реально доставил сообщение; любой
    ранний выход (все каналы выключены, нет шаблона, некому слать, ошибка) —
    False. Вызывающий код использует это для честного clients_notified (задача 3)."""
    context = context or {}
    try:
        settings = (await db.execute(
            select(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == studio_id)
        )).scalar_one_or_none()
        if settings is None:
            return False
        enabled_global = {ch for ch in NOTIFY_CHANNELS if getattr(settings, f"{ch}_notifications")}
        if not enabled_global:
            return False  # все каналы выключены глобально

        enabled_channels = set((await db.execute(
            select(NotificationEventToggle.channel_key).where(
                NotificationEventToggle.studio_id == studio_id,
                NotificationEventToggle.role == role,
                NotificationEventToggle.event_id == event_id,
                NotificationEventToggle.channel_key.in_(enabled_global),
                NotificationEventToggle.is_enabled == True,  # noqa: E712
            )
        )).scalars().all())
        if not enabled_channels:
            return False  # в матрице для этого события/роли ни один канал не включён

        lang, currency = await _studio_prefs(db, studio_id)
        rendered = _render(event_id, context, lang, currency)
        if rendered is None:
            return False  # нет шаблона под событие
        subject, text, html = rendered

        client, emails = await _recipient(db, studio_id, role, context)
        if not emails and client is None:
            return False  # некому слать ни на один канал

        sent = False
        if "email" in enabled_channels and emails:
            for addr in emails:
                await send_email(addr, subject, html)
            sent = True
        if client is not None:
            if "telegram" in enabled_channels and client.tg_id:
                sent = await deliver(db, "telegram", client, subject, text, html, studio_id=studio_id) or sent
            if "whatsapp" in enabled_channels:
                sent = await deliver(db, "whatsapp", client, subject, text, html, studio_id=studio_id) or sent
        return sent
    except Exception:
        logger.exception("notify failed: studio=%s role=%s event=%s", studio_id, role, event_id)
        return False

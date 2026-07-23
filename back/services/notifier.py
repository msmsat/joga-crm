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
        "c11": {
            "ru": ("Занятие изменено", f"Занятие «{lesson_ru}» перенесено — новое время: {when}."),
            "en": ("Class rescheduled", f'"{lesson_en}" has been rescheduled — new time: {when}.'),
        },
    }

    by_lang = TEMPLATES.get(event_id)
    if by_lang is None:
        return None
    subject, text = by_lang.get(lang) or by_lang["ru"]
    return subject, text, f"<p>{text}</p>"


async def _recipient(
    db: AsyncSession, studio_id: int, role: str, context: dict[str, Any],
) -> tuple[Client | None, str | None]:
    """Клиентские события → (Client, email клиента) — Client нужен для tg_id.
    Остальные → (None, email владельца), либо context["to_email"] если передан
    (сотрудник-адресат, например тренер при зарплате — приоритет над владельцем)."""
    client_id = context.get("client_id")
    if role == "client" and client_id is not None:
        client = (await db.execute(
            select(Client).where(Client.id == client_id, Client.studio_id == studio_id)
        )).scalar_one_or_none()
        return client, (client.email if client else None)

    to_email = context.get("to_email")
    if to_email:
        return None, to_email
    owner_email = (await db.execute(
        select(User.email)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id, StudioMember.role == "owner")
    )).scalars().first()
    return None, owner_email


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

        client, email = await _recipient(db, studio_id, role, context)
        if not email and client is None:
            return False  # некому слать ни на один канал

        sent = False
        if "email" in enabled_channels and email:
            await send_email(email, subject, html)
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

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
  - Network (куда): NOTIFY_CHANNELS = ("email", "telegram", "whatsapp",
    "instagram") — только каналы, включённые и глобально
    (StudioNotificationSettings), и в матрице события (NotificationEventToggle);
    sms/push не участвуют.

notify не должен валить основной запрос: вся отправка в try/except с логом.
Возвращает True, если хотя бы один канал реально доставил сообщение.

send_telegram(chat_id, text, token=None) — прямая отправка по tg_id (CL-5.4,
бонусы лояльности). Bot API не умеет писать по номеру телефона, только по
chat_id, поэтому это не часть матрицы notify(), а точечный вызов из мест, где
у клиента уже есть Client.tg_id. token — бот студии; не передан — fallback
на общий env TG_BOT_TOKEN.

deliver(db, channel, recipient, subject, text, html, *, studio_id) — диспетчер
каналов для сценариев лояльности (V5-5, задача 6) и фан-аута notify(): email,
telegram, whatsapp и instagram реально шлют по реквизитам студии из
StudioIntegration (N-2). recipient — Recipient(id, email, tg_id, phone, ig_id);
Client/User подходят под этот интерфейс напрямую. Нет токена канала или нужного
поля у получателя (email/tg_id/phone/ig_id) → False.
"""
import logging
import os
import re
from typing import Any, NamedTuple

import aiohttp
from aiogram import Bot
from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Client, Studio, StudioIntegration, StudioMember, User
from services.mailer import send_email

load_dotenv()
logger = logging.getLogger(__name__)

NOTIFY_CHANNELS = ("email", "telegram", "whatsapp", "instagram")
_CURRENCY_SIGNS = {"RUB": "₽", "USD": "$", "EUR": "€", "KZT": "₸", "BYN": "Br", "UAH": "₴"}
GRAPH = "https://graph.facebook.com/v23.0"
IG_GRAPH = "https://graph.instagram.com/v23.0"  # Instagram API with Instagram Login
# ponytail: фикс-порог для события "крупный платёж" (o3), настройка в UI владельца — после MVP
LARGE_PAYMENT = 10_000

# Единый список event_id, для которых есть шаблон в TEMPLATES (см. _render ниже) —
# сверяется с services.notification_catalog.CATALOG (EPIC 3, Задача 1). Новый event_id
# в TEMPLATES → сразу добавить и сюда, иначе _render упадёт на assert.
KNOWN_EVENT_IDS = frozenset({
    "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c11", "c12",
    "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9",
    "a1", "a2", "a3", "a4", "a6", "a7", "a8", "a9", "a10",
    "o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "o9",
})


class Recipient(NamedTuple):
    """Лёгкий получатель уведомления — общий для клиента и сотрудника (N-9.2).
    id — для логов; email/tg_id/phone/ig_id — реквизиты каналов, любое может
    быть None (канал просто не сработает). Client и User обоих совместимы по
    атрибутам, поэтому deliver() принимает и живой Client напрямую."""
    id: int | None
    email: str | None
    tg_id: int | None
    phone: str | None
    ig_id: str | None = None


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


async def _send_whatsapp(cfg: dict, recipient: "Recipient | Client", text: str) -> bool:
    """Отправка через WhatsApp Cloud API (N-2, задача 4). Нет токена/номера
    получателя → False. Свободный текст доставляется только в 24-часовом окне
    диалога — на стороне Meta, здесь не проверяется (MVP)."""
    phone_number_id = cfg.get("phone_number_id")
    token = cfg.get("token")
    if not phone_number_id or not token or not recipient.phone:
        return False
    to = re.sub(r"\D", "", recipient.phone)
    payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": text}}
    headers = {"Authorization": f"Bearer {token}"}
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{GRAPH}/{phone_number_id}/messages", json=payload, headers=headers) as resp:
            return resp.status == 200


async def _send_instagram(cfg: dict, recipient: "Recipient | Client", text: str) -> bool:
    """Отправка в Instagram Direct через Messenger Platform. Нет токена или IGSID
    получателя → False. Как и у WhatsApp, свободный текст доставляется только в
    24-часовом окне диалога — проверяет Meta, не мы (MVP).

    Хост зависит от того, как подключён аккаунт (services/instagram_account):
    токен из OAuth на странице AI («Instagram Login») ходит только на
    graph.instagram.com, ручной токен Facebook Login — только на graph.facebook.com.
    Ключа нет — строка досталась от ручного подключения, поведение прежнее."""
    ig_user_id = cfg.get("ig_user_id")
    token = cfg.get("token")
    ig_id = getattr(recipient, "ig_id", None)
    if not ig_user_id or not token or not ig_id:
        return False
    base = IG_GRAPH if cfg.get("api") == "instagram_login" else GRAPH
    payload = {"recipient": {"id": ig_id}, "message": {"text": text}}
    headers = {"Authorization": f"Bearer {token}"}
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{base}/{ig_user_id}/messages", json=payload, headers=headers) as resp:
            return resp.status == 200


async def deliver(
    db: AsyncSession, channel: str, recipient: "Recipient | Client", subject: str, text: str, html: str,
    *, studio_id: int,
) -> bool:
    """Единый диспетчер каналов доставки (V5-5, задача 6; N-2, задача 4; N-9,
    задача 2): email, telegram, whatsapp и instagram реально шлют по реквизитам
    студии. recipient — Recipient или любой объект с .id/.email/.tg_id/.phone/
    .ig_id (Client, User). Возвращает True, только если сообщение реально ушло;
    исключения не пробрасывает."""
    try:
        if channel == "email":
            if not recipient.email:
                return False
            cfg = await _integration_config(db, studio_id, "email_sender")
            sender = cfg.get("email") if cfg.get("verified") else None
            await send_email(recipient.email, subject, html, sender=sender)
            return True
        if channel == "telegram":
            if not recipient.tg_id:
                return False
            token = (await _integration_config(db, studio_id, "tg_notify")).get("token")
            return await send_telegram(recipient.tg_id, text, token)
        if channel == "whatsapp":
            cfg = await _integration_config(db, studio_id, "wa_notify")
            if not cfg:
                return False
            return await _send_whatsapp(cfg, recipient, text)
        if channel == "instagram":
            cfg = await _integration_config(db, studio_id, "ig_dm")
            if not cfg:
                return False
            return await _send_instagram(cfg, recipient, text)
        return False
    except Exception:
        logger.exception("deliver failed: channel=%s recipient=%s", channel, recipient.id)
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

    second_lesson = context.get("second_lesson_name") or ""
    resource_ru = {"hall": "зал", "trainer": "тренер"}.get(context.get("resource"), context.get("resource") or "")
    resource_en = {"hall": "hall", "trainer": "trainer"}.get(context.get("resource"), context.get("resource") or "")
    device = context.get("device") or ""
    city = context.get("city") or ""
    kind = context.get("kind") or ""
    rating = context.get("rating")
    amount_raw = context.get("amount")  # сырое число (баллы), не денежный формат
    description = context.get("description") or ""

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
        "t1": {
            "ru": ("Новая запись", f"Клиент {client_name} записался на «{lesson_ru}»{tail_ru}."),
            "en": ("New booking", f'{client_name} booked "{lesson_en}"{tail_en}.'),
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
        "t9": {
            "ru": ("Занятие отменено", f"Ваше занятие «{lesson_ru}»{tail_ru} отменено."),
            "en": ("Class cancelled", f'Your class "{lesson_en}"{tail_en} has been cancelled.'),
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
        "t2": {
            "ru": ("Отмена записи", f"Клиент {client_name} отменил запись на «{lesson_ru}»{tail_ru} менее чем за 2 часа до начала."),
            "en": ("Booking cancelled", f'{client_name} cancelled "{lesson_en}"{tail_en} less than 2 hours before start.'),
        },
        "t5": {
            "ru": ("Изменение в расписании", f"Занятие «{lesson_ru}» перенесено — новое время: {when}."),
            "en": ("Schedule change", f'"{lesson_en}" has been rescheduled — new time: {when}.'),
        },
        "a7": {
            "ru": ("Конфликт расписания", f"Наложение занятий: «{lesson_ru}» и «{second_lesson}»{tail_ru} — общий {resource_ru}."),
            "en": ("Schedule conflict", f'Overlapping classes: "{lesson_en}" and "{second_lesson}"{tail_en} — shared {resource_en}.'),
        },
        "a9": {
            "ru": ("Вход с нового устройства", f"Вход в аккаунт {staff_name} с нового устройства: {device}, {city}."),
            "en": ("New device login", f"{staff_name}'s account was accessed from a new device: {device}, {city}."),
        },
        "o9": {
            "ru": ("Экспорт данных", f"Экспорт данных ({kind}) выполнил {staff_name}."),
            "en": ("Data export", f"Data export ({kind}) performed by {staff_name}."),
        },
        "c12": {
            "ru": ("Начислены бонусы", f"Вам начислено баллов: {amount_raw}. {description}".strip()),
            "en": ("Bonus credited", f"You've earned {amount_raw} points. {description}".strip()),
        },
        # t7 — задел (N-9 границы): эндпоинта создания отзыва ещё нет, врезки тоже.
        "t7": {
            "ru": ("Новый отзыв", f"Новый отзыв от {client_name}: {rating}★ о занятии «{lesson_ru}»."),
            "en": ("New review", f'New review from {client_name}: {rating}★ for "{lesson_en}".'),
        },
    }

    assert TEMPLATES.keys() == KNOWN_EVENT_IDS, "notifier.TEMPLATES / KNOWN_EVENT_IDS out of sync"

    by_lang = TEMPLATES.get(event_id)
    if by_lang is None:
        return None
    subject, text = by_lang.get(lang) or by_lang["ru"]
    return subject, text, f"<p>{text}</p>"


# Стартовая проверка (EPIC 3, Задача 1): выполняется один раз при импорте модуля, вне
# try/except notify() — если TEMPLATES и KNOWN_EVENT_IDS разошлись, импорт падает сразу
# при старте приложения, а не тихо глотается где-то в проде.
_render("c1", {}, "ru", "RUB")


def _user_recipient(user: User) -> Recipient:
    return Recipient(user.id, user.email, user.tg_id, user.phone, user.ig_id)


async def _recipient(
    db: AsyncSession, studio_id: int, role: str, context: dict[str, Any],
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
        студии администратора может не быть);
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
        return [Recipient(client.id, client.email, client.tg_id, client.phone, client.ig_id)]

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
        # fallback: маленькая студия без отдельного администратора

    owner = (await db.execute(
        select(User)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id, StudioMember.role == "owner")
    )).scalars().first()
    return [_user_recipient(owner)] if owner else []


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
        from services.notification_resolver import resolve_channels  # локальный импорт — иначе цикл notifier<->resolver

        lang, currency = await _studio_prefs(db, studio_id)
        rendered = _render(event_id, context, lang, currency)
        if rendered is None:
            return False  # нет шаблона под событие
        subject, text, html = rendered

        recipients = await _recipient(db, studio_id, role, context)
        if not recipients:
            return False  # некому слать ни на один канал

        sent = False
        for r in recipients:
            recipient_user_id = r.id if role != "client" else None  # личный слой — только у staff
            channels, forced = await resolve_channels(db, studio_id, role, event_id, recipient_user_id)
            if forced:
                logger.warning("notify: forced fallback studio=%s role=%s event=%s", studio_id, role, event_id)
            if "email" in channels and r.email:
                sent = await deliver(db, "email", r, subject, text, html, studio_id=studio_id) or sent
            if "telegram" in channels and r.tg_id:
                sent = await deliver(db, "telegram", r, subject, text, html, studio_id=studio_id) or sent
            if "whatsapp" in channels and r.phone:
                sent = await deliver(db, "whatsapp", r, subject, text, html, studio_id=studio_id) or sent
            if "instagram" in channels and r.ig_id:
                sent = await deliver(db, "instagram", r, subject, text, html, studio_id=studio_id) or sent
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

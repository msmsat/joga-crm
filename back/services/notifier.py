"""Диспетчер уведомлений (задача 8): событие продукта → матрица → email.

notify(db, studio_id, role, event_id, context):
  1. читает StudioNotificationSettings (глобальный тумблер email) + матрицу
     NotificationEventToggle по (studio_id, role, event_id, "email");
  2. если email включён — собирает текст по event_id и шлёт письмо через mailer
     на email клиента (context["client_id"] → Client.email) или владельца студии;
  3. каналы telegram/whatsapp/sms/push — молча пропускаются (MVP: живой канал один).

notify не должен валить основной запрос: вся отправка в try/except с логом.
"""
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Client, NotificationEventToggle, StudioNotificationSettings, StudioMember, User
from services.mailer import send_email

logger = logging.getLogger(__name__)


def _render(event_id: str, context: dict[str, Any]) -> tuple[str, str] | None:
    """event_id → (subject, html). None — для события нет email-шаблона (пропускаем)."""
    lesson = context.get("lesson_name") or "занятие"
    when = context.get("start_time") or ""
    amount = context.get("amount")
    remaining = context.get("remaining")
    templates: dict[str, tuple[str, str]] = {
        "c1": ("Запись подтверждена",
               f"<p>Вы записаны на «{lesson}»{f' — {when}' if when else ''}. Ждём вас!</p>"),
        "c3": ("Занятие отменено",
               f"<p>К сожалению, «{lesson}»{f' — {when}' if when else ''} отменено. Приносим извинения.</p>"),
        "c4": ("Оплата получена",
               f"<p>Оплата на {(amount or 0) / 100:.0f} ₽ прошла успешно. Спасибо!</p>"),
        "c5": ("Абонемент на исходе",
               f"<p>В вашем абонементе осталось {remaining} занятий. Пора продлить.</p>"),
        "c6": ("Абонемент закончился",
               "<p>Ваш абонемент завершён. Оформите новый, чтобы продолжить занятия.</p>"),
    }
    return templates.get(event_id)


async def _recipient_email(db: AsyncSession, studio_id: int, role: str, context: dict[str, Any]) -> str | None:
    """Клиентские события → email клиента; остальные → email владельца студии."""
    client_id = context.get("client_id")
    if role == "client" and client_id is not None:
        return (await db.execute(
            select(Client.email).where(Client.id == client_id, Client.studio_id == studio_id)
        )).scalar_one_or_none()
    return (await db.execute(
        select(User.email)
        .join(StudioMember, StudioMember.user_id == User.id)
        .where(StudioMember.studio_id == studio_id, StudioMember.role == "owner")
    )).scalars().first()


async def notify(
    db: AsyncSession,
    studio_id: int,
    role: str,
    event_id: str,
    context: dict[str, Any] | None = None,
) -> None:
    context = context or {}
    try:
        settings = (await db.execute(
            select(StudioNotificationSettings).where(StudioNotificationSettings.studio_id == studio_id)
        )).scalar_one_or_none()
        if settings is None or not settings.email_notifications:
            return  # глобальный email-канал выключен

        enabled = (await db.execute(
            select(NotificationEventToggle.is_enabled).where(
                NotificationEventToggle.studio_id == studio_id,
                NotificationEventToggle.role == role,
                NotificationEventToggle.event_id == event_id,
                NotificationEventToggle.channel_key == "email",
            )
        )).scalar_one_or_none()
        if not enabled:
            return  # для этого события email в матрице не включён

        rendered = _render(event_id, context)
        if rendered is None:
            return  # нет email-шаблона под событие

        to = await _recipient_email(db, studio_id, role, context)
        if not to:
            return  # некому слать (нет email клиента/владельца)

        subject, html = rendered
        await send_email(to, subject, html)
    except Exception:
        logger.exception("notify failed: studio=%s role=%s event=%s", studio_id, role, event_id)

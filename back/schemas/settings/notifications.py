from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from schemas._base import BaseSchema


# Фронт шлёт короткие ключи (telegram, email, ...); колонки модели — *_notifications.
# instagram_notifications в схемах нет: Instagram перестал быть проактивным
# каналом (см. докстринг services/notifier.py), колонка в БД осталась нетронутой.
class NotificationSettingsRead(BaseSchema):
    telegram: bool = Field(alias="telegram_notifications")
    whatsapp: bool = Field(alias="whatsapp_notifications")
    email: bool = Field(alias="email_notifications")
    sms: bool = Field(alias="sms_notifications")
    push: bool = Field(alias="push_notifications")
    marketing_emails: bool
    primary_email: Optional[str] = None
    backup_email: Optional[str] = None


class NotificationSettingsUpdate(BaseSchema):
    telegram: Optional[bool] = Field(default=None, alias="telegram_notifications")
    whatsapp: Optional[bool] = Field(default=None, alias="whatsapp_notifications")
    email: Optional[bool] = Field(default=None, alias="email_notifications")
    sms: Optional[bool] = Field(default=None, alias="sms_notifications")
    push: Optional[bool] = Field(default=None, alias="push_notifications")
    marketing_emails: Optional[bool] = None
    primary_email: Optional[str] = None
    backup_email: Optional[str] = None


class EventToggle(BaseSchema):
    role: Literal["client", "trainer", "admin", "owner"]
    event_id: str = Field(pattern=r"^[ctao]\d{1,2}$")
    # instagram/sms/push остаются в Literal ТОЛЬКО ради чтения: GET
    # /notifications/events отдаёт живые строки таблицы, а там лежат осиротевшие
    # instagram-тумблеры, заведённые до отключения канала. На запись их отобьёт
    # _validate_toggles (канал недоступен ни одной роли), на отправку —
    # resolve_channels (перебирает NOTIFY_CHANNELS).
    channel_key: Literal["telegram", "whatsapp", "email", "instagram", "sms", "push"]
    is_enabled: bool


class EventToggleBulkUpdate(BaseSchema):
    toggles: list[EventToggle] = Field(min_length=1, max_length=500)


# ─── EPIC 3, Задача 3: матрица «событие × канал» и личные настройки ─────────
class ChannelInfo(BaseSchema):
    key: str
    connected: bool
    global_enabled: bool


class MatrixRow(BaseSchema):
    event_id: str
    role: Literal["client", "trainer", "admin", "owner"]
    tier: Literal["critical", "operational", "optional"]
    channels: dict[str, bool]
    locked: bool                       # строку менять нельзя вообще (tier=critical)
    locked_channels: list[str]         # эти каналы в строке снять нельзя (последний включённый)
    lock_reason: Optional[str] = None  # ключ i18n: "critical" | "last_channel"


class MatrixRead(BaseSchema):
    channels: list[ChannelInfo]
    events: list[MatrixRow]


class UserPrefRow(BaseSchema):
    event_id: str
    channels: dict[str, bool]


class UserPrefRead(BaseSchema):
    events: list[UserPrefRow]


class UserPrefUpdate(BaseSchema):
    event_id: str = Field(pattern=r"^[ctao]\d{1,2}$")
    channel_key: Literal["telegram", "whatsapp", "email", "instagram", "sms", "push"]
    is_enabled: bool


# ─── Журнал отправок (эпик N-10) ──────────────────────────────────────────────

class NotificationLogRow(BaseSchema):
    """Строка журнала. dedup_key наружу не отдаём — он служебный и ни на один
    вопрос поддержки не отвечает."""
    id: int
    event_id: Optional[str] = None
    channel: str
    recipient_id: Optional[int] = None
    recipient_address: Optional[str] = None
    status: str
    # Тело ответа провайдера («шаблон не одобрен», «вне окна») — то самое, чем
    # спор о списании закрывается по существу.
    error: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None


class NotificationLogSummary(BaseSchema):
    """Счётчики по тем же фильтрам, что и список: rejected > 0 — это и есть тот
    самый «никто не узнает», из-за которого события умирали молча."""
    sent: int = 0
    rejected: int = 0
    error: int = 0
    pending: int = 0


class NotificationLogRead(BaseSchema):
    summary: NotificationLogSummary
    items: list[NotificationLogRow]
    total: int
    offset: int
    limit: int

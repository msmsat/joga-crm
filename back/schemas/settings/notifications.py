from typing import Optional

from pydantic import Field

from schemas._base import BaseSchema


# Фронт шлёт короткие ключи (telegram, email, ...); колонки модели — *_notifications.
class NotificationSettingsRead(BaseSchema):
    telegram: bool = Field(alias="telegram_notifications")
    instagram: bool = Field(alias="instagram_notifications")
    whatsapp: bool = Field(alias="whatsapp_notifications")
    email: bool = Field(alias="email_notifications")
    sms: bool = Field(alias="sms_notifications")
    push: bool = Field(alias="push_notifications")
    marketing_emails: bool
    primary_email: Optional[str] = None
    backup_email: Optional[str] = None


class NotificationSettingsUpdate(BaseSchema):
    telegram: Optional[bool] = Field(default=None, alias="telegram_notifications")
    instagram: Optional[bool] = Field(default=None, alias="instagram_notifications")
    whatsapp: Optional[bool] = Field(default=None, alias="whatsapp_notifications")
    email: Optional[bool] = Field(default=None, alias="email_notifications")
    sms: Optional[bool] = Field(default=None, alias="sms_notifications")
    push: Optional[bool] = Field(default=None, alias="push_notifications")
    marketing_emails: Optional[bool] = None
    primary_email: Optional[str] = None
    backup_email: Optional[str] = None


class EventToggle(BaseSchema):
    role: str
    event_id: str
    channel_key: str
    is_enabled: bool

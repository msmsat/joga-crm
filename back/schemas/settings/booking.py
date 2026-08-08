import re
from datetime import datetime
from typing import Optional

from pydantic import field_validator

from schemas._base import BaseSchema

_TIME_RE = re.compile(r"^\d{2}:\d{2}$")


class BookingSettingsRead(BaseSchema):
    booking_active: bool
    prefill_on_booking: bool
    trainer_confirmation_required: bool
    client_reminder_enabled: bool
    repeat_booking_allowed: bool
    min_booking_advance_min: int
    booking_window_days: int
    cancellation_deadline_min: int
    widget_accent_color: Optional[str]
    widget_logo_url: Optional[str]
    widget_dark_mode: bool
    widget_language: str
    reminder_24h: bool
    reminder_2h: bool
    review_request: bool
    miniapp_generated: bool
    widget_work_start: str
    widget_work_end: str
    # Публичная ссылка на мини-приложение студии. Не колонка — считается из
    # MINIAPP_URL и studio_id (routers/booking/settings.py:_read): адрес зависит
    # от окружения, и фронту его собирать не по чему.
    miniapp_url: str = ""


class BookingSettingsUpdate(BaseSchema):
    booking_active: Optional[bool] = None
    prefill_on_booking: Optional[bool] = None
    trainer_confirmation_required: Optional[bool] = None
    client_reminder_enabled: Optional[bool] = None
    repeat_booking_allowed: Optional[bool] = None
    min_booking_advance_min: Optional[int] = None
    booking_window_days: Optional[int] = None
    cancellation_deadline_min: Optional[int] = None
    widget_accent_color: Optional[str] = None
    widget_logo_url: Optional[str] = None
    widget_dark_mode: Optional[bool] = None
    widget_language: Optional[str] = None
    reminder_24h: Optional[bool] = None
    reminder_2h: Optional[bool] = None
    review_request: Optional[bool] = None
    miniapp_generated: Optional[bool] = None
    widget_work_start: Optional[str] = None
    widget_work_end: Optional[str] = None

    @field_validator("widget_work_start", "widget_work_end")
    @classmethod
    def validate_time(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not _TIME_RE.match(value):
            raise ValueError("Время должно быть в формате ЧЧ:ММ")
        return value


class BookingChannelRead(BaseSchema):
    channel_type: str
    is_active: bool
    connected_at: Optional[datetime]
    config: Optional[dict]


class BookingChannelUpdate(BaseSchema):
    is_active: Optional[bool] = None
    config: Optional[dict] = None

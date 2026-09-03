import re
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from pydantic import field_validator

from schemas._base import BaseSchema

_TIME_RE = re.compile(r"^\d{2}:\d{2}$")

# Список из десяти кофеен превращает подсказку в справочник, поэтому предел
# есть. Пустой список — это «выключено» (BookingRules.coffee_live), а не ошибка.
_MAX_COFFEE_SPOTS = 5


class CoffeeSpotInput(BaseSchema):
    name: str
    address: str = ""
    url: Optional[str] = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: Optional[str]) -> Optional[str]:
        """Только http(s). Пишет это поле владелец студии, а рендерит его
        `<a href>` в мини-приложении КЛИЕНТА — то есть `javascript:` здесь
        означает чужой скрипт в webview клиента вместе с его сессией. Граница
        доверия ровно тут: дальше ссылка уходит в JSON и в чужой браузер.

        Ввод без схемы («maps.example/kofein») — обычное поведение владельца, а не
        атака: дописываем https, а не отвечаем 422. Схему смотрим ДО этого, иначе
        `javascript:` превратился бы в тихо битую ссылку вместо честной ошибки.
        """
        value = (value or "").strip()
        if not value:
            return None
        scheme = urlparse(value).scheme
        if not scheme:
            value, scheme = f"https://{value}", "https"
        if scheme not in ("http", "https"):
            raise ValueError("Ссылка на место должна начинаться с http:// или https://")
        return value


class BookingSettingsRead(BaseSchema):
    booking_active: bool
    prefill_on_booking: bool
    trainer_confirmation_required: bool
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
    trial_lesson_free: bool = False
    coffee_enabled: bool = True
    coffee_spots: list[CoffeeSpotInput] = []
    # Публичная ссылка на мини-приложение студии. Не колонка — считается из
    # MINIAPP_URL и studio_id (routers/booking/settings.py:_read): адрес зависит
    # от окружения, и фронту его собирать не по чему.
    miniapp_url: str = ""

    @field_validator("coffee_spots", mode="before")
    @classmethod
    def spots_from_db(cls, value: Optional[list]) -> list:
        """Колонка nullable: у студии, не заводившей мест, там NULL, а наружу
        всегда список.

        Именно `mode="before"`, а не подмена в роутере: `model_copy(update=...)`
        отрабатывает ПОСЛЕ валидации, поэтому NULL ронял её раньше — GET
        /booking/settings отдавал 500 всем студиям без мест.
        """
        return value or []


class BookingSettingsUpdate(BaseSchema):
    booking_active: Optional[bool] = None
    prefill_on_booking: Optional[bool] = None
    trainer_confirmation_required: Optional[bool] = None
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
    trial_lesson_free: Optional[bool] = None
    coffee_enabled: Optional[bool] = None
    coffee_spots: Optional[list[CoffeeSpotInput]] = None

    @field_validator("widget_work_start", "widget_work_end")
    @classmethod
    def validate_time(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not _TIME_RE.match(value):
            raise ValueError("Время должно быть в формате ЧЧ:ММ")
        return value

    @field_validator("coffee_spots")
    @classmethod
    def validate_spots(cls, value: Optional[list]) -> Optional[list]:
        if value is None:
            return None
        # Место без названия показать нечем — пустые строки владелец оставляет,
        # когда добавил поле и передумал; отбрасываем их, а не сохраняем пустоту.
        spots = [spot for spot in value if spot.name.strip()]
        if len(spots) > _MAX_COFFEE_SPOTS:
            raise ValueError(f"Не больше {_MAX_COFFEE_SPOTS} мест")
        return spots


class BookingChannelRead(BaseSchema):
    channel_type: str
    is_active: bool
    connected_at: Optional[datetime]
    config: Optional[dict]


class BookingChannelUpdate(BaseSchema):
    is_active: Optional[bool] = None
    config: Optional[dict] = None

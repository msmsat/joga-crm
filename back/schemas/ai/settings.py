from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from schemas._base import BaseSchema

Tone = Literal["friendly", "formal", "neutral"]


class AISettingsRead(BaseSchema):
    model: str
    language: str
    system_prompt: Optional[str]
    tg_enabled: bool
    tg_token: Optional[str]
    tg_username: Optional[str]
    tg_tone: str
    tg_max_length: int
    tg_handled_count: int
    tg_avg_rating: float
    ig_enabled: bool
    ig_token: Optional[str]
    ig_user_id: Optional[str]
    ig_token_expires_at: Optional[datetime]
    ig_username: Optional[str]
    ig_tone: str
    ig_max_length: int
    ig_off_hours_only: bool
    ig_handled_count: int
    ig_avg_rating: float


class AISettingsUpdate(BaseSchema):
    model: Optional[Literal["velora-3.5"]] = None
    language: Optional[Literal["auto", "ru", "en", "uk"]] = None
    system_prompt: Optional[str] = Field(None, max_length=2000)
    tg_enabled: Optional[bool] = None
    tg_tone: Optional[Tone] = None
    tg_max_length: Optional[int] = Field(None, ge=50, le=4000)
    ig_enabled: Optional[bool] = None
    ig_tone: Optional[Tone] = None
    ig_max_length: Optional[int] = Field(None, ge=50, le=4000)
    ig_off_hours_only: Optional[bool] = None
    # tg_token/ig_* подключения не сюда: токен TG пишет verify-эндпоинт,
    # Instagram — OAuth-callback (эпик AI-3). PATCH не даёт вписать токен руками.


class TelegramTokenIn(BaseSchema):
    token: str = Field(..., pattern=r"^\d+:[\w-]{30,}$")

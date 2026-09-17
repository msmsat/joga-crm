"""Схемы платформенной админки. Отдельный файл: к схемам студий эти данные
отношения не имеют и общих полей с ними не образуют."""
from pydantic import BaseModel


class AdminLoginRequest(BaseModel):
    login: str
    password: str


class AdminTokenResponse(BaseModel):
    token: str
    name: str


class AdminMeResponse(BaseModel):
    login: str
    name: str


class LandingVisitRequest(BaseModel):
    """Тело маяка с лендинга.

    Страны и устройства здесь НЕТ намеренно: их считает сервер по заголовкам.
    Лишние поля Pydantic отбросит, поэтому старый бандл в кэше браузера ничего
    не сломает.
    """

    anon_id: str
    path: str
    referrer: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    lang: str | None = None

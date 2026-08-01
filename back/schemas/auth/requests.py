import re
from typing import List, Optional
from pydantic import EmailStr, field_validator

from schemas._base import BaseSchema, Identifier, NormEmail, OptPhone, Phone


def validate_strong_password(value: str) -> str:
    """Требования к НОВОМУ паролю. Один источник правды: правила проверяются и
    схемами (регистрация, смена пароля), и роутером приглашений — там пароль
    задаётся только в одной из двух веток, поэтому валидатором поля не обойтись.
    """
    if len(value) < 8:
        raise ValueError("Пароль должен содержать минимум 8 символов")
    if not re.search(r"[A-Za-zА-Яа-я]", value):
        raise ValueError("Пароль должен содержать хотя бы одну букву")
    if not re.search(r"[0-9]", value):
        raise ValueError("Пароль должен содержать хотя бы одну цифру")
    if re.search(r"(.)\1{2,}", value):
        raise ValueError("Пароль содержит слишком много одинаковых символов подряд (например, 111)")
    if re.search(r"(123|234|345|456|567|678|789|890|qwe|wer|ert|asd|sdf|zxc)", value.lower()):
        raise ValueError("Пароль слишком простой (содержит популярные последовательности)")
    return value


class LoginRequest(BaseSchema):
    identifier: Identifier
    password: str


class Login2FARequest(BaseSchema):
    identifier: Identifier
    code: str


class RegisterRequest(BaseSchema):
    email: NormEmail
    name: str
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_strong_password(value)


class GoogleAuthRequest(BaseSchema):
    token: str


class VerifyEmailRequest(BaseSchema):
    email: NormEmail
    code: str


class ForgotPasswordRequest(BaseSchema):
    email: NormEmail


class ResetPasswordRequest(BaseSchema):
    email: NormEmail
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        # Те же требования, что при регистрации и смене пароля: восстановление —
        # не лазейка завести аккаунту пароль слабее, чем он мог задать сам.
        return validate_strong_password(value)


class ChangePasswordRequest(BaseSchema):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return validate_strong_password(value)


class SelectStudioRequest(BaseSchema):
    studio_id: int


class InviteAcceptRequest(BaseSchema):
    """Принятие приглашения в студию. `password` — либо НОВЫЙ пароль (аккаунта
    ещё не было), либо СУЩЕСТВУЮЩИЙ пароль уже заведённого аккаунта. Поэтому
    валидатора на поле нет: чужой старый пароль требованиям может не отвечать,
    и «слабый пароль» вместо «неверный пароль» — ложная ошибка.
    """
    token: str
    password: str
    # Обязателен, только если телефона у аккаунта ещё нет (`needs_phone` из
    # GET /auth/invite): владелец заводит сотрудника по одному email.
    phone: OptPhone = None


class InviteDeclineRequest(BaseSchema):
    """Отказ от приглашения. Только токен: пароль для отказа не нужен (см.
    routers/auth/invite.decline_invite)."""
    token: str


class ProfileUpdate(BaseSchema):
    name: Optional[str] = None
    last_name: Optional[str] = None
    phone: OptPhone = None
    tg_id: Optional[int] = None


class WorkingHoursInput(BaseSchema):
    dayOfWeek: int
    isOpen: bool
    openTime: str
    closeTime: str


class OnboardingRequest(BaseSchema):
    studioName: str
    description: Optional[str] = None
    logoUrl: Optional[str] = None
    activityType: str
    phone: Phone
    address: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    timezone: str
    language: str
    currency: str
    dateFormat: Optional[str] = "DD.MM.YYYY"
    firstDayOfWeek: Optional[str] = "monday"
    workingHours: Optional[List[WorkingHoursInput]] = None

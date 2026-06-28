import re
from typing import List, Optional
from pydantic import EmailStr, field_validator

from schemas._base import BaseSchema


class LoginRequest(BaseSchema):
    identifier: str
    password: str


class RegisterRequest(BaseSchema):
    email: EmailStr
    name: str
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
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


class GoogleAuthRequest(BaseSchema):
    token: str


class VerifyEmailRequest(BaseSchema):
    email: EmailStr
    code: str


class ForgotPasswordRequest(BaseSchema):
    email: EmailStr


class ResetPasswordRequest(BaseSchema):
    email: EmailStr
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Пароль должен содержать минимум 8 символов")
        if not re.search(r"[A-Za-zА-Яа-я]", value):
            raise ValueError("Пароль должен содержать хотя бы одну букву")
        if not re.search(r"[0-9]", value):
            raise ValueError("Пароль должен содержать хотя бы одну цифру")
        return value


class SelectStudioRequest(BaseSchema):
    studio_id: int


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
    phone: str
    address: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    timezone: str
    language: str
    currency: str
    dateFormat: Optional[str] = "DD.MM.YYYY"
    firstDayOfWeek: Optional[str] = "monday"
    workingHours: Optional[List[WorkingHoursInput]] = None

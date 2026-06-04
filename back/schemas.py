import re
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional

# ─── СХЕМЫ ДЛЯ АВТОРИЗАЦИИ И РЕГИСТРАЦИИ ──────────────────────────────────────

class LoginRequest(BaseModel):
    identifier: str  # 🔥 Универсальное поле: сюда может прилететь как email, так и телефон
    password: str

class RegisterRequest(BaseModel):
    email: EmailStr
    name: str 
    password: str

    # Суровая валидация пароля
    @field_validator('password')
    @classmethod
    def validate_password(cls, value):
        if len(value) < 8:
            raise ValueError('Пароль должен содержать минимум 8 символов')
        if not re.search(r'[A-Za-zА-Яа-я]', value):
            raise ValueError('Пароль должен содержать хотя бы одну букву')
        if not re.search(r'[0-9]', value):
            raise ValueError('Пароль должен содержать хотя бы одну цифру')
        
        # Штрафы за глупые пароли
        if re.search(r'(.)\1{2,}', value):
            raise ValueError('Пароль содержит слишком много одинаковых символов подряд (например, 111)')
        if re.search(r'(123|234|345|456|567|678|789|890|qwe|wer|ert|asd|sdf|zxc)', value.lower()):
            raise ValueError('Пароль слишком простой (содержит популярные последовательности)')
            
        return value

# Схема для ответа с токеном
class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    message: Optional[str] = None

class GoogleAuthRequest(BaseModel):
    token: str

class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

    # Используем ту же надежную проверку для нового пароля
    @field_validator('new_password')
    @classmethod
    def validate_password(cls, value):
        if len(value) < 8:
            raise ValueError('Пароль должен содержать минимум 8 символов')
        if not re.search(r'[A-Za-zА-Яа-я]', value):
            raise ValueError('Пароль должен содержать хотя бы одну букву')
        if not re.search(r'[0-9]', value):
            raise ValueError('Пароль должен содержать хотя бы одну цифру')
        return value

class OnboardingRequest(BaseModel):
    studioName: str
    phone: str
    businessType: str
    businessSubtype: str
    timezone: str
    language: str
    currency: str
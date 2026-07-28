import os
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

# Секретный ключ для подписи токена (в идеале добавить его в .env)
SECRET_KEY = os.getenv("SECRET_KEY", "velora_super_secret_key_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # Токен будет жить 7 дней

# Настройка алгоритма хэширования паролей
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    """Проверяет, совпадает ли введенный пароль с хэшем из БД"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Превращает обычный пароль в нечитаемый хэш для базы данных"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_minutes: int | None = None):
    """Генерирует тот самый JWT-токен. expires_minutes переопределяет TTL
    по умолчанию — короткоживущим otp_token (EPIC 5, задача 3)."""
    to_encode = data.copy()
    minutes = ACCESS_TOKEN_EXPIRE_MINUTES if expires_minutes is None else expires_minutes
    expire = datetime.utcnow() + timedelta(minutes=minutes)
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
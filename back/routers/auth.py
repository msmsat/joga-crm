from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from schemas import LoginRequest, RegisterRequest, TokenResponse

from security import verify_password, get_password_hash, create_access_token
from database import get_db  # твоя функция подключения к БД из database.py
from models import User      # твоя модель пользователя из models.py (таблица users)

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from schemas import LoginRequest, RegisterRequest, TokenResponse, VerifyEmailRequest, GoogleAuthRequest, ForgotPasswordRequest, ResetPasswordRequest
import random
import uuid
import os
from dotenv import load_dotenv

from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from models import Studio
from schemas import OnboardingRequest

# Загружаем переменные окружения
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "velora_super_secret_key_2026")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Создаем роутер (префикс добавим в main.py)
router = APIRouter()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

@router.post("/google", response_model=TokenResponse)
async def google_auth(request: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    try:
        # 1. Проверяем токен через сервера Google
        idinfo = id_token.verify_oauth2_token(
            request.token, 
            google_requests.Request(), 
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10
        )
        email = idinfo['email']
        google_name = idinfo.get('name', 'Google User')
    except ValueError as e:
        print("\n" + "!"*40)
        print(f"🚨 ОШИБКА GOOGLE AUTH: {e}")
        print("!"*40 + "\n")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен Google"
        )

    # 2. Ищем пользователя в БД
    query = select(User).where(User.email == email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    # 3. Если пользователя нет — регистрируем
    if not user:
        # 🔥 Больше никаких фейковых телефонов! Генерируем только пароль
        dummy_password = get_password_hash(str(uuid.uuid4()))
        
        new_user = User(
            email=email,
            name=google_name,
            hashed_password=dummy_password,
            is_verified=True,  # 🔥 Google юзерам сразу верим!
            verification_code=None
        )
        db.add(new_user)
        await db.commit() # 🔥 БАГ ИСПРАВЛЕН: Теперь мы сохраняем его в базу!
        await db.refresh(new_user)
        user = new_user

    # 4. Выдаем наш системный токен
    access_token = create_access_token(data={"sub": user.email})
    return TokenResponse(access_token=access_token, token_type="bearer")

# ─── 1. ЭНДПОИНТ РЕГИСТРАЦИИ ──────────────────────────────────────────────────
# Обрати внимание на response_model=TokenResponse — это подскажет сваггеру формат ответа
@router.post("/register")
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    query = select(User).where(User.email == request.email)
    existing_user = (await db.execute(query)).scalar_one_or_none()

    hashed_pwd = get_password_hash(request.password)
    verification_code = str(random.randint(1000, 9999))
    
    if existing_user:
        if existing_user.is_verified:
            # 🔥 Если юзер есть и УЖЕ подтвержден — тогда точно отклоняем
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пользователь с таким email уже зарегистрирован"
            )
        else:
            # 🔥 Если юзер есть, но НЕ подтвержден — обновляем его данные и шлем новый код!
            existing_user.name = request.name
            existing_user.hashed_password = hashed_pwd
            existing_user.verification_code = verification_code
            
            await db.commit()
            
            print("\n" + "="*40)
            print(f"📧 ПОВТОРНОЕ ПИСЬМО ДЛЯ: {existing_user.email}")
            print(f"🔑 НОВЫЙ КОД ПОДТВЕРЖДЕНИЯ: {verification_code}")
            print("="*40 + "\n")
            
            return {"message": "Новый код подтверждения отправлен на почту"}
    
    # 3. Создаем запись нового пользователя со всеми данными
    new_user = User(
        email=request.email,
        name=request.name, 
        hashed_password=hashed_pwd,
        is_verified=False,                    # Ждем подтверждения
        verification_code=verification_code   # Сохраняем код в БД
    )
    
    # 4. Сохраняем в PostgreSQL
    db.add(new_user)
    await db.commit()

    # 🔥 Имитируем отправку письма в терминале (чтобы ты видел код при тестах)
    print("\n" + "="*40)
    print(f"📧 ПИСЬМО ДЛЯ: {new_user.email}")
    print(f"🔑 ВАШ КОД ПОДТВЕРЖДЕНИЯ: {verification_code}")
    print("="*40 + "\n")
    
    # Токен пока НЕ отдаем
    return {"message": "Код подтверждения отправлен на почту"}

# ─── ЭНДПОИНТ ПОДТВЕРЖДЕНИЯ КОДА (ВЫДАЕТ ТОКЕН) ──────────────────────────────
@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(request: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    query = select(User).where(User.email == request.email)
    user = (await db.execute(query)).scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
        
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Почта уже подтверждена")
        
    if user.verification_code != request.code:
        raise HTTPException(status_code=400, detail="Неверный код подтверждения")
        
    # 🔥 Если код совпал: делаем юзера подтвержденным и стираем код
    user.is_verified = True
    user.verification_code = None
    await db.commit()
    
    # Только теперь пускаем в систему!
    access_token = create_access_token(data={"sub": user.email})
    return TokenResponse(access_token=access_token, token_type="bearer")

# ─── 2. ЭНДПОИНТ ЛОГИНА ───────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    
    # 1. Ищем пользователя в БД: либо по email, либо по номеру телефона
    query = select(User).where(
        (User.email == request.identifier) | (User.phone == request.identifier)
    )
    user = (await db.execute(query)).scalar_one_or_none()

    # 2. Проверка существования пользователя
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email, телефон или пароль"
        )
    
    # 🔥 Защита: не даем войти, если юзер не подтвердил почту (закрыл вкладку раньше времени)
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Ваш email не подтвержден. Пожалуйста, зарегистрируйтесь заново или введите код.")
    
    # 3. Проверка пароля
    if not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email, телефон или пароль"
        )
    
    if not user.is_verified:
        # Юзер пытается войти, но он не подтвержден.
        # Мы заботимся о нем: генерируем новый код прямо сейчас!
        new_code = str(random.randint(1000, 9999))
        user.verification_code = new_code
        await db.commit()
        
        # Имитируем отправку письма
        print("\n" + "="*40)
        print(f"📧 ПИСЬМО (ПОПЫТКА ВХОДА) ДЛЯ: {user.email}")
        print(f"🔑 НОВЫЙ КОД ПОДТВЕРЖДЕНИЯ: {new_code}")
        print("="*40 + "\n")
        
        # Отклоняем вход, но выдаем понятную инструкцию
        raise HTTPException(
            status_code=403, 
            detail="Аккаунт не подтвержден! Мы только что отправили новый код на вашу почту. Перейдите во вкладку 'Зарегистрироваться', чтобы ввести его."
        )

    # 4. Генерируем токен (внутрь зашиваем email как уникальный субъект)
    access_token = create_access_token(data={"sub": user.email})
    
    return TokenResponse(
        access_token=access_token, 
        token_type="bearer"
    )

# ─── 3. ВОССТАНОВЛЕНИЕ ПАРОЛЯ: ОТПРАВКА КОДА ──────────────────────────────────
@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    query = select(User).where(User.email == request.email)
    user = (await db.execute(query)).scalar_one_or_none()
    
    # В целях безопасности мы ВСЕГДА возвращаем один и тот же ответ, 
    # чтобы хакеры не могли проверять, есть ли email в базе.
    if not user:
        return {"message": "Если email существует, код отправлен"}
        
    code = str(random.randint(1000, 9999))
    user.verification_code = code
    await db.commit()
    
    print("\n" + "="*40)
    print(f"📧 ВОССТАНОВЛЕНИЕ ПАРОЛЯ ДЛЯ: {user.email}")
    print(f"🔑 ВАШ КОД ДЛЯ СМЕНЫ ПАРОЛЯ: {code}")
    print("="*40 + "\n")
    
    return {"message": "Если email существует, код отправлен"}


# ─── 4. ВОССТАНОВЛЕНИЕ ПАРОЛЯ: СМЕНА ПАРОЛЯ ───────────────────────────────────
@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    query = select(User).where(User.email == request.email)
    user = (await db.execute(query)).scalar_one_or_none()
    
    if not user or user.verification_code != request.code:
        raise HTTPException(status_code=400, detail="Неверный код или email")
        
    # Меняем пароль и стираем код
    user.hashed_password = get_password_hash(request.new_password)
    user.verification_code = None
    user.is_verified = True # Заодно подтверждаем почту, раз юзер ввел код
    await db.commit()
    
    return {"message": "Пароль успешно изменен"}

# Зависимость для получения текущего юзера по токену
async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Недействительный токен")
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    
    query = select(User).where(User.email == email)
    user = (await db.execute(query)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


# ─── 5. ПРОВЕРКА ПРОФИЛЯ ЮЗЕРА (ДЛЯ ДАШБОРДА) ─────────────────────────────────
@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "email": current_user.email,
        "name": current_user.name,
        "is_onboarded": current_user.is_onboarded,
        "studio_id": current_user.studio_id
    }


# ─── 6. СОХРАНЕНИЕ ОНБОРДИНГА И СОЗДАНИЕ СТУДИИ ────────────────────────────────
@router.post("/onboarding")
async def complete_onboarding(
    request: OnboardingRequest, 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.is_onboarded:
        raise HTTPException(status_code=400, detail="Онбординг уже пройден")

    # 1. Создаем новую студию
    new_studio = Studio(
        name=request.studioName,
        phone=request.phone,
        business_type=request.businessType,
        business_subtype=request.businessSubtype,
        timezone=request.timezone,
        language=request.language,
        currency=request.currency
    )
    db.add(new_studio)
    await db.flush() # Получаем ID студии до полного коммита

    # 2. Привязываем юзера к студии и ставим флаг онбординга
    current_user.studio_id = new_studio.id
    current_user.is_onboarded = True

    await db.commit()
    return {"message": "Онбординг успешно пройден!"}
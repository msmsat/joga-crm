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
from schemas import LoginRequest, RegisterRequest, TokenResponse, VerifyEmailRequest, GoogleAuthRequest
import random
import uuid

# Создаем роутер (префикс добавим в main.py)
router = APIRouter()


GOOGLE_CLIENT_ID = "ТВОЙ_GOOGLE_CLIENT_ID.apps.googleusercontent.com"

@router.post("/google", response_model=TokenResponse)
async def google_auth(request: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    try:
        # 1. Проверяем токен через сервера Google
        idinfo = id_token.verify_oauth2_token(
            request.token, 
            google_requests.Request(), 
            GOOGLE_CLIENT_ID
        )
        email = idinfo['email']
        display_name = idinfo.get('name', 'Google User')
    except ValueError:
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
            display_name=display_name,
            hashed_password=dummy_password,
            is_verified=True,  # 🔥 Google юзерам сразу верим!
            verification_code=None
        )
        db.add(new_user)

    # 4. Выдаем наш системный токен
    access_token = create_access_token(data={"sub": user.email})
    return TokenResponse(access_token=access_token, token_type="bearer")

# ─── 1. ЭНДПОИНТ РЕГИСТРАЦИИ ──────────────────────────────────────────────────
# Обрати внимание на response_model=TokenResponse — это подскажет сваггеру формат ответа
@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    
    # 1. Проверяем, нет ли уже пользователя с такой почтой
    query = select(User).where(User.email == request.email)
    result = await db.execute(query)
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже зарегистрирован"
        )
    
    # 2. Хэшируем пароль (он уже прошел строгую проверку в schemas.py!)
    hashed_pwd = get_password_hash(request.password)

    verification_code = str(random.randint(1000, 9999))
    
    # 3. Создаем запись нового пользователя со всеми данными
    new_user = User(
        email=request.email,
        display_name=request.display_name, 
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
    result = await db.execute(query)
    user = result.scalar_one_or_none()

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

    # 4. Генерируем токен (внутрь зашиваем email как уникальный субъект)
    access_token = create_access_token(data={"sub": user.email})
    
    return TokenResponse(
        access_token=access_token, 
        token_type="bearer"
    )
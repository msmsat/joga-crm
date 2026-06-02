from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from security import verify_password, create_access_token

# Создаем роутер (префикс добавим в main.py)
router = APIRouter()

# Описываем, какие данные мы ждем от React (вспоминаем твой JSON из fetch)
class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login")
async def login(request: LoginRequest):
    # TODO: Здесь мы скоро напишем поиск пользователя в базе данных PostgreSQL
    # А пока сделаем проверку-заглушку, чтобы связать фронт и бэк!
    
    fake_db_user = {
        "email": "test@test.com",
        # Это хэш пароля "qwerty12345"
        "hashed_password": "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW" 
    }

    # 1. Проверяем email
    if request.email != fake_db_user["email"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль"
        )
    
    # 2. Проверяем пароль
    if not verify_password(request.password, fake_db_user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль"
        )

    # 3. Если всё верно — генерируем реальный JWT-токен
    access_token = create_access_token(data={"sub": request.email})
    
    # 4. Отправляем токен во фронтенд
    return {"access_token": access_token, "token_type": "bearer"}
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth # Импортируем наш новый роутер

app = FastAPI(title="Velora CRM API")

# Настройки CORS (чтобы фронтенд мог делать запросы)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Адрес твоего React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутер. Все пути в auth.py автоматически получат префикс /auth
app.include_router(auth.router, prefix="/auth", tags=["Авторизация"])

@app.get("/")
async def root():
    return {"message": "Бэкенд Velora CRM работает!"}
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers.auth import router as auth_router
from routers.studio import router as studio_router
from routers.clients import router as clients_router
from routers.schedule import router as schedule_router
from routers.finances import router as finances_router
from routers.settings import router as settings_router
from routers.ai import router as ai_router
from routers.analytics import router as analytics_router
from routers.staff import router as staff_router

app = FastAPI(title="Velora CRM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(studio_router, prefix="/studio", tags=["Studio"])
app.include_router(clients_router, prefix="/clients", tags=["Clients"])
app.include_router(schedule_router, prefix="/schedule", tags=["Schedule"])
app.include_router(finances_router, prefix="/finances", tags=["Finances"])
app.include_router(settings_router, prefix="/settings", tags=["Settings"])
app.include_router(ai_router, prefix="/ai", tags=["AI"])
app.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])
app.include_router(staff_router, prefix="/staff", tags=["Staff"])

try:
    os.makedirs("static/logos", exist_ok=True)
    app.mount("/static", StaticFiles(directory="static"), name="static")
except Exception:
    pass


@app.get("/")
async def root():
    return {"message": "Бэкенд Velora CRM работает!"}

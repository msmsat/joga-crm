import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from ratelimit import limiter

from routers.auth import router as auth_router
from routers.studio import router as studio_router
from routers.clients import router as clients_router
from routers.schedule import router as schedule_router
from routers.finances import router as finances_router
from routers.settings import router as settings_router
from routers.ai import router as ai_router
from routers.analytics import router as analytics_router
from routers.staff import router as staff_router
from routers.loyalty import router as loyalty_router
from routers.booking import router as booking_router
from routers.billing import router as billing_router
from dependencies import require_active_subscription
from fastapi import Depends

# Гейт подписки (задача 8b): вешаем router-level на разделы данных. НЕ на /auth,
# /billing, вебхук и /booking/public — иначе не войти, не оплатить, не записаться извне.
_sub_gate = [Depends(require_active_subscription)]

app = FastAPI(title="Velora CRM API")

# Rate-limit публичных эндпоинтов (задача 11b). Лимиты вешаются декораторами
# на сами публичные роуты; на JWT-роутеры ничего не навешивается.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(studio_router, prefix="/studio", tags=["Studio"], dependencies=_sub_gate)
app.include_router(clients_router, prefix="/clients", tags=["Clients"], dependencies=_sub_gate)
app.include_router(schedule_router, prefix="/schedule", tags=["Schedule"], dependencies=_sub_gate)
app.include_router(finances_router, prefix="/finances", tags=["Finances"], dependencies=_sub_gate)
app.include_router(settings_router, prefix="/settings", tags=["Settings"], dependencies=_sub_gate)
app.include_router(ai_router, prefix="/ai", tags=["AI"], dependencies=_sub_gate)
app.include_router(analytics_router, prefix="/analytics", tags=["Analytics"], dependencies=_sub_gate)
app.include_router(staff_router, prefix="/staff", tags=["Staff"], dependencies=_sub_gate)
app.include_router(loyalty_router, prefix="/loyalty", tags=["Loyalty"], dependencies=_sub_gate)
# /booking смешивает публичные (без JWT) и owner-настройки в одном роутере — гейт вешаем
# на settings-подроутер внутри booking/router.py, НЕ на весь префикс.
app.include_router(booking_router, prefix="/booking", tags=["Booking"])
app.include_router(billing_router, prefix="/billing", tags=["Billing"])

try:
    os.makedirs("static/logos", exist_ok=True)
    app.mount("/static", StaticFiles(directory="static"), name="static")
except Exception:
    pass


@app.get("/")
async def root():
    return {"message": "Бэкенд Velora CRM работает!"}

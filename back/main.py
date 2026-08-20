import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from ratelimit import limiter
from database import async_session_maker
from services.alerts import alert_on_server_error, install as install_alerts
from services.scenario_runner import start_scenario_loop
from services.daily_notify import start_daily_notify_loop
from services.offline_fee_billing import start_offline_fee_billing_loop

from routers.auth import router as auth_router
from routers.studio import router as studio_router, onboarding_router as studio_onboarding_router
from routers.clients import router as clients_router
from routers.schedule import router as schedule_router
from routers.finances import router as finances_router
from routers.settings import router as settings_router
from routers.ai import router as ai_router
from routers.analytics import router as analytics_router
from routers.staff import router as staff_router
from routers.loyalty import router as loyalty_router
from routers.loyalty.packages import router as catalog_subscriptions_router
from routers.booking import router as booking_router, miniapp_router
from routers.billing import router as billing_router
from routers.checkout import router as checkout_router, webhook_router as checkout_webhook_router
from dependencies import require_active_subscription
from fastapi import Depends

# Гейт подписки (задача 8b): вешаем router-level на разделы данных. НЕ на /auth,
# /billing, вебхук и /booking/public — иначе не войти, не оплатить, не записаться извне.
# /ai — та же история с AI-3: callback Instagram OAuth публичный, гейт на нём
# не вешаем; для /ai (в отличие от /booking) гейт целиком переехал внутрь
# routers/ai/router.py, где применяется по каждому подроутеру отдельно.
_sub_gate = [Depends(require_active_subscription)]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Фоновый исполнитель умных сценариев лояльности (V5-4, задача 2).
    task = start_scenario_loop(async_session_maker)
    # Ежедневные уведомления: дни рождения, отчёты дня/недели, тариф (N-4, задача 6).
    daily_notify_task = start_daily_notify_loop(async_session_maker)
    # Ежемесячный счёт за комиссию с офлайн-продаж (тарифы «процент» и «комбо»).
    offline_fee_task = start_offline_fee_billing_loop(async_session_maker)
    try:
        yield
    finally:
        task.cancel()
        daily_notify_task.cancel()
        offline_fee_task.cancel()


app = FastAPI(title="Velora CRM API", lifespan=lifespan)

# Алерты платформе в Telegram (services/alerts.py): хендлер ловит все ERROR-логи,
# middleware — падения запросов и 5xx с путём и пострадавшим. Без ALERT_TG_CHAT_ID
# оба no-op, поэтому на деве и в тестах ничего не шлётся.
install_alerts()
app.middleware("http")(alert_on_server_error)

# Rate-limit публичных эндпоинтов (задача 11b). Лимиты вешаются декораторами
# на сами публичные роуты; на JWT-роутеры ничего не навешивается.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Источники берём из окружения: зашитый localhost означал, что на проде фронт
# просто не достучится до API. CORS_ORIGINS — список через запятую; не задан —
# один WEB_APP_URL (он уже есть в .env и на деве равен localhost:5173).
_ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv(
        "CORS_ORIGINS", os.getenv("WEB_APP_URL", "http://localhost:5173"),
    ).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Скачивание файлов идёт fetch с Authorization-заголовком (токен в localStorage,
    # не в куке) — без этого браузер не отдаст JS имя файла из Content-Disposition,
    # и все export-эндпоинты (billing, finances, ...) скачивают файл с именем "blob".
    expose_headers=["Content-Disposition"],
)

app.include_router(auth_router, prefix="/auth", tags=["Auth"])
# /studio/upload-logo зовётся из мастера онбординга — студии и подписки ещё нет,
# под общий гейт его не подвести. Регистрируем ДО гейтованного /studio: побеждает
# первый совпавший роут.
app.include_router(studio_onboarding_router, prefix="/studio", tags=["Studio"])
app.include_router(studio_router, prefix="/studio", tags=["Studio"], dependencies=_sub_gate)
app.include_router(clients_router, prefix="/clients", tags=["Clients"], dependencies=_sub_gate)
app.include_router(schedule_router, prefix="/schedule", tags=["Schedule"], dependencies=_sub_gate)
app.include_router(finances_router, prefix="/finances", tags=["Finances"], dependencies=_sub_gate)
# /settings — тот же случай, что /ai (эпик 6, задача 4): колбэк Google Calendar
# OAuth публичный (браузерный редирект без Authorization-заголовка), под общий
# гейт всего /settings его не подвести. Гейт переехал внутрь routers/settings/router.py.
app.include_router(settings_router, prefix="/settings", tags=["Settings"])
app.include_router(ai_router, prefix="/ai", tags=["AI"])
app.include_router(analytics_router, prefix="/analytics", tags=["Analytics"], dependencies=_sub_gate)
app.include_router(staff_router, prefix="/staff", tags=["Staff"], dependencies=_sub_gate)
app.include_router(loyalty_router, prefix="/loyalty", tags=["Loyalty"], dependencies=_sub_gate)
app.include_router(catalog_subscriptions_router, prefix="/catalog", tags=["Catalog"], dependencies=_sub_gate)
app.include_router(checkout_router, tags=["Checkout"], dependencies=_sub_gate)
# Вебхук Stripe — тот же префикс /checkout, но отдельным роутером без JWT и без
# гейта подписки: Stripe наш токен не носит, а деньги клиента уже списаны —
# просроченный тариф студии не повод потерять оплату. Путь с гейтованными не пересекается.
app.include_router(checkout_webhook_router, tags=["Checkout"])
# /booking смешивает публичные (без JWT) и owner-настройки в одном роутере — гейт вешаем
# на settings-подроутер внутри booking/router.py, НЕ на весь префикс.
app.include_router(booking_router, prefix="/booking", tags=["Booking"])
# Мини-приложение клиента ходит по путям бэкенда-предшественника (/global/...),
# без JWT и без гейта подписки — как и остальная публичная запись.
app.include_router(miniapp_router, prefix="/global", tags=["Miniapp"])
app.include_router(billing_router, prefix="/billing", tags=["Billing"])

try:
    os.makedirs("static/logos", exist_ok=True)
    app.mount("/static", StaticFiles(directory="static"), name="static")
except Exception:
    pass

# --- Клиентское мини-приложение ------------------------------------------------
# Раздаём собранный miniapp/dist с ЭТОГО же домена. Причина простая: кнопка
# web_app в ответе бота на /start требует публичный HTTPS, а публичный HTTPS у
# проекта ровно один — этот бэкенд. Отдельный хостинг и вторая DNS-запись ради
# трёх статических файлов не нужны, а раздача с того же origin заодно убирает
# CORS между мини-приложением и API.
# Монтируем ТОЧЕЧНО (/assets + два файла + /s/{id}), а не StaticFiles на "/":
# та перехватила бы все нераспознанные пути и вернула index.html вместо 404 API.
_MINIAPP_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "miniapp", "dist")
_MINIAPP_INDEX = os.path.join(_MINIAPP_DIST, "index.html")

if os.path.isfile(_MINIAPP_INDEX):
    app.mount("/assets", StaticFiles(directory=os.path.join(_MINIAPP_DIST, "assets")), name="miniapp-assets")

    @app.get("/favicon.svg", include_in_schema=False)
    async def miniapp_favicon():
        return FileResponse(os.path.join(_MINIAPP_DIST, "favicon.svg"))

    @app.get("/icons.svg", include_in_schema=False)
    async def miniapp_icons():
        return FileResponse(os.path.join(_MINIAPP_DIST, "icons.svg"))

    # Единственный маршрут самого приложения: студию оно читает из пути
    # (miniapp/src/lib/entry.ts), роутера внутри нет — экраны переключаются
    # состоянием, поэтому других путей отдавать не нужно.
    @app.get("/s/{studio_id}", include_in_schema=False)
    async def miniapp_index(studio_id: int):
        return FileResponse(_MINIAPP_INDEX)


@app.get("/")
async def root():
    return {"message": "Бэкенд Velora CRM работает!"}

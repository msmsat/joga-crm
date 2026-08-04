from fastapi import APIRouter, Depends
from dependencies import require_active_subscription
from .settings import router as settings_router
from .public import router as public_router
from .telegram_webhook import router as telegram_webhook_router

router = APIRouter()
# Гейт подписки (8b) только на owner-настройки; публичная запись клиентов и
# вебхук Telegram (его дёргает сам Telegram, без JWT и без подписки) — без гейта.
router.include_router(settings_router, dependencies=[Depends(require_active_subscription)])
router.include_router(public_router)
router.include_router(telegram_webhook_router)

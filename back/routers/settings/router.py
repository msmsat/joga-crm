from fastapi import APIRouter, Depends

from dependencies import require_active_subscription
from .general import router as general_router
from .team import router as team_router
from .security import router as security_router
from .integrations import router as integrations_router
from .google_calendar import callback_router as google_calendar_callback_router, router as google_calendar_router
from .notifications import router as notifications_router
from .data import router as data_router

router = APIRouter()

# Гейт подписки — как у /ai (эпик 6, задача 4; см. main.py): переехал сюда с уровня
# main.py, чтобы публичный колбэк Google OAuth (браузерный редирект без
# Authorization-заголовка) остался вне гейта, а остальные вкладки Настроек — под ним.
_gate = [Depends(require_active_subscription)]
router.include_router(general_router, dependencies=_gate)
router.include_router(team_router, dependencies=_gate)
router.include_router(security_router, dependencies=_gate)
router.include_router(integrations_router, dependencies=_gate)
router.include_router(google_calendar_router, dependencies=_gate)
router.include_router(google_calendar_callback_router)
router.include_router(notifications_router, dependencies=_gate)
router.include_router(data_router, dependencies=_gate)

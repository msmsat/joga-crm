from fastapi import APIRouter, Depends

from dependencies import require_active_subscription
from .agents import router as agents_router
from .chat import router as chat_router
from .instagram import callback_router as instagram_callback_router, router as instagram_router
from .settings import router as settings_router

router = APIRouter()

# Гейт подписки (8b) переехал сюда с уровня main.py (AI-3, задача 4): callback
# Instagram OAuth — это редирект браузера от Meta без Authorization-заголовка,
# под общий гейт всего /ai его не подвести. Схема — как у /booking (см.
# routers/booking/router.py): гейт на конкретных подроутерах, не на префиксе целиком.
_gate = [Depends(require_active_subscription)]
router.include_router(chat_router, dependencies=_gate)
router.include_router(settings_router, dependencies=_gate)
router.include_router(agents_router, dependencies=_gate)
router.include_router(instagram_router, dependencies=_gate)
router.include_router(instagram_callback_router)

from fastapi import APIRouter

from .router import router as _pos_router
from .stripe_pay import router as _stripe_router, webhook_router

router = APIRouter()
router.include_router(_pos_router)
router.include_router(_stripe_router)

__all__ = ["router", "webhook_router"]

from fastapi import APIRouter
from .profiles import router as profiles_router
from .subscriptions import router as subscriptions_router
from .loyalty import router as loyalty_router

router = APIRouter()
router.include_router(profiles_router)
router.include_router(subscriptions_router)
router.include_router(loyalty_router)

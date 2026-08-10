from fastapi import APIRouter

from .router import router
from .miniapp import router as miniapp_base_router
from .miniapp_email_auth import router as miniapp_email_auth_router
from .miniapp_lessons import router as miniapp_lessons_router
from .miniapp_users import router as miniapp_users_router
from .miniapp_studio import router as miniapp_studio_router
from .miniapp_loyalty import router as miniapp_loyalty_router

# Combine all miniapp routers into a single router
miniapp_router = APIRouter()
miniapp_router.include_router(miniapp_base_router)
miniapp_router.include_router(miniapp_email_auth_router)
miniapp_router.include_router(miniapp_lessons_router)
miniapp_router.include_router(miniapp_users_router)
miniapp_router.include_router(miniapp_studio_router)
miniapp_router.include_router(miniapp_loyalty_router)

__all__ = ["router", "miniapp_router"]

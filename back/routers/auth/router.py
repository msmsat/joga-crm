from fastapi import APIRouter
from .login import router as login_router
from .register import router as register_router
from .password import router as password_router
from .profile import router as profile_router
from .onboarding import router as onboarding_router

router = APIRouter()
router.include_router(login_router)
router.include_router(register_router)
router.include_router(password_router)
router.include_router(profile_router)
router.include_router(onboarding_router)

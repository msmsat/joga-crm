from fastapi import APIRouter
from .configs import router as configs_router
from .cards import router as cards_router
from .certificates import router as certificates_router
from .packages import router as packages_router

router = APIRouter()
router.include_router(configs_router)
router.include_router(cards_router)
router.include_router(certificates_router)
router.include_router(packages_router)

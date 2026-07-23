from fastapi import APIRouter
from .configs import router as configs_router
from .cards import router as cards_router
from .certificates import router as certificates_router
from .offers import router as offers_router
from .promocodes import router as promocodes_router
from .scenarios import router as scenarios_router
from .segments import router as segments_router

router = APIRouter()
router.include_router(configs_router)
router.include_router(cards_router)
router.include_router(certificates_router)
router.include_router(offers_router)
router.include_router(promocodes_router)
router.include_router(scenarios_router)
router.include_router(segments_router)

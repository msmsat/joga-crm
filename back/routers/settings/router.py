from fastapi import APIRouter
from .general import router as general_router
from .team import router as team_router
from .security import router as security_router
from .integrations import router as integrations_router

router = APIRouter()
router.include_router(general_router)
router.include_router(team_router)
router.include_router(security_router)
router.include_router(integrations_router)

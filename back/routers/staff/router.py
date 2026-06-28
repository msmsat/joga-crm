from fastapi import APIRouter
from .profiles import router as profiles_router
from .schedule import router as schedule_router
from .actions import router as actions_router

router = APIRouter()
router.include_router(profiles_router)
router.include_router(schedule_router)
router.include_router(actions_router)

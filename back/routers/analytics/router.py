from fastapi import APIRouter
from .reports import router as reports_router
from .tasks import router as tasks_router

router = APIRouter()
router.include_router(reports_router)
router.include_router(tasks_router)

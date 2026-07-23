from fastapi import APIRouter
from .overview import router as overview_router
from .reports import router as reports_router
from .sales import router as sales_router
from .tasks import router as tasks_router

router = APIRouter()
router.include_router(overview_router)
router.include_router(reports_router)
router.include_router(sales_router)
router.include_router(tasks_router)

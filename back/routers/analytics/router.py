from fastapi import APIRouter
from .overview import router as overview_router
from .reports import router as reports_router
from .retention import router as retention_router
from .sales import router as sales_router
from .tasks import router as tasks_router
from .team import router as team_router
from .utilization import router as utilization_router

router = APIRouter()
router.include_router(overview_router)
router.include_router(reports_router)
router.include_router(retention_router)
router.include_router(sales_router)
router.include_router(tasks_router)
router.include_router(team_router)
router.include_router(utilization_router)

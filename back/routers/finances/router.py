from fastapi import APIRouter
from .accounts import router as accounts_router
from .operations import router as operations_router
from .counterparties import router as counterparties_router
from .documents import router as documents_router
from .goals import router as goals_router
from .salary import router as salary_router
from .gateways import router as gateways_router

router = APIRouter()
router.include_router(accounts_router)
router.include_router(operations_router)
router.include_router(counterparties_router)
router.include_router(documents_router)
router.include_router(goals_router)
router.include_router(salary_router)
router.include_router(gateways_router)

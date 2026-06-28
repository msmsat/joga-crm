from fastapi import APIRouter
from .accounts import router as accounts_router
from .operations import router as operations_router
from .salary import router as salary_router

router = APIRouter()
router.include_router(accounts_router)
router.include_router(operations_router)
router.include_router(salary_router)

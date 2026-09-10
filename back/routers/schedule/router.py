from fastapi import APIRouter
from .lessons import router as lessons_router
from .halls import router as halls_router
from .reservations import router as reservations_router
from .hybrid import router as hybrid_router

router = APIRouter()
router.include_router(lessons_router)
router.include_router(halls_router)
router.include_router(reservations_router)
router.include_router(hybrid_router)

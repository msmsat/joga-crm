"""Сборка маршрутов админки."""
from fastapi import APIRouter

from .accounts import router as accounts_router
from .auth import router as auth_router
from .feed import router as feed_router
from .overview import router as overview_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(overview_router)
router.include_router(accounts_router)
router.include_router(feed_router)

"""Вход в админку и представление о текущем администраторе."""
import os

from fastapi import APIRouter, Depends, HTTPException, Request

from ratelimit import limiter
from schemas.admin import AdminLoginRequest, AdminMeResponse, AdminTokenResponse
from services import admin_auth

router = APIRouter()


@router.post("/login", response_model=AdminTokenResponse)
# Пять попыток за пятнадцать минут: пароль здесь один на весь продукт, и
# неограниченный темп подбора — единственная реальная атака на эту ручку.
@limiter.limit("5 per 15 minutes")
async def admin_login(body: AdminLoginRequest, request: Request):
    if not admin_auth.is_configured():
        raise HTTPException(status_code=503, detail="Админка не настроена")
    if not admin_auth.verify_credentials(body.login, body.password):
        # Один и тот же отказ на неверный логин и на неверный пароль: разные
        # ответы работали бы как проверялка существующего логина.
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return AdminTokenResponse(token=admin_auth.issue_token(), name=admin_auth.admin_name())


@router.get("/me", response_model=AdminMeResponse)
async def admin_me(_claims: dict = Depends(admin_auth.require_admin)):
    return AdminMeResponse(
        login=(os.getenv("ADMIN_LOGIN") or "").strip(),
        name=admin_auth.admin_name(),
    )

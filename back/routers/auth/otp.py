from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

import services.otp as otp
from database import get_db
from dependencies import get_current_user
from models import User
from ratelimit import limiter
from schemas.auth.otp import OtpRequestIn, OtpRequestOut, OtpVerifyIn, OtpVerifyOut
from security import create_access_token

router = APIRouter()

OTP_TOKEN_TTL_MINUTES = 5


@router.post("/otp/request", response_model=OtpRequestOut, status_code=202)
@limiter.limit("3/minute")
async def request_otp(
    request: Request,
    body: OtpRequestIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await otp.issue(db, user, body.action)
    return OtpRequestOut(expires_in=int(otp.CODE_TTL.total_seconds()))


@router.post("/otp/verify", response_model=OtpVerifyOut)
async def verify_otp(
    body: OtpVerifyIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await otp.verify(db, user, body.action, body.code)
    if not ok:
        raise HTTPException(status_code=400, detail="Неверный или истёкший код")
    otp_token = create_access_token(
        data={"sub": user.email, "action": body.action, "typ": "otp"},
        expires_minutes=OTP_TOKEN_TTL_MINUTES,
    )
    return OtpVerifyOut(otp_token=otp_token)

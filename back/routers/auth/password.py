import secrets
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import get_current_user, oauth2_scheme, require_otp
from models import User
from schemas import ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest
from security import get_password_hash, verify_password
from services.sessions import hash_token, revoke_sessions

router = APIRouter()


@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == request.email))
    ).scalar_one_or_none()

    if not user:
        return {"message": "Если email существует, код отправлен"}

    code = str(secrets.randbelow(9000) + 1000)  # secrets, не random — предсказуемый RNG в security-контексте
    user.verification_code = code
    await db.commit()

    print("\n" + "=" * 40)
    print(f"ВОССТАНОВЛЕНИЕ ПАРОЛЯ ДЛЯ: {user.email}")
    print(f"КОД: {code}")
    print("=" * 40 + "\n")
    return {"message": "Если email существует, код отправлен"}


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == request.email))
    ).scalar_one_or_none()

    if not user or user.verification_code != request.code:
        raise HTTPException(status_code=400, detail="Неверный код или email")

    user.hashed_password = get_password_hash(request.new_password)
    user.verification_code = None
    user.is_verified = True
    await db.commit()
    return {"message": "Пароль успешно изменен"}


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _otp: None = Depends(require_otp("change_password")),
):
    """Смена пароля из аккаунта (не «забыл пароль»): текущий пароль +
    код с почты (X-OTP-Token). После успеха — отозвать остальные сессии,
    иначе смена пароля не выкидывает того, кто угнал открытую вкладку."""
    if not verify_password(request.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    if request.new_password == request.current_password:
        raise HTTPException(status_code=400, detail="Новый пароль должен отличаться от текущего")

    user.hashed_password = get_password_hash(request.new_password)
    await db.commit()

    await revoke_sessions(db, user.id, except_token_hash=hash_token(token))
    return {"message": "Пароль успешно изменён"}

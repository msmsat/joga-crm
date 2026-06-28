from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, Studio, StudioWorkingHours, StudioMember
from schemas import OnboardingRequest, SelectStudioRequest, TokenResponse
from security import create_access_token
from dependencies import get_current_user

router = APIRouter()


@router.post("/onboarding")
async def complete_onboarding(
    request: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.is_onboarded:
        raise HTTPException(status_code=400, detail="Онбординг уже пройден")
    if len(request.studioName.strip()) < 2:
        raise HTTPException(status_code=400, detail="Название компании слишком короткое")
    if not request.phone or not request.phone.strip():
        raise HTTPException(status_code=400, detail="Укажите корректный номер телефона")
    if not request.activityType:
        raise HTTPException(status_code=400, detail="Выберите вид деятельности")
    if not request.timezone or not request.language or not request.currency:
        raise HTTPException(status_code=400, detail="Укажите региональные настройки")

    existing_phone = (
        await db.execute(select(User).where(User.phone == request.phone.strip()))
    ).scalar_one_or_none()
    if existing_phone is not None:
        raise HTTPException(status_code=400, detail="Данный номер телефона уже используется")

    new_studio = Studio(
        name=request.studioName.strip(),
        description=request.description,
        logo_url=request.logoUrl,
        phone=request.phone.strip(),
        address=request.address,
        email=request.email,
        website=request.website,
        business_type="fitness",
        business_subtype=request.activityType,
        timezone=request.timezone,
        language=request.language,
        currency=request.currency,
        date_format=request.dateFormat,
        first_day_of_week=request.firstDayOfWeek,
    )
    db.add(new_studio)
    await db.flush()

    if request.workingHours:
        for wh in request.workingHours:
            db.add(StudioWorkingHours(
                studio_id=new_studio.id,
                day_of_week=wh.dayOfWeek,
                is_open=wh.isOpen,
                open_time=wh.openTime,
                close_time=wh.closeTime,
            ))

    db.add(StudioMember(
        user_id=current_user.id,
        studio_id=new_studio.id,
        role="owner",
    ))

    current_user.is_onboarded = True
    current_user.phone = request.phone.strip()
    await db.commit()

    access_token = create_access_token(
        data={"sub": current_user.email, "studio_id": new_studio.id, "role": "owner"}
    )
    return {"message": "Онбординг успешно пройден!", "access_token": access_token}


@router.post("/select-studio", response_model=TokenResponse)
async def select_studio(
    request: SelectStudioRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = (
        await db.execute(
            select(StudioMember).where(
                StudioMember.user_id == current_user.id,
                StudioMember.studio_id == request.studio_id,
            )
        )
    ).scalar_one_or_none()

    if not member:
        raise HTTPException(status_code=403, detail="Нет доступа к этой студии")

    access_token = create_access_token(
        data={"sub": current_user.email, "studio_id": member.studio_id, "role": member.role}
    )
    return TokenResponse(access_token=access_token, token_type="bearer")

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import Client, User, Studio, StudioWorkingHours, StudioMember
from schemas import OnboardingRequest, SelectStudioRequest, StudioListItem, TokenResponse
from security import create_access_token
from dependencies import ALGORITHM, SECRET_KEY, get_current_user, oauth2_scheme
from jose import jwt

router = APIRouter()


def _validate_onboarding_request(data: OnboardingRequest) -> None:
    """Проверка формата — общая для первой студии (/onboarding) и
    дополнительной (/studios, EPIC 7 задача 3)."""
    if len(data.studioName.strip()) < 2:
        raise HTTPException(status_code=400, detail="Название компании слишком короткое")
    if not data.phone or not data.phone.strip():
        raise HTTPException(status_code=400, detail="Укажите корректный номер телефона")
    if not data.activityType:
        raise HTTPException(status_code=400, detail="Выберите вид деятельности")
    if not data.timezone or not data.language or not data.currency:
        raise HTTPException(status_code=400, detail="Укажите региональные настройки")


async def _create_studio_with_defaults(user: User, data: OnboardingRequest, db: AsyncSession) -> Studio:
    """Studio + рабочие часы + владелец в StudioMember — общее для /onboarding
    (первая студия) и /studios (доп. студия, EPIC 7 задача 3). Проверка формата —
    на вызывающем (_validate_onboarding_request), проверка глобальной
    уникальности телефона и флаг is_onboarded — тоже (нужны только при самом
    первом онбординге).

    Подписку здесь НЕ создаём. Пробный период выдаётся по явному согласию
    владельца — POST /billing/trial из окна с акцией; до этого строки в
    StudioBillingPlan нет, GET /billing/plan отдаёт status=none, и пейволл
    (_sub_gate) сам приводит на «Тариф и оплата», где то же предложение
    доступно кнопкой. Раньше триал начислялся молча прямо здесь, и
    «активировать» человеку было нечего."""
    new_studio = Studio(
        name=data.studioName.strip(),
        description=data.description,
        logo_url=data.logoUrl,
        phone=data.phone.strip(),
        address=data.address,
        email=data.email,
        website=data.website,
        business_type="fitness",
        business_subtype=data.activityType,
        timezone=data.timezone,
        language=data.language,
        currency=data.currency,
        date_format=data.dateFormat,
        first_day_of_week=data.firstDayOfWeek,
    )
    db.add(new_studio)
    await db.flush()

    if data.workingHours:
        for wh in data.workingHours:
            db.add(StudioWorkingHours(
                studio_id=new_studio.id,
                day_of_week=wh.dayOfWeek,
                is_open=wh.isOpen,
                open_time=wh.openTime,
                close_time=wh.closeTime,
            ))

    # Профиль владельца в новой студии начинается с имени его аккаунта — другого
    # источника нет. Дальше он правит его в «Сотрудниках», и на личное имя
    # аккаунта (и на его профиль в других студиях) это уже не влияет.
    db.add(StudioMember(
        user_id=user.id,
        studio_id=new_studio.id,
        role="owner",
        # Свою студию человек создаёт сам — приглашать его в неё некому.
        status="active",
        name=user.name,
        last_name=user.last_name,
        photo_url=user.photo_url,
    ))

    return new_studio


@router.post("/onboarding")
async def complete_onboarding(
    request: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.is_onboarded:
        raise HTTPException(status_code=400, detail="Онбординг уже пройден")
    _validate_onboarding_request(request)

    # Телефон студии в аккаунт владельца НЕ переносится и на уникальность не
    # проверяется: это контакт бизнеса, его можно указать хоть общий на сеть
    # студий, хоть чужой (docs/ROADMAP_ACCOUNTS, «Вне scope»). Личный номер
    # владельца спрашивает PhoneGate при входе в кабинет, если его ещё нет.
    new_studio = await _create_studio_with_defaults(current_user, request, db)

    current_user.is_onboarded = True
    current_user.last_studio_id = new_studio.id
    await db.commit()

    access_token = create_access_token(
        data={"sub": current_user.email, "studio_id": new_studio.id, "role": "owner"}
    )
    return {"message": "Онбординг успешно пройден!", "access_token": access_token}


@router.post("/studios", response_model=TokenResponse)
async def create_studio(
    request: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Дополнительная студия для уже онбординженного пользователя (мультистудийность,
    EPIC 7 задача 3) — тот же мастер (/onboarding?new=1 на фронте), но без блокировки
    is_onboarded."""
    _validate_onboarding_request(request)
    new_studio = await _create_studio_with_defaults(current_user, request, db)
    # Создал студию — в ней и остался: следующий вход откроет её, а не /select-crm.
    current_user.last_studio_id = new_studio.id
    await db.commit()

    access_token = create_access_token(
        data={"sub": current_user.email, "studio_id": new_studio.id, "role": "owner"}
    )
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.get("/studios", response_model=list[StudioListItem])
async def list_studios(
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Список студий пользователя для /select-crm (EPIC 7 задача 4) — по
    членству в StudioMember, не по справочнику внешних CRM (его в БД нет)."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    current_studio_id = payload.get("studio_id")

    rows = (await db.execute(
        select(StudioMember, Studio)
        .join(Studio, StudioMember.studio_id == Studio.id)
        # Непринятое приглашение в список рабочих пространств не попадает: студия
        # появится здесь, когда человек примет его по ссылке из письма.
        .where(StudioMember.user_id == current_user.id, StudioMember.status == "active")
        .order_by(Studio.id)
    )).all()
    studio_ids = [studio.id for _, studio in rows]

    members_counts = dict((await db.execute(
        select(StudioMember.studio_id, func.count())
        .where(StudioMember.studio_id.in_(studio_ids))
        .group_by(StudioMember.studio_id)
    )).all())
    clients_counts = dict((await db.execute(
        select(Client.studio_id, func.count())
        .where(Client.studio_id.in_(studio_ids))
        .group_by(Client.studio_id)
    )).all())

    return [
        StudioListItem(
            id=studio.id,
            name=studio.name,
            role=member.role,
            logo_url=studio.logo_url,
            is_current=(studio.id == current_studio_id),
            members_count=members_counts.get(studio.id, 0),
            clients_count=clients_counts.get(studio.id, 0),
        )
        for member, studio in rows
    ]


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
                # Непринятое приглашение — не доступ: переключиться в такую
                # студию нельзя, сначала принять письмо.
                StudioMember.status == "active",
            )
        )
    ).scalar_one_or_none()

    if not member:
        raise HTTPException(status_code=403, detail="Нет доступа к этой студии")

    # Выбор запоминаем: следующий вход откроет эту студию сразу, без /select-crm.
    current_user.last_studio_id = member.studio_id
    await db.commit()

    access_token = create_access_token(
        data={"sub": current_user.email, "studio_id": member.studio_id, "role": member.role}
    )
    return TokenResponse(access_token=access_token, token_type="bearer")

import logging
import os
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import async_session_maker, get_db
from dependencies import StudioContext, get_current_user, oauth2_scheme, require_otp, require_role
from models import (
    Client, ClientSubscription, FinDocument, GiftCertificate, Lesson, Operation, ReferralRecord,
    Reservation, Studio, StudioBillingPlan, StudioMember, User, UserSession,
)
from schemas.settings.security import (
    ConfirmNameRequest, DeleteAccountResult, ExportArchiveRequest, SessionRead, TwoFaStatus, TwoFaUpdate,
    WipeDataResult,
)
from services.exporter import csv_stream
from services.mailer import send_email
from services.sessions import hash_token, revoke_sessions

logger = logging.getLogger(__name__)
router = APIRouter()

EXPORT_DIR = Path("uploads/exports")
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")


@router.get("/security/sessions", response_model=list[SessionRead])
async def list_sessions(
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_hash = hash_token(token)
    sessions = (await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_active.desc())
    )).scalars().all()
    return [
        SessionRead(
            id=s.id, device=s.device, platform=s.platform, browser=s.browser,
            ip_address=s.ip_address, location_city=s.location_city, location_country=s.location_country,
            last_active=s.last_active, is_current=(s.token_hash == current_hash),
        )
        for s in sessions
    ]


@router.delete("/security/sessions/{session_id}", status_code=204)
async def terminate_session(
    session_id: int,
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = (await db.execute(
        select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id)
    )).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if session.token_hash == hash_token(token):
        raise HTTPException(status_code=409, detail="Нельзя завершить текущую сессию — используйте выход")
    session.revoked_at = datetime.utcnow()
    await db.commit()


@router.delete("/security/sessions", status_code=204)
async def terminate_other_sessions(
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Завершить все сессии, кроме текущей."""
    await revoke_sessions(db, user.id, except_token_hash=hash_token(token))


@router.patch("/security/2fa", response_model=TwoFaStatus)
async def set_two_fa(
    body: TwoFaUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _otp: None = Depends(require_otp("enable_2fa")),
):
    """Включение/выключение 2FA (EPIC 5, задача 5) — обе стороны требуют
    X-OTP-Token: иначе включить 2FA чужой рукой и заблокировать владельцу
    вход тривиально."""
    user.two_fa_enabled = body.enabled
    await db.commit()
    return TwoFaStatus(enabled=user.two_fa_enabled)


# ─── EPIC 5, задача 6: «Подготовить архив» ───────────────────────────────

async def _clients_csv(db: AsyncSession, studio_id: int) -> str:
    rows = (await db.execute(
        select(Client).where(Client.studio_id == studio_id).order_by(Client.id)
    )).scalars().all()
    header = ["ID", "Имя", "Фамилия", "Телефон", "Email", "Город", "Статус", "Дата регистрации"]

    def _rows():
        for c in rows:
            yield [
                c.id, c.name, c.last_name or "", c.phone or "", c.email or "", c.city or "", c.status,
                c.registration_date.strftime("%d.%m.%Y") if c.registration_date else "",
            ]
    return "".join(csv_stream(header, _rows()))


async def _finances_csv(db: AsyncSession, studio_id: int) -> str:
    rows = (await db.execute(
        select(Operation).where(Operation.studio_id == studio_id).order_by(Operation.op_date)
    )).scalars().all()
    header = ["Дата", "Тип", "Название", "Сумма", "Категория", "Способ оплаты", "Статус"]

    def _rows():
        for o in rows:
            yield [o.op_date.strftime("%d.%m.%Y"), o.type, o.title, f"{o.amount / 100:.2f}", o.category, o.method, o.status]
    return "".join(csv_stream(header, _rows()))


async def _schedule_csv(db: AsyncSession, studio_id: int) -> str:
    rows = (await db.execute(
        select(Lesson).where(Lesson.studio_id == studio_id).order_by(Lesson.start_time)
    )).scalars().all()
    header = ["Дата и время", "Занятие", "Тренер", "Длительность, мин", "Цена", "Статус"]

    def _rows():
        for l in rows:
            yield [l.start_time.strftime("%d.%m.%Y %H:%M"), l.name, l.teacher_name, l.duration_min,
                   f"{l.price / 100:.2f}", l.status]
    return "".join(csv_stream(header, _rows()))


_SECTION_BUILDERS = {"clients": _clients_csv, "finances": _finances_csv, "schedule": _schedule_csv}


async def _build_and_send_archive(studio_id: int, owner_email: str, include: list[str], file_id: str) -> None:
    """Фон (`BackgroundTasks`), не Celery — очередь ради кнопки, которую
    владелец жмёт раз в квартал, оверинжиниринг для MVP.
    # ponytail: BackgroundTasks; если архивы начнут таймаутить — очередь.

    Своя сессия БД: сессия исходного запроса закрывается сразу после ответа
    202, использовать её здесь нельзя (уже закрыта к моменту выполнения)."""
    async with async_session_maker() as db:
        try:
            studio_dir = EXPORT_DIR / str(studio_id)
            studio_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(studio_dir / f"{file_id}.zip", "w", zipfile.ZIP_DEFLATED) as zf:
                for section in include:
                    zf.writestr(f"{section}.csv", await _SECTION_BUILDERS[section](db, studio_id))

            await send_email(
                owner_email, "Ваш архив данных Velora готов",
                f"<p>Архив данных вашей студии сформирован.</p>"
                f"<p>Зайдите в Velora — Настройки → Безопасность, чтобы скачать его: "
                f"<a href=\"{WEB_APP_URL}/dashboard/settings\">{WEB_APP_URL}/dashboard/settings</a></p>"
                f"<p>Ссылка на скачивание в приложении действительна 7 дней.</p>",
            )
        except Exception:
            logger.exception("export-archive: сборка не удалась (studio_id=%s)", studio_id)


@router.post("/security/export-archive", status_code=202)
async def request_export_archive(
    body: ExportArchiveRequest,
    background_tasks: BackgroundTasks,
    ctx: StudioContext = Depends(require_role("owner")),
):
    file_id = uuid.uuid4().hex
    background_tasks.add_task(_build_and_send_archive, ctx.studio_id, ctx.user.email, body.include, file_id)
    return {"message": "Архив формируется, ссылка придёт на почту"}


@router.get("/security/export-archive/{file_id}")
async def download_export_archive(
    file_id: str,
    ctx: StudioContext = Depends(require_role("owner")),
):
    """Не отдаём файл напрямую из /uploads (там раздаётся статика — архив с
    клиентской базой по угадываемому пути в публичной директории недопустим).
    `file_id` — из URL, нормализуем через UUID, чтобы закрыть path traversal."""
    try:
        safe_id = uuid.UUID(file_id).hex  # .hex — тот же формат, что при генерации (uuid4().hex, без дефисов)
    except ValueError:
        raise HTTPException(status_code=404, detail="Архив не найден")

    path = EXPORT_DIR / str(ctx.studio_id) / f"{safe_id}.zip"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Архив не найден")
    return FileResponse(path, media_type="application/zip", filename=f"velora-export-{safe_id}.zip")


# ─── EPIC 5, задача 7: Danger Zone ────────────────────────────────────────
# Самый ответственный код эпика — удаляет данные безвозвратно. Явный список
# моделей (не «всё»): клиенты, занятия, записи, операции, документы,
# абонементы, лояльность. Остаётся: студия, филиалы, залы, услуги,
# сотрудники, подписка, настройки — владелец чистит рабочие данные, а не
# разбирает конфигурацию (StudioLoyaltyConfig/StudioDiscountConfig/
# SubscriptionPackage и т.п. — это каталог/настройки, как и Service, они не
# трогаются).

async def _check_confirm_name(db: AsyncSession, studio_id: int, confirm_name: str) -> Studio:
    studio = await db.get(Studio, studio_id)
    if studio is None or confirm_name != studio.name:
        raise HTTPException(status_code=422, detail="Название студии не совпадает")
    return studio


@router.post("/security/wipe-data", response_model=WipeDataResult)
async def wipe_data(
    body: ConfirmNameRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
    _otp: None = Depends(require_otp("delete_data")),
):
    await _check_confirm_name(db, ctx.studio_id, body.confirm_name)

    deleted: dict[str, int] = {}

    # Сначала зависимые (через studio_id родителя — Client/Lesson ещё не
    # удалены, подзапросы валидны), потом сами studio_id-таблицы.
    res = await db.execute(sa_delete(Reservation).where(
        Reservation.lesson_id.in_(select(Lesson.id).where(Lesson.studio_id == ctx.studio_id))
    ))
    deleted["reservations"] = res.rowcount or 0

    res = await db.execute(sa_delete(ClientSubscription).where(
        ClientSubscription.client_id.in_(select(Client.id).where(Client.studio_id == ctx.studio_id))
    ))
    deleted["subscriptions"] = res.rowcount or 0

    res = await db.execute(sa_delete(GiftCertificate).where(GiftCertificate.studio_id == ctx.studio_id))
    loyalty = res.rowcount or 0
    res = await db.execute(sa_delete(ReferralRecord).where(ReferralRecord.studio_id == ctx.studio_id))
    loyalty += res.rowcount or 0
    deleted["loyalty"] = loyalty

    res = await db.execute(sa_delete(Lesson).where(Lesson.studio_id == ctx.studio_id))
    deleted["lessons"] = res.rowcount or 0

    res = await db.execute(sa_delete(Operation).where(Operation.studio_id == ctx.studio_id))
    deleted["operations"] = res.rowcount or 0

    res = await db.execute(sa_delete(FinDocument).where(FinDocument.studio_id == ctx.studio_id))
    deleted["documents"] = res.rowcount or 0

    # Client — последним: FK-каскад (ondelete=CASCADE в БД) сам подчистит
    # заметки/платежи/карты лояльности/баллы/депозиты/офферы клиента —
    # эти категории эпик отдельно в ответе не просит.
    res = await db.execute(sa_delete(Client).where(Client.studio_id == ctx.studio_id))
    deleted["clients"] = res.rowcount or 0

    await db.commit()
    return WipeDataResult(deleted=deleted)


@router.delete("/security/account", response_model=DeleteAccountResult)
async def delete_account(
    body: ConfirmNameRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
    _otp: None = Depends(require_otp("delete_account")),
):
    await _check_confirm_name(db, ctx.studio_id, body.confirm_name)

    other_owner = (await db.execute(
        select(StudioMember).where(
            StudioMember.studio_id == ctx.studio_id,
            StudioMember.role == "owner",
            StudioMember.user_id != ctx.user.id,
        )
    )).scalars().first()
    if other_owner is not None:
        raise HTTPException(
            status_code=409,
            detail="В студии есть другие владельцы — сначала передайте им права или выведите их из студии",
        )

    plan = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == ctx.studio_id)
    )).scalar_one_or_none()
    if plan is not None and plan.status == "active":
        raise HTTPException(status_code=409, detail="Сначала отмените подписку")

    # Все сессии, включая текущую — студии, из которой они выданы, больше
    # не будет; ответ на этот запрос всё равно уйдёт (отзыв не рвёт текущее
    # соединение, только блокирует следующий запрос по этому токену).
    await revoke_sessions(db, ctx.user.id, except_token_hash=None)

    await db.execute(sa_delete(Studio).where(Studio.id == ctx.studio_id))
    await db.commit()

    return DeleteAccountResult(redirect="/select-crm")

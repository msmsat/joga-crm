"""Подарочные сертификаты: выпуск с уникальным кодом и погашение (задача 5).

Выпуск генерирует уникальный код (проверка коллизии). Погашение переводит
active → used (+used_at); повторное погашение — 409. Всё — только owner,
скоуп по ctx.studio_id.
"""
import secrets
from datetime import date, datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import GiftCertificate, StudioCertificateConfig
from schemas.loyalty import GiftCertificateCreate, GiftCertificateRead

router = APIRouter()

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # без похожих 0/O, 1/I


async def _unique_code(studio_id: int, db: AsyncSession) -> str:
    """Код вида GC-XXXXXXXX; повторяем, пока не найдём свободный."""
    for _ in range(10):
        code = "GC-" + "".join(secrets.choice(_ALPHABET) for _ in range(8))
        exists = (await db.execute(
            select(GiftCertificate.id).where(GiftCertificate.code == code)
        )).scalar_one_or_none()
        if exists is None:
            return code
    raise HTTPException(status_code=500, detail="Не удалось сгенерировать код сертификата")


@router.get("/certificates", response_model=List[GiftCertificateRead])
async def list_certificates(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(GiftCertificate)
        .where(GiftCertificate.studio_id == ctx.studio_id)
        .order_by(GiftCertificate.issued_at.desc())
    )).scalars().all()
    return rows


@router.post("/certificates", response_model=GiftCertificateRead, status_code=201)
async def create_certificate(
    body: GiftCertificateCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    expires_at = body.expires_at
    if expires_at is None:
        # Срок по умолчанию из конфига сертификатов студии (если он есть).
        cfg = (await db.execute(
            select(StudioCertificateConfig).where(StudioCertificateConfig.studio_id == ctx.studio_id)
        )).scalar_one_or_none()
        expiry_days = cfg.expiry_days if cfg else 365
        expires_at = date.today() + timedelta(days=expiry_days)

    cert = GiftCertificate(
        studio_id=ctx.studio_id,
        client_id=body.client_id,
        recipient_name=body.recipient_name,
        code=await _unique_code(ctx.studio_id, db),
        amount=body.amount,
        cert_type=body.cert_type,
        status="active",
        expires_at=expires_at,
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return cert


@router.post("/certificates/{cert_id}/redeem", response_model=GiftCertificateRead)
async def redeem_certificate(
    cert_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    cert = (await db.execute(
        select(GiftCertificate).where(
            GiftCertificate.id == cert_id,
            GiftCertificate.studio_id == ctx.studio_id,
        )
    )).scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=404, detail="Сертификат не найден")
    if cert.status != "active":
        raise HTTPException(status_code=409, detail="Сертификат уже погашен или недействителен")

    cert.status = "used"
    cert.used_at = datetime.utcnow()
    await db.commit()
    await db.refresh(cert)
    return cert

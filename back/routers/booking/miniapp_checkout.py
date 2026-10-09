"""Authenticated, bounded recovery after returning from a client checkout."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Client
from ratelimit import limiter
from schemas.miniapp_checkout import CheckoutSyncRequest, CheckoutSyncResponse
from services.client_checkout_sync import sync_checkouts

from .miniapp import get_current_client

router = APIRouter()


@router.post("/checkout/sync", response_model=CheckoutSyncResponse)
@limiter.limit("20/minute")
async def sync_checkout(
    request: Request,
    body: CheckoutSyncRequest | None = None,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    return await sync_checkouts(
        db, studio_id=client.studio_id, client_id=client.id,
        target=body or CheckoutSyncRequest(),
    )

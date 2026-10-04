"""Read-only imported history. Mutations are confined to the server CLI."""
import os
import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from dependencies import StudioContext, require_role
from models.bumpix import BumpixEvent, BumpixMedia
from schemas.clients.bumpix import BumpixFilter, BumpixProfile, BumpixEventPage
from services.bumpix_import.media import safe_path
from services.bumpix_import.reading import bindings_for, conditions, event_page, photo_response, FILTERS

router = APIRouter()
staff = require_role('owner', 'admin', 'trainer')


@router.get('/{client_id}/bumpix', response_model=list[BumpixProfile])
async def profile(client_id: int, ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    try:
        bindings = await bindings_for(db, ctx, client_id)
    except ValueError as exc:
        raise HTTPException(404, 'Клиент не найден') from exc
    results = []
    for binding in bindings:
        base = conditions(ctx, client_id) + [BumpixEvent.binding_id == binding.id]
        counts = {'all': await db.scalar(select(func.count()).select_from(BumpixEvent).where(*base))}
        for label, (_, mask) in FILTERS.items():
            counts[label] = await db.scalar(select(func.count()).select_from(BumpixEvent).where(
                *base, BumpixEvent.group_mask.op('&')(mask) != 0))
        avatar = await db.scalar(select(BumpixMedia).where(
            BumpixMedia.studio_id == ctx.studio_id, BumpixMedia.binding_id == binding.id,
            BumpixMedia.kind == 'avatar', BumpixMedia.is_current.is_(True)))
        lookups = binding.payload['lookups']
        if ctx.role == 'trainer':
            own_masters = set((await db.scalars(select(BumpixEvent.master_source_id).where(*base))).all())
            lookups = {'masters': [{'0': m.get('0'), '2': m.get('2', '')} for m in lookups.get('masters', [])
                                   if isinstance(m, dict) and m.get('0') in own_masters]}
        results.append({'source_client_id': binding.source_client_id, 'snapshot_id': binding.snapshot_id,
            'profile': {k: v for k, v in binding.payload['profile'].items() if k != 'media'}, 'raw_client': binding.payload['client'], 'counts': counts,
            'lookups': lookups,
            'avatar': photo_response(avatar, client_id) if avatar else None, 'imported_at': binding.created_at})
    return results


@router.get('/{client_id}/bumpix/events', response_model=BumpixEventPage)
async def events(client_id: int, status: BumpixFilter = 'all', offset: int = Query(0, ge=0),
                 limit: int = Query(50, ge=1, le=200), ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    try:
        return await event_page(db, ctx, client_id, status, offset, limit)
    except ValueError as exc:
        raise HTTPException(404, 'Клиент не найден') from exc


@router.get('/{client_id}/bumpix/media/{media_id}')
async def media(client_id: int, media_id: int, ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    try:
        bindings = await bindings_for(db, ctx, client_id)
        by_id = {b.id: b for b in bindings}
        photo = await db.scalar(select(BumpixMedia).where(
            BumpixMedia.id == media_id, BumpixMedia.studio_id == ctx.studio_id,
            BumpixMedia.binding_id.in_(by_id), BumpixMedia.is_current.is_(True)))
        if not photo:
            raise ValueError('Photo not found')
        if photo.kind == 'event':
            event = await db.scalar(select(BumpixEvent).where(
                *conditions(ctx, client_id), BumpixEvent.id == photo.event_id, BumpixEvent.binding_id == photo.binding_id))
            if not event or event.source_event_id != photo.source_owner_id:
                raise ValueError('Photo not found')
        binding = by_id[photo.binding_id]
        expected = f'bumpix/{ctx.studio_id}/{binding.account_key}/media/{photo.sha256}'
        if not re.fullmatch(re.escape(expected) + r'\.(jpg|jpeg|png|webp|gif)', photo.path):
            raise ValueError('Invalid photo storage path')
        path = safe_path(Path(os.getenv('BUMPIX_STORAGE_ROOT', 'uploads')), photo.path)
        if not path.is_file() or path.stat().st_size != photo.bytes:
            raise ValueError('Photo missing; rerun importer to repair storage')
    except ValueError as exc:
        raise HTTPException(404, 'Фото не найдено') from exc
    return FileResponse(path, headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Authorization'})

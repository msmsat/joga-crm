"""Imported Journal read layer. Native future bookings use normal lesson routes."""
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from dependencies import StudioContext, require_role
from schemas.clients.bumpix import BumpixEventResponse
from pydantic import BaseModel
from services.bumpix_import.journal_reading import range_page, month_days, linked_detail

router = APIRouter()
staff = require_role('owner', 'admin', 'trainer')


class JournalItem(BaseModel):
    event: BumpixEventResponse
    client_id: int
    client_name: str
    master_name: str


class JournalPage(BaseModel):
    total: int
    offset: int
    limit: int
    items: list[JournalItem]


@router.get('/bumpix-events', response_model=JournalPage)
async def events(date_from: date, date_to: date, offset: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=200), ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    if not 0 <= (date_to - date_from).days <= 31:
        raise HTTPException(422, 'Date range must be between 1 and 32 days')
    return await range_page(db, ctx, datetime.combine(date_from, datetime.min.time()), datetime.combine(date_to + timedelta(days=1), datetime.min.time()), offset, limit)


@router.get('/bumpix-days', response_model=list[str])
async def days(month: date, exclude_teacher_ids: str = '', exclude_unmapped: bool = False, ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    try:
        excluded = [int(x) for x in exclude_teacher_ids.split(',') if x]
        if len(excluded) > 200 or any(x < 1 for x in excluded):
            raise ValueError()
    except ValueError as exc:
        raise HTTPException(422, 'Invalid excluded teacher IDs') from exc
    start = month.replace(day=1)
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return await month_days(db, ctx, datetime.combine(start, datetime.min.time()), datetime.combine(end, datetime.min.time()), excluded, exclude_unmapped)


@router.get('/lessons/{lesson_id}/bumpix', response_model=JournalItem | None)
async def detail(lesson_id: int, ctx: StudioContext = Depends(staff), db: AsyncSession = Depends(get_db)):
    return await linked_detail(db, ctx, lesson_id)

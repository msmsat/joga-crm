from datetime import date,datetime,time,timedelta
from types import SimpleNamespace
from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from dependencies import get_studio_context,require_role,StudioContext
from models import StaffWorkingHours,StaffDayOverride,StaffBusyInterval,Studio,StudioMember
from schemas.schedule.time_blocks import StudioTimeCreate,StudioTimeRead,StudioTimeUpdate
from services.staff_hours import unavailable_blocks
from services import booking_time,studio_time,time_blocks
router=APIRouter()

@router.get("/staff-blocks")
async def staff_blocks(date_from:date,date_to:date,ctx:StudioContext=Depends(get_studio_context),db:AsyncSession=Depends(get_db)):
    if date_to<date_from or (date_to-date_from).days>62:
        raise HTTPException(422,detail="Некорректный диапазон дат")
    ids=list((await db.execute(select(StudioMember.user_id).where(StudioMember.studio_id==ctx.studio_id,
        StudioMember.status=="active",*([StudioMember.user_id==ctx.user.id] if ctx.role=="trainer" else [])))).scalars().all())
    hours=list((await db.execute(select(StaffWorkingHours).where(StaffWorkingHours.studio_id==ctx.studio_id,StaffWorkingHours.user_id.in_(ids)))).scalars().all())
    overrides=list((await db.execute(select(StaffDayOverride).where(StaffDayOverride.studio_id==ctx.studio_id,StaffDayOverride.user_id.in_(ids),StaffDayOverride.day>=date_from-timedelta(days=1),StaffDayOverride.day<=date_to))).scalars().all())
    busy=list((await db.execute(select(StaffBusyInterval).where(StaffBusyInterval.studio_id==ctx.studio_id,StaffBusyInterval.user_id.in_(ids),
        StaffBusyInterval.start_time<datetime.combine(date_to+timedelta(days=3),time.min),StaffBusyInterval.end_time>datetime.combine(date_from-timedelta(days=2),time.min)))).scalars().all())
    studio=(await db.execute(select(Studio).where(Studio.id==ctx.studio_id))).scalar_one()
    normalized=[]
    for b in busy:
        start,end=b.start_time,b.end_time
        resolved=booking_time.resolve_interval(start,end,b.tz_iana)
        if resolved and studio_time.clock(studio).verified:
            start,end=(studio_time.to_local(t,studio).replace(tzinfo=None) for t in resolved)
        normalized.append(SimpleNamespace(id=b.id,user_id=b.user_id,start_time=start,end_time=end,reason=b.reason))
    result=[]
    for staff_id in ids:
        mine_hours=[h for h in hours if h.user_id==staff_id]
        mine_overrides=[o for o in overrides if o.user_id==staff_id]
        mine_busy=[b for b in normalized if b.user_id==staff_id]
        for n in range((date_to-date_from).days+1):
            day=date_from+timedelta(days=n)
            base=datetime.combine(day,time.min)
            for block in unavailable_blocks(mine_hours,mine_overrides,mine_busy,day):
                result.append({"staff_id":staff_id,"date":day.isoformat(),"start_minute":int((block["start_time"]-base).total_seconds()/60),
                    "end_minute":int((block["end_time"]-base).total_seconds()/60),"kind":block["kind"],"label":block["label"],
                    **({"id":block["id"]} if "id" in block else {})})
    return result


# ─── «Время студии»: блок без занятия прямо из журнала ───────────────────────
# Журнал правят владелец и администратор — им и ставить уборку в сетку.
# Тренер блоки видит (GET выше), но не меняет: как и занятия.

@router.post("/staff-blocks",status_code=201,response_model=StudioTimeRead)
async def create_studio_time(payload:StudioTimeCreate,ctx:StudioContext=Depends(require_role("owner","admin")),db:AsyncSession=Depends(get_db)):
    return await time_blocks.create(db,ctx.studio_id,staff_id=payload.staff_id,start=payload.start_time,
        duration_min=payload.duration_min,label=payload.label)


@router.patch("/staff-blocks/{block_id}",response_model=StudioTimeRead)
async def update_studio_time(block_id:int,payload:StudioTimeUpdate,ctx:StudioContext=Depends(require_role("owner","admin")),db:AsyncSession=Depends(get_db)):
    return await time_blocks.update(db,ctx.studio_id,block_id,staff_id=payload.staff_id,start=payload.start_time,
        duration_min=payload.duration_min,label=payload.label)


@router.delete("/staff-blocks/{block_id}",response_model=StudioTimeRead)
async def delete_studio_time(block_id:int,ctx:StudioContext=Depends(require_role("owner","admin")),db:AsyncSession=Depends(get_db)):
    return await time_blocks.delete(db,ctx.studio_id,block_id)

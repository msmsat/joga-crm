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
async def staff_blocks(date_from:date,date_to:date,ctx:StudioContext=Depends(get_studio_context),db:AsyncSession=Depends(get_db),
                       hours_only:bool=False):
    # hours_only — только часы (выходные, нерабочее время, перерывы по графику)
    # без занятостей: окно «Время студии» сверяет по ним, не попадает ли блок
    # вне рабочего времени. С занятостями блок «прятал» бы нерабочий час под собой.
    if date_to<date_from or (date_to-date_from).days>62:
        raise HTTPException(422,detail="Некорректный диапазон дат")
    ids=list((await db.execute(select(StudioMember.user_id).where(StudioMember.studio_id==ctx.studio_id,
        StudioMember.status=="active",*([StudioMember.user_id==ctx.user.id] if ctx.role=="trainer" else [])))).scalars().all())
    hours=list((await db.execute(select(StaffWorkingHours).where(StaffWorkingHours.studio_id==ctx.studio_id,StaffWorkingHours.user_id.in_(ids)))).scalars().all())
    overrides=list((await db.execute(select(StaffDayOverride).where(StaffDayOverride.studio_id==ctx.studio_id,StaffDayOverride.user_id.in_(ids),StaffDayOverride.day>=date_from-timedelta(days=1),StaffDayOverride.day<=date_to))).scalars().all())
    busy=[] if hours_only else list((await db.execute(select(StaffBusyInterval).where(StaffBusyInterval.studio_id==ctx.studio_id,StaffBusyInterval.user_id.in_(ids),
        StaffBusyInterval.start_time<datetime.combine(date_to+timedelta(days=3),time.min),StaffBusyInterval.end_time>datetime.combine(date_from-timedelta(days=2),time.min)))).scalars().all())
    studio=(await db.execute(select(Studio).where(Studio.id==ctx.studio_id))).scalar_one()
    normalized=[]
    for b in busy:
        start,end=b.start_time,b.end_time
        resolved=booking_time.resolve_interval(start,end,b.tz_iana)
        if resolved and studio_time.clock(studio).verified:
            start,end=(studio_time.to_local(t,studio).replace(tzinfo=None) for t in resolved)
        normalized.append(SimpleNamespace(id=b.id,user_id=b.user_id,start_time=start,end_time=end,reason=b.reason))
    # Заметка и снимки «времени студии» едут в сетку вместе с блоком: окно
    # правки открывается сразу полным, без второго запроса. Только непустые —
    # у перерывов и голых занятостей их нет, и сетке незачем таскать пустоту.
    # Кого касается блок на нескольких сотрудников — всем составом, даже
    # тренеру, которому сетка отдаёт только его колонку: «планёрка с кем».
    # Имена и цвета — тоже здесь: тренеру список команды не отдаётся, и без них
    # его карточка показывала бы вместо коллег голое «+2».
    keys={b.group_key for b in busy if b.group_key}
    team,people={},{}
    if keys:
        for user_id,key in (await db.execute(select(StaffBusyInterval.user_id,StaffBusyInterval.group_key).where(
                StaffBusyInterval.studio_id==ctx.studio_id,StaffBusyInterval.group_key.in_(keys)).order_by(StaffBusyInterval.id))).all():
            team.setdefault(key,[]).append(user_id)
        members=(await db.execute(select(StudioMember).where(StudioMember.studio_id==ctx.studio_id,
            StudioMember.user_id.in_({u for ids in team.values() for u in ids})))).scalars().all()
        people={m.user_id:{"id":m.user_id,"name":" ".join(x for x in (m.name,m.last_name) if x),"color":m.color} for m in members}
    def crew(key):
        ids=team.get(key) or []
        return {"staff_ids":ids,"team":[people.get(u) or {"id":u,"name":"","color":None} for u in ids]} if len(ids)>1 else {}
    extras={b.id:{**({"notes":b.notes} if b.notes else {}),**({"photos":list(b.photos)} if b.photos else {}),
        **crew(b.group_key)} for b in busy}
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
                    **({"id":block["id"],**extras.get(block["id"],{})} if "id" in block else {})})
    return result


# ─── «Время студии»: блок без занятия прямо из журнала ───────────────────────
# Ставит, правит и убирает его только владелец: это распоряжение временем
# команды. Администратор и тренер блок видят (GET выше) и открывают карточкой
# «что сделать», но не меняют.

@router.post("/staff-blocks",status_code=201,response_model=StudioTimeRead)
async def create_studio_time(payload:StudioTimeCreate,ctx:StudioContext=Depends(require_role("owner")),db:AsyncSession=Depends(get_db)):
    return await time_blocks.create(db,ctx.studio_id,staff_ids=payload.staff_ids,start=payload.start_time,
        duration_min=payload.duration_min,label=payload.label,notes=payload.notes,photos=payload.photos)


@router.patch("/staff-blocks/{block_id}",response_model=StudioTimeRead)
async def update_studio_time(block_id:int,payload:StudioTimeUpdate,ctx:StudioContext=Depends(require_role("owner")),db:AsyncSession=Depends(get_db)):
    return await time_blocks.update(db,ctx.studio_id,block_id,staff_ids=payload.staff_ids,start=payload.start_time,
        duration_min=payload.duration_min,label=payload.label,notes=payload.notes,photos=payload.photos)


@router.delete("/staff-blocks/{block_id}",response_model=StudioTimeRead)
async def delete_studio_time(block_id:int,ctx:StudioContext=Depends(require_role("owner")),db:AsyncSession=Depends(get_db)):
    return await time_blocks.delete(db,ctx.studio_id,block_id)

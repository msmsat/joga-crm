"""Atomic employee-hours updates with protection of every live lesson."""
from datetime import datetime, time, timedelta
from fastapi import HTTPException
from sqlalchemy import select, text
from models import Lesson, StaffWorkingHours, StaffDayOverride, StaffBusyInterval
from services import booking_time, lesson_time, resource_hours, studio_time


async def load_hours(db, staff_id, studio_id):
    hours=list((await db.execute(select(StaffWorkingHours).where(StaffWorkingHours.user_id==staff_id,StaffWorkingHours.studio_id==studio_id))).scalars().all())
    overrides=list((await db.execute(select(StaffDayOverride).where(StaffDayOverride.user_id==staff_id,StaffDayOverride.studio_id==studio_id))).scalars().all())
    busy=list((await db.execute(select(StaffBusyInterval).where(StaffBusyInterval.user_id==staff_id,StaffBusyInterval.studio_id==studio_id))).scalars().all())
    return hours,overrides,busy


async def assert_future_fits(db, studio, staff_id, *, changed_dates=None, changed_weekdays=None):
    """Reject losing occupied time, regardless of strict mode or client count."""
    hours,overrides,busy=await load_hours(db,staff_id,studio.id)
    now=lesson_time.local_now(studio)
    protect_from=datetime.combine(now.date(),time.min)
    lessons=list((await db.execute(select(Lesson).where(Lesson.studio_id==studio.id,Lesson.teacher_id==staff_id,
        Lesson.status!="cancelled",Lesson.start_time + (Lesson.duration_min + Lesson.buffer_after_min) * text("interval '1 minute'") >= protect_from-timedelta(days=2)))).scalars().all())
    cache={}
    for lesson in lessons:
        start=lesson.start_time-timedelta(minutes=lesson.buffer_before_min or 0)
        end=lesson.start_time+timedelta(minutes=lesson.duration_min+(lesson.buffer_after_min or 0))
        resolved=booking_time.resolve_interval(start,end,lesson.tz_iana)
        if resolved and studio_time.clock(studio).verified:
            start,end=(studio_time.to_local(t,studio).replace(tzinfo=None) for t in resolved)
        if end<=protect_from:
            continue
        cursor=start.date()
        while cursor<=end.date():
            affected=(changed_dates is None and changed_weekdays is None) or cursor in (changed_dates or set()) or cursor.weekday() in (changed_weekdays or set()) or (cursor-timedelta(days=1)).weekday() in (changed_weekdays or set())
            clip_start=max(start,datetime.combine(cursor,time.min))
            clip_end=min(end,datetime.combine(cursor+timedelta(days=1),time.min))
            if affected and clip_start<clip_end:
                if cursor not in cache:
                    free,reason=resource_hours.staff_intervals(hours,overrides,cursor)
                    # Unconfigured old event hours do not suddenly close the day.
                    if reason==resource_hours.CONFIG_INCOMPLETE:
                        free=[(datetime.combine(cursor,time.min),datetime.combine(cursor+timedelta(days=1),time.min))]
                    cuts=[]
                    for b in busy:
                        window=booking_time.resolve_interval(b.start_time,b.end_time,b.tz_iana)
                        if window and studio_time.clock(studio).verified:
                            cuts.append(tuple(studio_time.to_local(t,studio).replace(tzinfo=None) for t in window))
                        else:
                            cuts.append((b.start_time,b.end_time))
                    cache[cursor]=resource_hours._subtract(free,cuts)
                if not any(s<=clip_start and clip_end<=e for s,e in booking_time.merge_intervals(cache[cursor])):
                    raise HTTPException(409,detail={"code":"STAFF_SCHEDULE_CONFLICT",
                        "message":f"Нельзя сделать это время нерабочим: уже есть занятие «{lesson.name}» {lesson.start_time:%d.%m.%Y %H:%M} (#{lesson.id})",
                        "params":{"lesson_id":lesson.id,"lesson_name":lesson.name,"start_time":lesson.start_time.isoformat()}})
            cursor+=timedelta(days=1)

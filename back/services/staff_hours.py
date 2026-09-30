"""Staff split shifts: one calculation for the editor, Journal and booking gates."""
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace


def as_hours(row):
    return SimpleNamespace(**row) if isinstance(row, dict) else row


def minutes(value):
    h, m = map(int, value.split(":"))
    return h * 60 + m


def shift_bounds(row, day):
    row = as_hours(row)
    start = datetime.combine(day, time.fromisoformat(row.open_time))
    end = datetime.combine(day, time.fromisoformat(row.close_time))
    if end <= start:
        end += timedelta(days=1)
    return start, end


def break_bounds(row, day):
    row = as_hours(row)
    start, end = shift_bounds(row, day)
    result = []
    for item in getattr(row, "breaks", None) or []:
        b = as_hours(item)
        bs = datetime.combine(day, time.fromisoformat(b.open_time))
        if bs < start:
            bs += timedelta(days=1)
        be = datetime.combine(bs.date(), time.fromisoformat(b.close_time))
        if be <= bs:
            be += timedelta(days=1)
        result.append((bs, be, getattr(b, "label", None)))
    return sorted(result, key=lambda b: b[0])


def shift_intervals(row, day):
    row = as_hours(row)
    if not row.is_open:
        return []
    start, end = shift_bounds(row, day)
    pieces, cursor = [], start
    for bs, be, _ in break_bounds(row, day):
        if cursor < bs:
            pieces.append((cursor, min(bs, end)))
        cursor = max(cursor, be)
    if cursor < end:
        pieces.append((cursor, end))
    return pieces


def schedule_contains(row, start, end):
    return any(s <= start and end <= e
               for day in (start.date()-timedelta(days=1), start.date())
               for s, e in shift_intervals(row, day))


def effective_hours(hours_rows, overrides, day):
    row = next((h for h in hours_rows if h.day_of_week == day.weekday()), None)
    override = next((o for o in overrides if o.day == day), None)
    if override is not None:
        if getattr(override, "hours", None):
            row = as_hours(override.hours)
        if row is not None:
            row = SimpleNamespace(is_open=override.is_working, open_time=row.open_time,
                close_time=row.close_time, breaks=getattr(row,"breaks",None) or [],
                off_label=getattr(row,"off_label",None))
        elif not override.is_working:
            row = SimpleNamespace(is_open=False,open_time="09:00",close_time="18:00",breaks=[],off_label=None)
    return row


def blocked_day(row, day):
    """Negative intervals with titles; dates are naive studio wall-clock dates."""
    if row is None:
        return []
    row = as_hours(row)
    lo, hi = datetime.combine(day,time.min), datetime.combine(day+timedelta(days=1),time.min)
    def block(start,end,kind,label=None):
        return {"start_time":start,"end_time":end,"kind":kind,"label":label}
    if not row.is_open:
        return [block(lo,hi,"day_off",getattr(row,"off_label",None))]
    start,end = shift_bounds(row,day)
    result=[]
    if start>lo:
        result.append(block(lo,min(start,hi),"off_hours"))
    if end<hi:
        result.append(block(max(end,lo),hi,"off_hours"))
    for bs,be,label in break_bounds(row,day):
        s,e=max(bs,lo),min(be,hi)
        if s<e:
            result.append(block(s,e,"break",label))
    return sorted(result,key=lambda b:b["start_time"])


def unavailable_blocks(hours_rows, overrides, busy_rows, day):
    from services.resource_hours import staff_intervals
    free, reason = staff_intervals(hours_rows, overrides, day)
    row = effective_hours(hours_rows, overrides, day)
    if row is None and not busy_rows:
        return []
    if row is None:
        free = [(datetime.combine(day,time.min),datetime.combine(day+timedelta(days=1),time.min))]
    lo,hi=datetime.combine(day,time.min),datetime.combine(day+timedelta(days=1),time.min)
    if row is not None and not free and not row.is_open:
        return [{"start_time":lo,"end_time":hi,"kind":"day_off","label":getattr(row,"off_label",None)}]
    labels=[]
    for anchor in (day-timedelta(days=1),day):
        source=effective_hours(hours_rows,overrides,anchor)
        if source is not None and source.is_open:
            labels.extend((s,e,"break",label) for s,e,label in break_bounds(source,anchor))
    labels.extend((b.start_time,b.end_time,"busy",b.reason) for b in busy_rows)
    cuts={lo,hi}
    for s,e in free:
        cuts.update((max(lo,s),min(hi,e)))
    for s,e,_,_ in labels:
        if s<hi and lo<e:
            cuts.update((max(lo,s),min(hi,e)))
    result=[]
    bounds=sorted(cuts)
    for start,end in zip(bounds,bounds[1:]):
        mid=start+(end-start)/2
        explicit=next((b for b in reversed(labels) if b[0]<=mid<b[1]),None)
        if explicit is None and any(s<=mid<e for s,e in free):
            continue
        kind,label=(explicit[2],explicit[3]) if explicit else ("off_hours",None)
        if result and result[-1]["end_time"]==start and result[-1]["kind"]==kind and result[-1]["label"]==label:
            result[-1]["end_time"]=end
        else:
            result.append({"start_time":start,"end_time":end,"kind":kind,"label":label})
    return result

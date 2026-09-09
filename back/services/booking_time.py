"""Точные интервалы расписания: wall time + IANA-снимок, без догадок о зоне."""
from datetime import datetime, timedelta
from types import SimpleNamespace

from services import studio_time


def resolve_interval(start: datetime, end: datetime, tz_iana: str | None):
    if studio_time.parse(tz_iana) is None or start.tzinfo or end.tzinfo:
        return None
    zone = SimpleNamespace(tz_iana=tz_iana, timezone=None)
    try:
        a, b = studio_time.to_utc(start, zone), studio_time.to_utc(end, zone)
    except (ValueError, studio_time.AmbiguousLocalTime, studio_time.NonexistentLocalTime):
        return None
    return (a, b) if a < b else None


def possibly_overlaps(start, end, window_start, window_end):
    # Даже крайние IANA-offset не могут сдвинуть дату на двое суток.
    # Используется только для консервативного отбора неопределенного наследия.
    margin = timedelta(days=2)
    return start - margin < window_end and window_start < end + margin


def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged

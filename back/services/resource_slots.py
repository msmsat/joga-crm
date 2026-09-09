"""Pure Resource slot generation over an already-loaded studio snapshot (HB-08)."""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from services import booking_time, resource_hours, studio_time
from services.booking_rules import BookingRules, within_widget_hours


@dataclass
class AvailabilityData:
    studio: object
    service: object
    rules: BookingRules
    teacher_ids: list[int]
    studio_hours: list = field(default_factory=list)
    branch_hours: list = field(default_factory=list)
    staff_hours: list = field(default_factory=list)
    overrides: list = field(default_factory=list)
    lessons: list = field(default_factory=list)
    busy: list = field(default_factory=list)
    hall_id: int | None = None


@dataclass(frozen=True)
class Slot:
    starts_at: datetime
    local_start: datetime
    tz_iana: str
    teacher_ids: list[int]


@dataclass(frozen=True)
class Availability:
    slots: list[Slot]
    reason: str | None = None


def _days(first, last):
    while first <= last:
        yield first
        first += timedelta(days=1)


def _windows(data, teacher_id, first, last):
    intervals, incomplete = [], False
    hours = [r for r in data.staff_hours if r.user_id == teacher_id]
    overrides = [r for r in data.overrides if r.user_id == teacher_id]
    # A slot may need its before-buffer yesterday and its end tomorrow.
    for day in _days(first - timedelta(days=1), last + timedelta(days=1)):
        studio, known_studio = resource_hours.weekly_intervals(data.studio_hours, day)
        branch, known_branch = resource_hours.weekly_intervals(data.branch_hours, day)
        staff, reason = resource_hours.staff_intervals(hours, overrides, day)
        if not known_studio or not known_branch or reason == resource_hours.CONFIG_INCOMPLETE:
            if first <= day <= last:
                incomplete = True
            continue
        if reason is None:
            intervals.extend(resource_hours._intersect_all([studio, branch, staff]))
    return booking_time.merge_intervals(intervals), incomplete


def _occupied(data, teacher_id):
    intervals, unknown = [], []
    for row in data.lessons:
        if row.teacher_id != teacher_id and (data.hall_id is None or row.hall_id != data.hall_id):
            continue
        start = row.start_time - timedelta(minutes=row.buffer_before_min)
        end = row.start_time + timedelta(minutes=row.duration_min + row.buffer_after_min)
        resolved = booking_time.resolve_interval(start, end, row.tz_iana)
        (intervals if resolved else unknown).append(resolved or (start, end))
    for row in data.busy:
        if row.user_id != teacher_id:
            continue
        resolved = booking_time.resolve_interval(row.start_time, row.end_time, row.tz_iana)
        (intervals if resolved else unknown).append(resolved or (row.start_time, row.end_time))
    return booking_time.merge_intervals(intervals), unknown


def generate(data: AvailabilityData, *, date_from: date, date_to: date,
             now: datetime, client: bool = True) -> Availability:
    """No database/network access. UTC is naive internally and aware in the response."""
    if now.tzinfo is None:
        raise ValueError("now must identify an aware instant")
    if not 1 <= (date_to - date_from).days + 1 <= 31:
        raise ValueError("availability range must contain 1..31 local days")
    studio, service, rules = data.studio, data.service, data.rules
    if not studio_time.clock(studio).verified:
        return Availability([], "config_incomplete")
    step = studio.journal_time_step
    before, after, duration = service.buffer_before_min, service.buffer_after_min, service.duration_min
    if not step or not 1 <= step <= 60 or not 1 <= duration <= 1440 or before + duration + after > 1440:
        return Availability([], "config_incomplete")
    if client and not rules.booking_active:
        return Availability([], "booking_closed")
    if not data.teacher_ids:
        return Availability([], "no_eligible_staff")
    instant_now = now.astimezone(timezone.utc).replace(tzinfo=None)
    local_now = studio_time.to_local(now, studio).replace(tzinfo=None)
    horizon = local_now + timedelta(days=rules.booking_window_days)
    starts = defaultdict(list)
    incomplete = False
    for teacher_id in sorted(data.teacher_ids):
        windows, missing = _windows(data, teacher_id, date_from, date_to)
        incomplete |= missing
        occupied, unknown = _occupied(data, teacher_id)
        for day in _days(date_from, date_to):
            midnight = datetime.combine(day, time.min)
            for minute in range(0, 1440, step):
                local = midnight + timedelta(minutes=minute)
                if local > horizon or (client and not within_widget_hours(rules, local)):
                    continue
                start = local - timedelta(minutes=before)
                end = local + timedelta(minutes=duration + after)
                if not any(a <= start and end <= b for a, b in windows):
                    continue
                full = booking_time.resolve_interval(start, end, studio.tz_iana)
                if full is None or full[1] - full[0] != end - start:
                    continue  # Missing/repeated time or an offset change inside the interval.
                try:
                    actual_start = studio_time.to_utc(local, studio)
                except ValueError:
                    continue
                threshold = instant_now + timedelta(minutes=rules.min_booking_advance_min if client else 0)
                if actual_start < threshold:
                    continue
                if any(booking_time.possibly_overlaps(a, b, *full) for a, b in unknown):
                    incomplete = True
                    continue
                if any(a < full[1] and full[0] < b for a, b in occupied):
                    continue
                starts[(actual_start, local)].append(teacher_id)
    slots = [Slot(utc.replace(tzinfo=timezone.utc), local, studio.tz_iana, teachers)
             for (utc, local), teachers in sorted(starts.items())]
    return Availability(slots, "config_incomplete" if incomplete and not slots else None)

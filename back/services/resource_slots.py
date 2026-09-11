"""Pure Resource slot generation over an already-loaded studio snapshot (HB-08)."""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from services import booking_time, resource_hours, studio_time
from services.booking_rules import BookingRules, within_widget_hours

# Потолок административной выдачи слотов. Не бизнес-правило студии, а предел
# здравого смысла: расписание на два года вперёд никто не ведёт, а без всякой
# границы запрос «покажи свободное время» на далёкую дату считался бы всерьёз.
MAX_STAFF_HORIZON_DAYS = 400


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


@dataclass(frozen=True)
class StaffDayEntry:
    """Один мастер на один день: работает ли ВООБЩЕ и что из этого свободно.

    Два вопроса раздельно потому, что ответы расходятся: смена, занятая целиком,
    даёт `works=True, free=[]`, а выходной — `works=False, free=[]`. В `Slot`
    этой разницы нет и быть не может: он описывает свободное время, а не смену.
    """
    teacher_id: int
    works: bool
    reason: str | None
    free: list[datetime]


@dataclass(frozen=True)
class StaffDay:
    staff: list[StaffDayEntry]
    reason: str | None = None


@dataclass(frozen=True)
class _Grid:
    """Параметры сетки, общие для всех мастеров запроса: считаются один раз."""
    studio: object
    rules: BookingRules
    date_from: date
    date_to: date
    step: int
    before: int
    duration: int
    after: int
    horizon: datetime
    threshold: datetime
    client: bool


@dataclass(frozen=True)
class _TeacherDay:
    starts: list[tuple[datetime, datetime]]
    windows: list[tuple[datetime, datetime]]
    incomplete: bool


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


def _prepare(data: AvailabilityData, *, date_from: date, date_to: date,
             now: datetime, client: bool) -> tuple[_Grid | None, str | None]:
    """Проверки и общая сетка. `(None, причина)` — отказ ещё до расчёта.

    Общая для `generate` и `by_staff` намеренно: два разных ответа об одном и том
    же дне обязаны отказывать по одним правилам, иначе список мастеров покажет
    смену там, где сетка времени уже отказала (и наоборот).
    """
    if now.tzinfo is None:
        raise ValueError("now must identify an aware instant")
    if not 1 <= (date_to - date_from).days + 1 <= 31:
        raise ValueError("availability range must contain 1..31 local days")
    studio, service, rules = data.studio, data.service, data.rules
    if not studio_time.clock(studio).verified:
        return None, "config_incomplete"
    step = studio.journal_time_step
    before, after, duration = service.buffer_before_min, service.buffer_after_min, service.duration_min
    if not step or not 1 <= step <= 60 or not 1 <= duration <= 1440 or before + duration + after > 1440:
        return None, "config_incomplete"
    if client and not rules.booking_active:
        return None, "booking_closed"
    if not data.teacher_ids:
        return None, "no_eligible_staff"
    instant_now = now.astimezone(timezone.utc).replace(tzinfo=None)
    local_now = studio_time.to_local(now, studio).replace(tzinfo=None)
    # Горизонт, минимальный advance и часы виджета — правила САМОСТОЯТЕЛЬНОЙ
    # записи клиента (§6.2 п.7), и к стойке они не относятся: у студии
    # единственный запрет — занятие уже прошло (booking_rules.
    # assert_staff_bookable). Пока горизонт применялся ко всем, администратор
    # не мог записать клиента дальше `booking_window_days` (по умолчанию 7):
    # availability просто отдавал пустой список без объяснения.
    horizon = (local_now + timedelta(days=rules.booking_window_days)
               if client else local_now + timedelta(days=MAX_STAFF_HORIZON_DAYS))
    threshold = instant_now + timedelta(minutes=rules.min_booking_advance_min if client else 0)
    return _Grid(studio=studio, rules=rules, date_from=date_from, date_to=date_to, step=step,
                 before=before, duration=duration, after=after, horizon=horizon,
                 threshold=threshold, client=client), None


def _teacher_starts(data: AvailabilityData, teacher_id: int, grid: _Grid) -> _TeacherDay:
    """Свободные начала одного мастера плюс его рабочие окна.

    Окна возвращаются наружу, потому что по ним отличают «занят целиком» от
    «не работает»: пустой список начал сам по себе не говорит, что именно
    произошло.
    """
    windows, incomplete = _windows(data, teacher_id, grid.date_from, grid.date_to)
    occupied, unknown = _occupied(data, teacher_id)
    starts = []
    for day in _days(grid.date_from, grid.date_to):
        midnight = datetime.combine(day, time.min)
        for minute in range(0, 1440, grid.step):
            local = midnight + timedelta(minutes=minute)
            if local > grid.horizon or (grid.client and not within_widget_hours(grid.rules, local)):
                continue
            start = local - timedelta(minutes=grid.before)
            end = local + timedelta(minutes=grid.duration + grid.after)
            if not any(a <= start and end <= b for a, b in windows):
                continue
            full = booking_time.resolve_interval(start, end, grid.studio.tz_iana)
            if full is None or full[1] - full[0] != end - start:
                continue  # Missing/repeated time or an offset change inside the interval.
            try:
                actual_start = studio_time.to_utc(local, grid.studio)
            except ValueError:
                continue
            if actual_start < grid.threshold:
                continue
            if any(booking_time.possibly_overlaps(a, b, *full) for a, b in unknown):
                incomplete = True
                continue
            if any(a < full[1] and full[0] < b for a, b in occupied):
                continue
            starts.append((actual_start, local))
    return _TeacherDay(starts, windows, incomplete)


def generate(data: AvailabilityData, *, date_from: date, date_to: date,
             now: datetime, client: bool = True) -> Availability:
    """No database/network access. UTC is naive internally and aware in the response."""
    grid, refused = _prepare(data, date_from=date_from, date_to=date_to, now=now, client=client)
    if grid is None:
        return Availability([], refused)
    starts = defaultdict(list)
    incomplete = False
    for teacher_id in sorted(data.teacher_ids):
        found = _teacher_starts(data, teacher_id, grid)
        incomplete |= found.incomplete
        for key in found.starts:
            starts[key].append(teacher_id)
    slots = [Slot(utc.replace(tzinfo=timezone.utc), local, data.studio.tz_iana, teachers)
             for (utc, local), teachers in sorted(starts.items())]
    return Availability(slots, "config_incomplete" if incomplete and not slots else None)


def by_staff(data: AvailabilityData, *, day: date, now: datetime, client: bool = True) -> StaffDay:
    """Тот же день, но в разрезе мастеров: кто на смене и что у него свободно.

    Отличие от `generate` — не в расчёте, а в том, что ответ НЕ склеивается:
    мастера остаются различимы, и работающий-но-занятый не пропадает из списка.
    """
    grid, refused = _prepare(data, date_from=day, date_to=day, now=now, client=client)
    if grid is None:
        return StaffDay([], refused)
    day_start = datetime.combine(day, time.min)
    day_end = day_start + timedelta(days=1)
    entries, incomplete = [], False
    for teacher_id in sorted(data.teacher_ids):
        found = _teacher_starts(data, teacher_id, grid)
        incomplete |= found.incomplete
        # Причина берётся у самого дня: `_windows` считает ещё соседние сутки
        # ради ночного хвоста и буферов, и их состояние к вопросу не относится.
        _, reason = resource_hours.staff_intervals(
            [r for r in data.staff_hours if r.user_id == teacher_id],
            [r for r in data.overrides if r.user_id == teacher_id], day)
        entries.append(StaffDayEntry(
            teacher_id=teacher_id,
            works=any(a < day_end and day_start < b for a, b in found.windows),
            reason=reason,
            free=[local for _, local in found.starts],
        ))
    return StaffDay(entries, "config_incomplete" if incomplete and not any(e.free for e in entries) else None)

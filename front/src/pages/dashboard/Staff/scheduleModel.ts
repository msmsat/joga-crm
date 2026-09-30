import type { StaffWorkingHoursItem } from '../../../api/staff/staff.types';
export const minuteOf = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export const timeOf = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function shiftParts(day: StaffWorkingHoursItem): [number, number][] {
  if (!day.is_open) return [];
  const start = minuteOf(day.open_time);
  const close = minuteOf(day.close_time);
  const end = close <= start ? close + 1440 : close;
  const pauses = (day.breaks ?? []).map(b => {
    let a = minuteOf(b.open_time), z = minuteOf(b.close_time);
    if (a < start) a += 1440;
    z += Math.floor(a / 1440) * 1440;
    if (z <= a) z += 1440;
    return [a, z] as [number, number];
  }).sort((a, b) => a[0] - b[0]);
  const parts: [number, number][] = [];
  let cursor = start;
  for (const [a, z] of pauses) { if (a > cursor) parts.push([cursor, a]); cursor = z; }
  if (cursor < end) parts.push([cursor, end]);
  return parts;
}
export function validShift(day: StaffWorkingHoursItem): boolean {
  if (!day.is_open) return true;
  const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  if (!validTime(day.open_time) || !validTime(day.close_time)) return false;
  const start = minuteOf(day.open_time);
  let end = minuteOf(day.close_time); if (end <= start) end += 1440;
  const breaks: [number, number][] = [];
  for (const b of day.breaks ?? []) {
    if (!validTime(b.open_time) || !validTime(b.close_time)) return false;
    let a = minuteOf(b.open_time), z = minuteOf(b.close_time);
    if (a < start) a += 1440;
    z += Math.floor(a / 1440) * 1440;
    if (z <= a) z += 1440;
    if (a < start || z > end || a >= z) return false;
    breaks.push([a, z]);
  }
  breaks.sort((a, b) => a[0] - b[0]);
  return !breaks.some((b, i) => i > 0 && b[0] < breaks[i - 1][1])
    && breaks.reduce((sum, [a, z]) => sum + z - a, 0) < end - start;
}

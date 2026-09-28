import type { ServiceRead } from '../../../../../../api/studio/services.api';
import type { ServiceDayRead } from '../../../../../../api/booking/hybrid.types';
import type { Lesson } from '../../../../../../api/schedule/schedule.types';
import { eventFreeTimes, toHHMM, toMin } from './freeTimes';

type Window = { teacherId: number; branchId?: number; minutes: Set<number> };
type Entry = { ready: boolean; windows: Window[] };
export type AvailabilityState = { kind: 'free' | 'busy' | 'unknown'; branchId?: number };
export function buildAvailability(o: {
  services: ServiceRead[]; trainers: { id: number }[]; rows: ServiceDayRead[];
  lessons: Lesson[]; lessonsReady: boolean; resourceReady: boolean; notBefore: number | null;
  /** Время стоящего группового занятия с местами — свободно: в него запишут
      клиента. Без клиента (групповое из журнала) это занятое время. */
  joinable?: boolean;
}) {
  const matrix = new Map<number, Entry>();
  for (const service of o.services) {
    const windows: Window[] = [];
    const resource = service.booking_mode === 'resource';
    if (resource) {
      for (const row of o.rows.filter(row => row.service_id === service.id)) {
        for (const [id, minutes] of Object.entries(row.free_by_teacher)) {
          windows.push({ teacherId: Number(id), branchId: row.branch_id,
            minutes: new Set(minutes.filter(m => o.notBefore == null || m >= o.notBefore)) });
        }
      }
    } else if (o.lessonsReady) {
      const teachers = service.masters.length ? service.masters.map(m => m.user_id) : o.trainers.map(t => t.id);
      for (const teacherId of teachers) {
        const free = eventFreeTimes({ lessons: o.lessons, teacherId, services: o.services,
          duration: service.masters.find(m => m.user_id === teacherId)?.duration_min ?? service.duration_min,
          bufferBefore: service.buffer_before_min, bufferAfter: service.buffer_after_min, notBefore: o.notBefore });
        const minutes = new Set<number>();
        for (let m = 0; m < 1440; m++) if (free.isFree(toHHMM(m))) minutes.add(m);
        if (o.joinable !== false) for (const lesson of o.lessons) {
          const m = toMin(lesson.start_time.slice(11, 16));
          if (lesson.service_id === service.id && lesson.teacher_id === teacherId && lesson.status !== 'cancelled'
            && lesson.booked_count < lesson.total_spots && (o.notBefore == null || m >= o.notBefore)) minutes.add(m);
        }
        windows.push({ teacherId, minutes });
      }
    }
    matrix.set(service.id, { ready: resource ? o.resourceReady : o.lessonsReady, windows });
  }
  return matrix;
}

export function selectAvailability(matrix: Map<number, Entry>, o: {
  serviceId: number | null; teacherId: number | null; time: string; step: number;
}) {
  const minute = /^([01]\d|2[0-3]):[0-5]\d$/.test(o.time) ? toMin(o.time) : null;
  const matches = (w: Window) => minute == null ? w.minutes.size > 0 : w.minutes.has(minute);
  const own = (w: Window) => o.teacherId == null || w.teacherId === o.teacherId;
  const selected = [...matrix].filter(([id]) => o.serviceId == null || id === o.serviceId).map(([, e]) => e);
  const serviceStates = new Map<number, AvailabilityState>();
  for (const [id, entry] of matrix) {
    const free = entry.windows.find(w => own(w) && matches(w));
    serviceStates.set(id, !entry.ready ? { kind: 'unknown' } : free
      ? { kind: 'free', branchId: free.branchId } : { kind: 'busy' });
  }
  const masterStates = new Map<number | null, AvailabilityState>();
  const windows = selected.flatMap(e => e.windows);
  const loading = selected.some(e => !e.ready);
  for (const id of [null, ...new Set(windows.map(w => w.teacherId))]) {
    masterStates.set(id, loading ? { kind: 'unknown' }
      : { kind: windows.some(w => (id == null || w.teacherId === id) && matches(w)) ? 'free' : 'busy' });
  }
  const minutes = new Set(windows.filter(own).flatMap(w => [...w.minutes]));
  // Выбранное время остаётся в сетке, даже если оно мимо шага (ячейка журнала
  // по 5 минут, сетка по 15): иначе выбор есть, а подсвеченной плитки нет.
  const times = loading ? [] : [...minutes].filter(m => m % o.step === 0 || m === minute)
    .sort((a, b) => a - b).map(toHHMM);
  const conflict = minute != null && !loading && !minutes.has(minute);
  const branchFor = (serviceId: number, teacherId: number | null, time: string) => {
    const available = matrix.get(serviceId)?.windows.filter(w => teacherId == null || w.teacherId === teacherId) ?? [];
    return (available.find(w => w.minutes.has(toMin(time))) ?? available.find(w => w.minutes.size > 0))?.branchId;
  };
  return { serviceStates, masterStates, times, loading, conflict, branchFor };
}

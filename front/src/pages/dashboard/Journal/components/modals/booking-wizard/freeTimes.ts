import type { Lesson } from '../../../../../../api/schedule/schedule.types';
import type { ServiceRead } from '../../../../../../api/studio/services.api';

/** Рабочие часы сетки журнала: занятие ставится между 07:00 и 22:00. */
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;
const STEP = 5;

export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

type Input = {
  /** Занятия выбранного дня (все — отфильтруем по мастеру здесь). */
  lessons: Lesson[];
  teacherId: number;
  services: ServiceRead[];
  /** Новое занятие: длительность у этого мастера и буферы услуги, минуты. */
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  /** Сегодня — прошедшее время не предлагается. */
  notBefore: number | null;
};

/**
 * Свободные начала нового группового занятия у мастера.
 *
 * Занятое — каждое его занятие дня вместе с буферами СВОЕЙ услуги: закончилось
 * в 12:15, уборка 5 минут — мастер свободен с 12:20. Новое занятие тоже несёт
 * свои буферы, и они не должны залезать на чужие.
 *
 * Кандидаты — сетка по 5 минут плюс первая минута каждого окна (12:20, даже
 * если это не кратно пяти): ближе к концу прошлого занятия поставить нельзя,
 * а ровно на его границу — можно.
 */
export function eventFreeTimes(o: Input) {
  const busy = o.lessons
    .filter(l => l.teacher_id === o.teacherId && l.status !== 'cancelled')
    .map(l => {
      const svc = o.services.find(s => s.id === l.service_id);
      const start = toMin(l.start_time.slice(11, 16));
      return [start - (svc?.buffer_before_min ?? 0), start + l.duration_min + (svc?.buffer_after_min ?? 0)] as const;
    });

  const isFreeMin = (s: number) => {
    if (s < DAY_START || s + o.duration > DAY_END) return false;
    if (o.notBefore != null && s < o.notBefore) return false;
    const from = s - o.bufferBefore;
    const to = s + o.duration + o.bufferAfter;
    return busy.every(([bs, be]) => to <= bs || from >= be);
  };

  const candidates = new Set<number>();
  for (let s = DAY_START; s <= DAY_END; s += STEP) candidates.add(s);
  for (const [, be] of busy) candidates.add(be + o.bufferBefore);
  if (o.notBefore != null) candidates.add(Math.ceil(o.notBefore / STEP) * STEP);

  const times = [...candidates].filter(isFreeMin).sort((a, b) => a - b).map(toHHMM);
  return { times, isFree: (hhmm: string) => /^\d\d:\d\d$/.test(hhmm) && isFreeMin(toMin(hhmm)) };
}

// Чистая модель окна «Изменить занятие»: без React и без сети, чтобы правила
// проверялись отдельно (scripts/check-lesson-editor.mjs). Время — индексы
// сетки журнала: 0 = 07:00, одна единица — час (Journal/utils.ts).
import type { Booking } from '../../../types';
import { MAX_TIME_INDEX, MIN_TIME_INDEX, toDateStr } from '../../../utils';

/** Сервер не двигает занятие ближе двух часов к началу — ни прежнее время,
 *  ни новое (back/routers/schedule/lessons.py, MIN_CHANGE_LEAD). Окно говорит
 *  это заранее, а не ответом на «Сохранить». */
export const CHANGE_LEAD_MIN = 120;
/** Шаг кнопок длительности: 55 → 60 → 65, как обычно и считают занятия. */
export const DURATION_STEP_MIN = 5;
export const MIN_DURATION_MIN = 5;

export interface LessonDraft {
  serviceId: number | null;
  title: string;
  hall: string;
  /** Строка: поле мест набирают руками, и «» между цифрами — законное состояние. */
  maxClients: string;
  timeStart: number;
  timeEnd: number;
  date: string;
  trainer: number;
}

export type DraftField = 'service' | 'date' | 'time' | 'trainer' | 'hall' | 'capacity';

const EPS = 1e-6;
const toMin = (idx: number) => Math.round(idx * 60);

/** Начало занятия как момент времени: дата + индекс сетки, местное время. */
export const startOf = (date: string, idx: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setMinutes(Math.round((idx + 7) * 60));
  return d;
};

/** Неделя для ленты дней: с понедельника, как сетка журнала. */
export function weekOf(date: string): string[] {
  const d = new Date(`${date}T00:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return toDateStr(day);
  });
}

export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** Начало в пределах дня, чтобы занятие длительностью `duration` целиком
 *  уместилось до 23:00. */
const clampStart = (start: number, duration: number) =>
  Math.min(Math.max(start, MIN_TIME_INDEX), MAX_TIME_INDEX - duration);

/** Сдвиг на шаг сетки (`delta` — ± шаг в индексах). Длительность сохраняется:
 *  прежняя форма двигала только начало, и перенос на час раньше растягивал
 *  занятие на час. Сдвиг встаёт на ближайшую отметку шага: 08:05 → 08:15. */
export function moveStart(timeStart: number, timeEnd: number, delta: number) {
  const duration = timeEnd - timeStart;
  const step = Math.abs(delta);
  const next = delta > 0
    ? (Math.floor(timeStart / step + EPS) + 1) * step
    : (Math.ceil(timeStart / step - EPS) - 1) * step;
  const start = clampStart(next, duration);
  return { timeStart: start, timeEnd: start + duration };
}

/** Начало выбрали из списка или набрали — занятие переезжает целиком. */
export function placeStart(timeStart: number, timeEnd: number, idx: number) {
  const duration = timeEnd - timeStart;
  const start = clampStart(idx, duration);
  return { timeStart: start, timeEnd: start + duration };
}

/** Новый конец при изменении длительности на `deltaMin` минут: кратно шагу,
 *  не короче минимума и не позже 23:00. */
export function resize(timeStart: number, timeEnd: number, deltaMin: number): number {
  const minutes = toMin(timeEnd - timeStart);
  const step = Math.abs(deltaMin);
  const next = deltaMin > 0
    ? (Math.floor(minutes / step) + 1) * step
    : (Math.ceil(minutes / step) - 1) * step;
  const bounded = Math.max(MIN_DURATION_MIN, next);
  return Math.min(timeStart + bounded / 60, MAX_TIME_INDEX);
}

export const minutesUntil = (date: string, idx: number, now = new Date()) =>
  (startOf(date, idx).getTime() - now.getTime()) / 60000;

/** Занятие уже не меняют: до начала меньше двух часов или оно прошло. */
export const isLocked = (date: string, idx: number, now = new Date()) =>
  minutesUntil(date, idx, now) < CHANGE_LEAD_MIN;

/** Самое раннее начало, которое примет сервер в этот день: индекс сетки;
 *  `null` — день доступен целиком; `Infinity` — в этот день уже не успеть. */
export function earliestStart(date: string, now = new Date()): number | null {
  const threshold = now.getTime() + CHANGE_LEAD_MIN * 60000;
  const dayStart = startOf(date, MIN_TIME_INDEX).getTime();
  if (dayStart >= threshold) return null;
  const idx = MIN_TIME_INDEX + (threshold - dayStart) / 3600000;
  return idx > MAX_TIME_INDEX ? Infinity : idx;
}

/** Что именно поменяли — по полю. Окно метит изменённые поля и по ним решает,
 *  уйдёт ли записанным уведомление. */
export function changesOf(original: Booking, draft: LessonDraft): DraftField[] {
  const changes: DraftField[] = [];
  if (draft.serviceId !== original.serviceId) changes.push('service');
  if (original.date && draft.date !== original.date) changes.push('date');
  if (toMin(draft.timeStart) !== toMin(original.timeStart) || toMin(draft.timeEnd) !== toMin(original.timeEnd)) {
    changes.push('time');
  }
  if (draft.trainer !== original.trainer) changes.push('trainer');
  if (draft.hall !== original.hall) changes.push('hall');
  if (Number(draft.maxClients) !== original.maxClients) changes.push('capacity');
  return changes;
}

/** Перенос дня, времени или зала сервер разошлёт записанным (уведомление c11,
 *  update_lesson) — окно предупреждает об этом до «Сохранить». */
export const notifiesClients = (changes: DraftField[]) =>
  changes.some(field => field === 'date' || field === 'time' || field === 'hall');

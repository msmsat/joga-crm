// Чистая модель окна «Изменить занятие»: без React и без сети, чтобы правила
// проверялись отдельно (scripts/check-lesson-editor.mjs). Время — индексы
// сетки журнала: 0 = 07:00, одна единица — час (Journal/utils.ts).
import type { Booking } from '../../../types';
import { MAX_TIME_INDEX, MIN_TIME_INDEX, toDateStr } from '../../../utils';

/** Зеркало back/services/lesson_edit_policy.py. Занятие перестают менять за
 *  срок отмены записи + 2 часа до начала, если на него кто-то записан (люди
 *  должны узнать об изменении, пока ещё могут бесплатно отменить запись), и за
 *  2 часа — если записанных нет. После окончания занятие снова можно править:
 *  это исправление записи, без уведомлений. Окно говорит всё это заранее, а не
 *  ответом на «Сохранить». */
export const EMPTY_LEAD_MIN = 120;
export const NOTICE_MARGIN_MIN = 120;
/** Умолчание правил записи (back/services/booking_rules.BookingRules), пока
 *  детали занятия не пришли с сервера. */
export const DEFAULT_CANCEL_DEADLINE_MIN = 240;
/** Шаг кнопок длительности: 55 → 60 → 65, как обычно и считают занятия. */
export const DURATION_STEP_MIN = 5;
export const MIN_DURATION_MIN = 5;
/** Пределы сервера: название — 150 символов, уровень и инвентарь — 50. */
export const MAX_NAME = 150;
export const MAX_SHORT_TEXT = 50;

/** open — меняется всё, записанным уйдёт уведомление; frozen — от последнего
 *  момента для правки до конца занятия, меняются только места; finished —
 *  занятие прошло, меняется всё, но молча, и время остаётся в прошлом. */
export type EditPhase = 'open' | 'frozen' | 'finished';

export interface LessonDraft {
  serviceId: number | null;
  /** Название занятия. Едет за услугой, пока его не переписали руками. */
  title: string;
  hall: string;
  /** Строка: поле мест набирают руками, и «» между цифрами — законное состояние. */
  maxClients: string;
  timeStart: number;
  timeEnd: number;
  date: string;
  trainer: number;
  /** Цена строкой — по той же причине, что и места. */
  price: string;
  /** Цену набрали руками: смена услуги или тренера её больше не пересчитывает. */
  priceEdited: boolean;
  level: string;
  equipment: string;
}

export const EMPTY_DRAFT: LessonDraft = {
  serviceId: null, title: '', hall: '', maxClients: '8', timeStart: 0, timeEnd: 0, date: '', trainer: 0,
  price: '0', priceEdited: false, level: '', equipment: '',
};

/** Черновик из карточки — с чего начинается правка. */
export const draftOf = (b: Booking): LessonDraft => ({
  serviceId: b.serviceId,
  title: b.title,
  hall: b.hall,
  maxClients: String(b.maxClients),
  timeStart: b.timeStart,
  timeEnd: b.timeEnd,
  date: b.date ?? '',
  trainer: b.trainer,
  price: String(b.price),
  priceEdited: false,
  level: b.level ?? '',
  equipment: b.equipment ?? '',
});

export type DraftField =
  | 'service' | 'name' | 'date' | 'time' | 'trainer' | 'hall' | 'capacity' | 'price' | 'level' | 'equipment';

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

/** За сколько минут до начала занятие перестают менять. */
export const editLeadMin = (booked: number, cancelDeadlineMin: number) =>
  booked > 0 ? Math.max(cancelDeadlineMin, 0) + NOTICE_MARGIN_MIN : EMPTY_LEAD_MIN;

/** Где занятие сейчас относительно правки (см. EditPhase). */
export function editPhase(
  date: string, timeStart: number, timeEnd: number, leadMin: number, now = new Date(),
): EditPhase {
  if (minutesUntil(date, timeEnd, now) <= 0) return 'finished';
  return minutesUntil(date, timeStart, now) < leadMin ? 'frozen' : 'open';
}

/** Самое раннее начало, которое примет сервер в этот день: индекс сетки;
 *  `null` — день доступен целиком; `Infinity` — в этот день уже не успеть. */
export function earliestStart(date: string, leadMin: number, now = new Date()): number | null {
  const threshold = now.getTime() + leadMin * 60000;
  const dayStart = startOf(date, MIN_TIME_INDEX).getTime();
  if (dayStart >= threshold) return null;
  const idx = MIN_TIME_INDEX + (threshold - dayStart) / 3600000;
  return idx > MAX_TIME_INDEX ? Infinity : idx;
}

/** Прошедшее занятие остаётся в прошлом: самый поздний конец в этот день —
 *  индекс «сейчас»; `null` — день прошёл целиком, ограничений нет;
 *  `-Infinity` — день ещё не начался, прошлого в нём нет. */
export function latestEnd(date: string, now = new Date()): number | null {
  const dayStart = startOf(date, MIN_TIME_INDEX).getTime();
  const idx = MIN_TIME_INDEX + (now.getTime() - dayStart) / 3600000;
  if (idx >= MAX_TIME_INDEX) return null;
  return idx - MIN_DURATION_MIN / 60 < MIN_TIME_INDEX ? -Infinity : idx;
}

/** Что именно поменяли — по полю. Окно метит изменённые поля и по ним решает,
 *  уйдёт ли записанным уведомление. */
export function changesOf(original: Booking, draft: LessonDraft): DraftField[] {
  const changes: DraftField[] = [];
  if (draft.serviceId !== original.serviceId) changes.push('service');
  if (draft.title.trim() !== original.title) changes.push('name');
  if (original.date && draft.date !== original.date) changes.push('date');
  if (toMin(draft.timeStart) !== toMin(original.timeStart) || toMin(draft.timeEnd) !== toMin(original.timeEnd)) {
    changes.push('time');
  }
  if (draft.trainer !== original.trainer) changes.push('trainer');
  if (draft.hall !== original.hall) changes.push('hall');
  if (Number(draft.maxClients) !== original.maxClients) changes.push('capacity');
  if (Number(draft.price) !== original.price) changes.push('price');
  if (draft.level.trim() !== (original.level ?? '')) changes.push('level');
  if (draft.equipment.trim() !== (original.equipment ?? '')) changes.push('equipment');
  return changes;
}

/** Места записанных не касаются — их правят в любой фазе (добавить коврик
 *  пришедшему за десять минут). Всё остальное клиент видит. */
export const QUIET_FIELDS: readonly DraftField[] = ['capacity'];

/** Что из поменянного увидят записанные: всё, кроме мест. Цена — тоже: у
 *  кого долг, тому сервер пересчитает сумму и скажет об этом. */
export const notifiesClients = (changes: DraftField[]) =>
  changes.some(field => !QUIET_FIELDS.includes(field));

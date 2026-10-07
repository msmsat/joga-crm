// «Время студии» — блок в журнале без занятия (уборка, подготовка, планёрка).
// Чистая модель окна StudioTimeModal: никакого React, чтобы проверять её
// скриптом (npm run check:studio-time). Правила сервера — back/services/time_blocks.py.
import type { StaffScheduleBlock, StudioTimePayload } from '../../../api/schedule';

/** Границы схемы сервера (schemas/schedule/time_blocks.py). */
export const MIN_DURATION = 5;
export const MAX_DURATION = 12 * 60;
export const MAX_LABEL = 80;
export const DURATION_STEP = 5;
/** Готовые длительности: то, что ставят чаще всего. Своё — кнопками ±5 мин. */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;
/** Готовые названия — ключи journal:studioTime.presets.*. */
export const LABEL_PRESETS = ['cleaning', 'prep', 'meeting', 'airing', 'maintenance'] as const;

export interface StudioTimeDraft {
  /** Есть — окно правит уже стоящий блок, нет — ставит новый. */
  id?: number;
  staffId: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, местное время студии */
  start: string;
  duration: number;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fromMinutes = (minutes: number) => {
  const day = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(day / 60))}:${pad(day % 60)}`;
};

/** Конец блока; `nextDay` — блок переходит за полночь. */
export function endOf(start: string, duration: number) {
  const total = toMinutes(start) + duration;
  return { time: fromMinutes(total), nextDay: total >= 1440 };
}

export const clampDuration = (minutes: number) =>
  Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(minutes / DURATION_STEP) * DURATION_STEP));

/** Название как его сохранит сервер: без двойных пробелов и краёв. */
export const cleanLabel = (label: string) => label.replace(/\s+/g, ' ').trim();

export const draftErrors = (draft: StudioTimeDraft) => ({
  label: cleanLabel(draft.label).length === 0 || cleanLabel(draft.label).length > MAX_LABEL,
  staff: !(draft.staffId > 0),
  date: !/^\d{4}-\d{2}-\d{2}$/.test(draft.date),
  start: !/^\d{2}:\d{2}$/.test(draft.start),
  duration: draft.duration < MIN_DURATION || draft.duration > MAX_DURATION,
});

export const isValid = (draft: StudioTimeDraft) => !Object.values(draftErrors(draft)).some(Boolean);

/** Полезная нагрузка запроса. На правке — только изменённые поля: блок,
 *  переходящий за полночь, сетка показывает по частям, и переписать время
 *  целиком значило бы молча обрезать его по видимой части. */
export function toPayload(draft: StudioTimeDraft, initial?: StudioTimeDraft): Partial<StudioTimePayload> {
  const full: StudioTimePayload = {
    staff_id: draft.staffId,
    start_time: `${draft.date}T${draft.start}:00`,
    duration_min: draft.duration,
    label: cleanLabel(draft.label),
  };
  if (!initial || draft.id == null) return full;
  const patch: Partial<StudioTimePayload> = {};
  if (draft.staffId !== initial.staffId) patch.staff_id = full.staff_id;
  if (draft.date !== initial.date || draft.start !== initial.start) patch.start_time = full.start_time;
  if (draft.duration !== initial.duration) patch.duration_min = full.duration_min;
  if (cleanLabel(draft.label) !== cleanLabel(initial.label)) patch.label = full.label;
  return patch;
}

/** Блок сетки → черновик правки. */
export const draftFromBlock = (block: StaffScheduleBlock): StudioTimeDraft => ({
  id: block.id,
  staffId: block.staff_id,
  date: block.date,
  start: fromMinutes(block.start_minute),
  duration: Math.max(MIN_DURATION, block.end_minute - block.start_minute),
  label: block.label ?? '',
});

/** «1 ч 30 мин» из минут — подписи из journal:studioTime.duration*. */
export function durationParts(minutes: number): { key: 'durationH' | 'durationHM' | 'durationM'; h: number; m: number } {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { key: h && m ? 'durationHM' : h ? 'durationH' : 'durationM', h, m };
}

/** Список начала: шаг сетки, но не мельче 5 минут — 960 строк по минуте не
 *  листают. Текущее время остаётся в списке, даже если не лежит на шаге. */
export function startOptions(step: number, current: string) {
  const every = Math.max(DURATION_STEP, step);
  const options: string[] = [];
  for (let m = 7 * 60; m <= 23 * 60; m += every) options.push(fromMinutes(m));
  if (current && !options.includes(current)) {
    options.push(current);
    options.sort((a, b) => toMinutes(a) - toMinutes(b));
  }
  return options;
}

/** Начало, когда клетки нет (кнопка без времени): ближайшие 15 минут впереди
 *  сегодня, 09:00 — в другой день. Всегда внутри сетки журнала (07:00–22:00). */
export function defaultStart(date: string, now = new Date()) {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (date !== today) return '09:00';
  const next = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15;
  return fromMinutes(Math.min(22 * 60, Math.max(7 * 60, next)));
}

export type StudioTimeKind = typeof LABEL_PRESETS[number] | 'custom';

/** Слова, по которым своё название узнаётся как готовое — на пяти языках
 *  исходящих текстов (ru, en, uk, cs, de). «Уборка зала», «Generalreinigung»,
 *  «Porada týmu» получают иконку своего вида, а не общую. Порядок значим:
 *  «уборка после ремонта» — уборка. */
const KIND_WORDS: [StudioTimeKind, RegExp][] = [
  ['cleaning', /убор|прибир|чист|мыть|мойк|clean|tidy|wash|úklid|uklid|čišt|myt|reinig|putz|sauber/i],
  ['airing', /провет|провітр|воздух|air|vent|větr|lüft/i],
  ['meeting', /планёр|планер|собран|встреч|нарад|летуч|meet|brief|sync|stand-?up|porad|schůz|besprech|teambesp/i],
  ['maintenance', /обслуж|ремонт|почин|чинит|техн|repair|maint|fix|servis|oprav|údrž|wartung|repar/i],
  ['prep', /подгот|підгот|расстав|prep|set ?up|příprav|vorbereit|aufbau/i],
];

/** Вид блока по его названию: сначала точное совпадение с готовым названием
 *  на языке интерфейса (`presets` — ключ → подпись), потом слова. */
export function labelKind(label: string, presets: Partial<Record<StudioTimeKind, string>> = {}): StudioTimeKind {
  const clean = cleanLabel(label).toLowerCase();
  if (!clean) return 'custom';
  const exact = LABEL_PRESETS.find(key => presets[key] && cleanLabel(presets[key]!).toLowerCase() === clean);
  if (exact) return exact;
  return KIND_WORDS.find(([, words]) => words.test(clean))?.[0] ?? 'custom';
}

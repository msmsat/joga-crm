// «Время студии» — блок в журнале без занятия (уборка, подготовка, планёрка).
// Чистая модель окна StudioTimeModal: никакого React, чтобы проверять её
// скриптом (npm run check:studio-time). Правила сервера — back/services/time_blocks.py.
import type { StaffScheduleBlock, StudioTimeMember, StudioTimeOutside, StudioTimePayload } from '../../../api/schedule';

/** Границы схемы сервера (schemas/schedule/time_blocks.py). */
export const MIN_DURATION = 5;
export const MAX_DURATION = 12 * 60;
export const MAX_LABEL = 80;
export const MAX_NOTES = 2000;
export const MAX_PHOTOS = 10;
export const DURATION_STEP = 5;
/** Готовые длительности: то, что ставят чаще всего. Своё — временем конца. */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;
/** Готовые названия — ключи journal:studioTime.presets.*. */
export const LABEL_PRESETS = ['cleaning', 'prep', 'meeting', 'airing', 'maintenance'] as const;
export type LabelPreset = typeof LABEL_PRESETS[number];

export interface StudioTimeDraft {
  /** Есть — окно правит уже стоящий блок, нет — ставит новый. */
  id?: number;
  /** Кого касается блок: один сотрудник или вся команда (планёрка). */
  staffIds: number[];
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, местное время студии */
  start: string;
  duration: number;
  label: string;
  /** Что сделать или подготовить — для своих, клиенту не показывается. */
  notes: string;
  /** Пути снимков из загрузки (/static/notes/…). */
  photos: string[];
  /** Имена людей блока, присланные сеткой, — для тех, кого нет в списке команды. */
  team?: StudioTimeMember[];
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

/** Время, набранное как удобно: «9», «930», «0930», «9:30», «9.30», «9 30».
 *  null — такого времени нет (25:00, 9:75) или это не время вовсе. */
export function parseClock(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const parts = raw.split(/[\s:.,hч-]+/i).filter(Boolean);
  let h: number;
  let m: number;
  if (parts.length === 2 && parts.every(p => /^\d{1,2}$/.test(p))) {
    h = Number(parts[0]);
    m = Number(parts[1]);
  } else if (parts.length === 1 && /^\d{1,4}$/.test(parts[0])) {
    const digits = parts[0];
    h = Number(digits.length <= 2 ? digits : digits.slice(0, digits.length - 2));
    m = digits.length <= 2 ? 0 : Number(digits.slice(-2));
  } else {
    return null;
  }
  return h < 24 && m < 60 ? `${pad(h)}:${pad(m)}` : null;
}

/** Длительность от начала до конца; конец раньше начала — это за полночь.
 *  0 — конец совпал с началом, такой блок не поставить. */
export const durationBetween = (start: string, end: string) =>
  (((toMinutes(end) - toMinutes(start)) % 1440) + 1440) % 1440;

/** Название как его сохранит сервер: без двойных пробелов и краёв. */
export const cleanLabel = (label: string) => label.replace(/\s+/g, ' ').trim();

export const draftErrors = (draft: StudioTimeDraft) => ({
  label: cleanLabel(draft.label).length === 0 || cleanLabel(draft.label).length > MAX_LABEL,
  staff: draft.staffIds.length === 0,
  date: !/^\d{4}-\d{2}-\d{2}$/.test(draft.date),
  start: !/^\d{2}:\d{2}$/.test(draft.start),
  duration: draft.duration < MIN_DURATION || draft.duration > MAX_DURATION,
  notes: draft.notes.trim().length > MAX_NOTES,
  photos: draft.photos.length > MAX_PHOTOS,
});

export const isValid = (draft: StudioTimeDraft) => !Object.values(draftErrors(draft)).some(Boolean);

const samePhotos = (a: string[], b: string[]) => a.length === b.length && a.every((photo, i) => photo === b[i]);
/** Тот же состав, в каком бы порядке его ни отметили. */
const sameStaff = (a: number[], b: number[]) => a.length === b.length && a.every(id => b.includes(id));

/** Полезная нагрузка запроса. На правке — только изменённые поля: блок,
 *  переходящий за полночь, сетка показывает по частям, и переписать время
 *  целиком значило бы молча обрезать его по видимой части. */
export function toPayload(draft: StudioTimeDraft, initial?: StudioTimeDraft): Partial<StudioTimePayload> {
  const full: StudioTimePayload = {
    staff_ids: draft.staffIds,
    start_time: `${draft.date}T${draft.start}:00`,
    duration_min: draft.duration,
    label: cleanLabel(draft.label),
    notes: draft.notes.trim(),
    photos: draft.photos,
  };
  if (!initial || draft.id == null) return full;
  const patch: Partial<StudioTimePayload> = {};
  if (!sameStaff(draft.staffIds, initial.staffIds)) patch.staff_ids = full.staff_ids;
  if (draft.date !== initial.date || draft.start !== initial.start) patch.start_time = full.start_time;
  if (draft.duration !== initial.duration) patch.duration_min = full.duration_min;
  if (cleanLabel(draft.label) !== cleanLabel(initial.label)) patch.label = full.label;
  if (draft.notes.trim() !== initial.notes.trim()) patch.notes = full.notes;
  if (!samePhotos(draft.photos, initial.photos)) patch.photos = full.photos;
  return patch;
}

/** Блок сетки → черновик правки. */
export const draftFromBlock = (block: StaffScheduleBlock): StudioTimeDraft => ({
  id: block.id,
  staffIds: block.staff_ids?.length ? block.staff_ids : [block.staff_id],
  date: block.date,
  start: fromMinutes(block.start_minute),
  duration: Math.max(MIN_DURATION, block.end_minute - block.start_minute),
  label: block.label ?? '',
  notes: block.notes ?? '',
  photos: block.photos ?? [],
  ...(block.team?.length ? { team: block.team } : {}),
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

/** Список конца — как в календаре: каждый шаг после начала с длительностью
 *  рядом, до потолка в 12 часов. Текущий конец остаётся, даже вне шага. */
export function endOptions(step: number, start: string, current: number) {
  const every = Math.max(DURATION_STEP, step);
  const lengths: number[] = [];
  for (let d = every; d <= MAX_DURATION; d += every) lengths.push(d);
  if (!lengths.includes(current) && current >= MIN_DURATION && current <= MAX_DURATION) {
    lengths.push(current);
    lengths.sort((a, b) => a - b);
  }
  return lengths.map(duration => ({ duration, ...endOf(start, duration) }));
}

/** Начало, когда клетки нет (кнопка без времени): ближайшие 15 минут впереди
 *  сегодня, 09:00 — в другой день. Всегда внутри сетки журнала (07:00–22:00). */
export function defaultStart(date: string, now = new Date()) {
  const today = isoDay(now);
  if (date !== today) return '09:00';
  const next = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15;
  return fromMinutes(Math.min(22 * 60, Math.max(7 * 60, next)));
}

/** YYYY-MM-DD по местным часам. */
export const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Местная полночь дня YYYY-MM-DD (полдень — чтобы перевод часов не сдвинул сутки). */
export const dayDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
};

/** Дни ленты выбора даты: сплошной ряд от недели до самого раннего из дат
 *  (сегодня, день окна, выбранный) до ~четырёх месяцев после самого позднего.
 *  Лента листается вбок; дальний день — через календарь, и ряд дорастёт до него. */
export function dayRange(days: string[], before = 7, after = 120) {
  const valid = days.filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  if (!valid.length) return [];
  const from = dayDate(valid[0]);
  from.setDate(from.getDate() - before);
  const to = dayDate(valid[valid.length - 1]);
  to.setDate(to.getDate() + after);
  const range: string[] = [];
  for (const cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) range.push(isoDay(cursor));
  return range;
}

/** Что считается «вне рабочего времени» и в каком порядке это называть. */
const OFF_KINDS = ['day_off', 'off_hours', 'break'] as const;

/** Кого блок застаёт вне рабочих часов — по часам сотрудников без занятостей
 *  (GET /schedule/staff-blocks?hours_only). Блок за полночь сверяется и со
 *  следующим днём. Тот же расчёт, что у сервера (time_blocks.outside_hours):
 *  окно предупреждает заранее, ответ сохранения — тем же списком. */
export function outsideHours(hours: StaffScheduleBlock[], draft: StudioTimeDraft): StudioTimeOutside[] {
  const start = toMinutes(draft.start);
  const end = start + draft.duration;
  const next = dayDate(draft.date);
  next.setDate(next.getDate() + 1);
  const spans = [
    { date: draft.date, from: start, to: Math.min(end, 1440) },
    { date: isoDay(next), from: 0, to: end - 1440 },
  ].filter(span => span.to > span.from);
  const result: StudioTimeOutside[] = [];
  for (const staffId of draft.staffIds) {
    const kinds = new Set<string>();
    for (const span of spans) {
      for (const block of hours) {
        if (block.staff_id === staffId && block.date === span.date && block.start_minute < span.to
            && span.from < block.end_minute && (OFF_KINDS as readonly string[]).includes(block.kind)) kinds.add(block.kind);
      }
    }
    const kind = OFF_KINDS.find(item => kinds.has(item));
    if (kind) result.push({ staff_id: staffId, kind });
  }
  return result;
}

/** Слова, по которым своё название узнаётся как готовое — на пяти языках
 *  исходящих текстов (ru, en, uk, cs, de): «Уборка зала», «Прибирання»,
 *  «Generalreinigung», «Porada týmu» получают значок своего вида, а не общий.
 *  Порядок значим: «уборка после ремонта» — уборка. */
const PRESET_WORDS: [LabelPreset, RegExp][] = [
  ['cleaning', /убор|прибир|чист|мыть|мойк|clean|tidy|wash|úklid|uklid|čišt|myt|reinig|putz|sauber/i],
  ['airing', /провет|провітр|воздух|air|vent|větr|lüft/i],
  ['meeting', /планёр|планер|собран|встреч|нарад|летуч|meet|brief|sync|stand-?up|porad|schůz|besprech/i],
  ['maintenance', /обслуж|ремонт|почин|чинит|техн|repair|maint|fix|servis|oprav|údrž|wartung|repar/i],
  ['prep', /подгот|підгот|расстав|prep|set ?up|příprav|vorbereit|aufbau/i],
];

/** Вид своего названия по словам; null — не узнали (общий значок). */
export function presetByWords(label: string): LabelPreset | null {
  const clean = cleanLabel(label);
  return (clean && PRESET_WORDS.find(([, words]) => words.test(clean))?.[0]) || null;
}

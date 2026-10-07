import type { EventRecord } from '../../../../api/clients/clients.types';

/**
 * Лента вкладки «События» карточки клиента: что это за событие, как его назвать
 * человеку и когда оно было. Без React — правила проверяет
 * scripts/check-client-event-dates.mjs.
 *
 * Сервер отдаёт ВСЮ историю одним списком (`event_type=all`), вкладки делят его
 * здесь же: переключение мгновенное, без запроса и пустого кадра.
 */

export type EventTab = 'all' | 'visits' | 'payments' | 'bonuses';
export const EVENT_TABS: readonly EventTab[] = ['all', 'payments', 'visits', 'bonuses'];

/** Состояние, которое видит человек: от него цвет, значок и подпись строки. */
export type EventTone =
  | 'upcoming' | 'ongoing' | 'attended' | 'missed' | 'done' | 'cancelled'
  | 'payment' | 'bonusIn' | 'bonusOut' | 'freeze' | 'unfreeze';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const VISIT_TYPES = new Set<EventRecord['type']>(['booking', 'completed', 'visit', 'cancel']);

/** Вкладка события; заморозки живут только во «Всех». */
export function tabOf(event: EventRecord): Exclude<EventTab, 'all'> | null {
  if (VISIT_TYPES.has(event.type)) return 'visits';
  if (event.type === 'payment') return 'payments';
  if (event.type === 'bonus') return 'bonuses';
  return null;
}

export function inTab(event: EventRecord, tab: EventTab): boolean {
  return tab === 'all' || tabOf(event) === tab;
}

export function toneOf(event: EventRecord): EventTone {
  switch (event.type) {
    case 'payment': return 'payment';
    case 'bonus': return (event.amount ?? '').trim().startsWith('-') ? 'bonusOut' : 'bonusIn';
    case 'freeze': return event.freeze_action === 'unfreeze' ? 'unfreeze' : 'freeze';
    case 'cancel': return 'cancelled';
  }
  switch (event.appointment_status) {
    case 'cancelled': return 'cancelled';
    case 'upcoming': return 'upcoming';
    case 'ongoing': return 'ongoing';
    case 'completed':
      return event.attendance_status === 'attended' ? 'attended'
        : event.attendance_status === 'missed' ? 'missed' : 'done';
  }
  // Явные отметки из прежнего ответа сохраняют смысл и без нового состояния.
  if (event.attendance_status === 'attended') return 'attended';
  if (event.attendance_status === 'missed') return 'missed';
  // Старые записи без вычисленного состояния: запись — впереди, остальное — прошло.
  return event.type === 'booking' ? 'upcoming' : 'done';
}

export const isAhead = (tone: EventTone) => tone === 'upcoming' || tone === 'ongoing';

// ─── Даты ─────────────────────────────────────────────────────────────────────

export interface Stamp { y: number; mo: number; d: number; h?: number; mi?: number }

/**
 * Время сервера — уже время студии. Разбираем «настенные часы» строки, не
 * пропуская их через часовой пояс браузера: администратор в другой стране
 * должен видеть то же 10:00, что и студия.
 */
export function parseStamp(value: string | null | undefined): Stamp | null {
  const parts = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/);
  if (!parts) return null;
  const [, y, mo, d, h, mi] = parts.map(Number);
  const hasTime = parts[4] !== undefined;
  const probe = new Date(Date.UTC(y, mo - 1, d, hasTime ? h : 0, hasTime ? mi : 0));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d
    || (hasTime && (probe.getUTCHours() !== h || probe.getUTCMinutes() !== mi))) return null;
  return hasTime ? { y, mo, d, h, mi } : { y, mo, d };
}

const formats = new Map<string, Intl.DateTimeFormat>();
function format(locale: string, options: Intl.DateTimeFormatOptions, key: string): Intl.DateTimeFormat {
  const id = `${locale}|${key}`;
  let f = formats.get(id);
  if (!f) { f = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }); formats.set(id, f); }
  return f;
}

/** «28 сент., 10:00»; без времени в данных — только день, полночь не выдумываем. */
export function formatStamp(value: string | null | undefined, locale: string): string | null {
  const s = parseStamp(value);
  if (!s) return null;
  const date = new Date(Date.UTC(s.y, s.mo - 1, s.d, s.h ?? 0, s.mi ?? 0));
  const day = format(locale, { day: 'numeric', month: 'short' }, 'day').format(date);
  if (s.h === undefined) return day;
  return `${day}, ${format(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'time').format(date)}`;
}

export interface EventDates {
  /** Главное время строки (справа): занятие для записей, само действие для остального. */
  when: string | null;
  /** Пояснения под названием: когда записан, когда отменено, за какое занятие оплата. */
  notes: string[];
}

export function describeDates(event: EventRecord, t: Translate, locale: string): EventDates {
  const fmt = (value: string | null | undefined) => formatStamp(value, locale);
  const unknown = t('panel.events.dates.unknown');
  const notes: string[] = [];

  if (event.type === 'payment') {
    // Старый долг без чека не знает, когда его погасили: дата создания платежа
    // — не дата оплаты, и в «когда» её не ставим.
    const paid = fmt(event.occurred_at);
    if (!paid) {
      notes.push(t('panel.events.dates.paymentUnknown'));
      const recorded = fmt(event.recorded_at);
      if (recorded) notes.push(t('panel.events.dates.recorded', { date: recorded }));
    }
    const lesson = fmt(event.scheduled_at);
    if (lesson) notes.push(t('panel.events.dates.forLesson', { date: lesson }));
    return { when: paid, notes };
  }

  if (event.type === 'cancel' && (event.occurred_at || event.scheduled_at)) {
    // Справа — занятие, которое отменили (его человек и ищет), под названием —
    // когда отменили. Нет занятия — справа само время отмены.
    const cancelled = fmt(event.occurred_at);
    const lesson = fmt(event.scheduled_at);
    if (!lesson) return { when: cancelled ?? unknown, notes };
    notes.push(cancelled ? t('panel.events.dates.cancelledAt', { date: cancelled }) : t('panel.events.dates.cancelUnknown'));
    return { when: lesson, notes };
  }

  if (VISIT_TYPES.has(event.type) && event.type !== 'cancel') {
    const lesson = fmt(event.scheduled_at);
    if (lesson && isAhead(toneOf(event))) {
      const booked = fmt(event.occurred_at);
      if (booked && event.occurred_at !== event.scheduled_at) notes.push(t('panel.events.dates.bookedAt', { date: booked }));
    }
    return { when: lesson ?? fmt(event.date) ?? unknown, notes };
  }

  return { when: fmt(event.occurred_at || event.date) ?? unknown, notes };
}

// ─── Лента ────────────────────────────────────────────────────────────────────

/** Тот же ключ, по которому сервер сортирует ленту (services/client_event_dates.event_order). */
const orderStamp = (event: EventRecord) => event.occurred_at || event.recorded_at || event.date;

export interface MonthGroup { key: string; label: string; items: EventRecord[] }
export interface Timeline { ahead: EventRecord[]; months: MonthGroup[] }

/**
 * Будущие занятия — отдельным блоком сверху, ближайшее первым: «что впереди»
 * человек ищет глазами раньше истории. Остальное — по месяцам в порядке сервера.
 */
export function buildTimeline(events: EventRecord[], locale: string, t: Translate, today = new Date()): Timeline {
  const ahead: EventRecord[] = [];
  const months: MonthGroup[] = [];
  const byKey = new Map<string, MonthGroup>();
  for (const event of events) {
    if (VISIT_TYPES.has(event.type) && isAhead(toneOf(event))) { ahead.push(event); continue; }
    const s = parseStamp(orderStamp(event));
    const key = s ? `${s.y}-${String(s.mo).padStart(2, '0')}` : 'unknown';
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: s ? monthLabel(s, locale, today) : t('panel.events.dates.unknown'), items: [] };
      byKey.set(key, group);
      months.push(group);
    }
    group.items.push(event);
  }
  ahead.sort((a, b) => (a.scheduled_at ?? a.date ?? '').localeCompare(b.scheduled_at ?? b.date ?? ''));
  // Записи без даты сервер ставит в конец — туда же и их группу.
  months.sort((a, b) => (a.key === 'unknown' ? 1 : 0) - (b.key === 'unknown' ? 1 : 0));
  return { ahead, months };
}

/** «Октябрь» в этом году, «Август 2025» — в прошлом: именительный падеж (standalone). */
export function monthLabel(s: Stamp, locale: string, today: Date): string {
  const date = new Date(Date.UTC(s.y, s.mo - 1, 1));
  const name = format(locale, { month: 'long' }, 'month').format(date);
  const label = name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  return s.y === today.getFullYear() ? label : `${label} ${s.y}`;
}

// ─── Сводки вкладок ───────────────────────────────────────────────────────────

export type VisitTone = 'attended' | 'missed' | 'done' | 'cancelled' | 'upcoming' | 'ongoing';
/** Порядок полосы и легенды: от хорошего к плохому, будущее — последним. */
export const VISIT_TONES: readonly VisitTone[] = ['attended', 'done', 'missed', 'cancelled', 'ongoing', 'upcoming'];

export function visitBreakdown(events: EventRecord[]): Record<VisitTone, number> {
  const out: Record<VisitTone, number> = { attended: 0, missed: 0, done: 0, cancelled: 0, upcoming: 0, ongoing: 0 };
  for (const event of events) {
    if (!VISIT_TYPES.has(event.type)) continue;
    const tone = toneOf(event);
    out[tone as VisitTone]++;
  }
  return out;
}

/** Сумма оплаты или баллы бонуса числом; сервер отдаёт их строкой («2400», «+200»). */
export function eventAmount(event: EventRecord): number | null {
  const raw = (event.amount ?? '').replace(/\s/g, '');
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function paymentTotal(events: EventRecord[]): number {
  return events.reduce((sum, e) => sum + (e.type === 'payment' ? eventAmount(e) ?? 0 : 0), 0);
}

export function bonusTotals(events: EventRecord[]): { earned: number; spent: number } {
  let earned = 0, spent = 0;
  for (const event of events) {
    if (event.type !== 'bonus') continue;
    const n = eventAmount(event) ?? 0;
    if (n >= 0) earned += n; else spent -= n;
  }
  return { earned, spent };
}

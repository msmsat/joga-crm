import type { BumpixEvent, BumpixEventPage, BumpixProfile } from '../../../../api/clients/bumpix.types';

export function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function eventDate(value: string, locale: string): string | null {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!parts) return null;
  const [, y, m, d, h, min] = parts.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, h, min));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d
    || date.getUTCHours() !== h || date.getUTCMinutes() !== min) return null;
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export function birthday(value: unknown, locale: string): string | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(number) || number === 0) return null;
  const date = new Date(number);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function lookupRows(profiles: BumpixProfile[], kind: string): Record<string, unknown>[] {
  return profiles.flatMap(p => Array.isArray(p.lookups[kind]) ? p.lookups[kind]
    .filter((v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)) : []);
}

export function masterName(profiles: BumpixProfile[], id: string): string | null {
  const names = new Set(lookupRows(profiles, 'masters').filter(m => m['0'] === id)
    .map(m => text(m['2'])).filter(Boolean));
  return names.size === 1 ? [...names][0] : null;
}

export function categoryNames(profile: BumpixProfile): string {
  if (!Array.isArray(profile.profile.categories)) return text(profile.profile.categories);
  const rows = lookupRows([profile], 'categories');
  return profile.profile.categories.map(value => text(rows.find(row => row['0'] === value)?.['2']) || text(value))
    .filter(Boolean).join(', ');
}

export function nextOffset(page: BumpixEventPage): number | undefined {
  const next = page.offset + page.items.length;
  return page.items.length > 0 && next < page.total ? next : undefined;
}

/** Reject inconsistent responses inside queryFn, before observers read cached pages. */
export function validatePage(page: BumpixEventPage, expectedOffset: number): BumpixEventPage {
  if (!page || !Number.isSafeInteger(page.total) || page.total < 0
    || page.offset !== expectedOffset || !Number.isSafeInteger(page.limit) || page.limit <= 0
    || !Array.isArray(page.items) || page.items.length > page.limit
    || (page.offset < page.total && page.items.length === 0)) {
    throw new Error('Incomplete Bumpix page');
  }
  return page;
}

export function uniqueEvents(pages: Pick<BumpixEventPage, 'items'>[]): BumpixEvent[] {
  return Array.from(new Map(pages.flatMap(p => p.items).map(e => [e.id, e])).values());
}

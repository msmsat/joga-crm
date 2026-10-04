import type { Booking } from '../types';
import type { SourceJournalItem, SourceJournalPage } from './types';

function wall(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}(?:\.\d+)?$/.exec(value);
  if (!match) throw new Error('Invalid source wall time');
  const hour = Number(match[2]), minute = Number(match[3]);
  if (hour > 23 || minute > 59) throw new Error('Invalid source wall time');
  return { date: match[1], index: hour - 7 + minute / 60 };
}
export const isSource = (booking: Pick<Booking, 'source'>) => Boolean(booking.source);
export const inGrid = (booking: Booking) => booking.timeStart >= 0 && booking.timeStart < 15 && booking.timeEnd <= 15 && booking.timeEnd > booking.timeStart;
export function sourceBooking(item: SourceJournalItem): Booking {
  const e = item.event, start = wall(e.start_time), end = wall(e.end_time);
  const dayDiff = (Date.parse(end.date + 'T00:00:00Z') - Date.parse(start.date + 'T00:00:00Z')) / 86400000;
  return { id: -e.id, trainer: e.teacher_user_id ?? -1, timeStart: start.index, timeEnd: end.index + dayDiff * 24,
    title: String(e.details.services || 'Bumpix'), hall: '', clients: 1, maxClients: 1, color: '#A087A9',
    status: e.status === 'canceled' ? 'cancelled' : 'confirmed', date: start.date, cancelReason: null,
    clientsNotified: false, notes: String(e.details.comment || ''), photos: [], serviceId: null,
    price: 0, bookingMode: 'event', version: 1, branchId: null, source: item };
}
export function validateRangePage(page: SourceJournalPage, offset: number): SourceJournalPage {
  if (!Number.isInteger(page.total) || page.total < 0 || page.offset !== offset || !Array.isArray(page.items)
    || !Number.isInteger(page.limit) || page.limit < 1 || page.items.length > page.limit || offset + page.items.length > page.total
    || (offset < page.total && page.items.length === 0)
    || page.items.some(i => !Number.isInteger(i.event?.id) || i.event.id < 1 || !Number.isInteger(i.client_id) || i.client_id < 1)
    || new Set(page.items.map(i => i.event.id)).size !== page.items.length) throw new Error('Incomplete source journal page');
  return page;
}

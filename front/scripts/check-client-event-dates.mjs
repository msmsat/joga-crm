import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createInstance } from 'i18next';

// Лента «Событий» карточки клиента: какое время и какие пояснения получает
// строка (utils/clientEvents.ts). Модуль без React — грузим его как есть.
const i18n = createInstance();
await i18n.init({ lng: 'ru', resources: { ru: { translation: JSON.parse(await readFile(new URL('../src/locales/ru/clients.json', import.meta.url), 'utf8')) } }, interpolation: { escapeValue: false } });
const t = i18n.t.bind(i18n);
const context = vm.createContext({ Intl, Date, Map, Set, Number, String, Math });
const source = await readFile(new URL('../src/pages/dashboard/Clients/utils/clientEvents.ts', import.meta.url), 'utf8');
const mod = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, { context });
await mod.link(() => { throw new Error('clientEvents.ts must stay free of runtime imports'); });
await mod.evaluate();
const { EVENT_TABS, describeDates, toneOf, buildTimeline, inTab, visitBreakdown, paymentTotal, bonusTotals } = mod.namespace;

const dates = event => describeDates(event, t, 'ru');
const text = event => { const d = dates(event); return [d.when ?? '', ...d.notes].join(' | '); };
const booking = { type: 'booking', appointment_status: 'upcoming', scheduled_at: '2026-09-28T10:00:00', occurred_at: '2026-09-26T12:00:00+03:00' };

test('four filters keep the requested order: all, payments, bookings, bonuses', () => {
  assert.deepEqual([...EVENT_TABS], ['all', 'payments', 'visits', 'bonuses']);
});

test('legacy attendance remains understandable without a new appointment status', () => {
  assert.equal(toneOf({ type: 'visit', attendance_status: 'attended' }), 'attended');
  assert.equal(toneOf({ type: 'completed', attendance_status: 'missed' }), 'missed');
  assert.equal(toneOf({ type: 'completed', attendance_status: 'unknown' }), 'done');
});
test('an ongoing appointment is not counted as merely planned in the summary', () => {
  const counts = visitBreakdown([{ ...booking, appointment_status: 'ongoing' }, booking]);
  assert.equal(counts.ongoing, 1);
  assert.equal(counts.upcoming, 1);
});

test('booking shows the lesson time and, separately, when it was booked', () => {
  const d = dates(booking);
  assert.match(d.when, /28 сент.*10:00/);
  assert.match(d.notes.join(), /Запись создана 26 сент.*12:00/);
});
test('studio day and time stay unchanged regardless of browser timezone', () => {
  assert.match(dates({ type: 'bonus', occurred_at: '2026-09-28T01:30:00+03:00' }).when, /28 сент.*01:30/);
});
test('payment shows settlement time and the lesson it paid for', () => {
  const d = dates({ ...booking, type: 'payment', occurred_at: '2026-09-29T14:20:00+03:00' });
  assert.match(d.when, /29 сент.*14:20/);
  assert.match(d.notes.join(), /За занятие 28 сент.*10:00/);
});
test('old debt creation must not be presented as payment time', () => {
  const d = dates({ ...booking, type: 'payment', occurred_at: null, recorded_at: '2026-09-26T12:00:00+03:00' });
  assert.equal(d.when, null);
  assert.match(d.notes.join(), /Дата оплаты не сохранена/);
  assert.match(d.notes.join(), /Платёж создан 26 сент/);
});
test('cancel shows the cancelled lesson and when it was cancelled', () => {
  const d = dates({ ...booking, type: 'cancel', appointment_status: 'cancelled' });
  assert.match(d.when, /28 сент.*10:00/);
  assert.match(d.notes.join(), /Запись отменена 26 сент/);
});
test('visit shows the appointment time once', () => {
  const html = text({ ...booking, type: 'completed', appointment_status: 'completed', occurred_at: booking.scheduled_at });
  assert.match(html, /28 сент/);
  assert.equal((html.match(/28 сент/g) || []).length, 1);
});
test('freezes and bonuses show their action timestamps', () => {
  for (const type of ['freeze', 'bonus']) assert.match(dates({ type, occurred_at: booking.occurred_at }).when, /26 сент.*12:00/);
});
test('legacy date-only records do not invent an appointment or midnight', () => {
  const html = text({ type: 'booking', date: '2026-09-28' });
  assert.match(html, /28 сент/);
  assert.doesNotMatch(html, /00:00|Запись создана/);
});
test('invalid or absent dates are explicit', () => {
  assert.match(dates({ type: 'bonus', date: 'bad' }).when, /Дата не сохранена/);
  assert.match(dates({ type: 'bonus', date: null }).when, /Дата не сохранена/);
});
test('historical cancellation without action time still shows the appointment', () => {
  const d = dates({ ...booking, type: 'cancel', occurred_at: null });
  assert.match(d.when, /28 сент.*10:00/);
  assert.match(d.notes.join(), /Дата отмены не сохранена/);
});

test('tone names what happened: attendance decides a finished lesson', () => {
  const done = { type: 'completed', appointment_status: 'completed' };
  assert.equal(toneOf({ ...done, attendance_status: 'attended' }), 'attended');
  assert.equal(toneOf({ ...done, attendance_status: 'missed' }), 'missed');
  assert.equal(toneOf({ ...done, attendance_status: 'unknown' }), 'done');
  assert.equal(toneOf({ type: 'cancel', appointment_status: 'cancelled' }), 'cancelled');
  assert.equal(toneOf({ type: 'booking', appointment_status: 'ongoing' }), 'ongoing');
  assert.equal(toneOf({ type: 'bonus', amount: '-150' }), 'bonusOut');
  assert.equal(toneOf({ type: 'bonus', amount: '+200' }), 'bonusIn');
  assert.equal(toneOf({ type: 'freeze', freeze_action: 'unfreeze' }), 'unfreeze');
});

const history = [
  { ...booking, scheduled_at: '2026-10-12T09:00:00', occurred_at: '2026-10-04T10:00:00' },
  { ...booking, scheduled_at: '2026-10-09T18:30:00', occurred_at: '2026-10-03T10:00:00' },
  { type: 'payment', occurred_at: '2026-10-02T14:00:00+02:00', amount: '2400' },
  { type: 'completed', appointment_status: 'completed', attendance_status: 'attended', scheduled_at: '2026-09-30T09:00:00', occurred_at: '2026-09-30T09:00:00' },
  { type: 'cancel', appointment_status: 'cancelled', scheduled_at: '2026-09-29T18:00:00', occurred_at: '2026-09-28T21:00:00+02:00' },
  { type: 'bonus', occurred_at: '2026-09-20T12:00:00+02:00', amount: '+200' },
  { type: 'bonus', occurred_at: '2025-12-20T12:00:00+02:00', amount: '-50' },
  { type: 'freeze', occurred_at: '2025-12-01T12:00:00+02:00', freeze_action: 'freeze' },
];

test('tabs split one history: freezes only in All, every booking state in Bookings', () => {
  const count = tab => history.filter(e => inTab(e, tab)).length;
  assert.deepEqual(['all', 'visits', 'payments', 'bonuses'].map(count), [8, 4, 1, 2]);
  assert.deepEqual({ ...visitBreakdown(history) }, { attended: 1, missed: 0, done: 0, cancelled: 1, upcoming: 2, ongoing: 0 });
  assert.equal(paymentTotal(history), 2400);
  assert.deepEqual({ ...bonusTotals(history) }, { earned: 200, spent: 50 });
});

test('upcoming lessons lead, nearest first; the rest keeps server order by month', () => {
  const { ahead, months } = buildTimeline(history, 'ru', t, new Date(2026, 9, 5));
  assert.deepEqual([...ahead.map(e => e.scheduled_at.slice(0, 10))], ['2026-10-09', '2026-10-12']);
  assert.deepEqual([...months.map(m => m.label)], ['Октябрь', 'Сентябрь', 'Декабрь 2025']);
  assert.deepEqual([...months.map(m => m.items.length)], [1, 3, 2]);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const context = vm.createContext({ console });
const source = await readFile(new URL('../src/pages/dashboard/Journal/hooks/useJournalView.ts', import.meta.url), 'utf8');
const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
} }).outputText, { context });
await module.link(name => {
  const exports = name === 'react'
    ? { useState() {}, useEffect() {}, useCallback: fn => fn }
    : { getActiveContextKey: () => '15:42:owner' };
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await module.evaluate();
const { readJournalPreferences, writeJournalPreferences, selectWeekSchedule } = module.namespace;
const plain = value => JSON.parse(JSON.stringify(value));
const defaults = { calendarView: 'day', weekTrainerId: null };
function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), entries };
}

test('new users open the day without a remembered master', () => {
  assert.deepEqual(plain(readJournalPreferences('15:42:owner', storage())), defaults);
});
test('the week and its selected master survive a new read of storage', () => {
  const store = storage();
  writeJournalPreferences('15:42:owner', { calendarView: 'week', weekTrainerId: 1722 }, store);
  assert.deepEqual(plain(readJournalPreferences('15:42:owner', store)), { calendarView: 'week', weekTrainerId: 1722 });
  writeJournalPreferences('15:42:owner', { calendarView: 'day', weekTrainerId: 1722 }, store);
  assert.deepEqual(plain(readJournalPreferences('15:42:owner', store)), { calendarView: 'day', weekTrainerId: 1722 });
});
test('another studio or account has its own choice', () => {
  const store = storage();
  writeJournalPreferences('15:42:owner', { calendarView: 'week', weekTrainerId: 1722 }, store);
  assert.deepEqual(plain(readJournalPreferences('16:42:owner', store)), defaults);
  assert.deepEqual(plain(readJournalPreferences('15:43:owner', store)), defaults);
});
test('corrupted or unsupported preferences cannot break the journal', () => {
  for (const raw of ['{', 'null', '[]', '{"calendarView":"month","weekTrainerId":-2}', '{"calendarView":"day","weekTrainerId":"1722"}']) {
    assert.deepEqual(plain(readJournalPreferences('15:42:owner', { getItem: () => raw })), defaults);
  }
});
test('blocked browser storage leaves the journal usable', () => {
  const store = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  assert.deepEqual(plain(readJournalPreferences('15:42:owner', store)), defaults);
  assert.doesNotThrow(() => writeJournalPreferences('15:42:owner', { calendarView: 'week', weekTrainerId: 1722 }, store));
});

test('denying access to the storage object itself does not break rendering', () => {
  Object.defineProperty(context, 'localStorage', { configurable: true, get() { throw new Error('Access denied'); } });
  assert.deepEqual(plain(readJournalPreferences('15:42:owner')), defaults);
  assert.doesNotThrow(() => writeJournalPreferences('15:42:owner', { calendarView: 'week', weekTrainerId: 1722 }));
  delete context.localStorage;
});

const trainers = [{ id: 11 }, { id: 22 }];
const bookings = [
  { id: 1, trainer: 11, bookingMode: 'resource', date: '2026-10-05' },
  { id: 2, trainer: 22, bookingMode: 'event', date: '2026-10-05' },
  { id: 3, trainer: 22, bookingMode: 'resource', date: '2026-10-07' },
];
const staffBlocks = [
  { staff_id: 11, date: '2026-10-05', kind: 'day_off' },
  { staff_id: 22, date: '2026-10-05', kind: 'break' },
  { staff_id: 22, date: '2026-10-07', kind: 'off_hours' },
];
test('the entire week contains only the chosen master, including breaks and both booking modes', () => {
  const result = selectWeekSchedule(trainers, bookings, staffBlocks, 22);
  assert.equal(result.trainer.id, 22);
  assert.deepEqual(Array.from(result.bookings, b => b.id), [2, 3]);
  assert.deepEqual(Array.from(result.staffBlocks, b => b.kind), ['break', 'off_hours']);
});
test('an unavailable remembered master falls back to one available master', () => {
  const result = selectWeekSchedule(trainers, bookings, staffBlocks, 99);
  assert.equal(result.trainer.id, 11);
  assert.deepEqual(Array.from(result.bookings, b => b.id), [1]);
  assert.deepEqual(Array.from(result.staffBlocks, b => b.kind), ['day_off']);
});
test('a master without lessons remains selected for their empty week', () => {
  const result = selectWeekSchedule(trainers, [], [], 22);
  assert.equal(result.trainer.id, 22);
  assert.equal(result.bookings.length, 0);
});
test('loading or an empty team never shows all other masters by accident', () => {
  const result = selectWeekSchedule([], bookings, staffBlocks, 22);
  assert.equal(result.trainer, null);
  assert.equal(result.bookings.length, 0);
  assert.equal(result.staffBlocks.length, 0);
});

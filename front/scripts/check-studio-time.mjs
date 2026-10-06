// «Время студии» (studioTimeModel.ts): что окно отправит на сервер и как
// подписывает длительность. Правила сервера — back/services/time_blocks.py.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const context = vm.createContext({ console });
const source = await readFile(new URL('../src/pages/dashboard/Journal/studioTimeModel.ts', import.meta.url), 'utf8');
const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
} }).outputText, { context });
await module.link(() => { throw new Error('studioTimeModel must stay free of runtime imports'); });
await module.evaluate();
const m = module.namespace;
const plain = value => JSON.parse(JSON.stringify(value));
const draft = { staffId: 7, date: '2099-10-08', start: '10:30', duration: 45, label: '  Уборка   зала ' };

test('a new block sends everything with a clean local time and label', () => {
  assert.deepEqual(plain(m.toPayload(draft)), {
    staff_id: 7, start_time: '2099-10-08T10:30:00', duration_min: 45, label: 'Уборка зала',
  });
});

test('editing sends only what changed: an untouched split block is never cut', () => {
  const initial = { ...draft, id: 3, label: 'Уборка зала' };
  assert.deepEqual(plain(m.toPayload({ ...initial }, initial)), {});
  assert.deepEqual(plain(m.toPayload({ ...initial, label: 'Планёрка' }, initial)), { label: 'Планёрка' });
  assert.deepEqual(plain(m.toPayload({ ...initial, start: '11:00' }, initial)), { start_time: '2099-10-08T11:00:00' });
  assert.deepEqual(plain(m.toPayload({ ...initial, staffId: 9, duration: 60 }, initial)), { staff_id: 9, duration_min: 60 });
});

test('the grid block opens as a draft with its id and real length', () => {
  const block = { id: 3, staff_id: 7, date: '2099-10-08', start_minute: 630, end_minute: 675, kind: 'busy', label: 'Уборка' };
  assert.deepEqual(plain(m.draftFromBlock(block)), { id: 3, staffId: 7, date: '2099-10-08', start: '10:30', duration: 45, label: 'Уборка' });
});

test('validation mirrors the server schema', () => {
  assert.equal(m.isValid(draft), true);
  assert.equal(m.draftErrors({ ...draft, label: '   ' }).label, true);
  assert.equal(m.draftErrors({ ...draft, label: 'x'.repeat(81) }).label, true);
  assert.equal(m.draftErrors({ ...draft, duration: 4 }).duration, true);
  assert.equal(m.draftErrors({ ...draft, duration: 721 }).duration, true);
  assert.equal(m.draftErrors({ ...draft, staffId: 0 }).staff, true);
});

test('duration is stepped, clamped and labelled', () => {
  assert.equal(m.clampDuration(2), 5);
  assert.equal(m.clampDuration(62), 60);
  assert.equal(m.clampDuration(999), 720);
  assert.deepEqual(plain(m.durationParts(45)), { key: 'durationM', h: 0, m: 45 });
  assert.deepEqual(plain(m.durationParts(120)), { key: 'durationH', h: 2, m: 0 });
  assert.deepEqual(plain(m.durationParts(95)), { key: 'durationHM', h: 1, m: 35 });
});

test('the end crosses midnight honestly', () => {
  assert.deepEqual(plain(m.endOf('10:30', 45)), { time: '11:15', nextDay: false });
  assert.deepEqual(plain(m.endOf('23:30', 60)), { time: '00:30', nextDay: true });
});

test('start options never go finer than 5 minutes and keep an off-step time', () => {
  const fine = m.startOptions(1, '10:00');
  assert.equal(fine[1], '07:05');
  assert.equal(fine.at(-1), '23:00');
  const odd = m.startOptions(15, '10:07');
  assert.ok(odd.includes('10:07'));
  assert.equal(odd[odd.indexOf('10:07') - 1], '10:00');
});

test('without a cell the start is the next quarter today and 09:00 on another day', () => {
  const now = new Date(2099, 9, 8, 10, 7);
  assert.equal(m.defaultStart('2099-10-08', now), '10:15');
  assert.equal(m.defaultStart('2099-10-09', now), '09:00');
  assert.equal(m.defaultStart('2099-10-08', new Date(2099, 9, 8, 23, 50)), '22:00');
  assert.equal(m.defaultStart('2099-10-08', new Date(2099, 9, 8, 5, 0)), '07:00');
});

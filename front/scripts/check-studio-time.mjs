// «Время студии» (studioTimeModel.ts): что окно отправит на сервер и как
// подписывает длительность. Правила сервера — back/services/time_blocks.py.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const context = vm.createContext({ console });
// Оба модуля — чистые: ни React, ни запросов. Любой runtime-импорт — ошибка.
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText, { context });
  await module.link(() => { throw new Error(`${path} must stay free of runtime imports`); });
  await module.evaluate();
  return module.namespace;
}
const m = await load('../src/pages/dashboard/Journal/studioTimeModel.ts');
const grid = await load('../src/pages/dashboard/Journal/components/ScheduleGrid/slotSpans.ts');
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

test('a short block closes only its own minutes of the hour', () => {
  const spans = grid.mergeSpans([[615, 630], [600, 615], [645, 660]]);
  assert.deepEqual(plain(spans), [[600, 630], [645, 660]]);
  assert.equal(grid.slotStart(spans, 600, 605), null);       // в уборку — объясняем
  assert.equal(grid.slotStart(spans, 600, 640), 630);        // мимо — сразу после неё
  assert.equal(grid.slotStart(spans, 600, 650), null);
  assert.equal(grid.slotStart([], 600, 640), 600);           // свободный час — как раньше, с начала
  assert.equal(grid.slotStart([[630, 660]], 600, 10 + 600), 600);
});

test('a block label maps to its kind: exact preset first, then words in five languages', () => {
  const presets = { cleaning: 'Уборка', prep: 'Подготовка зала', meeting: 'Планёрка', airing: 'Проветривание', maintenance: 'Обслуживание' };
  assert.equal(m.labelKind('  подготовка   ЗАЛА ', presets), 'prep');
  assert.equal(m.labelKind('Уборка после ремонта', presets), 'cleaning');
  assert.equal(m.labelKind('Generalreinigung'), 'cleaning');
  assert.equal(m.labelKind('Porada týmu'), 'meeting');
  assert.equal(m.labelKind('Team sync'), 'meeting');
  assert.equal(m.labelKind('Lüften'), 'airing');
  assert.equal(m.labelKind('Ремонт кондиционера'), 'maintenance');
  assert.equal(m.labelKind('Set up the hall'), 'prep');
  assert.equal(m.labelKind('Фотосессия'), 'custom');
  assert.equal(m.labelKind(''), 'custom');
});

// Цвет блока и палитра мастеров живут в трёх файлах. Разойдутся — мастер снова
// сможет надеть цвет «времени студии», а перерыв — совпасть с занятием.
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const hexes = text => [...text.matchAll(/#[0-9A-Fa-f]{6}/g)].map(match => match[0].toUpperCase());

test('the staff palette is the same on the server and in the card picker', async () => {
  const server = await read('../../back/services/staff_colors.py');
  const front = await read('../src/lib/staffColors.ts');
  const serverPalette = hexes(server.slice(server.indexOf('STAFF_PALETTE = ('), server.indexOf(')', server.indexOf('STAFF_PALETTE = ('))));
  const frontPalette = hexes(front.slice(front.indexOf('STAFF_PALETTE = ['), front.indexOf('] as const')));
  assert.ok(serverPalette.length >= 6, serverPalette);
  assert.deepEqual(frontPalette, serverPalette);
});

test('journal block accents in CSS are the colours the server keeps off staff', async () => {
  const server = await read('../../back/services/staff_colors.py');
  const css = await read('../src/pages/dashboard/Journal/components/ScheduleGrid/StaffBlockCard.css');
  const reserved = hexes(server.slice(server.indexOf('BLOCK_COLORS = {'), server.indexOf('}', server.indexOf('BLOCK_COLORS = {'))));
  const accent = selector => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, selector);
    return css.slice(at, css.indexOf('}', at)).match(/--sb-accent:\s*(#[0-9A-Fa-f]{6})/)[1].toUpperCase();
  };
  for (const selector of ['.j-staff-block-break', ':root.dark .j-staff-block-break', '.j-staff-block-day_off',
    ':root.dark .j-staff-block-day_off', '.j-staff-block-studio', ':root.dark .j-staff-block-studio']) {
    assert.ok(reserved.includes(accent(selector)), `${selector} ${accent(selector)} is not in BLOCK_COLORS`);
  }
});

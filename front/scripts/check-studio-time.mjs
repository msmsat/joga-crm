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
const draft = { staffIds: [7], date: '2099-10-08', start: '10:30', duration: 45, label: '  Уборка   зала ', notes: '', photos: [] };
const photo = `/static/notes/${'a'.repeat(32)}.jpg`;

test('a new block sends everything with a clean local time and label', () => {
  assert.deepEqual(plain(m.toPayload(draft)), {
    staff_ids: [7], start_time: '2099-10-08T10:30:00', duration_min: 45, label: 'Уборка зала', notes: '', photos: [],
  });
  assert.deepEqual(plain(m.toPayload({ ...draft, notes: '  Протереть коврики \n', photos: [photo] })).notes, 'Протереть коврики');
});

test('editing sends only what changed: an untouched split block is never cut', () => {
  const initial = { ...draft, id: 3, label: 'Уборка зала' };
  assert.deepEqual(plain(m.toPayload({ ...initial }, initial)), {});
  assert.deepEqual(plain(m.toPayload({ ...initial, label: 'Планёрка' }, initial)), { label: 'Планёрка' });
  assert.deepEqual(plain(m.toPayload({ ...initial, start: '11:00' }, initial)), { start_time: '2099-10-08T11:00:00' });
  assert.deepEqual(plain(m.toPayload({ ...initial, staffIds: [9], duration: 60 }, initial)), { staff_ids: [9], duration_min: 60 });
  // Состав — тот же в любом порядке; новый человек — весь состав целиком.
  const team = { ...initial, staffIds: [7, 9] };
  assert.deepEqual(plain(m.toPayload({ ...team, staffIds: [9, 7] }, team)), {});
  assert.deepEqual(plain(m.toPayload({ ...team, staffIds: [9, 7, 4] }, team)), { staff_ids: [9, 7, 4] });
  // Заметка и снимки — тоже только когда поменялись; пробелы по краям не правка.
  assert.deepEqual(plain(m.toPayload({ ...initial, notes: ' ' }, initial)), {});
  assert.deepEqual(plain(m.toPayload({ ...initial, notes: 'Швабра' }, initial)), { notes: 'Швабра' });
  assert.deepEqual(plain(m.toPayload({ ...initial, photos: [photo] }, initial)), { photos: [photo] });
  const withPhoto = { ...initial, photos: [photo] };
  assert.deepEqual(plain(m.toPayload({ ...withPhoto, photos: [] }, withPhoto)), { photos: [] });
  assert.deepEqual(plain(m.toPayload({ ...withPhoto, photos: [photo] }, withPhoto)), {});
});

test('the grid block opens as a draft with its id and real length', () => {
  const block = { id: 3, staff_id: 7, date: '2099-10-08', start_minute: 630, end_minute: 675, kind: 'busy', label: 'Уборка' };
  assert.deepEqual(plain(m.draftFromBlock(block)), {
    id: 3, staffIds: [7], date: '2099-10-08', start: '10:30', duration: 45, label: 'Уборка', notes: '', photos: [],
  });
  // Сетка присылает заметку и снимки, только когда они есть, — окно открывается полным.
  assert.deepEqual(plain(m.draftFromBlock({ ...block, notes: 'Швабра', photos: [photo] })).photos, [photo]);
  assert.equal(m.draftFromBlock({ ...block, notes: 'Швабра' }).notes, 'Швабра');
  // Блок на команду открывается всем составом, с какой колонки ни нажми.
  assert.deepEqual(plain(m.draftFromBlock({ ...block, staff_id: 9, staff_ids: [7, 9] }).staffIds), [7, 9]);
});

test('validation mirrors the server schema', () => {
  assert.equal(m.isValid(draft), true);
  assert.equal(m.draftErrors({ ...draft, label: '   ' }).label, true);
  assert.equal(m.draftErrors({ ...draft, label: 'x'.repeat(81) }).label, true);
  assert.equal(m.draftErrors({ ...draft, duration: 4 }).duration, true);
  assert.equal(m.draftErrors({ ...draft, duration: 721 }).duration, true);
  assert.equal(m.draftErrors({ ...draft, staffIds: [] }).staff, true);
  assert.equal(m.draftErrors({ ...draft, notes: 'x'.repeat(2001) }).notes, true);
  assert.equal(m.draftErrors({ ...draft, photos: Array(11).fill(photo) }).photos, true);
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

test('time is typed however it is convenient', () => {
  for (const [typed, clock] of [['9', '09:00'], ['930', '09:30'], ['0930', '09:30'], ['9:30', '09:30'], ['9.30', '09:30'],
    ['9 30', '09:30'], ['21:5', '21:05'], ['1545', '15:45'], [' 7 ', '07:00'], ['23:59', '23:59'], ['0', '00:00']]) {
    assert.equal(m.parseClock(typed), clock, typed);
  }
  for (const typed of ['', '24', '2400', '9:75', '12345', 'abc', '9:30:00', '9:3:0']) assert.equal(m.parseClock(typed), null, typed);
});

test('the end time sets the length, across midnight too', () => {
  assert.equal(m.durationBetween('10:00', '11:30'), 90);
  assert.equal(m.durationBetween('23:30', '00:15'), 45);
  assert.equal(m.durationBetween('10:00', '10:00'), 0);
  const ends = m.endOptions(15, '10:00', 60);
  assert.deepEqual(plain(ends[0]), { duration: 15, time: '10:15', nextDay: false });
  assert.deepEqual(plain(ends.at(-1)), { duration: 720, time: '22:00', nextDay: false });
  assert.ok(m.endOptions(15, '10:00', 50).some(end => end.duration === 50 && end.time === '10:50'));
  assert.equal(m.endOptions(15, '22:00', 60).find(end => end.duration === 180).nextDay, true);
});

test('the day strip is one row around today and the chosen day', () => {
  const days = m.dayRange(['2099-10-08', '2099-10-10'], 2, 3);
  assert.deepEqual(plain(days), ['2099-10-06', '2099-10-07', '2099-10-08', '2099-10-09', '2099-10-10', '2099-10-11', '2099-10-12', '2099-10-13']);
  // Через смену месяца и перевод часов — без пропусков и повторов.
  const autumn = m.dayRange(['2099-10-24'], 0, 10);
  assert.equal(new Set(autumn).size, autumn.length);
  assert.deepEqual(plain(autumn.slice(6, 9)), ['2099-10-30', '2099-10-31', '2099-11-01']);
  assert.deepEqual(plain(m.dayRange(['nope'])), []);
});

test('outside working hours is named per person, the next day too', () => {
  const hours = [
    { staff_id: 7, date: '2099-10-08', start_minute: 0, end_minute: 540, kind: 'off_hours', label: null },
    { staff_id: 7, date: '2099-10-08', start_minute: 780, end_minute: 840, kind: 'break', label: null },
    { staff_id: 7, date: '2099-10-08', start_minute: 1260, end_minute: 1440, kind: 'off_hours', label: null },
    { staff_id: 9, date: '2099-10-08', start_minute: 0, end_minute: 1440, kind: 'day_off', label: null },
    { staff_id: 7, date: '2099-10-09', start_minute: 0, end_minute: 1440, kind: 'day_off', label: null },
  ];
  const at = (start, duration, staffIds = [7]) => plain(m.outsideHours(hours, { ...draft, staffIds, start, duration }));
  assert.deepEqual(at('10:00', 60), []);                                     // рабочее время
  assert.deepEqual(at('08:30', 60), [{ staff_id: 7, kind: 'off_hours' }]);   // до начала смены
  assert.deepEqual(at('13:30', 15), [{ staff_id: 7, kind: 'break' }]);       // на перерыве
  assert.deepEqual(at('09:00', 240), []);                                    // встык к перерыву — не на нём
  assert.deepEqual(at('09:00', 270), [{ staff_id: 7, kind: 'break' }]);      // задевает перерыв
  assert.deepEqual(at('10:00', 60, [7, 9, 11]), [{ staff_id: 9, kind: 'day_off' }]); // у 11 графика нет — на месте
  assert.deepEqual(at('20:00', 60), []);
  assert.deepEqual(at('20:30', 60), [{ staff_id: 7, kind: 'off_hours' }]);
  // За полночь — в следующий день, а там выходной: он весомее нерабочего часа.
  assert.deepEqual(at('23:30', 60), [{ staff_id: 7, kind: 'day_off' }]);
});

test('an own label is recognised by its words in five languages', () => {
  assert.equal(m.presetByWords('Уборка после ремонта'), 'cleaning');
  assert.equal(m.presetByWords('Прибирання'), 'cleaning');
  assert.equal(m.presetByWords('Generalreinigung'), 'cleaning');
  assert.equal(m.presetByWords('Porada týmu'), 'meeting');
  assert.equal(m.presetByWords('Team sync'), 'meeting');
  assert.equal(m.presetByWords('Lüften'), 'airing');
  assert.equal(m.presetByWords('Ремонт кондиционера'), 'maintenance');
  assert.equal(m.presetByWords('Set up the hall'), 'prep');
  assert.equal(m.presetByWords('Фотосессия'), null);
  assert.equal(m.presetByWords('   '), null);
});

// Цвет блока и палитра мастеров живут в трёх файлах. Разойдутся — мастер снова
// сможет надеть цвет «времени студии», а перерыв — совпасть с занятием.
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const hexes = text => [...text.matchAll(/#[0-9A-Fa-f]{6}/g)].map(match => match[0].toUpperCase());

test('the staff palette is the same on the server and in the card picker', async () => {
  const server = await read('../../back/services/staff_colors.py');
  const front = await read('../src/lib/staffColors.ts');
  const from = server.indexOf('STAFF_PALETTE = (');
  const serverPalette = hexes(server.slice(from, server.indexOf(')', from)));
  const frontPalette = hexes(front.slice(front.indexOf('STAFF_PALETTE = ['), front.indexOf('] as const')));
  assert.ok(serverPalette.length >= 6, serverPalette);
  assert.deepEqual(frontPalette, serverPalette);
});

test('journal block accents in CSS are the colours the server keeps off staff', async () => {
  const server = await read('../../back/services/staff_colors.py');
  const css = await read('../src/pages/dashboard/Journal/components/ScheduleGrid/StaffBlockCard.css');
  const from = server.indexOf('BLOCK_COLORS = {');
  const reserved = hexes(server.slice(from, server.indexOf('}', from)));
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

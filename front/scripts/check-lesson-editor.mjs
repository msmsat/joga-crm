// Модель окна «Изменить занятие» (Journal/components/lesson/editor/editorModel.ts):
// неделя для ленты дней, сдвиг начала без потери длительности, длительность,
// фазы правки (зеркало back/services/lesson_edit_policy.py) и список того, что
// изменилось.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const context = vm.createContext({ console, Date, Math, Number, Array, Set, String });
const source = await readFile(new URL('../src/pages/dashboard/Journal/components/lesson/editor/editorModel.ts', import.meta.url), 'utf8');
const mod = new vm.SourceTextModule(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText, { context });
await mod.link(name => {
  // Сетка журнала: 0 = 07:00, 16 = 23:00 (Journal/utils.ts).
  const exports = name.endsWith('/utils') ? {
    MIN_TIME_INDEX: 0,
    MAX_TIME_INDEX: 16,
    toDateStr: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  } : {};
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await mod.evaluate();
const m = mod.namespace;

/** Индекс сетки → минуты от 07:00: сравниваем минутами, без хвостов плавающей точки. */
const min = idx => Math.round(idx * 60);
const at = (hh, mm = 0) => (hh - 7) + mm / 60;

test('неделя для ленты дней — с понедельника по воскресенье', () => {
  const week = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
  assert.deepEqual([...m.weekOf('2026-09-09')], week);
  assert.deepEqual([...m.weekOf('2026-09-13')], week, 'воскресенье — конец той же недели');
  assert.deepEqual([...m.weekOf('2026-09-07')], week);
});

test('листание недель и переход через месяц', () => {
  assert.equal(m.shiftDays('2026-09-09', 7), '2026-09-16');
  assert.equal(m.shiftDays('2026-09-28', 7), '2026-10-05');
  assert.equal(m.shiftDays('2026-10-01', -7), '2026-09-24');
});

test('сдвиг начала сохраняет длительность', () => {
  const next = m.moveStart(at(8), at(8, 55), 0.25);
  assert.equal(min(next.timeStart), min(at(8, 15)));
  assert.equal(min(next.timeEnd - next.timeStart), 55);
});

test('сдвиг встаёт на шаг сетки, а не тащит за собой случайные минуты', () => {
  assert.equal(min(m.moveStart(at(8, 5), at(9, 5), 0.25).timeStart), min(at(8, 15)));
  assert.equal(min(m.moveStart(at(8, 5), at(9, 5), -0.25).timeStart), min(at(8)));
  assert.equal(min(m.moveStart(at(8, 15), at(9, 15), 0.25).timeStart), min(at(8, 30)));
});

test('сдвиг не уводит занятие за края дня', () => {
  const late = m.moveStart(at(22), at(23), 0.25);
  assert.equal(min(late.timeStart), min(at(22)), 'конец уже упёрся в 23:00');
  assert.equal(min(late.timeEnd), min(at(23)));
  const early = m.moveStart(at(7), at(8), -0.25);
  assert.equal(min(early.timeStart), 0);
});

test('выбор начала из списка переносит занятие целиком', () => {
  const placed = m.placeStart(at(8), at(8, 55), at(10, 30));
  assert.equal(min(placed.timeStart), min(at(10, 30)));
  assert.equal(min(placed.timeEnd), min(at(11, 25)));
  const clamped = m.placeStart(at(8), at(9), at(22, 30));
  assert.equal(min(clamped.timeEnd), min(at(23)), 'час не поместился до 23:00 — начало прижато');
  assert.equal(min(clamped.timeStart), min(at(22)));
});

test('длительность меняется по 5 минут и встаёт на кратное', () => {
  assert.equal(min(m.resize(at(8), at(8, 55), 5) - at(8)), 60);
  assert.equal(min(m.resize(at(8), at(8, 55), -5) - at(8)), 50);
  assert.equal(min(m.resize(at(8), at(8, 52), 5) - at(8)), 55);
  assert.equal(min(m.resize(at(8), at(8, 52), -5) - at(8)), 50);
});

test('длительность не короче минимума и не за 23:00', () => {
  assert.equal(min(m.resize(at(8), at(8, 5), -5) - at(8)), m.MIN_DURATION_MIN);
  assert.equal(min(m.resize(at(22), at(23), 5)), min(at(23)));
});

test('последний момент для правки: срок отмены записи + 2 ч, без записанных — 2 ч', () => {
  assert.equal(m.editLeadMin(3, 240), 360);
  assert.equal(m.editLeadMin(1, 0), 120);
  assert.equal(m.editLeadMin(0, 240), 120, 'предупреждать некого');
});

test('фазы занятия: можно, заморожено, прошло', () => {
  const now = new Date('2026-09-09T06:30:00');
  // Начало в 08:00, конец в 09:00.
  assert.equal(m.editPhase('2026-09-09', at(8), at(9), 120, now), 'frozen', 'до начала полтора часа');
  assert.equal(m.editPhase('2026-09-09', at(8), at(9), 120, new Date('2026-09-09T05:59:00')), 'open');
  assert.equal(m.editPhase('2026-09-09', at(14), at(15), 360, now), 'open', 'до начала 7,5 ч при окне 6 ч');
  assert.equal(m.editPhase('2026-09-09', at(12), at(13), 360, now), 'frozen', 'до начала 5,5 ч при окне 6 ч');
  assert.equal(m.editPhase('2026-09-09', at(8), at(9), 120, new Date('2026-09-09T08:30:00')), 'frozen', 'идёт');
  assert.equal(m.editPhase('2026-09-08', at(20), at(21), 360, now), 'finished', 'занятие уже прошло');
});

test('самое раннее новое начало — через окно правки от текущего момента', () => {
  const now = new Date('2026-09-09T09:10:00');
  assert.equal(min(m.earliestStart('2026-09-09', 120, now)), min(at(11, 10)));
  assert.equal(min(m.earliestStart('2026-09-09', 360, now)), min(at(15, 10)), 'с записанными окно шире');
  assert.equal(m.earliestStart('2026-09-10', 120, now), null, 'завтра доступно целиком');
  assert.equal(m.earliestStart('2026-09-08', 120, now), Infinity, 'вчера недоступно');
  assert.equal(m.earliestStart('2026-09-09', 120, new Date('2026-09-09T21:30:00')), Infinity, 'до 23:00 не успеть');
});

test('прошедшее занятие остаётся в прошлом', () => {
  const now = new Date('2026-09-09T12:20:00');
  assert.equal(min(m.latestEnd('2026-09-09', now)), min(at(12, 20)), 'сегодня — конец не позже «сейчас»');
  assert.equal(m.latestEnd('2026-09-08', now), null, 'вчера — без предела');
  assert.equal(m.latestEnd('2026-09-10', now), -Infinity, 'завтра прошлого нет');
  assert.equal(m.latestEnd('2026-09-09', new Date('2026-09-09T07:02:00')), -Infinity, 'день едва начался');
});

const original = {
  id: 1, serviceId: 3, title: 'Хатха', date: '2026-09-09', timeStart: at(8), timeEnd: at(8, 55),
  trainer: 5, hall: 'The Loft', maxClients: 16, price: 500, level: '', equipment: 'Коврик',
};
const draftOf = patch => ({ ...m.draftOf(original), ...patch });

test('изменения считаются по каждому полю отдельно', () => {
  assert.deepEqual([...m.changesOf(original, draftOf({}))], []);
  assert.deepEqual([...m.changesOf(original, draftOf({ maxClients: '18' }))], ['capacity']);
  assert.deepEqual([...m.changesOf(original, draftOf({ date: '2026-09-10' }))], ['date']);
  assert.deepEqual([...m.changesOf(original, draftOf({ timeEnd: at(9) }))], ['time']);
  assert.deepEqual([...m.changesOf(original, draftOf({ trainer: 6, hall: 'Flow' }))], ['trainer', 'hall']);
  assert.deepEqual([...m.changesOf(original, draftOf({ serviceId: 4 }))], ['service']);
  assert.deepEqual([...m.changesOf(original, draftOf({ title: 'Хатха для начинающих' }))], ['name']);
  assert.deepEqual([...m.changesOf(original, draftOf({ title: ' Хатха ' }))], [], 'пробелы по краям — не правка');
  assert.deepEqual([...m.changesOf(original, draftOf({ price: '650' }))], ['price']);
  assert.deepEqual([...m.changesOf(original, draftOf({ level: 'Начинающие', equipment: 'Блоки' }))],
    ['level', 'equipment']);
});

test('черновик из карточки — та же карточка, ничего не изменено', () => {
  const draft = m.draftOf(original);
  assert.equal(draft.price, '500');
  assert.equal(draft.priceEdited, false);
  assert.deepEqual([...m.changesOf(original, draft)], []);
});

test('уведомление записанным — о всём, что они видят; места — тихие', () => {
  assert.equal(m.notifiesClients(['capacity']), false);
  assert.equal(m.notifiesClients(['trainer', 'service']), true);
  assert.equal(m.notifiesClients(['name']), true);
  assert.equal(m.notifiesClients(['price']), true);
  assert.equal(m.notifiesClients(['time']), true);
  assert.equal(m.notifiesClients(['date']), true);
  assert.equal(m.notifiesClients(['hall']), true);
});

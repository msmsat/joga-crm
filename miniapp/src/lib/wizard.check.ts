/**
 * Самопроверка мастера записи с главной: `node src/lib/wizard.check.ts`.
 *
 * Держит то, что легко сломать и трудно заметить руками: каждый раздел
 * показывает только совместимое с уже выбранным, «любой мастер» берёт общие
 * окна, филиал выводится сам, а после выбора лист ведёт в ближайший
 * невыбранный раздел.
 */
import assert from 'node:assert/strict';
import type { ResourceStaffMember, ServiceDayRow } from '../api/hybrid.types';
import { ANY } from './bookingPage.ts';
import {
  branchChoices, branchOf, emptyPick, freeTimes, groupMinutes, hhmm, isComplete, masterChoices, minutesOf,
  nextStep, offerAny, onService, reconcileTime, serviceChoices, shownStep, soloOf, stepsFor, withSoloMaster,
  STEPS, type WizardPick,
} from './wizard.ts';

let passed = 0;
const check = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const member = (teacher_id: number, service_ids: number[], branch_ids: number[] = [1]): ResourceStaffMember => ({
  teacher_id, name: `M${teacher_id}`, last_name: null, photo_url: null, department: null, service_ids, branch_ids,
  service_prices: {}, service_price_strs: {}, service_durations: {},
});
const row = (service_id: number, branch_id: number, byTeacher: Record<number, string[]>): ServiceDayRow => {
  const free_by_teacher = Object.fromEntries(Object.entries(byTeacher).map(([id, times]) => [id, times.map(minutesOf)]));
  const free = [...new Set(Object.values(free_by_teacher).flat())].sort((a, b) => a - b);
  return { service_id, branch_id, reason: null, free, free_by_teacher };
};

// Анна (10) — стрижка (1) и борода (2) в филиале 1; Борис (20) — только
// стрижка, в филиалах 1 и 2.
const anna = member(10, [1, 2]);
const boris = member(20, [1], [1, 2]);
const staff = [anna, boris];
const rows = [
  row(1, 1, { 10: ['10:00', '11:00'], 20: ['11:00', '18:00'] }),
  row(1, 2, { 20: ['09:00', '11:00'] }),
  row(2, 1, { 10: ['10:00', '14:00'] }),
];
const day = '2026-10-02';
const at = (over: Partial<WizardPick>): WizardPick => ({ ...emptyPick(day), ...over });

check('время без услуги и мастера — все окна дня', () => {
  assert.deepEqual(freeTimes(rows, at({})).map(hhmm), ['09:00', '10:00', '11:00', '14:00', '18:00']);
});
check('выбранные услуга и мастер сужают время', () => {
  assert.deepEqual(freeTimes(rows, at({ serviceId: 2 })).map(hhmm), ['10:00', '14:00']);
  assert.deepEqual(freeTimes(rows, at({ master: 20 })).map(hhmm), ['09:00', '11:00', '18:00']);
  assert.deepEqual(freeTimes(rows, at({ serviceId: 1, master: ANY })).map(hhmm), ['09:00', '10:00', '11:00', '18:00']);
});
check('названный час оставляет только свободные услуги и мастеров', () => {
  const at18 = at({ time: minutesOf('18:00') });
  assert.deepEqual(serviceChoices([1, 2], staff, rows, at18), [1]);
  assert.deepEqual(masterChoices(staff, rows, at18).map((m) => m.teacher_id), [20]);
  const at10 = at({ time: minutesOf('10:00'), serviceId: 1 });
  assert.deepEqual(masterChoices(staff, rows, at10).map((m) => m.teacher_id), [10]);
});
check('без времени мастер сужает услуги своим списком, а не снимком дня', () => {
  assert.deepEqual(serviceChoices([1, 2], staff, rows, at({ master: 20 })), [1]);
  assert.deepEqual(serviceChoices([1, 2], staff, [], at({})), [1, 2], 'день без окон не прячет услуги');
  assert.deepEqual(masterChoices(staff, rows, at({ serviceId: 2 })).map((m) => m.teacher_id), [10]);
});
check('филиал выводится сам, когда он один, и спрашивается, когда их два', () => {
  const both = at({ serviceId: 1, master: 20, time: minutesOf('11:00') });
  assert.deepEqual(branchChoices(rows, both), [1, 2]);
  assert.equal(branchOf(rows, both), null);
  assert.equal(branchOf(rows, { ...both, branchId: 2 }), 2);
  const one = at({ serviceId: 1, master: 20, time: minutesOf('18:00') });
  assert.equal(branchOf(rows, one), 1);
  assert.equal(branchOf(rows, { ...one, branchId: 2 }), 1, 'неподходящий филиал не держится');
});
check('филиал с главной: время, услуги и мастера — только его', () => {
  // Филиал 2 — только Борис со стрижкой в 09:00 и 11:00.
  const inSecond = at({ branchId: 2 });
  assert.deepEqual(freeTimes(rows, inSecond).map(hhmm), ['09:00', '11:00'], 'окна других адресов не предлагаются');
  const at11 = at({ branchId: 2, time: minutesOf('11:00') });
  assert.deepEqual(serviceChoices([1, 2], staff, rows, at11), [1], 'борода в филиале 2 не делается');
  assert.deepEqual(masterChoices(staff, rows, at11).map((m) => m.teacher_id), [20], 'Анна во втором филиале не принимает');
  // Тот же час есть и в филиале 1, но выбор уже сделан — запись идёт во второй.
  assert.equal(branchOf(rows, { ...at11, serviceId: 1, master: 20 }), 2);
});
check('после выбора лист ведёт в ближайший невыбранный раздел', () => {
  assert.equal(nextStep(at({ time: 600 }), 'time'), 'service');
  assert.equal(nextStep(at({ master: 10 }), 'master'), 'time');
  assert.equal(nextStep(at({ master: 10, time: 600 }), 'time'), 'service');
  const full = at({ master: 10, time: 600, serviceId: 1 });
  assert.equal(isComplete(full), true);
  assert.equal(nextStep(full, 'service'), 'summary');
});
check('смена услуги снимает мастера, который её не делает', () => {
  assert.equal(onService(at({ master: 20 }), 2, staff).master, null);
  assert.equal(onService(at({ master: 10 }), 2, staff).master, 10);
  assert.equal(onService(at({ master: ANY }), 2, staff).master, ANY);
});
check('время, которого в новом дне нет, снимается', () => {
  assert.equal(reconcileTime(at({ time: minutesOf('14:00') }), rows).time, minutesOf('14:00'));
  assert.equal(reconcileTime(at({ time: minutesOf('07:00') }), rows).time, null);
  assert.equal(reconcileTime(at({ time: minutesOf('14:00'), master: 20 }), rows).time, null);
});
check('части дня и «любой мастер»', () => {
  assert.deepEqual(groupMinutes([540, 720, 1020]).map((g) => g.part), ['morning', 'afternoon', 'evening']);
  assert.equal(offerAny([anna]), false);
  assert.equal(offerAny(staff), true);
});

check('мастер один — раздела «Мастер» нет, мастер подставляется сам', () => {
  assert.deepEqual(stepsFor(true), ['time', 'service', 'summary']);
  assert.deepEqual(stepsFor(false), STEPS);
  assert.equal(shownStep('master', stepsFor(true)), 'summary', 'скрытый раздел ведёт на итог');
  assert.equal(shownStep('service', stepsFor(true)), 'service');
  assert.equal(soloOf([anna]), 10);
  assert.equal(soloOf(staff), null);
  assert.equal(soloOf([]), null);
  const solo = withSoloMaster({ ...emptyPick('2026-10-01'), time: minutesOf('10:00'), serviceId: 1 }, 10);
  assert.equal(solo.master, 10);
  assert.ok(isComplete(solo), 'время и услуга — и запись сложилась');
  assert.equal(nextStep(withSoloMaster({ ...emptyPick('2026-10-01'), serviceId: 1 }, 10), 'service'), 'time');
  assert.equal(nextStep(solo, 'service'), 'summary', 'после услуги — сразу итог, мимо мастера');
  assert.equal(withSoloMaster({ ...emptyPick('2026-10-01'), master: ANY }, 10).master, ANY, 'названное не перебивается');
  const untouched = emptyPick('2026-10-01');
  assert.equal(withSoloMaster(untouched, null), untouched, 'мастеров несколько — выбор тот же');
});

console.log(`ALL PASS — ${passed} проверок мастера записи`);

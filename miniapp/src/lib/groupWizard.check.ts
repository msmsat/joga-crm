/**
 * Самопроверка группового мастера записи: `node src/lib/groupWizard.check.ts`.
 *
 * Держит то, что легко сломать и трудно заметить руками: предлагаются только
 * занятия, куда можно записаться; час, направление и тренер сужают друг друга;
 * занятие выводится из часа, когда оно в нём одно, и лист ведёт на итог.
 */
import assert from 'node:assert/strict';
import type { LessonResponse } from '../api/lessons';
import {
  candidates, choose, daySlots, emptyGroupPick, focusLesson, groupTimes, isGroupChosen,
  isOffered, lessonOf, marksOf,
  nextGroupStep, nextMarked, openingDay, reconcileGroupTime, rhythmOf, serviceIdsOf, slotsByPart, teacherIdsOf, timesOf,
  withChoice, withDay, type GroupPick,
} from './groupWizard.ts';
import { hhmm, minutesOf } from './wizard.ts';

let passed = 0;
const check = (name: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const lesson = (
  id: number, time: string, service_id: number, teacher_id: number,
  over: Partial<LessonResponse> = {},
): LessonResponse => ({
  id, booking_mode: 'event', service_id, teacher_id, branch_id: 1, tz_iana: 'Europe/Prague',
  name: `S${service_id}`, level: '', equipment: '', total_spots: 10, teacher_name: `T${teacher_id}`,
  start_time: `2026-10-02T${time}:00`, duration_min: 60, price: 0, time, price_str: '', teacher: `T${teacher_id}`,
  color: '#000', badge: 'open', taken_spots: [], bookable: true, trial_available: false,
  coffee: { enabled: false, count: 0, joined: false, participants: [], spots: [] },
  ...over,
});

// Йога (1) — у Анны (10) в 09:00 и 18:00, у Бориса (20) в 18:00; пилатес (2) —
// у Анны в 12:00. Полное занятие в 07:00 и закрытое для записи в 21:00 не
// предлагаются; своя бронь в 20:00 — предлагается, хотя мест нет.
const day = [
  lesson(1, '09:00', 1, 10),
  lesson(2, '18:00', 1, 10),
  lesson(3, '18:00', 1, 20),
  lesson(4, '12:00', 2, 10),
  lesson(5, '07:00', 1, 20, { total_spots: 2, taken_spots: [1, 2] }),
  lesson(6, '21:00', 2, 20, { bookable: false }),
  lesson(7, '20:00', 2, 20, { total_spots: 1, taken_spots: [1], is_booked_by_user: true }),
];
const at = (over: Partial<GroupPick>): GroupPick => ({ ...emptyGroupPick('2026-10-02'), ...over });
const m = minutesOf;

check('предлагается только то, куда можно записаться, и своя бронь', () => {
  assert.deepEqual(day.filter(isOffered).map((row) => row.id), [1, 2, 3, 4, 7]);
  assert.deepEqual(groupTimes(day, at({})).map(hhmm), ['09:00', '12:00', '18:00', '20:00']);
});
check('направление и тренер сужают часы', () => {
  assert.deepEqual(groupTimes(day, at({ serviceId: 1 })).map(hhmm), ['09:00', '18:00']);
  assert.deepEqual(groupTimes(day, at({ teacherId: 20 })).map(hhmm), ['18:00', '20:00']);
  assert.deepEqual(groupTimes(day, at({ serviceId: 2, teacherId: 10 })).map(hhmm), ['12:00']);
});
check('час сужает направления и тренеров', () => {
  assert.deepEqual([...serviceIdsOf(day, at({ time: m('18:00') }))], [1]);
  assert.deepEqual([...teacherIdsOf(day, at({ time: m('18:00') }))].sort(), [10, 20]);
  assert.deepEqual([...teacherIdsOf(day, at({ time: m('12:00') }))], [10]);
});
check('занятие выводится из часа, когда оно одно', () => {
  assert.equal(lessonOf(day, at({ time: m('12:00') }))?.id, 4);
  const pick = at({ time: m('12:00') });
  assert.equal(nextGroupStep(pick, lessonOf(day, pick)), 'summary', 'одно занятие — сразу на итог');
  assert.ok(isGroupChosen(pick, lessonOf(day, pick), 'master'), 'тренер выведен из занятия');
});
check('несколько в один час — уточнять тем, что не названо', () => {
  const pick = at({ time: m('18:00') });
  assert.equal(candidates(day, pick).length, 2);
  assert.equal(lessonOf(day, pick), null, 'Анна и Борис — разные занятия, выбирать за человека нельзя');
  assert.equal(nextGroupStep(pick, null), 'service');
  assert.equal(nextGroupStep({ ...pick, serviceId: 1 }, null), 'master');
  assert.equal(lessonOf(day, { ...pick, teacherId: 20 })?.id, 3);
  assert.equal(lessonOf(day, choose(pick, day[1]))?.id, 2, 'выбор из списка делает час однозначным');
});
check('без часа записываться не на что — ведём во «Время»', () => {
  assert.equal(lessonOf(day, at({ serviceId: 2 })), null);
  assert.equal(nextGroupStep(at({ serviceId: 2 }), null), 'time');
  assert.equal(nextGroupStep(at({ teacherId: 10 }), null), 'time');
});
check('смена направления снимает час, в который его нет', () => {
  const pick = at({ time: m('09:00') });
  assert.equal(withChoice(day, pick, { serviceId: 2 }).time, null);
  assert.equal(withChoice(day, choose(pick, day[0]), { serviceId: 2 }).lessonId, null, 'вместе с часом уходит и карточка');
  assert.equal(withChoice(day, pick, { serviceId: 1 }).time, m('09:00'));
  assert.equal(withChoice(null, pick, { serviceId: 2 }).time, m('09:00'), 'день не пришёл — час не трогаем');
});
check('час, которого в пришедшем дне нет, снимается', () => {
  assert.equal(reconcileGroupTime(at({ time: m('10:00') }), day).time, null);
  assert.equal(reconcileGroupTime(at({ time: m('18:00') }), day).time, m('18:00'));
  assert.equal(reconcileGroupTime(at({ time: m('09:00'), teacherId: 20 }), day).time, null);
});
check('одинаковые занятия в один час — не тупик', () => {
  const twins = [lesson(11, '10:00', 3, 30, { branch_id: 1 }), lesson(12, '10:00', 3, 30, { branch_id: 2 })];
  assert.equal(lessonOf(twins, at({ time: m('10:00') }))?.id, 11);
  assert.equal(lessonOf(twins, choose(at({}), twins[1]))?.id, 12, 'карточка второго филиала ведёт во второй филиал');
  assert.equal(lessonOf(twins, { ...choose(at({}), twins[1]), teacherId: 31 }), null, 'выбранное карточкой не обходит фильтр');
});
check('подсказка строки — часы её занятий в дне', () => {
  assert.deepEqual(timesOf(day, (row) => row.teacher_id === 20).map(hhmm), ['18:00', '20:00']);
  assert.deepEqual(timesOf(day, (row) => row.service_id === 3), []);
});

check('карточки дня — все занятия по началу, с состоянием и местами', () => {
  const slots = daySlots(day, at({}));
  assert.deepEqual(slots.map((slot) => slot.lesson.id), [5, 1, 4, 2, 3, 7, 6], 'одновременные — по номеру');
  assert.deepEqual(slots.map((slot) => slot.state), ['full', 'open', 'open', 'open', 'open', 'mine', 'closed']);
  assert.equal(slots[1].left, 10);
  assert.equal(slots[0].left, 0);
  assert.equal(slotsByPart(slots).map((group) => group.part).join(), 'morning,afternoon,evening');
  assert.deepEqual(slotsByPart(daySlots(day, at({ serviceId: 2 }))).map((group) => group.part), ['afternoon', 'evening']);
});
check('полное и закрытое не прячутся — карточка погашена с причиной', () => {
  const state = (id: number) => daySlots(day, at({})).find((slot) => slot.lesson.id === id)?.state;
  assert.equal(state(5), 'full', 'мест нет');
  assert.equal(state(6), 'closed', 'студия закрыла запись');
  assert.equal(daySlots([lesson(8, '10:00', 1, 10, { bookable: false, total_spots: 1, taken_spots: [1] })], at({}))[0].state,
    'closed', 'закрыто и полно разом — закрыто: место не поможет');
  assert.deepEqual(daySlots(day, at({ serviceId: 1 })).map((slot) => slot.lesson.id), [5, 1, 2, 3], 'фильтр направления действует и на них');
  assert.deepEqual(daySlots(day, at({ teacherId: 10 })).map((slot) => slot.state), ['open', 'open', 'open'], 'у Анны закрытых нет');
  assert.equal(daySlots(day, at({ time: m('09:00') })).length, 7, 'выбранный час список не сужает');
});
check('карточка ведёт ровно в своё занятие, даже когда в час их несколько', () => {
  const pick = choose(at({}), day[2]);
  assert.equal(lessonOf(day, pick)?.id, 3);
  assert.equal(nextGroupStep(pick, lessonOf(day, pick)), 'summary');
  assert.ok(isGroupChosen(pick, lessonOf(day, pick), 'service'), 'направление выведено из занятия');
});
check('выбранная карточка не сужает «Время» — можно выбрать другую', () => {
  const pick = choose(at({}), day[2]);
  assert.equal(pick.serviceId, null);
  assert.equal(pick.teacherId, null);
  assert.equal(daySlots(day, pick).length, 7);
  assert.equal(lessonOf(day, choose(pick, day[3]))?.id, 4, 'другая карточка — другое занятие');
});
check('другой день снимает выбранное занятие, но не названное во вкладках', () => {
  const pick = { ...choose(at({ serviceId: 1 }), day[1]) };
  const moved = withDay(pick, '2026-10-03');
  assert.equal(moved.time, null);
  assert.equal(moved.lessonId, null);
  assert.equal(moved.serviceId, 1);
  assert.equal(withDay(pick, pick.day), pick, 'тот же день — тот же выбор');
});
check('занятие из QR-кода: открытое — на итог, полное и пропавшее — нет', () => {
  assert.equal(focusLesson(day, 2)?.id, 2);
  assert.equal(focusLesson(day, 7)?.id, 7, 'своя бронь на полном — на итог, там отмена');
  assert.equal(focusLesson(day, 5), null, 'мест нет');
  assert.equal(focusLesson(day, 99), null, 'отменили или прошло');
  assert.equal(lessonOf(day, choose(at({}), day[1]))?.id, 2, 'выбор складывается ровно в него');
});

// Лента: сегодня (02.10) пусто, 03.10 — утро и вечер, 05.10 — только день.
const strip = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
const marks = marksOf([
  { day: '2026-10-03', times: ['09:00', '18:30'] },
  { day: '2026-10-05', times: ['13:00'] },
]);
check('ритм дня — утро, день, вечер по порядку', () => {
  assert.deepEqual(rhythmOf(marks['2026-10-03']).map((row) => row.lit), [true, false, true]);
  assert.deepEqual(rhythmOf(marks['2026-10-05']).map((row) => row.lit), [false, true, false]);
  assert.deepEqual(rhythmOf([]).map((row) => row.lit), [false, false, false]);
});
check('ближайший день с занятиями', () => {
  assert.equal(nextMarked(strip, marks, '2026-10-02'), '2026-10-03');
  assert.equal(nextMarked(strip, marks, '2026-10-03'), '2026-10-05');
  assert.equal(nextMarked(strip, marks, '2026-10-05'), null);
});
check('пустой сегодняшний день не встречает человека — открываем ближайший', () => {
  const today = '2026-10-02';
  assert.equal(openingDay(at({ day: today }), today, strip, marks), '2026-10-03');
  assert.equal(openingDay(at({ day: '2026-10-04' }), today, strip, marks), '2026-10-04', 'выбранный руками день не трогаем');
  assert.equal(openingDay(at({ day: today, time: m('09:00') }), today, strip, marks), today, 'час уже выбран — не трогаем');
  assert.equal(openingDay(at({ day: today }), today, strip, {}), today, 'занятий нет нигде — остаёмся');
});

console.log(`ALL PASS — ${passed} проверок группового мастера записи`);

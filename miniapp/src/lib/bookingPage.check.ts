/**
 * Самопроверка экрана «Записатись»: `node src/lib/bookingPage.check.ts`.
 *
 * Держит поведение, которое сломать легко, а увидеть — только пройдя экран
 * руками: мастера видны без услуги, услуга только фильтрует, «любой мастер» не
 * тащит за собой прошлый teacher_id, закрытие листа ничего не забывает. И то,
 * что постоянного календаря над списком мастеров больше нет.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ResourceStaffMember } from '../api/hybrid.types';
import type { StudioService } from '../api/studio';
import {
  ANY, bookingPageReducer, choiceServices, initialBookingPage, masterPills, offeredServices,
  reconcile, sheetStep, showAnyMaster, teacherIdOf, visibleStaff, type BookingPageState,
} from './bookingPage.ts';
import {
  addDays, availabilityQuery, dayList, dayPart, daysBetween, firstDayWithSlots, firstFreeByTeacher,
  groupByDay, groupByPart, lastBookableDay, pageCount, pageRange, relativeDay, studioToday, timeOf,
} from './slots.ts';

const service = (id: number, name: string, over: Partial<StudioService> = {}): StudioService => ({
  id, name, booking_mode: 'resource', service_type: 'individual', buffer_before_min: 0, buffer_after_min: 0,
  is_bookable: true, terminology_profile: null, price: 500, price_str: '500 Kč', duration_min: 45,
  color: null, ...over,
});
const member = (teacher_id: number, name: string, service_ids: number[]): ResourceStaffMember => ({
  teacher_id, name, last_name: null, photo_url: null, department: null, service_ids,
});

// Каталог в порядке сервера (по названию) + то, чего на экране быть не должно.
const beard = service(1, 'Борода');
const shave = service(2, 'Гоління');
const haircut = service(3, 'Стрижка');
const styling = service(4, 'Укладка');
const yoga = service(5, 'Йога', { booking_mode: 'event', service_type: 'group' });
const archived = service(6, 'Архів', { is_bookable: false });
const services = [beard, shave, haircut, styling, yoga, archived];

const anna = member(10, 'Анна', [3, 1, 2, 4]);
const boris = member(20, 'Борис', [1]);
const olga = member(30, 'Ольга', [3, 5, 6]);
const staff = [anna, boris, olga];

let passed = 0;
const check = (title: string, run: () => void) => {
  try {
    run();
    passed += 1;
  } catch (error) {
    throw new Error(`${title}\n${(error as Error).message}`, { cause: error });
  }
};

const act = (state: BookingPageState, ...actions: Parameters<typeof bookingPageReducer>[1][]) =>
  actions.reduce(bookingPageReducer, state);

const start = initialBookingPage(171);

// ─── 1. Мастера без услуги ────────────────────────────────────────────────────
check('без услуги видны все мастера филиала', () => {
  assert.equal(start.serviceId, null);
  assert.deepEqual(visibleStaff(staff, start.serviceId).map((m) => m.teacher_id), [10, 20, 30]);
});

// ─── 2–3. Услуга фильтрует, снятие фильтра возвращает всех ────────────────────
check('услуга оставляет только тех, кто её оказывает', () => {
  const state = act(start, { type: 'service', serviceId: 3, staff });
  assert.equal(state.serviceId, 3);
  assert.deepEqual(visibleStaff(staff, state.serviceId).map((m) => m.teacher_id), [10, 30]);
});
check('повторное касание чипа и «Усі послуги» снимают фильтр', () => {
  const picked = act(start, { type: 'service', serviceId: 3, staff });
  assert.equal(act(picked, { type: 'service', serviceId: 3, staff }).serviceId, null);
  const all = act(picked, { type: 'service', serviceId: null, staff });
  assert.equal(all.serviceId, null);
  assert.equal(visibleStaff(staff, all.serviceId).length, 3);
});
check('в чипах только услуги, на которые можно записаться и которые кто-то оказывает', () => {
  assert.deepEqual(offeredServices(staff, services).map((s) => s.id), [1, 2, 3, 4]);
  assert.deepEqual(offeredServices([boris], services).map((s) => s.id), [1]);
});

// ─── 4. Услуги мастера на карточке ────────────────────────────────────────────
check('у мастера его услуги: в порядке каталога, «ещё N», выбранная — первой', () => {
  const plain = masterPills(anna, services, null);
  assert.deepEqual(plain.shown.map((s) => s.name), ['Борода', 'Гоління', 'Стрижка']);
  assert.equal(plain.more, 1);
  const filtered = masterPills(anna, services, 4);
  assert.equal(filtered.shown[0].name, 'Укладка');
  assert.equal(filtered.more, 1);
  // Групповая и архивная услуга карточку не засоряют.
  assert.deepEqual(masterPills(olga, services, null), { shown: [haircut], more: 0 });
});

// ─── 5. Мастер без услуги → услуги ЭТОГО мастера ──────────────────────────────
check('мастер без выбранной услуги открывает выбор его услуг', () => {
  const state = act(start, { type: 'openMaster', master: 10, staff, services });
  assert.equal(sheetStep(state), 'service');
  assert.equal(state.sheet?.canPickService, true);
  assert.deepEqual(choiceServices(10, staff, services).map((s) => s.id), [1, 2, 3, 4]);
  const picked = act(state, { type: 'pickService', serviceId: 2 });
  assert.equal(sheetStep(picked), 'time');
  assert.equal(picked.serviceId, 2, 'выбранная в листе услуга становится фильтром страницы');
  const back = act(picked, { type: 'backToServices' });
  assert.equal(sheetStep(back), 'service');
  assert.equal(back.serviceId, null);
  assert.equal(back.master, 10);
});
check('у мастера одна услуга — лишнего шага нет', () => {
  const state = act(start, { type: 'openMaster', master: 20, staff, services });
  assert.equal(sheetStep(state), 'time');
  assert.equal(state.sheet?.serviceId, 1);
  assert.equal(state.sheet?.canPickService, false);
  assert.equal(act(state, { type: 'backToServices' }), state, 'назад некуда');
});

// ─── 6. Мастер с услугой → сразу время ────────────────────────────────────────
check('мастер при выбранной услуге открывает сразу время', () => {
  const state = act(start, { type: 'service', serviceId: 3, staff }, { type: 'openMaster', master: 30, staff, services });
  assert.equal(sheetStep(state), 'time');
  assert.deepEqual(state.sheet, { master: 30, serviceId: 3, canPickService: false });
});

// ─── 7. «Любой мастер» очищает teacher_id ─────────────────────────────────────
check('«любой мастер» не тащит прошлый teacher_id', () => {
  const state = act(
    start,
    { type: 'service', serviceId: 3, staff },
    { type: 'openMaster', master: 10, staff, services },
    { type: 'close' },
    { type: 'openMaster', master: ANY, staff, services },
  );
  assert.equal(state.sheet?.master, ANY);
  assert.equal(teacherIdOf(state.sheet!.master), null);
  const query = availabilityQuery({
    serviceId: 3, branchId: 171, teacherId: teacherIdOf(state.sheet!.master), from: '2026-09-14', to: '2026-09-27',
  });
  assert.equal('teacher_id' in query, false, 'ключа teacher_id нет вовсе');
  assert.equal(
    availabilityQuery({ serviceId: 3, branchId: 171, teacherId: 10, from: '2026-09-14', to: '2026-09-14' }).teacher_id,
    10,
  );
  // «Любой» без услуги предлагает все услуги филиала.
  assert.equal(sheetStep(act(start, { type: 'openMaster', master: ANY, staff, services })), 'service');
  assert.equal(showAnyMaster(visibleStaff(staff, 1)), true);
  assert.equal(showAnyMaster([boris]), false, 'из одного выбирать нечего');
});

// ─── 8. Закрытие листа ничего не забывает ─────────────────────────────────────
check('закрытие листа сохраняет услугу и мастера', () => {
  const state = act(
    start,
    { type: 'openMaster', master: 10, staff, services },
    { type: 'pickService', serviceId: 4 },
    { type: 'close' },
  );
  assert.equal(state.sheet, null);
  assert.equal(state.serviceId, 4);
  assert.equal(state.master, 10);
});
check('после записи мастер снят, фильтр услуги остаётся', () => {
  const state = act(start, { type: 'service', serviceId: 3, staff }, { type: 'openMaster', master: 10, staff, services }, { type: 'booked' });
  assert.deepEqual([state.serviceId, state.master, state.sheet], [3, null, null]);
});

// ─── 9. Смена услуги сбрасывает несовместимого мастера ────────────────────────
check('смена услуги: несовместимый мастер сброшен, совместимый сохранён', () => {
  const chosen = act(start, { type: 'openMaster', master: 10, staff, services }, { type: 'pickService', serviceId: 3 }, { type: 'close' });
  assert.equal(act(chosen, { type: 'service', serviceId: 1, staff }).master, 10, 'Анна делает бороду');
  const olgaChosen = act(start, { type: 'service', serviceId: 3, staff }, { type: 'openMaster', master: 30, staff, services }, { type: 'close' });
  assert.equal(act(olgaChosen, { type: 'service', serviceId: 1, staff }).master, null, 'Ольга бороду не делает');
  assert.equal(act(olgaChosen, { type: 'service', serviceId: null, staff }).master, 30, 'без фильтра она на месте');
});
check('смена филиала сбрасывает всё', () => {
  const chosen = act(start, { type: 'service', serviceId: 3, staff }, { type: 'openMaster', master: 30, staff, services });
  assert.deepEqual(act(chosen, { type: 'branch', branchId: 172 }), initialBookingPage(172));
});
check('свежий список мастеров не показывает исчезнувший выбор', () => {
  const chosen = act(start, { type: 'service', serviceId: 2, staff }, { type: 'openMaster', master: 10, staff, services }, { type: 'close' });
  const without = reconcile(chosen, [boris, olga], services);
  assert.deepEqual([without.serviceId, without.master], [null, null]);
  assert.equal(reconcile(chosen, null, services), chosen, 'нет ответа — ничего не решаем');
  assert.equal(reconcile(chosen, staff, services), chosen);
});

// ─── 10. Постоянного календаря над списком мастеров нет ───────────────────────
check('экран индивидуальной записи не рисует ленту недели', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const path of [
    '../pages/booking/BookingPage.tsx',
    '../pages/booking/components/ServiceFilter.tsx',
    '../pages/booking/components/MasterCard.tsx',
    '../pages/booking/components/BookingSheet.tsx',
    '../components/booking/ResourceBookingSheet.tsx',
    '../components/booking/TimeStep.tsx',
  ]) {
    assert.doesNotMatch(read(path), /WeekRail/, `${path} снова тянет WeekRail`);
  }
  const schedule = read('../pages/shedule.tsx');
  assert.doesNotMatch(schedule, /WeekRail/, 'лента недели живёт только в EventSchedule');
  assert.match(read('../pages/schedule/EventSchedule.tsx'), /<WeekRail/, 'у групп расписание по дням осталось');
});

// ─── Время — строкой студии, не часовым поясом телефона ───────────────────────
check('сегодня считается в поясе студии', () => {
  // 23:30 UTC 14 сентября — в Праге уже 15-е, в Нью-Йорке ещё 14-е.
  const moment = new Date(Date.UTC(2026, 8, 14, 23, 30));
  assert.equal(studioToday('Europe/Prague', moment), '2026-09-15');
  assert.equal(studioToday('America/New_York', moment), '2026-09-14');
  assert.match(studioToday('Not/AZone', moment), /^\d{4}-\d{2}-\d{2}$/);
});
check('арифметика дней не спотыкается о месяц, год и перевод часов', () => {
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-09-14', '2026-10-05'), 21);
  assert.deepEqual(dayList('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.equal(relativeDay('2026-09-15', '2026-09-14'), 'tomorrow');
  assert.equal(relativeDay('2026-09-17', '2026-09-14'), null);
});
check('горизонт студии режется на страницы по две недели', () => {
  const today = '2026-09-14';
  const last = lastBookableDay(today, 21);
  assert.equal(last, '2026-10-05');
  assert.equal(pageCount(today, last), 2);
  assert.deepEqual(pageRange(today, 0, last), { from: '2026-09-14', to: '2026-09-27' });
  assert.deepEqual(pageRange(today, 1, last), { from: '2026-09-28', to: '2026-10-05' });
  assert.equal(pageRange(today, 2, last), null);
  assert.equal(pageCount(today, lastBookableDay(today, 0)), 1);
});
check('слоты группируются по дням и частям дня срезом строки', () => {
  const slot = (local_start: string, teacher_ids: number[]) => ({ starts_at: `${local_start}Z`, local_start, tz_iana: 'Europe/Prague', teacher_ids });
  const slots = [
    slot('2026-09-15T09:00:00', [10]), slot('2026-09-15T12:30:00', [10, 20]),
    slot('2026-09-15T18:15:00', [20]), slot('2026-09-17T11:00:00', [30]),
  ];
  assert.equal(timeOf(slots[1].local_start), '12:30');
  assert.equal(dayPart('2026-09-15T11:59:00'), 'morning');
  assert.equal(dayPart('2026-09-15T17:00:00'), 'evening');
  const days = groupByDay(slots);
  assert.deepEqual([...days.keys()], ['2026-09-15', '2026-09-17']);
  assert.deepEqual(groupByPart(days.get('2026-09-15')!).map((g) => g.part), ['morning', 'afternoon', 'evening']);
  assert.deepEqual([...firstFreeByTeacher(slots)], [[10, '2026-09-15T09:00:00'], [20, '2026-09-15T12:30:00'], [30, '2026-09-17T11:00:00']]);
  const strip = dayList('2026-09-14', '2026-09-18');
  assert.equal(firstDayWithSlots(strip, days), '2026-09-15');
  assert.equal(firstDayWithSlots(strip, days, '2026-09-16'), '2026-09-17');
});

console.log(`ALL PASS — ${passed} проверок экрана «Записатись»`);

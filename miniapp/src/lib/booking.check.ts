/** Самопроверка решений листа брони: `node src/lib/booking.check.ts`. */
import { bookingState } from './booking.ts';
import type { LessonResponse } from '../api/lessons';

const lesson = (over: Partial<LessonResponse>): LessonResponse =>
  ({
    id: 1, name: 'Хатха', level: '', equipment: '', total_spots: 8, teacher_name: 'Олена',
    start_time: '2026-08-18T12:00:00', duration_min: 60, price: 2000, time: '12:00',
    price_str: '2 000 Kč', teacher: 'Олена', color: '#F9A08B', badge: 'open', taken_spots: [],
    bookable: true, trial_available: false,
    coffee: { enabled: false, count: 0, joined: false, participants: [], spots: [] },
    ...over,
  }) as LessonResponse;

type Case = [string, LessonResponse | null, boolean, BookingExpectation];
interface BookingExpectation {
  action: ReturnType<typeof bookingState>['action'];
  showGrid: boolean;
}

const cases: Case[] = [
  ['свободное занятие — запись', lesson({}), false, { action: 'book', showGrid: true }],
  [
    'студия дарит первое занятие — цена на кнопке не звучит',
    lesson({ trial_available: true }), false, { action: 'book_trial', showGrid: true },
  ],
  [
    'уже записан, повтор выключен — только отмена, сетки нет',
    lesson({ is_booked_by_user: true }), false, { action: 'cancel_booking', showGrid: false },
  ],
  [
    'уже записан, повтор включён — второй коврик и сетка',
    lesson({ is_booked_by_user: true }), true, { action: 'book_more', showGrid: true },
  ],
  [
    'повтор включён, но занятие закрыто правилами — только отмена',
    lesson({ is_booked_by_user: true, bookable: false }), true,
    { action: 'cancel_booking', showGrid: false },
  ],
  [
    'закрыто правилами и брони нет — записаться нельзя, сетки нет',
    lesson({ bookable: false }), false, { action: 'not_bookable', showGrid: false },
  ],
  ['занятия ещё нет (лист открывается пустым)', null, false, { action: 'book', showGrid: true }],
];

for (const [title, value, allowRepeat, expected] of cases) {
  const state = bookingState(value, allowRepeat);
  if (state.action !== expected.action || state.showGrid !== expected.showGrid) {
    throw new Error(
      `${title}: ждали ${expected.action}/grid=${expected.showGrid}, ` +
        `получили ${state.action}/grid=${state.showGrid}`,
    );
  }
}

// Кнопка записи не смеет называться оплатой ни в одном состоянии: денег эта
// кнопка не берёт никогда (см. bookingState).
const actions = new Set(cases.map(([, value, repeat]) => bookingState(value, repeat).action));
if ([...actions].some((action) => action.includes('pay'))) {
  throw new Error('кнопка брони снова обещает оплату');
}

console.log(`ALL PASS — ${cases.length} состояний листа брони`);

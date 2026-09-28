// Запись в прошлое: тап по прошедшей клетке журнала не ставит занятие задним
// числом, а спрашивает про ближайший такой же час впереди.
import { toDateStr } from '../../../utils';

/** Ближе этого сервер занятие не ставит (lessons.py, MIN_CREATE_LEAD = 3 ч):
    предлагать сегодняшний час, который он всё равно отклонит, незачем. */
const LEAD_MIN = 180;

const minuteOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** День и время уже прошли. */
export function isPastSlot(date: string, time: string, now = new Date()) {
  const today = toDateStr(now);
  if (date !== today) return date < today;
  return minuteOf(time) < now.getHours() * 60 + now.getMinutes();
}

/** Тот же час впереди: сегодня, если до него хватает времени, иначе завтра. */
export function nextSameTime(time: string, now = new Date()) {
  const day = new Date(now);
  if (minuteOf(time) < now.getHours() * 60 + now.getMinutes() + LEAD_MIN) day.setDate(day.getDate() + 1);
  return { date: toDateStr(day), time };
}

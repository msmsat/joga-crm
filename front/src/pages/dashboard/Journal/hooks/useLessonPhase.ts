// Где занятие относительно «сейчас»: впереди, идёт или прошло.
//
// Часы общие на всю сетку: один таймер, сколько бы карточек ни было на экране,
// и тикает он, только пока на него кто-то подписан. Карточка перерисовывается
// не на каждый тик, а когда меняется ЕЁ фаза — useSyncExternalStore сравнивает
// строку, а строка у сорока карточек из пятидесяти не меняется весь день.
// Каждый тик перерисовывается только полоса хода идущего занятия (useClock).
import { useSyncExternalStore } from 'react';
import type { Booking } from '../types';

export type LessonPhase = 'upcoming' | 'live' | 'done';

const TICK_MS = 20_000;
const listeners = new Set<() => void>();
let now = Date.now();
let timer: number | undefined;

const tick = () => {
  now = Date.now();
  listeners.forEach(listener => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = window.setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
};

/** Начало и конец занятия в мс. Время — местное студии, сверяется с часами
 *  устройства: у стойки они совпадают (то же допущение, что utils.isLessonStarted). */
export const lessonSpan = (b: Pick<Booking, 'date' | 'timeStart' | 'timeEnd'>) => {
  if (!b.date) return null;
  const day = new Date(`${b.date}T00:00:00`).getTime();
  return {
    start: day + Math.round((b.timeStart + 7) * 60) * 60_000,
    end: day + Math.round((b.timeEnd + 7) * 60) * 60_000,
  };
};

export const phaseOf = (b: Pick<Booking, 'date' | 'timeStart' | 'timeEnd'>, at: number): LessonPhase => {
  const span = lessonSpan(b);
  if (!span || at < span.start) return 'upcoming';
  return at < span.end ? 'live' : 'done';
};

export function useLessonPhase(b: Pick<Booking, 'date' | 'timeStart' | 'timeEnd'>): LessonPhase {
  return useSyncExternalStore(subscribe, () => phaseOf(b, now), () => 'upcoming');
}

/** «Сейчас» с шагом тика — только для того, что обязано двигаться каждый тик
 *  (ход идущего занятия). Таких элементов на экране один-два. */
export function useClock(): number {
  return useSyncExternalStore(subscribe, () => now, () => now);
}

/** Шаг часов: столько длится плавный переход между двумя тиками. */
export const CLOCK_STEP_MS = TICK_MS;

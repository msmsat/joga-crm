import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { scheduleApi } from '../../../../api/schedule';
import { queryKeys } from '../../../../api/queryKeys';
import type { LessonDetail } from '../../../../api/schedule/schedule.types';
import type { Booking } from '../types';

/**
 * Подробности занятия (записанные, адрес, оплата) — заранее, по наведению и
 * касанию карточки в сетке.
 *
 * Без этого попап открывался «пустым» и дорастал на глазах, когда приходил
 * ответ: на телефоне шит прыгал верхним краем, на ноутбуке — список записанных
 * выскакивал снизу. От наведения до клика проходит больше, чем идёт запрос, и
 * попап открывается сразу целиком.
 *
 * Свежесть держится коротким окном и сбросом при закрытии попапа
 * (dropLessonDetail): всё, что меняется внутри попапа, меняется при открытом
 * попапе, а следующее открытие спрашивает сервер заново.
 */

/** Сколько подтянутое заранее годится для открытия попапа. */
const FRESH_MS = 10_000;
/** Курсор задержался на карточке — значит, целится в неё, а не проезжает мимо. */
const HOVER_MS = 120;

const keyOf = (b: Booking) =>
  queryKeys.journalLessonDetail(b.id, [b.price, b.timeStart, b.timeEnd, b.trainer, b.clients, b.status].join('|'));

const request = (b: Booking) => ({
  queryKey: keyOf(b),
  queryFn: () => scheduleApi.getLesson(b.id),
  staleTime: FRESH_MS,
  retry: false,
});

/** Уже подтянутое и ещё свежее — чтобы попап отрисовался с ним с первого кадра. */
export function cachedLessonDetail(qc: QueryClient, b: Booking): LessonDetail | null {
  const state = qc.getQueryState<LessonDetail>(keyOf(b));
  return state?.data && Date.now() - state.dataUpdatedAt < FRESH_MS ? state.data : null;
}

/** Подробности занятия: свежее подтянутое — из кэша, иначе (или fresh) — с сервера. */
export function fetchLessonDetail(qc: QueryClient, b: Booking, fresh = false): Promise<LessonDetail> {
  return qc.fetchQuery({ ...request(b), staleTime: fresh ? 0 : FRESH_MS });
}

/** Попап закрыт — подтянутое о нём больше не годится. */
export function dropLessonDetail(qc: QueryClient, id: number) {
  qc.removeQueries({ queryKey: queryKeys.journalLessonDetailAll(id) });
}

/**
 * prefetch(b) — курсор на карточке (запрос после короткой паузы);
 * prefetch(b, true) — касание или нажатие (сразу); prefetch(null) — курсор ушёл.
 */
export function usePrefetchLesson() {
  const qc = useQueryClient();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useCallback((b: Booking | null, now = false) => {
    window.clearTimeout(timer.current);
    // Оптимистичная карточка (id < 0): на сервере её ещё нет.
    if (!b || b.id < 0) return;
    const run = () => { void qc.prefetchQuery(request(b)); };
    if (now) run();
    else timer.current = window.setTimeout(run, HOVER_MS);
  }, [qc]);
}

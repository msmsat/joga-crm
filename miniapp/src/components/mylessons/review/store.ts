import { useSyncExternalStore } from 'react';
import { rateReservation, type ReservationResponse } from '../../../api/user';

/**
 * Оценка и отзыв каждой прошедшей брони — вне состояния страницы.
 *
 * Раньше оценки и «отскоки» сердечек жили в `MyLessons`, и тап по сердечку
 * перерисовывал весь раздел: замерено 1000–1680 компонентов за 3–5 коммитов
 * (таймер отскока на каждое сердечко) и 300–500 мс до кадра при CPU ×4.
 * Теперь на запись подписан только блок отзыва своей брони — карточка в
 * списке и лист занятия, — и тап стоит один коммит этого блока.
 */
export type Review = { rating: number; text: string | null; photos: string[] };

const EMPTY: Review = { rating: 0, text: null, photos: [] };
const entries = new Map<number, Review>();
const listeners = new Map<number, Set<() => void>>();
const subscribers = new Map<number, (onChange: () => void) => () => void>();
/** Номер последней отправленной оценки брони: ответ на устаревшую не откатывает новую. */
const latest = new Map<number, number>();
let ticket = 0;

const emit = (id: number) => listeners.get(id)?.forEach((notify) => notify());

const same = (a: Review, b: Review) =>
  a.rating === b.rating && a.text === b.text && a.photos.join('|') === b.photos.join('|');

function subscriber(id: number) {
  let subscribe = subscribers.get(id);
  if (!subscribe) {
    subscribe = (onChange) => {
      const set = listeners.get(id) ?? new Set();
      set.add(onChange);
      listeners.set(id, set);
      return () => {
        set.delete(onChange);
      };
    };
    subscribers.set(id, subscribe);
  }
  return subscribe;
}

export const getReview = (id: number): Review => entries.get(id) ?? EMPTY;

export function useReview(id: number): Review {
  return useSyncExternalStore(subscriber(id), () => getReview(id));
}

function put(id: number, next: Review) {
  if (same(getReview(id), next) && entries.has(id)) return;
  entries.set(id, next);
  emit(id);
}

/** Данные сервера после загрузки списка. Оценку, которая ещё летит, не трогаем:
 *  перечитанный список пришёл бы со старой и мигнул бы ею. */
export function seedReviews(list: { reservation_id: number; rating: number | null; review_text: string | null; review_photos?: string[] }[]) {
  for (const item of list) {
    if (latest.has(item.reservation_id)) continue;
    put(item.reservation_id, {
      rating: item.rating ?? 0,
      text: item.review_text ?? null,
      photos: item.review_photos ?? [],
    });
  }
}

/** Ответ сервера на отправленный отзыв. */
export function applySaved(id: number, res: ReservationResponse) {
  put(id, {
    rating: res.rating ?? getReview(id).rating,
    text: res.review_text ?? null,
    photos: res.review_photos ?? [],
  });
}

/** Оценка сразу на экране, запрос — следом. Отказ возвращает прежнюю и
 *  пробрасывается вызывающему: текст отказа пишет сервер. */
export async function rate(id: number, rating: number): Promise<void> {
  const before = getReview(id);
  if (before.rating === rating) return;
  const mine = ++ticket;
  latest.set(id, mine);
  put(id, { ...before, rating });
  try {
    await rateReservation(id, rating);
  } catch (error) {
    if (latest.get(id) === mine) put(id, { ...getReview(id), rating: before.rating });
    throw error;
  } finally {
    if (latest.get(id) === mine) latest.delete(id);
  }
}

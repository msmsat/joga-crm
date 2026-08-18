import type { LessonResponse } from '../api/lessons';

/** Что предлагает лист брони: главное действие и показывать ли сетку ковриков. */
export interface BookingState {
  /** У клиента уже есть бронь на это занятие. */
  isBooked: boolean;
  /** Правила студии закрыли занятие для онлайн-записи, своей брони при этом нет. */
  isClosed: boolean;
  /** Можно занять ЕЩЁ один коврик: «Повторная запись» включена, занятие открыто. */
  canBookMore: boolean;
  /** Показывать ли сетку ковриков: выбирать место, которое не забронировать, незачем. */
  showGrid: boolean;
  /** Подпись главной кнопки (ключ локали внутри `bookingModal`). */
  action: 'cancel_booking' | 'not_bookable' | 'book' | 'book_trial' | 'book_more';
}

/**
 * Решение листа брони — отдельной функцией от разметки, чтобы его можно было
 * проверить без DOM (`node src/lib/booking.check.ts`).
 *
 * Кнопка НИКОГДА не называется «Оплатить»: запись не берёт денег ни в одном из
 * случаев — занятие покрывает абонемент, дарит студия или клиент платит на
 * месте (гасить долг умеет только касса CRM).
 */
export function bookingState(
  lesson: LessonResponse | null,
  allowRepeat: boolean,
): BookingState {
  const isBooked = Boolean(lesson?.is_booked_by_user);
  const isClosed = lesson !== null && !lesson.bookable && !isBooked;
  const canBookMore = isBooked && allowRepeat && Boolean(lesson?.bookable);

  return {
    isBooked,
    isClosed,
    canBookMore,
    showGrid: !isClosed && (!isBooked || canBookMore),
    action: canBookMore
      ? 'book_more'
      : isBooked
        ? 'cancel_booking'
        : isClosed
          ? 'not_bookable'
          : lesson?.trial_available
            ? 'book_trial'
            : 'book',
  };
}

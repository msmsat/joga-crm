// «Удалить из журнала» отменённое занятие (история записей остаётся на
// сервере, уходит только карточка из сетки). Порядок — ради того, что видит
// человек: попап уходит, карточка растворяется на месте и только потом
// исчезает из кэша. Отказ сервера возвращает её (откат в мутации).
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../api/errorMessage';
import { useToast } from '../../../../components/ui/index';
import type { Booking } from '../types';
import type { useJournalMutations } from './useJournalMutations';

/** Длительность card-vanish в BookingCard.css. */
const VANISH_MS = 340;

function vanish(lessonId: number): Promise<void> {
  const cards = document.querySelectorAll<HTMLElement>(`.booking-card[data-booking-id="${lessonId}"]`);
  if (cards.length === 0) return Promise.resolve();
  // Атрибут, а не класс: className карточки ведёт React и перезаписал бы его
  // при ближайшей перерисовке — хотя бы когда с неё снимется выделение.
  cards.forEach(card => card.setAttribute('data-vanishing', ''));
  return new Promise(resolve => window.setTimeout(resolve, VANISH_MS));
}

interface LessonPurgeDeps {
  mutations: ReturnType<typeof useJournalMutations>;
  /** Отмена этого занятия, если она ещё ждёт в undo-тосте, уходит на сервер
   *  сейчас. false — сервер её не принял (тост с причиной уже показан). */
  settleCancel: (lessonId: number) => Promise<boolean>;
  closePopup: () => void;
}

export function useLessonPurge({ mutations, settleCancel, closePopup }: LessonPurgeDeps) {
  const toast = useToast();
  const { t } = useTranslation('journal');

  return useCallback(async (booking: Booking): Promise<boolean> => {
    // Отменили только что — на сервере занятие ещё живое, с записанными, и
    // DELETE его не пропустит. Сначала отмена, с уведомлениями клиентам.
    const cancelled = await settleCancel(booking.id);
    closePopup();
    if (!cancelled) return false;
    await vanish(booking.id);
    try {
      await mutations.purgeLesson(booking);
      toast.success(t('toasts.lessonDeleted'));
      return true;
    } catch (e) {
      toast.error(errorMessage(e, t));
      return false;
    }
  }, [mutations, settleCancel, closePopup, toast, t]);
}

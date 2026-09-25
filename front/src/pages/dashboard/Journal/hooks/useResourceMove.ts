import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '../../../../api/errorMessage';
import type { BookingRead, CrmRescheduleQuoteRequest } from '../../../../api/booking/hybrid.types';
import { useToast } from '../../../../components/ui/index';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { formatMoney } from '../../../../lib/money';
import type { Booking } from '../types';
import { indexToDateTime } from '../utils';
import type { useJournalMutations } from './useJournalMutations';
import type { HistoryEntry } from './useUndoHistory';

interface Params {
  halls: { id: number; name: string }[];
  mutations: ReturnType<typeof useJournalMutations>;
  pushHistory: (entry: HistoryEntry) => void;
  setPopupBooking: React.Dispatch<React.SetStateAction<Booking | null>>;
  showToast: (message: string) => void;
}

/**
 * Перенос и растягивание индивидуальной записи — одним путём для всех трёх
 * жестов: перетаскивание, растягивание за край и поля в карточке занятия.
 *
 * Путь — перенос (quote → reschedule с версией), а не PATCH занятия: у
 * индивидуальной записи есть клиент, и сервер при переносе проверяет часы и
 * перерывы мастера, уведомляет клиента и пересчитывает его сумму при смене
 * мастера (back/services/resource_reschedule.py). У группового занятия свой
 * путь — PATCH в `Journal.commitBookingChange`.
 *
 * Возвращает, удался ли перенос: окно в карточке по нему решает, закрываться
 * или оставить человека с ошибкой и его вводом.
 */
export function useResourceMove({ halls, mutations, pushHistory, setPopupBooking, showToast }: Params) {
  const { t } = useTranslation('journal');
  const toast = useToast();
  const currency = useStudioCurrency();

  // Время — местное время студии: Журнал живёт в нём, а в UTC его переводит
  // сервер по зоне студии. Длительность шлём всегда — она и есть то, что
  // человек видит на карточке; сервер без неё взял бы прежнюю.
  const request = useCallback((from: Booking, to: Booking): CrmRescheduleQuoteRequest | null => {
    if (to.serviceId == null || to.branchId == null || !to.date) return null;
    const body: CrmRescheduleQuoteRequest = {
      booking_mode: 'resource',
      service_id: to.serviceId,
      branch_id: to.branchId,
      teacher_id: to.trainer,
      local_start: indexToDateTime(to.date, to.timeStart),
      duration_min: Math.round((to.timeEnd - to.timeStart) * 60),
    };
    // Зал — только когда его сменили (режим «Залы»): не названный зал сервер
    // оставляет прежним.
    if (to.hall !== from.hall) {
      const hall = halls.find(h => h.name === to.hall);
      if (hall) body.hall_id = hall.id;
    }
    return body;
  }, [halls]);

  // Мастер сменился, и с ним — сумма клиента. Заплаченные деньги сервер не
  // двигает: говорим человеку у стойки, сколько вернуть или добрать.
  const report = useCallback((result: BookingRead) => {
    const change = result.repricing;
    if (!change) return false;
    const money = (amount: number) => formatMoney(amount, currency);
    if (change.paid == null || change.paid === change.current) {
      toast.info(t('toasts.repriced', { price: money(change.current) }));
    } else if (change.paid > change.current) {
      toast.info(t('toasts.repricedRefund', {
        paid: money(change.paid), price: money(change.current), diff: money(change.paid - change.current),
      }));
    } else {
      toast.info(t('toasts.repricedTopUp', {
        paid: money(change.paid), price: money(change.current), diff: money(change.current - change.paid),
      }));
    }
    return true;
  }, [currency, t, toast]);

  const move = useCallback(async (from: Booking, to: Booking) => {
    const body = request(from, to);
    if (!body) return;
    if (!report(await mutations.moveResource(from, to, body))) showToast(t('toasts.lessonUpdated'));
  }, [request, report, mutations, showToast, t]);

  return useCallback(async (prev: Booking, next: Booking): Promise<boolean> => {
    try {
      await move(prev, next);
    } catch (e) {
      setPopupBooking(pb => (pb && pb.id === prev.id ? prev : pb));
      toast.error(errorMessage(e, t));
      return false;
    }
    pushHistory({
      label: t('toasts.historyLabels.moveLesson'),
      undo: async () => {
        await move(next, prev);
        setPopupBooking(pb => (pb && pb.id === prev.id ? prev : pb));
      },
      redo: async () => {
        await move(prev, next);
        setPopupBooking(pb => (pb && pb.id === next.id ? next : pb));
      },
    });
    return true;
  }, [move, pushHistory, setPopupBooking, t, toast]);
}

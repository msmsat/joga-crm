import { scheduleApi } from '../../../../api/schedule';
import type { ReservationPaymentPreview } from '../../../../api/schedule/schedule.types';
import { usePaymentCheck, type PaymentChoice } from './usePaymentCheck';

export { percentOf } from './usePaymentCheck';

/**
 * Чек погашения долга за занятие у стойки (usePaymentCheck над
 * `POST /schedule/reservations/{id}/payment-preview`).
 *
 * Окно открывается со скидкой, которую дали брони при записи: долг посчитан с
 * ней. Стёртая скидка уходит нулём — «без скидки», а не «как при записи».
 */
export function useReservationPayment(reservationId: number, initialManual?: number | null) {
  const check = usePaymentCheck<ReservationPaymentPreview>({
    scope: `r${reservationId}`,
    initialManual,
    load: choice => scheduleApi.reservationPaymentPreview(reservationId, toOptions(choice)),
  });
  return {
    ...check,
    /** Тело `POST …/pay`: выбор в виде ручки оплаты долга и итог чека. */
    payRequest: () => {
      const { expected_total, ...choice } = check.request();
      return { ...toOptions(choice), expected_total };
    },
  };
}

const toOptions = ({ manual_percent, ...rest }: PaymentChoice) => ({
  ...rest, manual_discount_percent: manual_percent ?? 0,
});

export type ReservationPayment = ReturnType<typeof useReservationPayment>;

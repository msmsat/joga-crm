// Приём оплаты за занятие у стойки: окно оплаты (PaySheet) над долгом брони.
// Открывается со скидкой, которую дали брони при записи. Кнопка способа сразу
// проводит оплату тем же ядром кассы, что посчитало чек.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../../../api/client';
import { errorMessage } from '../../../../../api/errorMessage';
import type { BookedClient } from '../../../../../api/schedule/schedule.types';
import { useToast } from '../../../../../components/ui/index';
import { useReservationPayment } from '../../hooks/useReservationPayment';
import type { useJournalMutations } from '../../hooks/useJournalMutations';
import { PaySheet, type PayMethod } from './PaySheet';

interface Props {
  booked: BookedClient;
  lessonLabel: string;
  /** Только проведение оплаты: окно открывают и карточка занятия, и мастер
   *  записи сразу после записи «Индивидуального» (там своих мутаций журнала нет). */
  mutations: Pick<ReturnType<typeof useJournalMutations>, 'payReservation'>;
  onPaid: (total: number) => void;
  /** Левая кнопка подвала. По умолчанию «Отмена». */
  cancelLabel?: string;
  onClose: () => void;
}

export function ReservationPayModal({ booked, lessonLabel, mutations, onPaid, cancelLabel, onClose }: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const toast = useToast();
  const payment = useReservationPayment(booked.reservation_id, booked.manual_discount_percent);
  const [sending, setSending] = useState(false);
  // Оплата прошла: окно доигрывает уход, а onClose придёт после него.
  const [done, setDone] = useState(false);
  const name = [booked.name, booked.last_name].filter(Boolean).join(' ');

  const accept = (method: PayMethod) => {
    const { preview } = payment;
    if (!payment.ready || !preview) return;
    setSending(true);
    mutations.payReservation(booked.reservation_id, method, payment.payRequest())
      .then(() => { setDone(true); onPaid(preview.total); })
      .catch((e: unknown) => {
        // Итог разошёлся с пересчётом (баллы потратили в другом окне, скидку
        // поменяли) — денег не приняли; показываем новый чек.
        if (e instanceof ApiError && e.status === 409) payment.retry();
        toast.error(errorMessage(e, t));
      })
      .finally(() => setSending(false));
  };

  return (
    <PaySheet
      payment={payment}
      clientId={booked.client_id}
      title={t('journal:lessonPay.title')}
      subtitle={`${name} · ${lessonLabel}`}
      sending={sending}
      done={done}
      onPay={accept}
      cancelLabel={cancelLabel ?? t('common:buttons.cancel')}
      onClose={onClose}
    />
  );
}

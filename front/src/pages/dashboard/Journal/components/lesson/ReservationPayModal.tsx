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
  mutations: ReturnType<typeof useJournalMutations>;
  onPaid: (total: number) => void;
  onClose: () => void;
}

export function ReservationPayModal({ booked, lessonLabel, mutations, onPaid, onClose }: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const toast = useToast();
  const payment = useReservationPayment(booked.reservation_id, booked.manual_discount_percent);
  const [sending, setSending] = useState(false);
  const name = [booked.name, booked.last_name].filter(Boolean).join(' ');

  const accept = (method: PayMethod) => {
    const { preview } = payment;
    if (!payment.ready || !preview) return;
    setSending(true);
    mutations.payReservation(booked.reservation_id, method, payment.payRequest())
      .then(() => onPaid(preview.total))
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
      onPay={accept}
      cancelLabel={t('common:buttons.cancel')}
      onClose={onClose}
    />
  );
}

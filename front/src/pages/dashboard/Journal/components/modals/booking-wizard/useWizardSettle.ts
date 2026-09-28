import { useState } from 'react';
import { hybridApi } from '../../../../../../api/booking/hybrid.api';
import type { PaymentPreview } from '../../../../../../api/booking/hybrid.types';
import { usePaymentCheck, type PaymentChoice } from '../../../hooks/usePaymentCheck';
import type { BookingSettle, ResourceBooking } from '../../../hooks/useResourceBooking';
import type { PayMethod } from '../../lesson/PaySheet';

/** Выбор окна оплаты в виде кодов чека записи (schemas/schedule/hybrid.PaymentCodes).
 *  Первое занятие — не код: у записи оно берёт условия заново (resource.setFirstLesson). */
const toCodes = (c: PaymentChoice) => ({
  promo_code: c.promo_code, certificate_code: c.certificate_code, manual_discount_percent: c.manual_percent,
  use_bonuses: c.use_bonuses, use_deposit: c.use_deposit,
});

/**
 * Итог индивидуальной записи: «Оплата» и «Посещение».
 *
 * Запись создаётся неоплаченной и неотмеченной. Своя скидка на это занятие
 * ставится прямо на итоге и ложится в долг. «Оплата» открывает окно оплаты
 * (PaySheet): промокод, первое занятие, баллы, приглашения — и способ,
 * наличными или картой; деньги принимаются вместе с подтверждением записи,
 * одной транзакцией. «Посещение» — просто отметка: после подтверждения клиент
 * отмечается пришедшим. Не отметили — после конца занятия сетка покажет неявку.
 *
 * Способ и отметка — под клиента: сменили человека — выбирать заново.
 */
export function useWizardSettle(resource: ResourceBooking, clientId: number | null) {
  const quoteId = resource.quote?.quote_id ?? null;
  const check = usePaymentCheck<PaymentPreview>({
    scope: `q${quoteId ?? ''}`,
    load: quoteId ? choice => hybridApi.paymentPreview(quoteId, toCodes(choice)) : null,
    firstLesson: { value: resource.firstLesson, set: resource.setFirstLesson },
  });
  const [paid, setPaid] = useState<{ client: number | null; method: PayMethod } | null>(null);
  const [came, setCame] = useState<number | null | undefined>(undefined);
  /** Окно оплаты открыто: Escape закрывает его, а не всю запись. */
  const [open, setOpen] = useState(false);
  const method = paid != null && paid.client === clientId ? paid.method : null;
  const attended = came !== undefined && came === clientId;
  /** Платить нечего: абонемент или бесплатное первое занятие. */
  const covered = check.preview?.covered_by ?? null;

  return {
    check, method, attended, covered, open, setOpen,
    choose: (value: PayMethod) => { setPaid({ client: clientId, method: value }); setOpen(false); },
    unpay: () => { setPaid(null); setOpen(false); },
    toggleAttended: () => setCame(attended ? undefined : clientId),
    /** Подтверждать можно: скидка введена верно, а выбран способ — есть чек
     *  под нынешний выбор (сумму, которую примут, сервер сверяет с ним). */
    ready: !check.manualInvalid && (method == null || covered != null || check.ready),
    /** Сумма, которую примут при подтверждении; null — денег сейчас не берут. */
    amount: method != null && covered == null ? check.preview?.total ?? null : null,
    settle: (): BookingSettle => {
      const { expected_total, ...choice } = check.request();
      return {
        payment: method != null && covered == null
          ? { ...toCodes(choice), expected_total: expected_total ?? 0, method } : null,
        manualPercent: method == null ? check.manualPercent : null,
        attend: attended,
      };
    },
  };
}

export type WizardSettle = ReturnType<typeof useWizardSettle>;

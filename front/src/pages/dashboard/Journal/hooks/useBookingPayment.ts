import { useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { hybridApi } from '../../../../api/booking/hybrid.api';
import type { ConfirmPayment, PaymentPreview } from '../../../../api/booking/hybrid.types';
import { formatMoney } from '../../../../lib/money';

/** Поле кода на шаге оплаты: промокод или ваучер (подарочный сертификат). */
export type PaymentCode = {
  /** Что набрано в поле. */
  draft: string;
  /** Принятый сервером код — он и уйдёт в оплату. */
  applied: string | null;
  /** Почему код не принят: ключ локали или код ошибки сервера. */
  error: string | null;
  /** Поле раскрыто (по умолчанию — только ссылка «+ Промокод»). */
  open: boolean;
};

const EMPTY: PaymentCode = { draft: '', applied: null, error: null, open: false };
type Kind = 'promo' | 'voucher';

/**
 * Шаг оплаты индивидуальной записи: чек с сервера, промокод и ваучер.
 *
 * Считает НЕ фронт: сумму, скидки и ваучер отдаёт `payment-preview` — тот же
 * расчёт, что у кассы (routers/checkout). Здесь только то, что набрано в полях,
 * и какой чек сейчас на экране.
 *
 * Без эффектов: чек запрашивают действия — пришли условия записи (`load`),
 * применили или убрали код. Так он не уходит повторно на каждый рендер, а
 * устаревший ответ (условия успели смениться) отбрасывает счётчик версий.
 *
 * Судьбу кодов решает КАЖДЫЙ чек, а не только нажатие «Применить»: условия
 * меняются и после (выключатель первого занятия), а с ними и то, какая скидка
 * выгоднее. Код, который сервер не принял (промокод умер, ваучер погашен), в
 * оплату не попадает: он снимается с «применённых», а причина остаётся под полем.
 */
export function useBookingPayment() {
  const [preview, setPreview] = useState<PaymentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Какой код сейчас применяется: крутится только его «Применить», а не оба.
  const [applying, setApplying] = useState<Kind | null>(null);
  const [promo, setPromo] = useState<PaymentCode>(EMPTY);
  const [voucher, setVoucher] = useState<PaymentCode>(EMPTY);
  const quoteId = useRef<string | null>(null);
  const applied = useRef<{ promo: string | null; voucher: string | null }>({ promo: null, voucher: null });
  const version = useRef(0);

  const setCode = (kind: Kind, patch: Partial<PaymentCode>) =>
    (kind === 'promo' ? setPromo : setVoucher)(code => ({ ...code, ...patch }));

  /** Чек под нынешние условия и принятые коды. */
  const refresh = async (): Promise<PaymentPreview | null> => {
    const id = quoteId.current;
    if (!id) return null;
    const current = ++version.current;
    // Коды, под которые считается ЭТОТ чек. Пока он последний, они совпадают с
    // применёнными: применить или убрать код — значит запросить чек заново.
    const sent = { ...applied.current };
    setLoading(true);
    setFailed(false);
    try {
      const result = await hybridApi.paymentPreview(id, {
        promo_code: sent.promo, certificate_code: sent.voucher,
      });
      if (current !== version.current) return null;
      if (sent.promo) {
        const valid = result.promo_valid !== false;
        if (!valid) applied.current.promo = null;
        setCode('promo', valid
          // Принят, но мог проиграть более выгодной скидке — не суммируются.
          ? { applied: sent.promo, open: false,
              error: result.promo_outweighed ? 'journal:payment.promoOutweighed' : null }
          : { applied: null, open: true, error: 'journal:payment.promoInvalid' });
      }
      if (sent.voucher) {
        const error = result.certificate_error;
        if (error) applied.current.voucher = null;
        setCode('voucher', error
          ? { applied: null, open: true, error: `common:errors.${error}` }
          : { applied: sent.voucher, open: false, error: null });
      }
      setPreview(result);
      return result;
    } catch {
      if (current === version.current) setFailed(true);
      return null;
    } finally {
      if (current === version.current) {
        setLoading(false);
        setApplying(null);
      }
    }
  };

  /** Пришли новые условия записи — чек под них. Старый держим до ответа:
   *  выключатель первого занятия не должен мигать пустотой. */
  const load = (id: string) => {
    quoteId.current = id;
    void refresh();
  };

  /** Условия сброшены (сменили услугу, мастера, время) — чек устарел. */
  const reset = () => {
    quoteId.current = null;
    version.current += 1;
    setPreview(null);
    setLoading(false);
    setFailed(false);
    setApplying(null);
  };

  /** Сменили клиента — коды набирали под другого человека. */
  const clear = () => {
    reset();
    applied.current = { promo: null, voucher: null };
    setPromo(EMPTY);
    setVoucher(EMPTY);
  };

  /** Принят код или нет — решит чек, который он запросит (см. refresh). */
  const apply = async (kind: Kind) => {
    const code = (kind === 'promo' ? promo : voucher).draft.trim();
    if (!code || !quoteId.current) return;
    applied.current = { ...applied.current, [kind]: code };
    setApplying(kind);
    setCode(kind, { error: null });
    await refresh();
  };

  const remove = (kind: Kind) => {
    applied.current = { ...applied.current, [kind]: null };
    (kind === 'promo' ? setPromo : setVoucher)(EMPTY);
    void refresh();
  };

  return {
    preview, loading, failed, applying, promo, voucher,
    /** Чек есть и он про нынешние условия — можно подтверждать. */
    ready: preview != null && !loading && !failed,
    load, reset, clear, refresh, apply, remove,
    edit: (kind: Kind, draft: string) => setCode(kind, { draft, error: null }),
    toggle: (kind: Kind, open: boolean) => setCode(kind, { open }),
    /** Что уйдёт в подтверждение: принятые коды и итог, который видел кассир. */
    request: (): ConfirmPayment | null => preview == null ? null : {
      promo_code: applied.current.promo, certificate_code: applied.current.voucher,
      expected_total: preview.total,
    },
  };
}

export type BookingPayment = ReturnType<typeof useBookingPayment>;

/** Подпись кнопки подтверждения: называет сумму, которую сейчас примут
 *  наличными. Платить нечего (абонемент, подарок) — прежняя подпись окна. */
export function confirmLabel(payment: BookingPayment, t: TFunction, fallback: string): string {
  const { preview } = payment;
  return preview && preview.total > 0
    ? t('journal:payment.confirmAndPay', { amount: formatMoney(preview.total, preview.currency) })
    : fallback;
}

import { useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { hybridApi } from '../../../../api/booking/hybrid.api';
import type { ConfirmPayment, PaymentPreview } from '../../../../api/booking/hybrid.types';
import { formatMoney } from '../../../../lib/money';

/** Поле на шаге оплаты: промокод, ваучер (подарочный сертификат) или ручная
 *  скидка администратора в процентах. */
export type PaymentCode = {
  /** Что набрано в поле. */
  draft: string;
  /** Принятый сервером код (у скидки — процент строкой) — он и уйдёт в оплату. */
  applied: string | null;
  /** Почему код не принят: ключ локали или код ошибки сервера. */
  error: string | null;
  /** Поле раскрыто (по умолчанию — только ссылка «+ Промокод»). */
  open: boolean;
};

const EMPTY: PaymentCode = { draft: '', applied: null, error: null, open: false };
export type PaymentCodeKind = 'promo' | 'voucher' | 'manual';
type Applied = Record<PaymentCodeKind, string | null>;
const NONE: Applied = { promo: null, voucher: null, manual: null };

/** Процент ручной скидки: целое 1…100, иначе null. */
const percentOf = (value: string) => {
  const n = Number(value);
  return /^\d{1,3}$/.test(value) && n >= 1 && n <= 100 ? n : null;
};

/**
 * Шаг оплаты индивидуальной записи: чек с сервера, промокод, ваучер и ручная
 * скидка администратора.
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
 * Ручная скидка идёт в тот же ряд, что и остальные (без стека): проиграла
 * более выгодной — остаётся применённой, но с пометкой, почему не снимает денег.
 */
export function useBookingPayment() {
  const [preview, setPreview] = useState<PaymentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Какой код сейчас применяется: крутится только его «Применить», а не все.
  const [applying, setApplying] = useState<PaymentCodeKind | null>(null);
  const [codes, setCodes] = useState<Record<PaymentCodeKind, PaymentCode>>(
    { promo: EMPTY, voucher: EMPTY, manual: EMPTY });
  const quoteId = useRef<string | null>(null);
  const applied = useRef<Applied>({ ...NONE });
  const version = useRef(0);

  const setCode = (kind: PaymentCodeKind, patch: Partial<PaymentCode>) =>
    setCodes(all => ({ ...all, [kind]: { ...all[kind], ...patch } }));

  /** Коды в том виде, в каком их ждёт сервер. */
  const toRequest = (sent: Applied) => ({
    promo_code: sent.promo, certificate_code: sent.voucher,
    manual_discount_percent: sent.manual ? Number(sent.manual) : null,
  });

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
      const result = await hybridApi.paymentPreview(id, toRequest(sent));
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
      if (sent.manual) {
        // Строки «manual» в чеке нет — выгоднее оказалась другая скидка.
        const outweighed = !result.covered_by && !result.discounts.some(d => d.kind === 'manual');
        setCode('manual', { applied: sent.manual, open: false,
          error: outweighed ? 'journal:payment.promoOutweighed' : null });
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

  /** Сменили клиента — коды и скидку набирали под другого человека. */
  const clear = () => {
    reset();
    applied.current = { ...NONE };
    setCodes({ promo: EMPTY, voucher: EMPTY, manual: EMPTY });
  };

  /** Принят код или нет — решит чек, который он запросит (см. refresh).
   *  Процент скидки проверяется здесь: вне 1…100 сервер его и не посчитает. */
  const apply = async (kind: PaymentCodeKind) => {
    const code = codes[kind].draft.trim();
    if (!code || !quoteId.current) return;
    if (kind === 'manual' && percentOf(code) == null) {
      setCode(kind, { error: 'journal:payment.manualInvalid' });
      return;
    }
    applied.current = { ...applied.current, [kind]: kind === 'manual' ? String(percentOf(code)) : code };
    setApplying(kind);
    setCode(kind, { error: null });
    await refresh();
  };

  const remove = (kind: PaymentCodeKind) => {
    applied.current = { ...applied.current, [kind]: null };
    setCode(kind, EMPTY);
    void refresh();
  };

  return {
    preview, loading, failed, applying,
    promo: codes.promo, voucher: codes.voucher, manual: codes.manual,
    /** Чек есть и он про нынешние условия — можно подтверждать. */
    ready: preview != null && !loading && !failed,
    load, reset, clear, refresh, apply, remove,
    // В поле скидки — только цифры: на телефоне там цифровая клавиатура, а
    // вставленное «10 %» не должно превращаться в ошибку.
    edit: (kind: PaymentCodeKind, draft: string) => setCode(kind, {
      draft: kind === 'manual' ? draft.replace(/\D/g, '').slice(0, 3) : draft, error: null,
    }),
    toggle: (kind: PaymentCodeKind, open: boolean) => setCode(kind, { open }),
    /** Что уйдёт в подтверждение: принятые коды, скидка и итог, который видел кассир. */
    request: (): ConfirmPayment | null => preview == null ? null : {
      ...toRequest(applied.current), expected_total: preview.total,
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

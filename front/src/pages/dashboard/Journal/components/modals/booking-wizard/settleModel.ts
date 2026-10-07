// Чистая модель итога записи: скидка на чеке и доля мастера. Без React и без
// сети — проверяется отдельно (scripts/check-booking-settle.mjs).
import type { LessonCompensation, PaymentCheckPreview } from '../../../../../../api/schedule/schedule.types';

export interface ReceiptView {
  base: number;
  total: number;
  /** Сколько сняли скидки — только они, без баллов, депозита и сертификата:
   *  те — способы оплаты, а не скидка. */
  discount: number;
  /** Доля скидки от цены, 0…1. */
  share: number;
}

export function receiptOf(p: Pick<PaymentCheckPreview, 'base_price' | 'total' | 'discounts'>): ReceiptView {
  const raw = p.discounts.reduce((sum, d) => sum + (d.amount || 0), 0);
  const discount = Math.max(0, Math.min(p.base_price, raw));
  return {
    base: p.base_price,
    total: p.total,
    discount,
    share: p.base_price > 0 ? discount / p.base_price : 0,
  };
}

export interface EarningView {
  kind: 'percent' | 'hourly';
  rate: number;
  /** Сколько получит мастер; null — процент от визита по абонементу неизвестен. */
  amount: number | null;
  /** От какой суммы процент — то, что заплатит клиент, со скидкой. */
  base: number;
  hours: number;
  /** Доля студии: что остаётся после мастера. Меньше нуля — студия в минусе. */
  studio: number;
  /** Делить клиентскую сумму на доли есть смысл: деньги за запись берут. */
  split: boolean;
}

/** Заработок мастера показывается только тем, кто работает за процент или
 *  почасово: оклад к записи не относится, а владелец — не сотрудник. */
export function earningOf(
  c: LessonCompensation | null | undefined,
  p: Pick<PaymentCheckPreview, 'total' | 'deposit_applied' | 'certificate_applied'>,
  covered: boolean,
): EarningView | null {
  if (!c || (c.kind !== 'percent' && c.kind !== 'hourly')) return null;
  const base = c.base_amount ?? p.total + p.deposit_applied + p.certificate_applied;
  const amount = c.amount;
  return {
    kind: c.kind,
    rate: c.rate ?? 0,
    amount,
    base,
    hours: c.duration_min / 60,
    studio: base - (amount ?? 0),
    split: !covered && amount != null && base > 0,
  };
}

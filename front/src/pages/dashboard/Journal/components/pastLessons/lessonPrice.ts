// Цена прошлого занятия в истории клиента — тем же правилом, что чек
// записанного в карточке занятия (lesson/funding.ts): разойдись они, одна и
// та же бронь стоила бы в двух местах по-разному. Без React: файл компонента
// не должен экспортировать функции (Fast Refresh).
import type { EventFunding, EventRecord } from '../../../../../api/clients/clients.types';
import { discountedPrice, fundingParts, type DiscountPart, type Funding } from '../lesson/funding';

/** Визит из истории → общий вид «как записан и чем закрыт». */
export const fundingOfVisit = (f: EventFunding): Funding => ({
  price: f.price,
  trialPercent: f.trial_discount_percent ?? null,
  trialAmount: f.trial_discount_amount ?? null,
  manualPercent: f.manual_discount_percent ?? null,
  isTrial: f.is_trial,
  subscriptionName: f.subscription_name ?? null,
  bySubscription: f.by_subscription,
  debt: f.debt,
  paidAmount: f.paid_amount,
  payment: f.payment ?? null,
});

/** Чем закончилось с деньгами: внесено, ждём или сказать нечего. */
export type Settled = { kind: 'paid'; amount: number } | { kind: 'debt'; amount: number } | null;

export type PriceView =
  /** Закрыто абонементом — денег по визиту не ждут. */
  | { kind: 'subscription'; name: string | null }
  /** Платить было нечего: бесплатно по прайсу или скидка на всю сумму. */
  | { kind: 'free'; base: number; discounts: DiscountPart[] }
  /** Цена клиента; was — прайс, если скидки её снизили. */
  | { kind: 'price'; price: number; was: number | null; percent: number | null; discounts: DiscountPart[]; settled: Settled };

/**
 * Что показать в строке истории. null — сказать нечего: перенесённая история
 * без сведений о цене и оплате.
 */
export function priceView(f: EventFunding, paymentStatus?: EventRecord['payment_status']): PriceView | null {
  const funding = fundingOfVisit(f);
  const parts = fundingParts(funding);
  if (parts.bySubscription) return { kind: 'subscription', name: parts.subscriptionName };
  const own = discountedPrice(funding);
  if (own?.price === 0) return { kind: 'free', base: own.base, discounts: parts.discounts };
  const price = own?.price ?? parts.base;
  if (price <= 0) return paymentStatus === 'free' ? { kind: 'free', base: 0, discounts: [] } : null;
  const settled: Settled = parts.debt > 0 ? { kind: 'debt', amount: parts.debt }
    : parts.paid ? { kind: 'paid', amount: parts.paid.amount } : null;
  return {
    kind: 'price', price, settled, discounts: parts.discounts,
    was: own ? own.base : null,
    percent: own && own.base > 0 ? Math.round((own.base - own.price) / own.base * 100) : null,
  };
}

/** Строка чека: стоимость, скидка или средство оплаты (баллы, депозит, сертификат). */
export interface ReceiptLine {
  key: string; label: string; amount: number; gain: boolean;
  percent?: number | null; promo?: string | null; points?: number;
}

export interface Receipt {
  lines: ReceiptLine[];
  /** Цена клиента; null — закрыто абонементом. */
  total: number | null;
  /** На сколько скидки снизили прайс. */
  saved: number;
  subscriptionName: string | null;
  bySubscription: boolean;
  settled: Settled;
  method: string | null;
}

/**
 * Чек прошлого занятия — те же строки, что чек записанного в карточке занятия
 * (LessonBill): прайс, каждая скидка, средства оплаты, итог и чем закрыто.
 * label — вид строки (price, discount kind, points, deposit, certificate);
 * подписи называет компонент.
 */
export function receiptOf(f: EventFunding): Receipt {
  const funding = fundingOfVisit(f);
  const parts = fundingParts(funding);
  const own = discountedPrice(funding);
  const settled: Settled = parts.debt > 0 ? { kind: 'debt', amount: parts.debt }
    : parts.paid ? { kind: 'paid', amount: parts.paid.amount } : null;
  if (parts.bySubscription) {
    return { lines: [], total: null, saved: 0, subscriptionName: parts.subscriptionName, bySubscription: true, settled: null, method: null };
  }
  const base = own?.base ?? parts.base;
  const total = own?.price ?? parts.base;
  const lines: ReceiptLine[] = [{ key: 'price', label: 'price', amount: base, gain: false }];
  for (const d of parts.discounts) {
    lines.push({ key: `d-${d.kind}`, label: d.kind, amount: d.amount, gain: true, percent: d.percent, promo: d.promoCode });
  }
  if (parts.points) lines.push({ key: 'pts', label: 'points', amount: parts.points.amount, gain: true, points: parts.points.points });
  if (parts.deposit > 0) lines.push({ key: 'dep', label: 'deposit', amount: parts.deposit, gain: true });
  if (parts.certificate) lines.push({ key: 'cert', label: 'certificate', amount: parts.certificate.amount, gain: true, promo: parts.certificate.code });
  return {
    lines, total, saved: Math.max(0, base - total), subscriptionName: null, bySubscription: false,
    settled, method: parts.paid?.method ?? null,
  };
}

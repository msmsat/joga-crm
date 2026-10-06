// Как записан и чем закрыто занятие — данные для чипов (FundingChips) и для
// цены клиента в плитке «Цена» индивидуального занятия (LessonFacts). Отдельным
// модулем: файл компонента не должен экспортировать функции (Fast Refresh).
import type { BookedClient, PaymentBreakdown } from '../../../../../api/schedule/schedule.types';

export interface Funding {
  price: number;
  trialPercent: number | null;
  /** Скидка первого занятия суммой — тогда процента у брони нет. */
  trialAmount?: number | null;
  manualPercent?: number | null;
  isTrial: boolean;
  subscriptionName: string | null;
  bySubscription: boolean;
  debt: number;
  paidAmount: number;
  payment: PaymentBreakdown | null;
}

/** Строка записанного → общий вид «как записан и чем закрыт». */
export const fundingOf = (c: BookedClient, price: number): Funding => ({
  price,
  trialPercent: c.trial_discount_percent ?? null,
  trialAmount: c.trial_discount_amount ?? null,
  manualPercent: c.manual_discount_percent ?? null,
  isTrial: c.is_trial,
  subscriptionName: c.subscription_name ?? null,
  bySubscription: c.by_subscription,
  debt: c.debt,
  paidAmount: c.paid_amount ?? 0,
  payment: c.payment ?? null,
});

/** Скидка покрыла занятие целиком: долга нет, потому что платить нечего. */
const fullyDiscounted = (f: Funding) =>
  (f.manualPercent ?? 0) >= 100
  || (f.isTrial && (f.trialAmount != null ? f.trialAmount >= f.price : (f.trialPercent ?? 100) >= 100));

/**
 * Сколько занятие стоит этому клиенту — прайс минус ЕГО скидки. Баллы, депозит
 * и сертификат — средства оплаты, а не цена, и сюда не входят. После оплаты —
 * по снимку кассы; до неё — долг плюс уже внесённое: сервер заводит долг по
 * цене клиента (services/booking.client_price), со всеми его скидками.
 * null — цена клиента не ниже прайса или считать не от чего (абонемент,
 * импорт без сведений об оплате).
 */
export function discountedPrice(f: Funding): { base: number; price: number } | null {
  if (f.bySubscription || f.subscriptionName) return null;
  const base = f.payment?.base_price ?? f.price;
  const owed = f.debt + f.paidAmount;
  const price = f.payment ? base - f.payment.discounts.reduce((sum, d) => sum + d.amount, 0)
    : owed > 0 ? owed
    : fullyDiscounted(f) ? 0 : null;
  return price != null && price >= 0 && price < base ? { base, price } : null;
}

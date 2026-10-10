// Как записан и чем закрыто занятие — один разбор на три вида: чипы в истории
// клиента (FundingChips), чек записанного в карточке занятия (LessonBill) и
// «Итог» индивидуального занятия (LessonFacts). Разойдись они, одна и та же
// бронь читалась бы по-разному. Отдельным модулем: файл компонента не должен
// экспортировать функции (Fast Refresh).
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

/** Что сняло деньги с цены: вид скидки, сумма и процент от прайса (null —
 *  прайса нет, считать не от чего). */
export interface DiscountPart {
  kind: string;
  amount: number;
  percent: number | null;
  /** Промокод — его называют вместе со скидкой. */
  promoCode: string | null;
  /** Название скидки студии — им строка и подписана. */
  name?: string | null;
}

export interface FundingParts {
  /** Занятие закрыто абонементом: денег по нему не ждут. */
  bySubscription: boolean;
  subscriptionName: string | null;
  /** Прайс — точка отсчёта скидок (после оплаты — из снимка кассы). */
  base: number;
  discounts: DiscountPart[];
  /** Средства оплаты из снимка кассы: не скидки, но тоже сняли сумму. */
  points: { points: number; amount: number } | null;
  deposit: number;
  certificate: { code: string | null; amount: number } | null;
  /** Сколько внесено; способ известен только по снимку кассы. */
  paid: { amount: number; method: string | null } | null;
  /** Долг — только до оплаты: снимок кассы его закрывает. */
  debt: number;
}

/** Разбор брони: после оплаты — по снимку кассы, до неё — по броне. */
export function fundingParts(f: Funding): FundingParts {
  const bySubscription = f.bySubscription || !!f.subscriptionName;
  const common = { bySubscription, subscriptionName: f.subscriptionName };
  const p = f.payment;
  if (p) {
    const base = p.base_price ?? f.price;
    return {
      ...common, base,
      discounts: p.discounts.map(d => ({
        kind: d.kind, amount: d.amount,
        percent: base > 0 ? Math.round(d.amount / base * 100) : null,
        promoCode: d.kind === 'promo' ? p.promo_code : null,
        name: d.name ?? null,
      })),
      points: p.bonuses_value > 0 ? { points: p.bonuses_applied, amount: p.bonuses_value } : null,
      deposit: p.deposit_applied > 0 ? p.deposit_applied : 0,
      certificate: p.certificate_applied > 0 ? { code: p.certificate_code, amount: p.certificate_applied } : null,
      paid: { amount: p.total, method: p.method },
      debt: 0,
    };
  }
  return {
    ...common, base: f.price,
    discounts: bySubscription ? [] : storedDiscounts(f),
    points: null, deposit: 0, certificate: null,
    paid: f.paidAmount > 0 ? { amount: f.paidAmount, method: null } : null,
    debt: f.debt,
  };
}

/**
 * До оплаты источник скидки хранится на брони. Называем только те сохранённые
 * скидки, которые объясняют фактическую сумму: программы могут выбирать лучшую
 * скидку или складывать их. Разница сама по себе источник не выдумывает.
 */
function storedDiscounts(f: Funding): DiscountPart[] {
  // Скидка суммой — та же формула, что у сервера (apply_discount): не больше
  // цены; процент для подписи считается от неё, как у снимка кассы.
  const byAmount = (amount: number) => {
    const off = Math.min(amount, f.price);
    return { amount: off, percent: f.price > 0 ? Math.round(off / f.price * 100) : 0 };
  };
  const byPercent = (percent: number) => ({ percent, amount: Math.floor(f.price * percent / 100) });
  const firstLesson = !f.isTrial ? null
    : f.trialAmount != null ? byAmount(f.trialAmount) : byPercent(f.trialPercent ?? 100);
  const candidates = [
    { kind: 'first_lesson', promoCode: null, ...(firstLesson ?? byPercent(0)) },
    { kind: 'manual', promoCode: null, ...byPercent(f.manualPercent ?? 0) },
  ].filter(d => d.percent > 0 || d.amount > 0);
  const reduction = f.price - f.debt - f.paidAmount;
  const single = candidates.find(d => d.amount === reduction);
  return single ? [single]
    : candidates.reduce((sum, d) => sum + d.amount, 0) === reduction ? candidates : [];
}

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

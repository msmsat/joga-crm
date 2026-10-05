import type { CheckoutPreview } from '../../../../../api/billing/billing.types';

export interface PaymentAmounts {
  net: number | null;
  total: number | null;
  tax: number | null;
  taxRate: number | null;
  amount_before_promo?: number | null;
  promo_discount_amount?: number | null;
  promo_discount_percent?: number | null;
  promo_code?: string | null;
}

/** Rates are authoritative data, never inferred from rounded money amounts. */
export function uniformTaxRate(amounts: readonly { percentage?: number }[] | null): number | null {
  if (!amounts?.length) return null;
  const rate = amounts[0].percentage;
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0
    && amounts.every(amount => amount.percentage === rate) ? rate : null;
}

export const hasPayableTotal = (amount: number | null | undefined) =>
  typeof amount === 'number' && Number.isFinite(amount) && amount > 0;

/** The purchased period is paid now, even if access starts after the trial. */
export function checkoutAmounts(preview?: CheckoutPreview, payment?: PaymentAmounts, taxPending = false) {
  const invalidPayment = payment?.total != null && !hasPayableTotal(payment.total)
    && hasPayableTotal(preview?.total);
  const payable = invalidPayment ? undefined : payment;
  const confirmedPaymentTax = hasPayableTotal(payable?.total) && payable?.tax != null
    && Number.isFinite(payable.tax) && payable.tax >= 0;
  const requiresReview = !taxPending && preview?.tax_outcome === 'requires_review' && !confirmedPaymentTax;
  const manualTaxKnown = !!preview && !['stripe_auto', 'requires_review'].includes(preview.tax_outcome);
  const taxKnown = !taxPending && !requiresReview && (payable?.tax != null || manualTaxKnown);
  const tax = taxKnown ? payable?.tax ?? preview!.tax_amount : null;
  const quoteMatches = (payable?.tax == null || payable.tax === preview?.tax_amount)
    && (payable?.net == null || payable.net === preview?.total);
  const taxReason = taxKnown && manualTaxKnown && quoteMatches && preview?.tax_outcome !== 'taxable' ? preview?.tax_outcome : null;
  const taxRate = taxKnown && !taxReason ? payable?.taxRate ?? (manualTaxKnown && quoteMatches ? preview!.tax_rate_percent : null) : null;
  const net = payable?.net ?? preview?.total ?? null;
  const total = requiresReview || taxPending ? net : payable?.total
    ?? (manualTaxKnown ? preview!.total_with_tax : net);
  // Once payment preparation supplies a breakdown, it replaces the old offer.
  // Otherwise a changed Stripe subtotal must not inherit an earlier promotion.
  const promoSource = payable?.amount_before_promo != null ? payable
    : payable?.net == null || payable.net === preview?.total ? preview : undefined;
  const promoDiscount = promoSource?.promo_code && (promoSource.promo_discount_percent ?? 0) > 0
    && (promoSource.promo_discount_amount ?? 0) > 0
    && promoSource.amount_before_promo! - promoSource.promo_discount_amount! === net
    ? promoSource.promo_discount_amount! : 0;
  const amountBeforePromo = promoDiscount > 0 ? promoSource!.amount_before_promo! : net;
  const promoCode = promoDiscount > 0 ? promoSource!.promo_code! : null;
  const promoPercent = promoDiscount > 0 ? promoSource!.promo_discount_percent! : 0;
  return { net, tax, taxRate, total, taxKnown, taxReason, requiresReview, invalidPayment,
    amountBeforePromo, promoDiscount, promoCode, promoPercent };
}

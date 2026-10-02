import type { CheckoutPreview } from '../../../../../api/billing/billing.types';

export interface PaymentAmounts {
  net: number | null;
  total: number | null;
  tax: number | null;
  taxRate: number | null;
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
  const requiresReview = !taxPending && preview?.tax_outcome === 'requires_review';
  const invalidPayment = payment?.total != null && !hasPayableTotal(payment.total)
    && hasPayableTotal(preview?.total);
  const payable = invalidPayment ? undefined : payment;
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
  return { net, tax, taxRate, total, taxKnown, taxReason, requiresReview, invalidPayment };
}

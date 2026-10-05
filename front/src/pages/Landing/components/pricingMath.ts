export type PricingModel = 'subscription' | 'percent' | 'combo';

/** Public estimate in minor units; the payment quote remains authoritative. */
export function calculateLandingPrice(monthly: number, months: number, periodDiscount: number, model: PricingModel, promoPercent: number) {
  if (model === 'percent') return null;
  const regular = Math.floor(Math.round(monthly * months * (1 - periodDiscount)) / (model === 'combo' ? 2 : 1));
  const base = Math.floor(monthly * months / (model === 'combo' ? 2 : 1));
  const promoSaving = Math.floor(regular * promoPercent / 100);
  return { base, regular, first: regular - promoSaving, promoSaving };
}

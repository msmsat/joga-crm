import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { checkoutAmounts, hasPayableTotal, uniformTaxRate } from '../src/pages/dashboard/Billing/components/checkout/checkoutAmounts.ts';

const quote = (overrides = {}) => ({
  kind: 'new', current_plan: null, gross: 4500, total: 4500, currency: 'EUR',
  free_until: null, free_days: 0, tax_outcome: 'taxable', tax_rate_percent: 21,
  tax_amount: 945, total_with_tax: 5445, tax_review_reason: null, ...overrides,
});

test('a €45 period plus confirmed 21% VAT shows €54.45 due now', () => {
  const amounts = checkoutAmounts(quote());
  assert.equal(amounts.net, 4500);
  assert.equal(amounts.tax, 945);
  assert.equal(amounts.taxRate, 21);
  assert.equal(amounts.total, 5445);
  assert.equal(amounts.taxKnown, true);
});

test('future trial/access dates never turn a prepaid period into a zero charge', () => {
  const amounts = checkoutAmounts(quote({ free_until: '2099-01-02T00:00:00Z', free_days: 90,
    access_starts_at: '2099-01-02T00:00:00Z', access_until: '2099-02-02T00:00:00Z' }));
  assert.equal(amounts.total, 5445);
});

test('unresolved automatic tax and review remain unknown rather than zero VAT', () => {
  for (const tax_outcome of ['stripe_auto', 'requires_review']) {
    const amounts = checkoutAmounts(quote({ tax_outcome, tax_amount: 0, tax_rate_percent: null, total_with_tax: 4500 }));
    assert.equal(amounts.taxKnown, false);
    assert.equal(amounts.tax, null);
    assert.equal(amounts.taxRate, null);
    assert.equal(amounts.total, 4500);
  }
  assert.equal(checkoutAmounts(quote({ tax_outcome: 'requires_review' })).requiresReview, true);
});

test('zero-tax legal outcomes keep distinct reasons', () => {
  for (const tax_outcome of ['reverse_charge', 'exempt', 'out_of_scope']) {
    const amounts = checkoutAmounts(quote({ tax_outcome, tax_rate_percent: 0, tax_amount: 0, total_with_tax: 4500 }));
    assert.equal(amounts.tax, 0);
    assert.equal(amounts.taxKnown, true);
    assert.equal(amounts.taxReason, tax_outcome);
    assert.equal(amounts.taxRate, null);
    assert.equal(amounts.total, 4500);
  }
});

test('Stripe authoritative subtotal, tax and total replace the quote', () => {
  const amounts = checkoutAmounts(quote({ tax_outcome: 'stripe_auto' }), {
    net: 4600, tax: 966, total: 5566, taxRate: 21,
  });
  assert.equal(amounts.net, 4600);
  assert.equal(amounts.total, 5566);
  assert.equal(amounts.taxRate, 21);
});

test('a zero Stripe total for a positive period is rejected and cannot masquerade as free', () => {
  const amounts = checkoutAmounts(quote(), { net: 4500, tax: 0, total: 0, taxRate: null });
  assert.equal(amounts.invalidPayment, true);
  assert.equal(amounts.total, 5445);
  for (const invalid of [0, -1, null, undefined, NaN, Infinity]) assert.equal(hasPayableTotal(invalid), false);
  assert.equal(hasPayableTotal(5445), true);
});

test('tax percentages must be explicit and uniform, never reverse-calculated from cents', () => {
  assert.equal(uniformTaxRate([{ percentage: 21 }, { percentage: 21 }]), 21);
  for (const amounts of [null, [], [{}], [{ percentage: 19 }, { percentage: 21 }], [{ percentage: NaN }]]) {
    assert.equal(uniformTaxRate(amounts), null);
  }
  assert.equal(uniformTaxRate([{ percentage: 0 }]), 0);
  assert.equal(checkoutAmounts(quote({ total: 1, tax_amount: 0, total_with_tax: 1 })).taxRate, 21);
  assert.equal(checkoutAmounts(quote(), { net: 4500, total: 5445, tax: 945, taxRate: null }).taxRate, 21);
  assert.equal(checkoutAmounts(quote(), { net: 4500, total: 4500, tax: 0, taxRate: null }).taxRate, null);
});

test('unfinished Stripe tax stays unknown and cannot supply a guessed percentage', () => {
  const amounts = checkoutAmounts(quote({ tax_outcome: 'stripe_auto', tax_rate_percent: null }), {
    net: 4500, total: 4500, tax: null, taxRate: null,
  });
  assert.equal(amounts.taxKnown, false);
  assert.equal(amounts.taxRate, null);
});

test('editing payer details hides the previous country VAT until a new calculation is confirmed', () => {
  const dirty = checkoutAmounts(quote(), undefined, true);
  assert.equal(dirty.tax, null);
  assert.equal(dirty.taxRate, null);
  assert.equal(dirty.taxKnown, false);
  assert.equal(dirty.total, 4500);
  assert.equal(dirty.net, 4500);
  assert.equal(checkoutAmounts(quote(), undefined, false).total, 5445);
  assert.equal(checkoutAmounts(quote({ tax_outcome: 'reverse_charge', tax_amount: 0, tax_rate_percent: 0 }), undefined, true).taxReason, null);
});

test('Russian checkout copy names VAT and one-time access without an automatic next charge', async () => {
  const billing = JSON.parse(await readFile(new URL('../src/locales/ru/billing.json', import.meta.url), 'utf8'));
  assert.equal(billing.checkout.tax, 'НДС');
  assert.match(billing.checkout.purchase, /период/);
  assert.match(billing.checkout.noAutoRenewal, /автомат/i);
  assert.ok(billing.checkout.vatIdHint.includes('Чехии'));
  const source = await readFile(new URL('../src/pages/dashboard/Billing/components/checkout/CheckoutSummary.tsx', import.meta.url), 'utf8');
  assert.ok(!source.includes('free_until') && !source.includes('nextCharge') && !source.includes('confirmSubscription'));
});

test('first-payment receipt preserves the period amount and shows the automatic promotion before VAT', () => {
  const amounts = checkoutAmounts(quote({ gross: 3600, amount_before_promo: 3600,
    promo_code: 'WELCOME30', promo_discount_percent: 30, promo_discount_amount: 1080,
    total: 2520, tax_amount: 529, total_with_tax: 3049 }));
  assert.equal(amounts.amountBeforePromo, 3600);
  assert.equal(amounts.promoDiscount, 1080);
  assert.equal(amounts.promoPercent, 30);
  assert.equal(amounts.promoCode, 'WELCOME30');
  assert.equal(amounts.net, 2520);
  assert.equal(amounts.tax, 529);
  assert.equal(amounts.total, 3049);
});

test('a prepared payment replaces an expired first-payment offer in a stale quote', () => {
  const amounts = checkoutAmounts(quote({ gross: 3600, amount_before_promo: 3600,
    promo_code: 'WELCOME30', promo_discount_percent: 30, promo_discount_amount: 1080,
    total: 2520, tax_amount: 529, total_with_tax: 3049 }), {
    net: 3600, total: 4356, tax: 756, taxRate: 21,
    amount_before_promo: 3600, promo_code: null, promo_discount_percent: 0, promo_discount_amount: 0,
  });
  assert.equal(amounts.promoDiscount, 0);
  assert.equal(amounts.promoCode, null);
  assert.equal(amounts.amountBeforePromo, 3600);
  assert.equal(amounts.net, 3600);
  assert.equal(amounts.total, 4356);
});

test('a prepared payment with confirmed tax supersedes an earlier tax-review quote', () => {
  const amounts = checkoutAmounts(quote({ tax_outcome: 'requires_review' }), {
    net: 4500, total: 5445, tax: 945, taxRate: 21,
  });
  assert.equal(amounts.requiresReview, false);
  assert.equal(amounts.taxKnown, true);
  assert.equal(amounts.total, 5445);
});

test('a payment with a changed net never borrows promotional savings from an older quote', () => {
  const amounts = checkoutAmounts(quote({ gross: 3600, amount_before_promo: 3600,
    promo_code: 'WELCOME30', promo_discount_percent: 30, promo_discount_amount: 1080,
    total: 2520, tax_amount: 529, total_with_tax: 3049 }), {
    net: 3600, total: 4356, tax: 756, taxRate: 21,
  });
  assert.equal(amounts.promoDiscount, 0);
  assert.equal(amounts.promoCode, null);
});

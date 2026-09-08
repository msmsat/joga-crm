import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasBillingAccess, billingStatusKey } from '../src/lib/billingAccess.ts';

const now = Date.parse('2026-09-08T12:00:00Z');
const future = '2099-09-08T13:00:00';
const past = '2020-09-08T11:00:00';
const plan = (billing_mode, status, expires_at) => ({ billing_mode, status, expires_at });

// Активация процента сохраняет статус старой подписки, в том числе expired/none.
for (const status of ['none', 'expired', 'canceled', 'unpaid', 'failed', 'trial', 'active']) {
  for (const expires of [null, past, future]) {
    const percent = plan('percent', status, expires);
    assert.equal(hasBillingAccess(percent, now), true);
    assert.equal(billingStatusKey(percent), 'header.active');
  }
}
// Комбо требует фиксированную оплату; процентная ветка на него не распространяется.
for (const mode of ['subscription', 'combo']) {
  for (const status of ['none', 'expired', 'canceled', 'unpaid', 'failed', 'pending']) {
    assert.equal(hasBillingAccess(plan(mode, status, future), now), false);
  }
  for (const status of ['active', 'trial', 'past_due']) {
    assert.equal(hasBillingAccess(plan(mode, status, future), now), true);
    assert.equal(hasBillingAccess(plan(mode, status, past), now), false);
    assert.equal(hasBillingAccess(plan(mode, status, null), now), false);
  }
}
assert.equal(hasBillingAccess(plan('subscription', 'active', '2026-09-08T12:00:00'), now), true);
assert.equal(hasBillingAccess(plan('subscription', 'active', '2026-09-08T13:00:00+02:00'), now), false);
assert.equal(hasBillingAccess(plan('subscription', 'active', 'invalid'), now), false);
assert.equal(billingStatusKey(plan('subscription', 'failed', null)), 'header.unpaid');
assert.equal(billingStatusKey(plan('combo', 'past_due', future)), 'header.awaitingPayment');

for (const lang of ['ru', 'en', 'cs', 'uk', 'de']) {
  const billing = JSON.parse(await readFile(new URL(`../src/locales/${lang}/billing.json`, import.meta.url)));
  const settings = JSON.parse(await readFile(new URL(`../src/locales/${lang}/settings.json`, import.meta.url)));
  for (const text of [billing.header.unpaid, billing.banner.unpaid, billing.banner.suspended, billing.status.failed]) {
    assert.ok(text && !/failed|undefined/i.test(text), `${lang}: ${text}`);
  }
  assert.equal(settings.billing.history.status.failed, billing.status.failed);
}
console.log('Billing access and payment messages: all checks passed.');

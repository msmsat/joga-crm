import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateLandingPrice } from '../src/pages/Landing/components/pricingMath.ts';

test('welcome applies after the period discount to the whole first fixed purchase', () => {
  const price = calculateLandingPrice(3000, 12, 0.3, 'subscription', 30);
  assert.equal(price.base, 36000);
  assert.equal(price.regular, 25200);
  assert.equal(price.promoSaving, 7560);
  assert.equal(price.first, 17640);
});

test('combo halves the discounted fixed amount and welcome never alters its sales rate', () => {
  const price = calculateLandingPrice(3000, 3, 0.2, 'combo', 30);
  assert.equal(price.base, 4500);
  assert.equal(price.regular, 3600);
  assert.equal(price.first, 2520);
  assert.equal(price.promoSaving, 1080);
});

test('an existing payer gets period savings without a second welcome discount', () => {
  const price = calculateLandingPrice(2000, 6, 0.25, 'subscription', 0);
  assert.equal(price.regular, 9000);
  assert.equal(price.first, 9000);
  assert.equal(price.promoSaving, 0);
});

test('the percentage model never invents an upfront discounted purchase', () => {
  assert.equal(calculateLandingPrice(3000, 12, 0.3, 'percent', 30), null);
});

test('discounted amounts round once in cents, with a half-cent in favour of the buyer', () => {
  const price = calculateLandingPrice(1001, 1, 0, 'combo', 30);
  assert.equal(price.regular, 500);
  assert.equal(price.first, 350);
});

test('the welcome discount matches server integer-cent rounding', () => {
  const price = calculateLandingPrice(333, 1, 0, 'subscription', 30);
  assert.equal(price.promoSaving, 99);
  assert.equal(price.first, 234);
});

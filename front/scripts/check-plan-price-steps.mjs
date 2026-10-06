import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as planModule from '../src/lib/plan.ts';

const ladder = [
  { seats: 1, price: 2000 }, { seats: 2, price: 2500 }, { seats: 3, price: 3000 },
  { seats: 4, price: 3500 }, { seats: 5, price: 4000 }, { seats: 6, price: 4500 },
  { seats: 7, price: 5000 }, { seats: 8, price: 6000 }, { seats: 9, price: 7000 },
  { seats: 10, price: 8000 }, { seats: 11, price: 9000 }, { seats: 12, price: 10000 },
  { seats: 13, price: 11000 }, { seats: 14, price: 12000 }, { seats: 15, price: 13000 },
  { seats: 16, price: 14000 }, { seats: 17, price: 15000 }, { seats: 18, price: 16000 },
  { seats: 19, price: 17000 }, { seats: 20, price: 18000 }, { seats: null, price: 23000 },
];

test('seat hints expose both price bands without treating unlimited as another seat', () => {
  assert.equal(typeof planModule.planPriceSteps, 'function', 'seat hints must derive every increment band from the catalog');
  assert.deepEqual(planModule.planPriceSteps(ladder), [
    { from: 2, to: 7, amount: 500 },
    { from: 8, to: 20, amount: 1000 },
  ]);
});

test('seat hint boundaries follow an updated catalog without a frontend price table', () => {
  assert.deepEqual(planModule.planPriceSteps([
    { seats: 4, price: 5800 }, { seats: 2, price: 3200 }, { seats: null, price: 23000 },
    { seats: 1, price: 2500 }, { seats: 3, price: 3900 }, { seats: 5, price: 7700 },
  ]), [
    { from: 2, to: 3, amount: 700 },
    { from: 4, to: 5, amount: 1900 },
  ]);
});

test('a missing tier never turns a multi-seat price jump into a per-seat promise', () => {
  assert.deepEqual(planModule.planPriceSteps([
    { seats: 1, price: 2000 }, { seats: 3, price: 3000 },
    { seats: 4, price: 3500 }, { seats: 5, price: 4000 },
  ]), [{ from: 4, to: 5, amount: 500 }]);
});

test('a lone tier or an unloaded catalog has no invented price increment', () => {
  assert.deepEqual(planModule.planPriceSteps([]), []);
  assert.deepEqual(planModule.planPriceSteps([{ seats: 1, price: 2000 }, { seats: null, price: 23000 }]), []);
});

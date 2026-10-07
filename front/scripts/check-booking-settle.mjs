// Модель итога записи (Journal/components/modals/booking-wizard/settleModel.ts):
// скидка на чеке и доля мастера. Процент мастера — от суммы СО скидкой (её
// считает сервер, back/services/lesson_compensation): 850 по прайсу, скидка
// 20 % — клиент платит 680, мастер на 40 % получает 272, студии остаётся 408.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const context = vm.createContext({ console, Math, Number, Array });
const source = await readFile(new URL('../src/pages/dashboard/Journal/components/modals/booking-wizard/settleModel.ts', import.meta.url), 'utf8');
const mod = new vm.SourceTextModule(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText, { context });
await mod.link(() => { throw new Error('settleModel не должна ничего импортировать в рантайме'); });
await mod.evaluate();
const m = mod.namespace;

const check = (patch = {}) => ({
  base_price: 850, total: 680, discounts: [{ kind: 'manual', amount: 170 }],
  deposit_applied: 0, certificate_applied: 0, ...patch,
});

test('скидка на чеке — только скидки, без баллов и депозита', () => {
  const r = m.receiptOf(check());
  assert.equal(r.discount, 170);
  assert.equal(Math.round(r.share * 100), 20);
  const noDiscount = m.receiptOf(check({ total: 800, discounts: [] }));
  assert.equal(noDiscount.discount, 0, 'баллы сняли 50 — это способ оплаты, не скидка');
  assert.equal(m.receiptOf(check({ discounts: [{ kind: 'manual', amount: 9999 }] })).discount, 850, 'не больше цены');
});

test('процент мастера — от суммы со скидкой, остаток — студии', () => {
  const e = m.earningOf({ kind: 'percent', rate: 40, amount: 272, base_amount: 680, duration_min: 30 }, check(), false);
  assert.equal(e.base, 680);
  assert.equal(e.amount, 272);
  assert.equal(e.studio, 408);
  assert.equal(e.split, true);
});

test('почасовая ставка: доля студии — что осталось от оплаты клиента, может уйти в минус', () => {
  const e = m.earningOf({ kind: 'hourly', rate: 1600, amount: 800, base_amount: null, duration_min: 30 }, check(), false);
  assert.equal(e.base, 680, 'база — сумма клиента с депозитом и сертификатом');
  assert.equal(e.hours, 0.5);
  assert.equal(e.studio, -120, 'скидка съела долю студии');
});

test('оклад, владелец и «не настроено» — карточки нет', () => {
  for (const kind of ['salary', 'owner', 'unconfigured']) {
    assert.equal(m.earningOf({ kind, rate: 40, amount: 1, base_amount: 1, duration_min: 30 }, check(), false), null);
  }
  assert.equal(m.earningOf(null, check(), false), null, 'не владелец — ставки нет');
});

test('визит по абонементу: процент неизвестен, долей не рисуем', () => {
  const e = m.earningOf({ kind: 'percent', rate: 40, amount: null, base_amount: null, duration_min: 30 },
    check({ total: 0, discounts: [] }), true);
  assert.equal(e.amount, null);
  assert.equal(e.split, false);
});

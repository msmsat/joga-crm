import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';

const i18n = createInstance();
await i18n.init({ lng: 'ru', resources: { ru: { translation: JSON.parse(await readFile(new URL('../src/locales/ru/journal.json', import.meta.url), 'utf8')) } }, interpolation: { escapeValue: false } });
const jsx = await import('react/jsx-runtime');
const context = vm.createContext({ console });
const source = await readFile(new URL('../src/pages/dashboard/Journal/components/lesson/MasterCompensation.tsx', import.meta.url), 'utf8');
const mod = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, { context });
await mod.link(name => {
  const exports = name === 'react/jsx-runtime' ? jsx : name === 'react-i18next' ? { useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) } : name.endsWith('/money') ? { formatMoney: n => `${n} EUR` } : {};
  return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
});
await mod.evaluate();
const render = (value, extra = {}) =>
  renderToStaticMarkup(React.createElement(mod.namespace.MasterCompensation, { value, currency: 'EUR', ...extra }));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const base = {
  kind: 'percent', rate: 30, amount: 600, base_amount: 2000, duration_min: 90,
  paid_base: 2000, due_base: 0, estimated_base: 0, paid_amount: 600, unknown_count: 0,
};
test('the share is shown big, with its rate and the paid amount it comes from', () => {
  const html = render(base);
  assert.match(html, /lc-pay-amount">600 EUR</);
  assert.match(text(html), /30% от 2000 EUR/);
  assert.match(html, /lc-pay-ring-value">30<small>%/);
  assert.match(html, /stroke-dasharray="30 100"/);
  assert.match(html, /lc-pay-chip is-paid/);
  assert.match(text(html), /Оплачено/);
});
test('an open debt is the money still expected', () => {
  const html = render({ ...base, paid_base: 0, due_base: 2000, paid_amount: 0 });
  assert.match(html, /lc-pay-chip is-due/);
  assert.match(text(html), /Ждёт оплаты/);
});
test('a lesson without any payment record says so instead of showing zero', () => {
  const html = render({ ...base, amount: 1200, base_amount: 4000, paid_base: 0, estimated_base: 4000, paid_amount: 0 });
  assert.match(html, /lc-pay-amount">1200 EUR</);
  assert.match(text(html), /30% от 4000 EUR/);
  assert.match(text(html), /Оплата не отмечена/);
});
test('partly paid splits the share into received and expected', () => {
  const html = render({ ...base, amount: 1200, base_amount: 4000, paid_base: 2000, due_base: 2000, paid_amount: 600 });
  assert.match(html, /lc-pay-chip is-partial/);
  assert.match(html, /width:50%/);
  assert.match(text(html), /600 EUR — с оплаченного/);
  assert.match(text(html), /600 EUR — ожидается/);
});
test('owner receives the whole amount', () => {
  const html = render({ ...base, kind: 'owner', rate: 100, amount: 2000, paid_amount: 2000 });
  assert.match(text(html), /Владельцу/);
  assert.match(html, /lc-pay-amount">2000 EUR</);
});
test('hourly pay shows rate and lesson hours', () => {
  assert.match(text(render({ ...base, kind: 'hourly', rate: 100, amount: 150 })), /150 EUR 100 EUR\/ч × 1,5/);
});
test('salary does not pretend to be a per-lesson payment', () => {
  const html = render({ ...base, kind: 'salary', amount: null });
  assert.match(text(html), /Оплата: оклад/);
  assert.doesNotMatch(html, /EUR/);
});
test('missing rate points to where it is set', () => {
  const html = render({ ...base, kind: 'unconfigured', amount: null, rate: null });
  assert.match(text(html), /Оплата не настроена/);
  assert.match(text(html), /карточке сотрудника/);
});
test('unknown membership allocation does not render zero earnings', () => {
  const html = render({ ...base, amount: null, base_amount: null });
  assert.match(text(html), /Доход: нет данных/);
  assert.doesNotMatch(html, /0 EUR/);
});
test('memberships without a price are named, not hidden', () => {
  assert.match(text(render({ ...base, unknown_count: 2 })), /абонементу без цены: 2/);
});
test('an empty lesson tells what each client will bring', () => {
  const html = render({ ...base, amount: 0, base_amount: 0, paid_base: 0, paid_amount: 0 }, { price: 4000, empty: true });
  assert.match(html, /≈ 1200 EUR/);
  assert.match(text(html), /30% от цены 4000 EUR — с каждого клиента/);
  assert.doesNotMatch(html, /lc-pay-chip/);
});
test('no salary data means no card', () => {
  assert.equal(render(null), '');
});
test('zero is a valid calculated amount', () => {
  const html = render({ ...base, amount: 0, base_amount: 0, paid_base: 0, paid_amount: 0 });
  assert.match(html, /lc-pay-amount">0 EUR</);
  assert.doesNotMatch(html, /lc-pay-chip/);
});

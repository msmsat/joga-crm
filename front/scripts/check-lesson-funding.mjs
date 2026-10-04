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
const source = await readFile(new URL('../src/pages/dashboard/Journal/components/lesson/FundingChips.tsx', import.meta.url), 'utf8');
const mod = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, { context });
await mod.link(name => {
  const exports = name === 'react/jsx-runtime' ? jsx : name === 'react-i18next' ? { useTranslation: () => ({ t: i18n.t.bind(i18n) }) } : name.endsWith('/money') ? { formatMoney: n => `${n} EUR` } : {};
  return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
});
await mod.evaluate();
const base = { price: 250, trialPercent: null, manualPercent: null, isTrial: false, subscriptionName: null, bySubscription: false, debt: 125, paidAmount: 0, payment: null };
const render = patch => renderToStaticMarkup(React.createElement(mod.namespace.FundingChips, { funding: { ...base, ...patch }, currency: 'EUR' }));

test('unpaid manual discount explains the missing 125 with its source and percentage', () => {
  const html = render({ manualPercent: 50 });
  assert.match(html, /Скидка администратора −50% · −125 EUR/);
  assert.match(html, /Цена 250 EUR/);
  assert.match(html, /125 EUR/);
  assert.doesNotMatch(html, /Оплачено/);
});
test('first lesson discount includes the saved percentage and money saved', () => {
  assert.match(render({ isTrial: true, trialPercent: 50 }), /Первое занятие −50% · −125 EUR/);
});
test('first lesson discount by amount names the money and its share of the price', () => {
  assert.match(render({ isTrial: true, trialPercent: null, trialAmount: 100, debt: 150 }), /Первое занятие −40% · −100 EUR/);
});
test('first lesson amount above the price is capped at the price', () => {
  assert.match(render({ isTrial: true, trialPercent: null, trialAmount: 400, debt: 0 }), /Первое занятие −100% · −250 EUR/);
});
test('paid receipt takes precedence over the booking discount', () => {
  const html = render({ manualPercent: 50, debt: 0, paidAmount: 200, payment: { base_price: 250, discounts: [{ kind: 'promo', amount: 50 }], promo_code: 'SUMMER', bonuses_value: 0, deposit_applied: 0, certificate_applied: 0, total: 200, method: 'cash' } });
  assert.match(html, /SUMMER −20% · −50 EUR/);
  assert.match(html, /Оплачено 200 EUR/);
  assert.doesNotMatch(html, /Скидка администратора/);
});
test('a full manual discount still explains why no payment is due', () => {
  assert.match(render({ manualPercent: 100, debt: 0 }), /Скидка администратора −100% · −250 EUR/);
});
test('subscription visits do not claim a cash discount', () => {
  assert.doesNotMatch(render({ bySubscription: true, subscriptionName: 'Yoga', debt: 0, manualPercent: 50 }), /Скидка администратора/);
});
test('partial payments show both the paid amount and remaining debt', () => {
  const html = render({ manualPercent: 50, debt: 75, paidAmount: 50 });
  assert.match(html, /Скидка администратора −50% · −125 EUR/);
  assert.match(html, /Оплачено · 50 EUR/);
  assert.match(html, /75 EUR/);
});
test('when discounts do not stack only the discount matching the debt is shown', () => {
  const html = render({ manualPercent: 50, isTrial: true, trialPercent: 20 });
  assert.match(html, /Скидка администратора −50% · −125 EUR/);
  assert.doesNotMatch(html, /Первое занятие/);
});
test('stacked stored discounts explain the combined reduction', () => {
  const html = render({ manualPercent: 20, isTrial: true, trialPercent: 30, debt: 125 });
  assert.match(html, /Скидка администратора −20% · −50 EUR/);
  assert.match(html, /Первое занятие −30% · −75 EUR/);
});

test('the lesson roster passes the saved manual discount to the displayed receipt', async () => {
  const file = new URL('../src/pages/dashboard/Journal/components/lesson/BookedClients.tsx', import.meta.url);
  const roster = new vm.SourceTextModule(ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, { context });
  await roster.link(name => {
    const exports = name === 'react' ? React : name === 'react/jsx-runtime' ? jsx
      : name === 'react-i18next' ? { useTranslation: () => ({ t: i18n.t.bind(i18n) }) }
      : name.endsWith('/FundingChips') ? { FundingChips: mod.namespace.FundingChips }
      : name.endsWith('/VisitMarks') ? { AttendMark: () => null, PayMark: () => null }
      : name.endsWith('/utils') ? { attendanceOf: () => 'waiting' }
      : name.endsWith('/ReservationPayModal') ? { ReservationPayModal: () => null }
      : name.endsWith('/errorMessage') ? { errorMessage: () => '' }
      : name.endsWith('/ui/index') ? { useToast: () => ({}) } : {};
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await roster.evaluate();
  const html = renderToStaticMarkup(React.createElement(roster.namespace.BookedClients, {
    clients: [{ reservation_id: 1, client_id: 1, name: 'Anna', status: 'active', is_trial: false, manual_discount_percent: 50, debt: 125, paid_amount: 0, payment: null }],
    price: 250, canEdit: false, removable: false, started: false,
  }));
  assert.match(html, /Скидка администратора −50% · −125 EUR/);
});
test('legacy paid bookings retain their recorded manual discount', () => {
  assert.match(render({ manualPercent: 50, debt: 0, paidAmount: 125 }), /Скидка администратора −50% · −125 EUR/);
});
test('a price difference alone does not invent a discount source', () => {
  assert.doesNotMatch(render({ manualPercent: null }), /Скидка администратора|Первое занятие/);
});

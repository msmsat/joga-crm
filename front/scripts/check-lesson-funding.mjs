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
const translation = { useTranslation: () => ({ t: i18n.t.bind(i18n) }) };
const money = { formatMoney: n => `${n} EUR` };
/** Модуль из src/…/lesson в vm: импорты отдаёт `mocks` по окончанию имени, прочее — пустышка (стили). */
async function lessonModule(file, mocks = {}) {
  const source = await readFile(new URL(`../src/pages/dashboard/Journal/components/lesson/${file}`, import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, { context });
  await module.link(name => {
    const all = { 'react/jsx-runtime': jsx, 'react-i18next': translation, ...mocks };
    const key = Object.keys(all).find(k => name === k || name.endsWith(`/${k}`));
    const exports = key ? all[key] : {};
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, value] of Object.entries(exports)) this.setExport(k, value); }, { context });
  });
  await module.evaluate();
  return module.namespace;
}
// Разбор оплаты — общий модуль чипов, чека и «Итога» (lesson/funding.ts); импортов у него нет.
const funding = await lessonModule('funding.ts');
const fundingMocks = { money, funding: { ...funding } };
const mod = { namespace: await lessonModule('FundingChips.tsx', fundingMocks) };
const bill = await lessonModule('LessonBill.tsx', fundingMocks);
const base = { price: 250, trialPercent: null, manualPercent: null, isTrial: false, subscriptionName: null, bySubscription: false, debt: 125, paidAmount: 0, payment: null };
const render = patch => renderToStaticMarkup(React.createElement(mod.namespace.FundingChips, { funding: { ...base, ...patch }, currency: 'EUR' }));
const renderBill = patch => renderToStaticMarkup(React.createElement(bill.LessonBill, { funding: { ...base, ...patch }, currency: 'EUR' }));
const paidSnapshot = { base_price: 250, discounts: [{ kind: 'manual', amount: 50 }], promo_code: null, bonuses_applied: 0, bonuses_value: 0, deposit_applied: 0, certificate_applied: 0, total: 200, method: 'transfer' };

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
      : name.endsWith('/LessonBill') ? { LessonBill: bill.LessonBill }
      : name.endsWith('/funding') ? { ...funding }
      : name.endsWith('/VisitMarks') ? { AttendMark: () => null, PayMark: () => null }
      : name.endsWith('/utils') ? { attendanceOf: () => 'waiting' }
      : name.endsWith('/ReservationPayModal') ? { ReservationPayModal: () => null }
      : name.endsWith('/PaidSheet') ? { PaidSheet: () => null }
      : name.endsWith('/paymentChange') ? { paymentChangeable: () => false }
      : name.endsWith('/errorMessage') ? { errorMessage: () => '' }
      : name.endsWith('/ui/index') ? { useToast: () => ({}) } : {};
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await roster.evaluate();
  const html = renderToStaticMarkup(React.createElement(roster.namespace.BookedClients, {
    clients: [{ reservation_id: 1, client_id: 1, name: 'Anna', status: 'active', is_trial: false, manual_discount_percent: 50, debt: 125, paid_amount: 0, payment: null }],
    price: 250, canEdit: false, removable: false, started: false,
  }));
  // Чек записанного: итог со скидкой клиента крупно, прайс «было», скидка строкой.
  assert.match(html, /Итог/);
  assert.match(html, /lc-bill-amount">125 EUR/);
  assert.match(html, /было <s>250 EUR<\/s>/);
  assert.match(html, /Скидка администратора −50%<\/span><span>−125 EUR/);
  assert.match(html, /Не оплачено/);
});
test('the bill of a paid booking names the method instead of a debt', () => {
  const html = renderBill({ debt: 0, paidAmount: 200, payment: paidSnapshot });
  assert.match(html, /lc-bill-amount">200 EUR/);
  assert.match(html, /было <s>250 EUR<\/s>/);
  assert.match(html, /Оплачено · переводом/);
  assert.doesNotMatch(html, /Не оплачено/);
});
test('the bill shows what points paid and the cash part separately', () => {
  const html = renderBill({ debt: 0, payment: { ...paidSnapshot, bonuses_applied: 10, bonuses_value: 40, total: 160 } });
  assert.match(html, /lc-bill-amount">200 EUR/);
  assert.match(html, /Баллы \(10\)<\/span><span>−40 EUR/);
  assert.match(html, /Оплачено<\/span><span>160 EUR/);
});
test('a partial payment keeps the remaining debt in the bill status', () => {
  const html = renderBill({ manualPercent: 50, debt: 75, paidAmount: 50 });
  assert.match(html, /Не оплачено · 75 EUR/);
  assert.match(html, /Оплачено<\/span><span>50 EUR/);
});
test('a subscription visit has no money total in the bill', () => {
  const html = renderBill({ bySubscription: true, subscriptionName: 'Yoga', debt: 0 });
  assert.match(html, /Абонемент «Yoga»/);
  assert.doesNotMatch(html, /Итог|EUR/);
});
test('a full discount reads as free, with the list price as before', () => {
  const html = renderBill({ manualPercent: 100, debt: 0 });
  assert.match(html, /lc-bill-amount">0 EUR/);
  assert.match(html, /было <s>250 EUR<\/s>/);
  assert.match(html, /Бесплатно/);
});
test('a bill without any discount does not show a crossed-out price', () => {
  const html = renderBill({ debt: 250 });
  assert.match(html, /lc-bill-amount">250 EUR/);
  assert.doesNotMatch(html, /было/);
});
test('the client price is the list price minus the client discounts', () => {
  // Копия — объект из vm-контекста с чужим прототипом deepStrictEqual не равен.
  const price = patch => { const r = funding.discountedPrice({ ...base, ...patch }); return r && { ...r }; };
  assert.deepEqual(price({ manualPercent: 50 }), { base: 250, price: 125 });
  // Частичная оплата: долг и внесённое вместе — это цена клиента.
  assert.deepEqual(price({ debt: 75, paidAmount: 50 }), { base: 250, price: 125 });
  // После оплаты — по снимку кассы; баллы и депозит — средства оплаты, не скидка.
  assert.deepEqual(price({ debt: 0, payment: { base_price: 300, discounts: [{ kind: 'manual', amount: 60 }], promo_code: null,
    bonuses_applied: 10, bonuses_value: 40, deposit_applied: 0, certificate_applied: 0, total: 200, method: 'cash' } }),
  { base: 300, price: 240 });
  assert.deepEqual(price({ manualPercent: 100, debt: 0 }), { base: 250, price: 0 });
  assert.equal(price({ debt: 250 }), null);
  assert.equal(price({ bySubscription: true, debt: 0 }), null);
  assert.equal(price({ debt: 0 }), null);
});
test('legacy paid bookings retain their recorded manual discount', () => {
  assert.match(render({ manualPercent: 50, debt: 0, paidAmount: 125 }), /Скидка администратора −50% · −125 EUR/);
});
test('a price difference alone does not invent a discount source', () => {
  assert.doesNotMatch(render({ manualPercent: null }), /Скидка администратора|Первое занятие/);
});

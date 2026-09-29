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
const render = value => renderToStaticMarkup(React.createElement(mod.namespace.MasterCompensation, { value, currency: 'EUR' }));
const base = { kind: 'percent', rate: 40, amount: 50, base_amount: 125, duration_min: 90 };
test('percentage displays net earnings and its calculation', () => {
  const html = render(base);
  assert.match(html, /Расчёт мастеру: 50 EUR · 40%/);
  assert.match(html, /125 EUR × 40% = 50 EUR/);
});
test('owner receives the whole amount', () => {
  assert.match(render({ ...base, kind: 'owner', rate: 100, amount: 125 }), /Владельцу: 125 EUR · 100%/);
});
test('hourly pay shows rate and lesson hours', () => {
  assert.match(render({ ...base, kind: 'hourly', rate: 100, amount: 150 }), /150 EUR · 100 EUR\/ч × 1,5/);
});
test('salary does not pretend to be a per-lesson payment', () => {
  const html = render({ ...base, kind: 'salary', amount: null });
  assert.match(html, /Оплата: оклад/);
  assert.doesNotMatch(html, /EUR/);
});
test('unknown membership allocation does not render zero earnings', () => {
  const html = render({ ...base, amount: null, base_amount: null });
  assert.match(html, /Доход: нет данных/);
  assert.doesNotMatch(html, /0 EUR/);
});
test('no salary data means no row', () => {
  assert.equal(render(null), '');
});
test('zero is a valid calculated amount', () => {
  assert.match(render({ ...base, amount: 0, base_amount: 0 }), /Расчёт мастеру: 0 EUR/);
});

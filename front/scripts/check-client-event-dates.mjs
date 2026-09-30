import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';

const i18n = createInstance();
await i18n.init({ lng: 'ru', resources: { ru: { translation: JSON.parse(await readFile(new URL('../src/locales/ru/clients.json', import.meta.url), 'utf8')) } }, interpolation: { escapeValue: false } });
const jsx = await import('react/jsx-runtime');
const context = vm.createContext({ console });
const source = await readFile(new URL('../src/pages/dashboard/Clients/components/ClientEventDates.tsx', import.meta.url), 'utf8');
const mod = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, { context });
await mod.link(name => {
  const exports = name === 'react/jsx-runtime' ? jsx : name === 'react-i18next' ? { useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) } : name.endsWith('/money') ? { formatMoney: n => `${n} EUR` } : {};
  return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
});
await mod.evaluate();
const render = event => renderToStaticMarkup(React.createElement(mod.namespace.ClientEventDates, { event }));
const booking = { type: 'booking', scheduled_at: '2026-09-28T10:00:00', occurred_at: '2026-09-26T12:00:00+03:00' };
test('booking distinguishes appointment from creation', () => {
  const html = render(booking);
  assert.match(html, /Занятие:.*28 сент.*10:00/);
  assert.match(html, /Запись создана:.*26 сент.*12:00/);
});
test('studio day and time stay unchanged regardless of browser timezone', () => {
  assert.match(render({ type: 'bonus', occurred_at: '2026-09-28T01:30:00+03:00' }), /28 сент.*01:30/);
});
test('payment shows settlement and appointment dates', () => {
  const html = render({ ...booking, type: 'payment', occurred_at: '2026-09-29T14:20:00+03:00' });
  assert.match(html, /Оплачено:.*29 сент.*14:20/);
  assert.match(html, /Занятие:.*28 сент.*10:00/);
});
test('old debt creation must not be presented as payment time', () => {
  const html = render({ ...booking, type: 'payment', occurred_at: null, recorded_at: '2026-09-26T12:00:00+03:00' });
  assert.match(html, /Дата оплаты не сохранена/);
  assert.match(html, /Платёж создан:.*26 сент/);
  assert.doesNotMatch(html, /Оплачено:/);
});
test('cancel includes action and appointment time', () => {
  const html = render({ ...booking, type: 'cancel' });
  assert.match(html, /Отменено:.*26 сент/);
  assert.match(html, /Занятие:.*28 сент/);
});
test('visit shows the appointment time once', () => {
  const html = render({ ...booking, type: 'visit', occurred_at: booking.scheduled_at });
  assert.match(html, /Визит:.*28 сент/);
  assert.equal((html.match(/28 сент/g) || []).length, 1);
});
test('freezes and bonuses show their action timestamps', () => {
  for (const type of ['freeze', 'bonus']) assert.match(render({ type, occurred_at: booking.occurred_at }), /Дата события:.*26 сент.*12:00/);
});
test('legacy date-only records do not invent an appointment or midnight', () => {
  const html = render({ type: 'booking', date: '2026-09-28' });
  assert.match(html, /Дата события:.*28 сент/);
  assert.doesNotMatch(html, /00:00|Занятие:/);
});
test('invalid or absent dates are explicit', () => {
  assert.match(render({ type: 'bonus', date: 'bad' }), /Дата не сохранена/);
  assert.match(render({ type: 'bonus', date: null }), /Дата не сохранена/);
});

test('historical cancellation without action time still shows the appointment', () => {
  const html = render({ ...booking, type: 'cancel', occurred_at: null });
  assert.match(html, /Дата не сохранена/);
  assert.match(html, /Занятие:.*28 сент.*10:00/);
});

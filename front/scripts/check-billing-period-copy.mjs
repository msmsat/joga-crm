import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const locales = new URL('../src/locales/', import.meta.url);
const percentDescriptions = {
  ru: 'Без фикса: {{rate}}% с каждой продажи, включая наличные.',
  en: 'No fixed fee: {{rate}}% of every sale, cash included.',
  cs: 'Bez pevného poplatku: {{rate}} % z každé tržby, včetně hotovosti.',
  uk: 'Без фіксованої плати: {{rate}}% з кожного продажу, включно з готівкою.',
  de: 'Keine Grundgebühr: {{rate}} % von jedem Verkauf, Bargeld inklusive.',
};

for (const entry of await readdir(locales, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const language = entry.name;
  const billing = JSON.parse(await readFile(new URL(`${language}/billing.json`, locales), 'utf8'));
  test(`${language}: billing describes prepaid access while retaining sales commission and forfeiture`, () => {
    const copy = [billing.header.subtitle, billing.header.noPlan, billing.mode.subscription,
      billing.mode.short.subscription, billing.mode.descriptions.subscription, billing.mode.descriptions.combo,
      billing.mode.confirmSwitchMessage, billing.payModal.cardNote];
    assert.ok(copy.every(text => typeof text === 'string' && text.length > 0));
    for (const text of copy) assert.doesNotMatch(text, /подписк|передплат|subscription|subscribe|předplat|\babo\b/i);
    assert.match(billing.mode.descriptions.combo, /\{\{rate\}\}/);
    assert.ok(!Object.hasOwn(billing.payModal, 'freeUntil'));
    assert.match(billing.payModal.cardNote, /Stripe/);
    assert.doesNotMatch(billing.payModal.cardNote, /\b7\b|refund|возврат|повернення|vrácení|Rückerstattung/i);
    assert.match(billing.mode.confirmSwitchMessage, /СГОРАЕТ|ЗГОРЯЄ|FORFEITED|PROPADÁ|VERFÄLLT/);
    if (Object.hasOwn(percentDescriptions, language)) {
      assert.equal(billing.mode.descriptions.percent, percentDescriptions[language]);
    }
    assert.match(billing.mode.termsMessage, /\{\{rate\}\}/);
    assert.match(billing.mode.termsMinimum, /\{\{amount\}\}/);
    assert.ok(billing.mode.termsCombo.length > 0);
  });
}

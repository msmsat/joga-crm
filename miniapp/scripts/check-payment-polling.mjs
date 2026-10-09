import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function setup({ awaiting = true, hidden = false, empty = false } = {}) {
  const window = new EventTarget(), document = new EventTarget(), timers = new Map();
  document.visibilityState = hidden ? 'hidden' : 'visible';
  let nextId = 0, checks = 0, cleanup, pending = true;
  const context = vm.createContext({ window, document,
    setTimeout(callback, delay) { timers.set(++nextId, { callback, delay }); return nextId; },
    clearTimeout(id) { timers.delete(id); },
  });
  const dependencies = {
    react: { useEffect(effect) { cleanup = effect(); }, useSyncExternalStore(_subscribe, get) { return get(); } },
    paymentSync: { getPaymentSnapshot: () => ({ awaiting }), notePaymentReturn() {}, subscribePayments() {},
      async syncCheckouts() { checks++; return { payments: empty ? [] : [{ status: pending ? 'pending' : 'paid' }] }; } },
  };
  const source = ts.transpileModule(await readFile(new URL('../src/hooks/usePaymentReconciliation.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const module = new vm.SourceTextModule(source, { context });
  await module.link(name => {
    const exports = dependencies[name.split('/').at(-1)];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  module.namespace.usePaymentReconciliation(true);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  return { window, document, timers, checks: () => checks, close: () => cleanup(),
    paid: () => { pending = false; awaiting = false; },
    async tick() { const entry = timers.entries().next().value; if (!entry) return; const [id, timer] = entry; timers.delete(id); timer.callback(); await settle(); }, settle };
}

test('waiting for Stripe continues polling with backoff beyond the first minute', async () => {
  const s = await setup();
  for (let index = 0; index < 13; index++) await s.tick();
  assert.equal(s.checks(), 14);
  assert.equal([...s.timers.values()][0].delay, 15000);
  s.paid(); await s.tick();
  assert.equal(s.timers.size, 0);
});

test('unrelated unpaid history uses a bounded refresh instead of polling forever', async () => {
  const s = await setup({ awaiting: false });
  for (let index = 0; index < 15; index++) await s.tick();
  assert.equal(s.checks(), 12);
  assert.equal(s.timers.size, 0);
});

test('return waiting retries when the checkout record is not available yet', async () => {
  const s = await setup({ empty: true });
  for (let index = 0; index < 13; index++) await s.tick();
  assert.equal(s.checks(), 14);
  assert.equal([...s.timers.values()][0].delay, 15000);
  s.close();
});

test('hidden apps do no network work and verify when the client returns', async () => {
  const s = await setup({ hidden: true });
  assert.equal(s.checks(), 0);
  s.document.visibilityState = 'visible'; s.document.dispatchEvent(new Event('visibilitychange')); await s.settle();
  assert.equal(s.checks(), 1);
});

test('unmount removes polling and return listeners', async () => {
  const s = await setup(); s.close();
  assert.equal(s.timers.size, 0);
  s.window.dispatchEvent(new Event('focus')); await s.settle();
  assert.equal(s.checks(), 1);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function setup() {
  let session = { token: 'client1', name: 'Client' }, bumps = 0;
  let response = { payments: [], verification_unavailable: false }, draft = null;
  const values = new Map(), calls = [], window = new EventTarget();
  window.location = { href: 'https://studio.test/s/one' };
  window.history = { replaceState(_state, _title, url) { window.location.href = String(url); } };
  const context = vm.createContext({ console, URL, Date, Set, Map, JSON, Event, CustomEvent, window,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
  });
  const dependencies = {
    client: { apiPost: async (path, body) => { calls.push({ path, body }); return typeof response === 'function' ? response() : response; } },
    session: { getSession: () => session, accountId: token => token, studioOf: () => 1 },
    revision: { bumpLessons() { bumps++; } },
    bookingCheckout: { readBookingCheckout: () => draft, clearBookingCheckout: () => { draft = null; } },
  };
  const source = ts.transpileModule(await readFile(new URL('../src/lib/paymentSync.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const module = new vm.SourceTextModule(source, { context });
  await module.link(name => {
    const exports = dependencies[name.split('/').at(-1)];
    if (!exports) throw new Error(`Missing dependency ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return { api: module.namespace, calls, window, values,
    respond: value => { response = value; }, switchUser: token => { session = { token, name: token }; },
    bumps: () => bumps,
    draft: () => draft, rememberDraft: id => { draft = { booking: { reservation_id: id } }; },
  };
}
const payment = (status = 'pending', extra = {}) => ({ id: 21, kind: 'booking', status, amount_str: '25 Kč',
  title: 'Hair styling', reservation_id: 41, package_id: null, created_at: new Date().toISOString(), newly_paid: false, ...extra });
const result = (...payments) => ({ payments, verification_unavailable: false });

test('only verified paid matching booking clears its Stripe return draft', async () => {
  const s = await setup(); s.rememberDraft(41);
  s.respond(result(payment())); await s.api.syncCheckouts();
  assert.equal(s.draft().booking.reservation_id, 41);
  s.respond(result(payment('paid', { reservation_id: 42 }))); await s.api.syncCheckouts();
  assert.equal(s.draft().booking.reservation_id, 41);
  s.respond(result(payment('paid'))); await s.api.syncCheckouts();
  assert.equal(s.draft(), null);
});

test('a cancelled Stripe return does not show a payment acceptance overlay', async () => {
  const s = await setup(); s.window.location.href += '?pay=paycancel&checkout_id=21';
  s.respond(result(payment())); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().awaiting, false);
  assert.equal(s.api.getPaymentSnapshot().success, null);
});

test('server-pending debt retains its waiting state when reconciliation starts immediately', async () => {
  const s = await setup();
  s.respond(result(payment()));
  let checking;
  s.window.addEventListener('velora:checkout-started', () => { checking = s.api.syncCheckouts(); });
  s.api.awaitCheckout({ checkout_id: 21, reservation_id: 41 });
  await checking;
  assert.equal(s.api.getPaymentSnapshot().awaiting, true);
  assert.equal(s.api.getPaymentSnapshot().success, null);
});

test('a Stripe return URL and an unpaid session never celebrate or claim payment', async () => {
  const s = await setup(); s.window.location.href += '?pay=paysuccess&checkout_id=21';
  s.respond(result(payment())); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success, null);
  assert.equal(s.api.getPaymentSnapshot().payments[0].status, 'pending');
  assert.equal(s.api.getPaymentSnapshot().awaiting, true);
});
test('pending then server-paid refreshes bookings and celebrates confirmed payment', async () => {
  const s = await setup(); s.respond(result(payment())); await s.api.syncCheckouts();
  s.respond(result(payment('paid'))); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success.id, 21);
  assert.equal(s.api.getPaymentSnapshot().awaiting, false);
  assert.ok(s.bumps() >= 1);
});
test('a webhook received before the browser returns is recovered by the stored checkout ID', async () => {
  const s = await setup(); s.api.rememberCheckout({ checkout_id: 21 });
  s.respond(result(payment('paid'))); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success.id, 21);
});
test('opening the app does not celebrate unrelated already-paid purchase history', async () => {
  const s = await setup(); s.respond(result(payment('paid'))); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success, null);
});
test('a newly reconciled paid booking celebrates even without a previous browser marker', async () => {
  const s = await setup(); s.respond(result(payment('paid', { newly_paid: true }))); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success.id, 21);
});
test('dismissed payment does not celebrate twice on focus or duplicate responses', async () => {
  const s = await setup(); s.respond(result(payment('paid', { newly_paid: true }))); await s.api.syncCheckouts();
  s.api.dismissPaymentSuccess(); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success, null);
});

test('two confirmed payments keep separate receipts without losing the second celebration', async () => {
  const s = await setup();
  s.respond(result(payment('paid', { newly_paid: true }), payment('paid', { id: 22, newly_paid: true })));
  await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success.id, 22);
  await s.api.syncCheckouts();
  s.api.dismissPaymentSuccess();
  assert.equal(s.api.getPaymentSnapshot().success.id, 21);
  s.api.dismissPaymentSuccess();
  await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success, null);
});

test('closing a paid receipt during a refresh does not reopen the same receipt', async () => {
  const s = await setup(); s.respond(result(payment('paid', { newly_paid: true }))); await s.api.syncCheckouts();
  let resolve;
  s.respond(() => new Promise(done => { resolve = done; }));
  const request = s.api.syncCheckouts(); s.api.dismissPaymentSuccess();
  resolve(result(payment('paid'))); await request;
  assert.equal(s.api.getPaymentSnapshot().success, null);
});

test('a Telegram payment return waits for server confirmation before showing success', async () => {
  const s = await setup(); s.api.notePaymentReturn('paysuccess');
  s.respond(result(payment())); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().awaiting, true);
  assert.equal(s.api.getPaymentSnapshot().success, null);
  s.respond(result(payment('paid'))); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().awaiting, false);
  assert.equal(s.api.getPaymentSnapshot().success.id, 21);
});

test('a receipt already seen in another tab is not celebrated again', async () => {
  const s = await setup(); s.api.rememberCheckout({ checkout_id: 21 });
  s.values.set('velora:checkout:1:client1', JSON.stringify({ hints: [], seen: [21] }));
  s.respond(result(payment('paid', { newly_paid: true }))); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success, null);
});

test('dismissing the waiting panel during a request does not reopen it or hide later success', async () => {
  const s = await setup(); s.window.location.href += '?pay=paysuccess&checkout_id=21';
  s.api.rememberCheckout({ checkout_id: 21 });
  let resolve;
  s.respond(() => new Promise(done => { resolve = done; }));
  const request = s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().awaiting, true);
  s.api.dismissPaymentWaiting();
  resolve(result(payment())); await request;
  assert.equal(s.api.getPaymentSnapshot().awaiting, false);
  s.respond(result(payment('paid'))); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success.id, 21);
});
test('switching account discards the previous account response and receipt', async () => {
  const s = await setup(); let resolve;
  s.respond(() => new Promise(done => { resolve = done; }));
  const pending = s.api.syncCheckouts(); s.switchUser('client2');
  resolve(result(payment('paid', { newly_paid: true }))); await pending;
  assert.equal(s.api.getPaymentSnapshot().success, null);
  assert.equal(s.api.getPaymentSnapshot().payments.length, 0);
});
test('network failure is recoverable and does not change a pending payment to paid', async () => {
  const s = await setup(); s.respond(result(payment())); await s.api.syncCheckouts();
  s.respond(() => { throw new Error('Offline'); }); await assert.rejects(s.api.syncCheckouts());
  assert.equal(s.api.getPaymentSnapshot().error, true);
  assert.equal(s.api.getPaymentSnapshot().success, null);
  s.respond(result(payment('paid'))); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().error, false);
  assert.equal(s.api.getPaymentSnapshot().success.id, 21);
});
test('rapid simultaneous refreshes share one request and specify no client identity', async () => {
  const s = await setup(); let resolve;
  s.respond(() => new Promise(done => { resolve = done; }));
  const a = s.api.syncCheckouts({ reservation_id: 41 });
  const b = s.api.syncCheckouts({ reservation_id: 41 });
  assert.equal(s.calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls[0].body)), { reservation_id: 41 });
  resolve(result(payment())); await Promise.all([a, b]);
});
test('failed fulfillment never produces success even with a saved payment marker', async () => {
  const s = await setup(); s.api.rememberCheckout({ reservation_id: 41 });
  s.respond(result(payment('failed'))); await s.api.syncCheckouts();
  assert.equal(s.api.getPaymentSnapshot().success, null);
});

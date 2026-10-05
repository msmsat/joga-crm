import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real billing controller and banner; only browser/React boundaries
// and HTTP responses are replaced so webhook timing is deterministic.
async function setup({ search = '?payment=return&invoice_id=42', statuses = ['pending'], returnedId = 42,
  scope = '', localStorage, catalog = { plans: [], period_discounts: { 1: 0 } }, quotes = { quotes: [] }, loading = [] } = {}) {
  let index = 0, changed = false, latest, now = 0, nextTimer = 1;
  const state = [], effects = [], timers = new Map(), syncs = [], navigations = [], previews = [];
  const activePlan = { plan_name: 'free_trial', status: 'active', billing_mode: 'subscription',
    expires_at: '2099-01-01T00:00:00Z', has_live_subscription: false, trial_available: false };
  const invoice = status => ({ id: returnedId, plan_name: 's7', period_months: 3, amount: 5445,
    payment_method: 'card', paid_at: status === 'paid' ? '2026-10-03T00:00:00Z' : null,
    status, pdf_url: null });
  const context = vm.createContext({ console, URLSearchParams, localStorage,
    window: { location: { search, pathname: '/dashboard/billing' },
      history: { replaceState() {} }, addEventListener() {}, removeEventListener() {},
      setTimeout: (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, at: now + delay }); return id; },
      clearTimeout: id => timers.delete(id) },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: callback => { callback(); return 0; }, clearTimeout() {},
  });
  const modules = new Map();
  function mock(name, values) {
    modules.set(name, new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context }));
  }
  const equal = (left, right) => left && right && left.length === right.length && left.every((v, i) => Object.is(v, right[i]));
  mock('react', {
    useState(value) { const slot = index++; if (!(slot in state)) state[slot] = typeof value === 'function' ? value() : value;
      return [state[slot], next => { const value = typeof next === 'function' ? next(state[slot]) : next;
        if (!Object.is(value, state[slot])) { state[slot] = value; changed = true; } }]; },
    useRef(value) { const slot = index++; state[slot] ??= { current: value }; return state[slot]; },
    useMemo(factory, deps) { const slot = index++; if (!equal(state[slot]?.deps, deps)) state[slot] = { deps, value: factory() }; return state[slot].value; },
    useCallback(callback, deps) { const slot = index++; if (!equal(state[slot]?.deps, deps)) state[slot] = { deps, value: callback }; return state[slot].value; },
    useEffect(callback, deps) { const slot = index++; if (!equal(state[slot]?.deps, deps)) {
      state[slot]?.cleanup?.(); state[slot] = { deps }; effects.push(() => { state[slot].cleanup = callback(); }); } },
  });
  const qc = { fetchQuery: async () => activePlan, setQueryData() {}, invalidateQueries() {} };
  // Ответы кэша по ключу: план, каталог и наборы расчётов (одинаковые для обеих моделей).
  const cached = { plan: activePlan, plans: catalog, quotes };
  mock('@tanstack/react-query', { useQuery: ({ queryKey }) => loading.includes(queryKey[1])
    ? { data: undefined, status: 'pending' } : { data: cached[queryKey[1]], status: 'success' }, useQueryClient: () => qc });
  mock('react-router-dom', { useNavigate: () => path => navigations.push(path) });
  mock('react-i18next', { useTranslation: () => ({ t: (key, values) => key + (values?.plan ? `:${values.plan}` : '') }) });
  const api = { getPlan: async () => activePlan, getPlans: async () => catalog,
    getInvoices: async () => ({ items: [invoice('pending')], total: 1, limit: 100, offset: 0 }),
    getPaymentCards: async () => [], getStats: async () => ({ total_spent: 0 }),
    previewCheckout: async (...args) => { previews.push(args); return null; },
    syncInvoice: async id => { syncs.push(id); const outcome = await statuses[Math.min(syncs.length - 1, statuses.length - 1)];
      if (outcome instanceof Error) throw outcome; return invoice(outcome); } };
  mock('../../../../api/billing/billing.api', { billingApi: api });
  mock('../constants', { DEFAULT_PLAN_ID: 's1', PERIOD_DISCOUNTS_FALLBACK: { 1: 0 } });
  mock('../../../../lib/plan', { planLabel: name => name, planSeats: () => 1 });
  mock('../../../../api/errorMessage', { errorMessage: error => error.message });
  mock('../../../../api/queryKeys', { queryKeys: { billingPlan: ['billing', 'plan'], billingPlans: ['billing', 'plans'],
    billingQuotes: combo => ['billing', 'quotes', combo], billingQuotesAll: ['billing', 'quotes'] } });
  mock('../../../../utils/auth', { getActiveContextKey: () => scope });
  mock('../../../../components/ui/index', { useToast: () => ({ error() {}, success() {} }) });
  mock('../../../lib/plan', { planLabel: name => name });
  mock('../../../utils/legal', { LEGAL_LINK_PROPS: {}, PRIVACY_URL: '/privacy', TERMS_URL: '/terms' });
  mock('../../../hooks/useAiIntent', { useAiIntent() {} });
  mock('./Billing.module.css', { default: {} });
  for (const name of ['sections/BillingHeader', 'sections/OfflineFeeCard', 'sections/TrialOfferCard',
    'tabs/PlansTab', 'tabs/InvoicesTab', 'tabs/PaymentMethodTab']) mock(`./components/${name}`, { default: name });
  const node = (type, props) => ({ type, props });
  mock('react/jsx-runtime', { jsx: node, jsxs: node, Fragment: 'Fragment' });
  async function source(path) {
    const code = ts.transpileModule(await readFile(new URL(`../src/pages/dashboard/Billing/${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = new vm.SourceTextModule(code, { context });
    await module.link(async name => {
      if (modules.has(name)) return modules.get(name);
      if (name === './usePaymentReturn') return source('hooks/usePaymentReturn.ts');
      if (name === './useBillingChoice') return source('hooks/useBillingChoice.ts');
      if (name === './useBillingCatalog') return source('hooks/useBillingCatalog.ts');
      if (name === './useCheckoutQuotes') return source('hooks/useCheckoutQuotes.ts');
      assert.fail(`Unexpected dependency: ${name}`);
    });
    await module.evaluate(); return module;
  }
  const controller = await source('hooks/useBillingCalculator.ts');
  mock('./hooks/useBillingCalculator', { useBillingCalculator: () => latest });
  const billing = await source('Billing.tsx');
  let tree;
  async function settle() {
    for (let tries = 0; tries < 30; tries++) {
      if (changed || !latest) { changed = false; index = 0; latest = controller.namespace.useBillingCalculator(); tree = billing.namespace.default(); }
      while (effects.length) effects.shift()();
      await new Promise(resolve => setImmediate(resolve));
      if (!changed && !effects.length) return;
    }
    assert.fail('Controller did not settle');
  }
  function strings(value) {
    if (Array.isArray(value)) return value.flatMap(strings);
    if (typeof value === 'string') return [value];
    return value && typeof value === 'object' ? strings(value.props?.children) : [];
  }
  await settle();
  return { syncs, previews, settle, latest: () => latest, text: () => strings(tree).join(' '),
    async tick() { const soonest = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!soonest) return; timers.delete(soonest[0]); now = soonest[1].at; soonest[1].callback(); await settle(); },
    async manualSync() { await latest.syncInvoice(42); await settle(); },
    cleanup() { for (const item of state) item?.cleanup?.(); } };
}

test('an active trial and a pending new purchase never show payment success', async () => {
  const ui = await setup();
  assert.ok(ui.text().includes('paymentReturn.processing'));
  assert.ok(!ui.text().includes('paymentReturn.done'));
  assert.deepEqual(ui.syncs, [42]);
  ui.cleanup();
});

test('a delayed paid purchase refreshes and reports the purchased plan without focus or reload', async () => {
  const ui = await setup({ statuses: ['pending', 'pending', 'paid'] });
  assert.ok(!ui.text().includes('paymentReturn.done'));
  await ui.tick(); await ui.tick();
  assert.ok(ui.text().includes('paymentReturn.done:s7'));
  assert.deepEqual(ui.syncs, [42, 42, 42]);
  await ui.tick();
  assert.equal(ui.syncs.length, 3);
  ui.cleanup();
});

test('an unrelated paid invoice cannot satisfy the returned purchase', async () => {
  const ui = await setup({ statuses: ['paid'], returnedId: 41 });
  assert.ok(!ui.text().includes('paymentReturn.done'));
  ui.cleanup();
});

test('failed and refunded purchases stop checking and never report success', async () => {
  for (const status of ['failed', 'refunded']) {
    const ui = await setup({ statuses: [status] });
    assert.ok(ui.text().includes(`status.${status}`));
    assert.ok(!ui.text().includes('paymentReturn.done'));
    await ui.tick(); assert.deepEqual(ui.syncs, [42]);
    ui.cleanup();
  }
});

test('pending status checks stop after a bounded window and manual reconciliation can still finish', async () => {
  const statuses = [...Array(7).fill('pending'), 'paid'];
  const ui = await setup({ statuses });
  for (let i = 0; i < 12; i++) await ui.tick();
  assert.equal(ui.syncs.length, 7);
  assert.ok(ui.text().includes('paymentReturn.processing'));
  await ui.manualSync();
  assert.ok(ui.text().includes('paymentReturn.done:s7'));
  ui.cleanup();
});

test('missing or invalid return identity never uses the existing active plan as proof', async () => {
  for (const search of ['?payment=return', '?payment=return&invoice_id=0', '?payment=return&invoice_id=abc', '?invoice_id=42']) {
    const ui = await setup({ search });
    assert.ok(!ui.text().includes('paymentReturn.done'));
    assert.deepEqual(ui.syncs, []);
    ui.cleanup();
  }
});

test('transient status fetch failure does not claim success or prevent later verification', async () => {
  const ui = await setup({ statuses: [new Error('Temporary network failure'), 'pending', 'paid'] });
  assert.ok(ui.text().includes('paymentReturn.processing'));
  await ui.tick(); await ui.tick();
  assert.ok(ui.text().includes('paymentReturn.done:s7'));
  assert.deepEqual(ui.syncs, [42, 42, 42]);
  ui.cleanup();
});

test('an older pending response cannot overwrite a payment verified by manual reconciliation', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const ui = await setup({ statuses: [delayed, 'paid'] });
  await ui.manualSync();
  assert.ok(ui.text().includes('paymentReturn.done:s7'));
  release('pending'); await ui.settle();
  assert.ok(ui.text().includes('paymentReturn.done:s7'));
  await ui.tick(); assert.deepEqual(ui.syncs, [42, 42]);
  ui.cleanup();
});

test('an older manual pending response cannot overwrite an automatically verified terminal result', async () => {
  for (const status of ['paid', 'failed', 'refunded']) {
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    const ui = await setup({ statuses: ['pending', delayed, status] });
    const manual = ui.manualSync();
    await ui.tick();
    assert.equal(ui.latest().paymentStatus, status);
    release('pending'); await manual;
    assert.equal(ui.latest().paymentStatus, status);
    await ui.tick(); assert.deepEqual(ui.syncs, [42, 42, 42]);
    ui.cleanup();
  }
});

test('an older manual paid response cannot undo an automatically verified refund', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const ui = await setup({ statuses: ['pending', delayed, 'refunded'] });
  const manual = ui.manualSync();
  await ui.tick();
  assert.ok(ui.text().includes('status.refunded'));
  release('paid'); await manual;
  assert.ok(ui.text().includes('status.refunded'));
  assert.ok(!ui.text().includes('paymentReturn.done'));
  ui.cleanup();
});

test('manual terminal updates allow recovery and refunds without reversing verified progress', async () => {
  const ui = await setup({ statuses: ['failed', 'paid', 'failed', 'refunded', 'paid'] });
  assert.equal(ui.latest().paymentStatus, 'failed');
  await ui.manualSync(); assert.equal(ui.latest().paymentStatus, 'paid');
  await ui.manualSync(); assert.equal(ui.latest().paymentStatus, 'paid');
  await ui.manualSync(); assert.equal(ui.latest().paymentStatus, 'refunded');
  await ui.manualSync(); assert.equal(ui.latest().paymentStatus, 'refunded');
  ui.cleanup();
});
test('leaving the page discards late replies and cancels further automatic checks', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const ui = await setup({ statuses: [delayed] });
  ui.cleanup(); release('paid'); await ui.settle();
  assert.ok(!ui.text().includes('paymentReturn.done'));
  await ui.tick(); assert.deepEqual(ui.syncs, [42]);
});

test('the chosen model, seats and period survive leaving the page, per studio', async () => {
  const saved = new Map();
  const localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)) };
  const tier = id => ({ id, price: 1000, limits: { staff: 1, ai_requests: 10 } });
  const catalog = { plans: [tier('s1'), tier('s12')], period_discounts: { 1: 0, 12: 0.3 } };
  const open = scope => setup({ search: '', scope, localStorage, catalog });
  const choice = ui => { const h = ui.latest(); return [h.billingMode, h.selectedPlan, h.selectedPeriod]; };

  const first = await open('7:1:owner');
  const fresh = choice(first);
  first.latest().setBillingMode('fixed'); await first.settle();
  first.latest().setSelectedPlan('s12'); await first.settle();
  first.latest().setSelectedPeriod(12); await first.settle();
  first.cleanup();

  const again = await open('7:1:owner');
  assert.deepEqual(choice(again), ['fixed', 's12', 12]);
  again.cleanup();

  const otherStudio = await open('8:1:owner');
  assert.deepEqual(choice(otherStudio), fresh);
  otherStudio.cleanup();

  // A tier removed from the catalog must not stick: the slider has nowhere to stand.
  catalog.plans = [tier('s1')];
  const stale = await open('7:1:owner');
  assert.equal(stale.latest().billingMode, 'fixed');
  assert.notEqual(stale.latest().selectedPlan, 's12');
  stale.cleanup();
});

test('a seat or period change shows its ready quote with tax at once and asks the server nothing', async () => {
  const quote = (plan, period_months, total) => ({ plan, period_months, kind: 'new', current_plan: null,
    gross: total, total, currency: 'EUR', tax_outcome: 'taxable', tax_rate_percent: 21,
    tax_amount: total * 0.21, total_with_tax: total * 1.21, tax_review_reason: null, free_until: null, free_days: 0 });
  const tier = id => ({ id, price: 1000, limits: { staff: 1, ai_requests: 10 } });
  const ui = await setup({ search: '', catalog: { plans: [tier('s1'), tier('s12')], period_discounts: { 1: 0, 12: 0.3 } },
    quotes: { quotes: [quote('s1', 1, 1000), quote('s12', 1, 6000), quote('s12', 12, 50400)] } });
  assert.equal(ui.latest().pricingPending, false);
  ui.latest().setSelectedPlan('s12'); await ui.settle();
  assert.equal(ui.latest().preview.total_with_tax, 6000 * 1.21);
  ui.latest().setSelectedPeriod(12); await ui.settle();
  assert.equal(ui.latest().preview.total_with_tax, 50400 * 1.21);
  for (let i = 0; i < 5; i++) await ui.tick();
  assert.deepEqual(ui.previews, [], 'no per-click quote requests');
  ui.cleanup();
});

test('until prices and quotes arrive the panel is pending instead of showing a price without tax', async () => {
  for (const key of ['plans', 'quotes', 'plan']) {
    const ui = await setup({ search: '', loading: [key] });
    assert.equal(ui.latest().pricingPending, true, `${key} still loading`);
    ui.cleanup();
  }
});
async function checkoutReturn(clientSecret = 'cs_secret') {
  const state = [], routes = [], requests = [];
  let index = 0;
  const context = vm.createContext({ URLSearchParams, window: { location: { origin: 'https://app.example.com' } } });
  const modules = new Map();
  function mock(name, values) {
    modules.set(name, new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context }));
  }
  mock('react', {
    useState(value) { const slot = index++; if (!(slot in state)) state[slot] = value;
      return [state[slot], next => { state[slot] = next; }]; },
    useRef(value) { const slot = index++; state[slot] ??= { current: value }; return state[slot]; },
  });
  const profile = { legal_name: 'Alice Example', country: 'CZ', line1: 'Prague 1', postal_code: '11000', city: 'Prague' };
  mock('@tanstack/react-query', { useQueryClient: () => ({ cancelQueries: async () => {}, setQueryData() {}, invalidateQueries: async () => {} }),
    useQuery: ({ queryKey }) => queryKey[1] === 'catalog'
    ? { data: { plans: [{ id: 's7' }], period_discounts: { 1: 0, 3: 0.2 } } }
    : { data: profile, refetch: async () => ({ data: profile }) } });
  mock('react-router-dom', { useNavigate: () => path => routes.push(path),
    useSearchParams: () => [new URLSearchParams('plan=s7&period=3&combo=true')] });
  mock('react-i18next', { useTranslation: () => ({ t: key => key }) });
  mock('../../../../api/billing/billing.api', { billingApi: {
    activateModel: async () => {},
    saveBillingProfile: async () => profile,
    checkout: async (...args) => { requests.push(args); return { invoice_id: 42, client_secret: clientSecret }; },
  } });
  mock('../../../../api/errorMessage', { errorMessage: error => error.message });
  const code = ts.transpileModule(await readFile(new URL('../src/pages/dashboard/Billing/hooks/useCheckoutPage.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  const module = new vm.SourceTextModule(code, { context });
  await module.link(name => { assert.ok(modules.has(name), `Unexpected checkout dependency: ${name}`); return modules.get(name); });
  await module.evaluate();
  const render = () => { index = 0; return module.namespace.useCheckoutPage(); };
  render().setComboAccepted(true);
  await render().prepare(profile);
  return { hook: render(), routes, requests };
}

test('card completion and redirect authentication return to the exact prepared purchase', async () => {
  const ui = await checkoutReturn();
  assert.deepEqual(ui.requests, [['s7', 3, true, 'elements']]);
  assert.equal(ui.hook.returnUrl, 'https://app.example.com/dashboard/billing?payment=return&invoice_id=42');
  ui.hook.completed();
  assert.deepEqual(ui.routes, ['/dashboard/billing?payment=return&invoice_id=42']);
});

test('reopening a purchase already paid returns to the same exact invoice without another confirmation', async () => {
  const ui = await checkoutReturn(null);
  assert.deepEqual(ui.routes, ['/dashboard/billing?payment=return&invoice_id=42']);
});
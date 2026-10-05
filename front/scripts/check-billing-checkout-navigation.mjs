import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Run with: node --experimental-vm-modules scripts/check-billing-checkout-navigation.mjs
// The actual components run without a browser, backend, database, or Stripe requests.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(pathToFileURL(`${root}/package.json`));
const ts = require('typescript');
const base = 'src/pages/dashboard/Billing/';
const noop = () => {};
const jsx = (type, props) => ({ type, props });
const t = (key, options) => options?.returnObjects ? [] : key;

async function harness(file, overrides = {}) {
  let cursor = 0;
  const state = [];
  const context = vm.createContext({ console, URLSearchParams, window: { location: { origin: 'https://example.invalid' } } });
  const deps = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
        return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
      },
      useRef(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = { current: initial };
        return state[i];
      },
      useMemo: fn => fn(), useEffect: noop,
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-i18next': { useTranslation: () => ({ t, i18n: { language: 'en' } }) },
    money: { formatMoney: (amount, currency) => `${currency} ${amount}` },
    plan: { planSeats: id => id === 'unlimited' ? null : Number(id.slice(1)), planLabel: id => id },
    usePhone: { usePhone: () => true },
    index: { Button: 'Button', ConfirmModal: 'ConfirmModal', useToast: () => ({ info: noop, error: noop }) },
    BillingIcons: Object.fromEntries(['CheckIcon', 'StarIcon', 'ZapIcon', 'ShieldIcon', 'CreditCardIcon', 'PercentIcon'].map(name => [name, name])),
    PlanCalculator: { default: 'PlanCalculator' },
    AnimatedPayButton: { default: 'PayButton' },
    CheckoutDetails: { default: 'CheckoutDetails' },
    TeamLineup: { default: 'TeamLineup' },
    CheckoutArtwork: { default: 'CheckoutArtwork' },
    'lucide-react': { ChevronDown: 'ChevronDown', ShieldCheck: 'ShieldCheck' },
    legal: { LEGAL_LINK_PROPS: {}, PRIVACY_URL: '/privacy', TERMS_URL: '/terms' },
    ...overrides,
  };
  async function load(url) {
    const code = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const mod = new vm.SourceTextModule(code, { context, identifier: url.href });
    await mod.link((name, parent) => {
      if (name === './checkoutAmounts') return load(new URL(`${name}.ts`, parent.identifier));
      const leaf = name.split('/').at(-1).replace(/\.module\.css$/, '');
      const exports = name.endsWith('.css') ? { default: new Proxy({}, { get: (_, key) => String(key) }) } : deps[name] ?? deps[leaf];
      if (!exports) throw new Error(`Missing dependency: ${name}`);
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    return mod;
  }
  const mod = await load(pathToFileURL(`${root}/${base}${file}`));
  await mod.evaluate();
  return {
    render(props, name = 'default') { cursor = 0; return mod.namespace[name](props); },
  };
}

function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}
const planInfo = { name: 'Solo', monthly: 20, staffLimit: 1, ai: 500 };
const quote = tax_outcome => ({ currency: 'EUR', total: 2000, total_with_tax: 2420, tax_amount: 420, tax_rate_percent: 21, tax_outcome });
const calculatorProps = () => ({
  planIds: ['s1'], plans: { s1: planInfo }, selected: 's1', onSelect: noop, currency: 'EUR',
  payBusy: false, preview: quote('taxable'), pending: false, payDisabled: false,
  selectedPeriod: 1, setSelectedPeriod: noop, periodDiscounts: { 1: 0, 12: 0.3 },
  monthly: 20, fullMonthly: 20, savedTotal: 0, totalToPay: 20, onPay: noop, currentPlanId: null,
});

for (const [label, preview, pending] of [
  ['payer details require tax review', quote('requires_review'), false],
  ['quote is still loading', null, true],
  ['quote request failed', null, false],
]) {
  test(`plan Pay enters payer details when ${label}`, async () => {
    const app = await harness('components/ui/PlanCalculator.tsx');
    let entered = 0;
    const button = nodes(app.render({ ...calculatorProps(), preview, pending, onPay: () => { entered++; } }), 'PayButton')[0];
    assert.equal(Boolean(button.disabled), false, 'tax preview must not prevent entering the checkout form');
    button.onClick();
    assert.equal(entered, 1);
  });
}

test('plan Pay stays unavailable if the selected plan is missing from the catalog', async () => {
  const app = await harness('components/ui/PlanCalculator.tsx');
  assert.equal(nodes(app.render({ ...calculatorProps(), plans: {} }), 'PayButton')[0].disabled, true);
});

const tabProps = overrides => ({
  currency: 'EUR', payBusy: false, preview: quote('requires_review'), pending: false,
  billingMode: 'fixed', setBillingMode: noop, selectedPlan: 's1', setSelectedPlan: noop,
  selectedPeriod: 1, setSelectedPeriod: noop, periodDiscounts: { 1: 0 },
  plans: { s1: planInfo }, planIds: ['s1'], currentMonthly: 10, discountedPrice: 10,
  totalToPay: 10, savedTotal: 0, startCheckout: noop, activateModel: noop,
  modelBusy: false, plan: null, minMonthly: 20, terms: { percent_rate: 3, combo_rate: 1.5, grace_days: 7 },
  ...overrides,
});

test('combo plan enters checkout before asking for payment terms', async () => {
  const app = await harness('components/tabs/PlansTab.tsx');
  let entered = 0;
  const calculator = nodes(app.render(tabProps({ startCheckout: () => { entered++; } })), 'PlanCalculator')[0];
  assert.equal(Boolean(calculator.payDisabled), false, 'combo terms belong on the payer-details page');
  calculator.onPay();
  assert.equal(entered, 1);
});

test('combo plan with no billing profile does not call model activation before navigation', async () => {
  const app = await harness('components/tabs/PlansTab.tsx');
  const calls = [];
  const props = tabProps({ startCheckout: () => calls.push('navigate'), activateModel: () => calls.push('activate') });
  const first = nodes(app.render(props), 'PlanCalculator')[0];
  // Accept the old inline agreement if present, so the regression catches the
  // profile-required API call independently of the old consent UI gate.
  const accept = nodes(first.checkoutTerms, 'input')[0];
  accept?.onChange({ target: { checked: true } });
  nodes(app.render(props), 'PlanCalculator')[0].onPay();
  assert.deepEqual(calls, ['navigate']);
});

test('checkout can submit corrected payer details while the old quote requires review', async () => {
  const app = await harness('components/checkout/CheckoutSummary.tsx');
  let prepared = 0;
  const button = nodes(app.render({
    plan: { id: 's1' }, period: 1, preview: quote('requires_review'), currency: 'EUR',
    preparing: false, canPrepare: true, error: '', onPrepare: () => { prepared++; }, onBack: noop,
  }), 'PayButton')[0];
  assert.equal(button.disabled, false);
  button.onClick();
  assert.equal(prepared, 1);
});

test('actual Stripe confirmation remains blocked for unresolved tax', async () => {
  const app = await harness('components/checkout/CheckoutSummary.tsx');
  const button = nodes(app.render({
    plan: { id: 's1' }, period: 1, preview: quote('requires_review'), currency: 'EUR',
    preparing: false, canPrepare: true, error: '', onPrepare: noop, onBack: noop,
    payment: { ready: true, busy: false, net: 2000, total: 2000, tax: 0, taxRate: null, submit: noop },
  }), 'PayButton')[0];
  assert.equal(button.disabled, true, 'navigation fix must not bypass final tax validation');
});

async function checkoutHook({ combo = false, api = {} } = {}) {
  const calls = [];
  const catalog = { data: {
    plans: [{ id: 's1', price: 2000 }], period_discounts: { 1: 0, 12: 0.3 },
    combo_rate: 1.5, grace_days: 7,
  } };
  const profile = { data: {}, dataUpdatedAt: 1, refetch: async () => ({ data: {} }) };
  const queryClient = {
    cancelQueries: async () => {},
    setQueryData: (_key, value) => { profile.data = value; profile.dataUpdatedAt++; },
  };
  const mockApi = {
    getPlans: noop, getBillingProfile: noop, previewCheckout: noop,
    saveBillingProfile: async input => { calls.push(['save', input]); return input; },
    activateModel: async body => { calls.push(['activate', body]); return {}; },
    checkout: async (...args) => { calls.push(['checkout', ...args]); return { client_secret: 'fake_secret', publishable_key: 'pk_test_fake' }; },
    ...api,
  };
  const app = await harness('hooks/useCheckoutPage.ts', {
    '@tanstack/react-query': {
      useQuery: ({ queryKey }) => queryKey[1] === 'catalog' ? catalog : queryKey[1] === 'profile' ? profile : {},
      useQueryClient: () => queryClient,
    },
    'react-router-dom': {
      useNavigate: () => (...args) => { calls.push(['navigate', ...args]); },
      useSearchParams: () => [new URLSearchParams({ plan: 's1', period: '12', combo: String(combo) })],
    },
    'billing.api': { billingApi: mockApi },
    errorMessage: { errorMessage: error => error.message },
  });
  return { render: () => app.render(undefined, 'useCheckoutPage'), calls, catalog, profile, mockApi, queryClient };
}
const payer = country => ({ name: 'Test Business', billing_email: 'billing@example.invalid', country,
  address_line1: 'Test 1', city: 'Prague', postal_code: '13000' });

test('checkout saves payer details before preparing a one-time payment for the selected period', async () => {
  const fixture = await checkoutHook();
  const input = payer('CZ');
  await fixture.render().prepare(input);
  assert.deepEqual(fixture.calls.map(call => call[0]), ['save', 'checkout']);
  assert.equal(fixture.calls[0][1], input);
  assert.deepEqual(fixture.calls[1].slice(1), ['s1', 12, false, 'elements']);
  assert.equal(fixture.render().session.client_secret, 'fake_secret');
});

test('combo checkout needs explicit current terms consent before making API writes', async () => {
  const fixture = await checkoutHook({ combo: true });
  await fixture.render().prepare(payer('CZ'));
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.render().error, 'mode.termsConfirm');
  fixture.render().setComboAccepted(true);
  await fixture.render().prepare(payer('CZ'));
  assert.deepEqual(fixture.calls.map(call => call[0]), ['save', 'activate', 'checkout']);
  assert.equal(fixture.calls[1][1].mode, 'combo');
  assert.equal(fixture.calls[1][1].accept_offline_terms, true);
  assert.deepEqual(fixture.calls[2].slice(1), ['s1', 12, true, 'elements']);
});

test('accepting older combo terms does not accept a changed rate or payment deadline', async () => {
  for (const changes of [{ combo_rate: 2 }, { grace_days: 10 }]) {
    const fixture = await checkoutHook({ combo: true });
    fixture.render().setComboAccepted(true);
    fixture.catalog.data = { ...fixture.catalog.data, ...changes };
    assert.equal(fixture.render().comboAccepted, false);
    await fixture.render().prepare(payer('CZ'));
    assert.equal(fixture.calls.length, 0);
  }
});

test('rejected payer details release the button and allow a corrected retry', async () => {
  const fixture = await checkoutHook();
  let attempts = 0;
  fixture.mockApi.saveBillingProfile = async input => {
    fixture.calls.push(['save', input]);
    if (++attempts === 1) throw new Error('billing.invalid_address');
    return input;
  };
  await assert.rejects(fixture.render().prepare(payer('')), { message: 'billing.invalid_address' });
  assert.equal(fixture.render().busy, false);
  assert.equal(fixture.render().session, null);
  assert.equal(fixture.render().error, 'billing.invalid_address');
  await fixture.render().prepare(payer('CZ'));
  assert.deepEqual(fixture.calls.map(call => call[0]), ['save', 'save', 'checkout']);
  assert.equal(fixture.render().error, '');
  assert.equal(fixture.render().session.client_secret, 'fake_secret');
});

test('tax review rejection cannot create payment fields, and corrected country can be retried', async () => {
  const fixture = await checkoutHook();
  let attempts = 0;
  fixture.mockApi.checkout = async (...args) => {
    fixture.calls.push(['checkout', ...args]);
    if (++attempts === 1) throw new Error('billing.tax_review_required');
    return { client_secret: 'fake_secret', publishable_key: 'pk_test_fake' };
  };
  await assert.rejects(fixture.render().prepare(payer('US')), { message: 'billing.tax_review_required' });
  assert.equal(fixture.render().busy, false);
  assert.equal(fixture.render().session, null);
  assert.equal(fixture.render().error, 'billing.tax_review_required');
  await fixture.render().prepare(payer('CZ'));
  assert.deepEqual(fixture.calls.map(call => call[0]), ['save', 'checkout', 'save', 'checkout']);
  assert.equal(fixture.render().error, '');
  assert.equal(fixture.render().session.client_secret, 'fake_secret');
});

test('repeated taps while payer details are saving prepare only one payment', async () => {
  const fixture = await checkoutHook();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  fixture.mockApi.saveBillingProfile = async input => { fixture.calls.push(['save', input]); await waiting; return input; };
  const first = fixture.render().prepare(payer('CZ'));
  await fixture.render().prepare(payer('CZ'));
  assert.deepEqual(fixture.calls.map(call => call[0]), ['save']);
  release();
  await first;
  assert.deepEqual(fixture.calls.map(call => call[0]), ['save', 'checkout']);
});


test('an older profile GET cannot replace newly saved payer details during payment preparation', async () => {
  const fixture = await checkoutHook();
  const oldProfile = payer('US');
  fixture.profile.data = oldProfile;
  let cancelled = false;
  let finishCancellation;
  const cancellation = new Promise(resolve => { finishCancellation = resolve; });
  let finishOldFetch;
  const oldFetch = new Promise(resolve => { finishOldFetch = resolve; }).then(() => {
    if (!cancelled) fixture.profile.data = oldProfile;
  });
  fixture.queryClient.cancelQueries = async options => {
    fixture.calls.push(['cancel']);
    assert.equal(JSON.stringify(options.queryKey), JSON.stringify(['billing', 'profile']));
    assert.equal(options.exact, true);
    await cancellation;
    cancelled = true;
  };
  const publish = fixture.queryClient.setQueryData;
  fixture.queryClient.setQueryData = (key, value) => {
    fixture.calls.push(['publish']);
    publish(key, value);
    finishOldFetch();
  };
  fixture.mockApi.checkout = async (...args) => {
    fixture.calls.push(['checkout', ...args]);
    await oldFetch;
    return { client_secret: 'fake_secret', publishable_key: 'pk_test_fake' };
  };
  const prepared = fixture.render().prepare(payer('CZ')).then(() => null, error => error);
  await new Promise(resolve => setImmediate(resolve));
  const callsBeforeCancellationFinishes = fixture.calls.map(call => call[0]);
  finishCancellation();
  const error = await prepared;
  assert.equal(error, null);
  assert.deepEqual(callsBeforeCancellationFinishes, ['save', 'cancel'],
    'saved details must only be published after the old profile request has been cancelled');
  assert.deepEqual(fixture.calls.map(call => call[0]), ['save', 'cancel', 'publish', 'checkout']);
  assert.equal(fixture.render().profile.data.country, 'CZ');
});

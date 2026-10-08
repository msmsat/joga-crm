import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const account = { gateway_type: 'stripe', account_id: 'acct_studio', is_active: true,
  charges_enabled: false, details_submitted: false, requirements_due: false,
  status_available: true, platform_configured: true, payouts_enabled: false };
const settle = () => new Promise(done => setTimeout(done, 0));

async function setup({ gateway = account, error = false, search = '', role = 'owner' } = {}) {
  let cursor = 0;
  const state = [], effects = [], calls = [], storage = new Map();
  const query = { gateways: gateway ? [gateway] : [], isLoading: false, isFetching: false,
    isError: error, isConnecting: false, connectError: null,
    connectStripe: () => calls.push('connect'),
    refetch: async () => { calls.push('refetch'); return { data: query.gateways, isError: query.isError }; } };
  const context = vm.createContext({ console, URLSearchParams,
    window: { location: { search, pathname: '/dashboard/booking', hash: '' }, history: {
      replaceState: (_a, _b, url) => { calls.push(url); context.window.location.search = url.includes('?') ? url.slice(url.indexOf('?')) : ''; },
    } }, sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  const react = {
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return state[index] ??= { current: initial }; },
    useEffect(fn, deps) { const index = cursor++; if (!state[index] || deps.some((dep, i) => dep !== state[index][i])) {
      state[index] = deps; effects.push(fn); } },
  };
  const jsx = (type, props) => ({ type, props });
  const toast = { success: message => calls.push(`success:${message}`), error: message => calls.push(`error:${message}`) };
  const other = { useNavigate: () => path => calls.push(path), useTranslation: () => ({ t: key => key }),
    useToast: () => toast, useGateways: () => query, useBookingSettings: () => ({ settings: null }),
    useBookingModals: () => ({ openChannel: null }), useChannels: () => ({ connected: false }), useAiIntent() {},
    getActiveToken: () => role ? 'authenticated' : null, getUserRoleFromToken: () => role,
    getActiveContextKey: () => 'studio:owner', errorMessage: String };
  for (const name of ['BookingChannels', 'BookingSettings', 'CoffeeSettings', 'StripeGateModal', 'TgModal']) other[name] = name;
  async function load(url) {
    const code = ts.transpileModule(await readFile(url, 'utf8'), { compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = new vm.SourceTextModule(code, { context, identifier: url.href });
    await mod.link((name, parent) => {
      if (/\/(stripeStatus|useStripeReturn)$/.test(name)) return load(new URL(`${name}.ts`, parent.identifier));
      const exports = name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' } : other;
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    return mod;
  }
  const mod = await load(new URL('../src/pages/dashboard/Booking/Booking.tsx', import.meta.url));
  await mod.evaluate();
  function render() { cursor = 0; const tree = mod.namespace.default(); for (const fn of effects.splice(0)) fn(); return tree; }
  const open = () => { nodes(render(), 'BookingChannels')[0].onOpenStripe(); return nodes(render(), 'StripeGateModal')[0]; };
  return { render, open, calls, query, context };
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}

test('failed gateway lookup offers a status retry instead of creating an account', async () => {
  const app = await setup({ gateway: null, error: true });
  const modal = app.open();
  assert.equal(modal.state, 'unavailable');
  modal.onConnect(); await settle();
  assert.equal(app.calls.includes('connect'), false);
  assert.ok(app.calls.includes('refetch'));
});
test('Stripe status outage is not an incomplete form', async () => {
  const app = await setup({ gateway: { ...account, status_available: false } });
  assert.equal(app.open().state, 'unavailable');
});
test('platform configuration failure does not offer account creation', async () => {
  const app = await setup({ gateway: { ...account, account_id: null, platform_configured: false } });
  const modal = app.open(); assert.equal(modal.state, 'unconfigured');
  modal.onConnect(); await settle(); assert.equal(app.calls.includes('connect'), false);
});
test('submitted form awaiting review has a refresh action', async () => {
  const app = await setup({ gateway: { ...account, details_submitted: true } });
  const modal = app.open(); assert.equal(modal.state, 'pending');
  modal.onConnect(); await settle(); assert.equal(app.calls.includes('connect'), false);
});
test('required information takes precedence over pending review', async () => {
  const app = await setup({ gateway: { ...account, details_submitted: true, requirements_due: true } });
  assert.equal(app.open().state, 'requiresInfo');
});
test('ready account opens its status first, even when payouts are pending', async () => {
  const app = await setup({ gateway: { ...account, charges_enabled: true } });
  assert.equal(app.open().state, 'ready');
  assert.equal(app.calls.includes('/dashboard/finances?tab=onlinePayments'), false);
});
test('owner switch off is distinct from Stripe review', async () => {
  const app = await setup({ gateway: { ...account, charges_enabled: true, is_active: false } });
  assert.equal(app.open().state, 'paused');
});
test('Stripe return refetches and opens status without claiming success from the URL', async () => {
  const app = await setup({ search: '?stripe=return&other=kept' });
  app.render(); await settle();
  assert.ok(nodes(app.render(), 'StripeGateModal')[0]);
  assert.ok(app.calls.includes('refetch'));
  assert.equal(app.calls.some(call => call.startsWith('success:')), false);
  assert.ok(app.calls.includes('/dashboard/booking?other=kept'));
});
test('expired link renews once for an authenticated owner with a known account', async () => {
  const app = await setup({ search: '?stripe=refresh' });
  app.render(); await settle(); app.render(); await settle();
  assert.equal(app.calls.filter(call => call === 'connect').length, 1);
});
test('expired link never creates an account after a failed status fetch or without owner auth', async () => {
  for (const options of [{ error: true }, { gateway: null }, { role: null }, { role: 'admin' }]) {
    const app = await setup({ search: '?stripe=refresh', ...options });
    app.render(); await settle(); app.render();
    assert.equal(app.calls.includes('connect'), false);
  }
});

async function modal(props) {
  const context = vm.createContext({ document: { body: {} } });
  const jsx = (type, props) => ({ type, props });
  const exports = { default: new Proxy({}, { get: (_target, key) => key }), useTranslation: () => ({ t: key => key }), createPortal: tree => tree,
    useEffect() {}, useRef: () => ({ current: null }), useId: () => 'stripe-dialog',
    errorMessage: () => 'Connection failed' };
  const url = new URL('../src/pages/dashboard/Booking/components/modals/StripeGateModal.tsx', import.meta.url);
  const code = ts.transpileModule(await readFile(url, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new vm.SourceTextModule(code, { context });
  await mod.link(name => {
    const values = name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' } : exports;
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return mod.namespace.StripeGateModal({ isConnecting: false, isRefreshing: false,
    onConnect() {}, onRefresh() {}, onClose() {}, gateway: account, ...props });
}
test('status dialog is named and modal, with a persistent failed-connection reason', async () => {
  const tree = await modal({ state: 'incomplete', connectError: new Error('failed') });
  const dialog = nodes(tree, 'div').find(node => node.role === 'dialog');
  assert.ok(dialog); assert.equal(dialog['aria-modal'], true);
  assert.ok(dialog['aria-labelledby']); assert.ok(dialog['aria-describedby']);
  assert.ok(nodes(tree, 'p').find(node => node.role === 'alert'));
});
test('unavailable status shows unknown capability values rather than false disabled claims', async () => {
  const tree = await modal({ state: 'unavailable', gateway: { ...account, charges_enabled: true } });
  const values = nodes(tree, 'dd').map(node => node.children);
  assert.deepEqual(values, ['stripeGate.unknown', 'stripeGate.unknown', 'stripeGate.unknown']);
});
test('pending payouts do not disable the ready account management action', async () => {
  const tree = await modal({ state: 'ready', gateway: { ...account, charges_enabled: true } });
  const action = nodes(tree, 'button').find(node => node['data-stripe-primary']);
  assert.ok(action); assert.equal(action.disabled, false);
  assert.ok(nodes(tree, 'dd').some(node => node.children === 'stripeGate.awaiting'));
});

// Run with: node --experimental-vm-modules scripts/check-landing-promo-eligibility.mjs
// The real landing hook runs with controlled React state and query results.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const promo = { code: 'WELCOME30', percent: 30 };
const owner = { scope: '10:owner@example.test:owner', token: 'owner-token', role: 'owner' };
const guest = { scope: '', token: null, role: null };

function eligibilityResult(available, { status = 'success', fetchStatus = 'idle' } = {}) {
  return {
    data: available === undefined ? undefined : { first_payment_promo_available: available },
    status, fetchStatus, error: status === 'error' ? new Error('Eligibility unavailable') : null,
    isSuccess: status === 'success', isError: status === 'error', isPending: status === 'pending',
    isFetching: fetchStatus === 'fetching', isPaused: fetchStatus === 'paused',
    isLoading: status === 'pending' && fetchStatus === 'fetching',
  };
}

async function harness(initialAuth = owner, initialEligibility = eligibilityResult(true)) {
  let auth = initialAuth;
  let cursor = 0;
  const state = [], effects = [], listeners = new Map(), queries = [];
  const eligibility = new Map([[auth.scope, initialEligibility]]);
  const catalog = { data: { first_payment_promo: promo }, status: 'success' };
  const context = vm.createContext({
    window: {
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
      },
      removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    },
  });
  const dependencies = {
    react: {
      useState(initial) {
        const slot = cursor++;
        if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
        return [state[slot], next => {
          state[slot] = typeof next === 'function' ? next(state[slot]) : next;
        }];
      },
      useEffect(callback) {
        const slot = cursor++;
        if (!(slot in state)) {
          state[slot] = {};
          effects.push(() => { state[slot].cleanup = callback(); });
        }
      },
    },
    '@tanstack/react-query': {
      useQuery(options) {
        queries.push(options);
        if (options.queryKey[1] === 'public-plans') return catalog;
        return eligibility.get(options.queryKey[2]) ?? eligibilityResult(undefined, { status: 'pending' });
      },
    },
    '../../../api/billing/billing.api': {
      billingApi: {
        getPublicPlans() { assert.fail('The query boundary must not contact the backend'); },
        getPlan() { assert.fail('The query boundary must not contact the backend'); },
      },
    },
    '../../../utils/auth': {
      getActiveContextKey: () => auth.scope,
      getActiveToken: () => auth.token,
      getUserRoleFromToken: () => auth.role,
    },
  };
  const source = await readFile(new URL('../src/pages/Landing/components/useLandingPricing.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  const module = new vm.SourceTextModule(code, { context });
  await module.link(name => {
    const exports = dependencies[name];
    assert.ok(exports, `Unexpected landing dependency: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return {
    eligibility, queries,
    render() {
      cursor = 0;
      queries.length = 0;
      const result = module.namespace.useLandingPricing();
      while (effects.length) effects.shift()();
      return result;
    },
    changeAuth(next, event = 'auth-context-changed') {
      auth = next;
      for (const callback of listeners.get(event) ?? []) callback();
    },
    cleanup() { for (const value of state) value?.cleanup?.(); },
  };
}

test('a guest sees the public welcome offer without requesting secured eligibility', async () => {
  const ui = await harness(guest);
  const result = ui.render();
  assert.equal(result.promo, promo);
  assert.equal(result.signedIn, false);
  assert.equal(ui.queries.at(-1).enabled, false);
  ui.cleanup();
});

test('an eligible owner sees the offer after eligibility succeeds', async () => {
  const ui = await harness();
  const result = ui.render();
  assert.equal(result.promo, promo);
  assert.equal(result.signedIn, true);
  assert.equal(ui.queries.at(-1).enabled, true);
  ui.cleanup();
});

test('an owner with a previous tariff payment sees no welcome offer', async () => {
  const ui = await harness(owner, eligibilityResult(false));
  assert.equal(ui.render().promo, undefined);
  ui.cleanup();
});

test('unresolved owner eligibility never promises a first-payment discount', async () => {
  const ui = await harness(owner, eligibilityResult(undefined, { status: 'pending', fetchStatus: 'fetching' }));
  assert.equal(ui.render().promo, undefined);
  ui.cleanup();
});

for (const auth of [
  { scope: '10:admin@example.test:admin', token: 'admin-token', role: 'admin' },
  { scope: '10:trainer@example.test:trainer', token: 'trainer-token', role: 'trainer' },
  { scope: ':owner@example.test:owner', token: 'owner-token', role: 'owner' },
]) {
  test(`a signed-in ${auth.role}${auth.scope.startsWith(':') ? ' without a studio' : ''} cannot inherit an eligible owner offer`, async () => {
    const ui = await harness(auth);
    assert.equal(ui.render().promo, undefined);
    assert.equal(ui.queries.at(-1).enabled, false);
    ui.cleanup();
  });
}

test('cached eligibility is hidden while another payment is being rechecked', async () => {
  const ui = await harness();
  assert.equal(ui.render().promo, promo);
  ui.eligibility.set(owner.scope, eligibilityResult(true, { fetchStatus: 'fetching' }));
  assert.equal(ui.render().promo, undefined);
  ui.eligibility.set(owner.scope, eligibilityResult(false));
  assert.equal(ui.render().promo, undefined);
  ui.cleanup();
});

test('cached eligible data cannot advertise the offer after a failed refresh', async () => {
  const ui = await harness();
  assert.equal(ui.render().promo, promo);
  ui.eligibility.set(owner.scope, eligibilityResult(true, { status: 'error' }));
  assert.equal(ui.render().promo, undefined);
  ui.eligibility.set(owner.scope, eligibilityResult(true));
  assert.equal(ui.render().promo, promo, 'a successful later refresh can restore the verified offer');
  ui.cleanup();
});

test('an offline paused refresh does not keep promising a cached eligible discount', async () => {
  const ui = await harness(owner, eligibilityResult(true, { fetchStatus: 'paused' }));
  assert.equal(ui.render().promo, undefined);
  ui.cleanup();
});

for (const event of ['auth-context-changed', 'storage', 'focus']) {
  test(`${event} changes eligibility scope before showing the new studio offer`, async () => {
    const ui = await harness();
    assert.equal(ui.render().promo, promo);
    const nextOwner = { ...owner, scope: '20:owner@example.test:owner' };
    ui.changeAuth(nextOwner, event);
    assert.equal(ui.render().promo, undefined, 'the old studio eligibility must not follow a context change');
    assert.deepEqual(Array.from(ui.queries.at(-1).queryKey), ['landing', 'promo-eligibility', nextOwner.scope]);
    ui.eligibility.set(nextOwner.scope, eligibilityResult(false));
    assert.equal(ui.render().promo, undefined);
    ui.eligibility.set(nextOwner.scope, eligibilityResult(true));
    assert.equal(ui.render().promo, promo);
    ui.changeAuth({ ...nextOwner, role: 'admin', scope: '20:owner@example.test:admin' }, event);
    assert.equal(ui.render().promo, undefined);
    ui.changeAuth(guest, event);
    assert.equal(ui.render().promo, promo);
    assert.equal(ui.render().signedIn, false);
    ui.cleanup();
  });
}


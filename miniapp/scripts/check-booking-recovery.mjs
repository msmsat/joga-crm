import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const members = [{ teacher_id: 7, name: 'David', service_ids: [2], branch_ids: [5] }];
const rows = [{ service_id: 2, branch_id: 5, free: [1140], free_by_teacher: { 7: [1140] } }];
const catalog = { studio: {}, rules: {}, services: [{ id: 2, booking_mode: 'resource', is_bookable: true }], staff: members };
const quote = { quote_id: 'q-new', terms: { domain: { funding: { kind: 'pay', price: 25 } } } };

async function setup(file, api = {}) {
  let cursor = 0;
  let pending = [];
  const state = [];
  const context = vm.createContext({ console, document: api.document,
    window: api.window ?? { location: { assign() {} } } });
  const react = {
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useEffect(fn, deps) {
      const i = cursor++;
      const previous = state[i];
      state[i] = deps;
      if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) pending.push(fn);
    },
  };
  const jsx = (type, props) => ({ type, props });
  const deps = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    'hybrid.api': { hybridApi: {
      resourceStaff: async () => ({ staff: members }), servicesDay: async () => ({ services: rows }), ...api,
    } },
    revision: { bumpLessons() {} }, petals: { spawnPetals() {} }, session: { getSession: () => ({ token: 'test' }) },
    slots: { studioToday: () => '2026-10-08', dayList: () => ['2026-10-08'], lastBookableDay: () => '2026-10-08',
      availabilityQuery: value => value, timeOf: value => value.slice(11, 16) },
    useTelegram: { useTelegram: () => ({ vibrateLight() {}, vibrateMedium() {}, tg: null, ...api.telegram }) },
    Sheet: { SheetAction: 'button' },
  };
  async function load(url) {
    const source = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const mod = new vm.SourceTextModule(source, { context, identifier: url.href });
    await mod.link((name, parent) => {
      const base = name.split('/').at(-1).replace(/\.ts$/, '');
      if (base === 'wizard' || base === 'bookingPage' || base === 'useBookingPaymentStatus') return load(new URL(name.endsWith('.ts') ? name : `${name}.ts`, parent.identifier));
      const exports = deps[name] ?? deps[base];
      if (!exports) throw new Error(`Missing dependency ${name}`);
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    return mod;
  }
  const mod = await load(new URL(file, import.meta.url));
  await mod.evaluate();
  return (name, props) => {
    cursor = 0;
    const result = mod.namespace[name](props);
    const run = pending; pending = [];
    for (const effect of run) effect();
    return result;
  };
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}

test('retrying a failed staff request really sends another request', async () => {
  let requests = 0;
  const render = await setup('../src/hooks/useBookingWizard.ts', { resourceStaff: async () => {
    if (++requests === 1) throw new Error('Offline');
    return { staff: members };
  } });
  const flow = () => render('useBookingWizard', { catalog, onNeedAuth() {} });
  flow().open('summary'); flow(); await settle();
  assert.equal(flow().staffError, true);
  flow().retryStaff(); flow(); await settle();
  assert.equal(requests, 2);
  assert.equal(flow().staffError, false);
  assert.equal(flow().staff.length, 1);
});

test('failed day loading can be retried while retaining all selected fields', async () => {
  let requests = 0;
  const render = await setup('../src/hooks/useBookingWizard.ts', { servicesDay: async () => {
    if (++requests === 1) throw new Error('Offline');
    return { services: rows };
  } });
  const flow = () => render('useBookingWizard', { catalog, onNeedAuth() {} });
  flow().open('summary'); flow(); await settle();
  flow().pickService(2); flow().pickTime(1140); flow();
  assert.equal(flow().dayError, true);
  const before = { ...flow().pick };
  flow().retryDay(); flow(); await settle();
  assert.deepEqual({ ...flow().pick }, before);
  assert.equal(flow().complete, true);
});

test('the selected location cannot silently turn into another location with a free slot', async () => {
  const render = await setup('../src/hooks/useBookingWizard.ts', {
    resourceStaff: async () => ({ staff: [{ ...members[0], branch_ids: [5, 6] }] }),
  });
  const flow = () => render('useBookingWizard', { catalog, onNeedAuth() {} });
  flow().open('summary', 6); flow(); await settle();
  flow().pickService(2); flow().pickTime(1140);
  assert.equal(flow().branchId, null);
  assert.equal(flow().complete, false);
});

test('a late failure for the previous time cannot clear the new selection', async () => {
  let rejectOld;
  let requests = 0;
  const render = await setup('../src/hooks/useBookingWizard.ts', {
    servicesDay: async () => ({ services: [{ ...rows[0], free: [1140, 1155], free_by_teacher: { 7: [1140, 1155] } }] }),
    availability: async () => ({ slots: [
      { local_start: '2026-10-08T19:00:00', starts_at: '2026-10-08T17:00:00Z', teacher_ids: [7] },
      { local_start: '2026-10-08T19:15:00', starts_at: '2026-10-08T17:15:00Z', teacher_ids: [7] },
    ] }),
    quote: async () => ++requests === 1 ? new Promise((resolve, reject) => { rejectOld = reject; }) : quote,
  });
  const flow = () => render('useBookingWizard', { catalog, onNeedAuth() {} });
  flow().open('summary'); flow(); await settle();
  flow().pickService(2); flow().pickTime(1140); flow(); await settle();
  assert.equal(flow().quoting, true);
  flow().pickTime(1155); flow(); await settle();
  rejectOld(Object.assign(new Error('Unavailable'), { status: 409, code: 'SLOT_UNAVAILABLE' }));
  await settle();
  assert.equal(flow().pick.time, 1155);
  assert.equal(flow().quote.quote_id, 'q-new');
  assert.equal(flow().notice, null);
  assert.equal(flow().quoting, false);
});

for (const error of ['staffError', 'dayError']) {
  test(`summary offers an enabled retry for ${error} even with every field selected`, async () => {
    const render = await setup('../src/components/wizard/WizardSummaryAction.tsx');
    let requests = 0;
    const flow = { complete: false, [error]: true, dayLoading: error === 'staffError',
      pick: { day: '2026-10-08', time: 1140, serviceId: 2, master: 7 }, steps: ['time', 'service', 'master', 'summary'],
      retryStaff: () => requests++, retryDay: () => requests++ };
    const tree = render('WizardSummaryAction', { flow, onPay() {} });
    const button = nodes(tree, 'button')[0];
    assert.equal(Boolean(button.disabled), false);
    assert.equal(button.children, 'booking.retry');
    button.onClick();
    assert.equal(requests, 1);
  });
}

test('an unavailable scoped slot offers choosing another time, not an impossible branch selection', async () => {
  const render = await setup('../src/components/wizard/WizardSummaryAction.tsx');
  let destination;
  const flow = { complete: false, scope: 5, rows: [], steps: ['time', 'service', 'master', 'summary'],
    pick: { day: '2026-10-08', time: 1140, serviceId: 2, master: 7 }, goTo: step => { destination = step; } };
  const tree = render('WizardSummaryAction', { flow, onPay() {} });
  const button = nodes(tree, 'button')[0];
  assert.equal(Boolean(button.disabled), false);
  button.onClick();
  assert.equal(destination, 'time');
});

test('two rapid confirmations cannot create two bookings before React rerenders', async () => {
  let confirmations = 0, resolveBooking;
  const render = await setup('../src/hooks/useBookingWizard.ts', {
    availability: async () => ({ slots: [{ local_start: '2026-10-08T19:00:00', starts_at: '2026-10-08T17:00:00Z', teacher_ids: [7] }] }),
    quote: async () => quote,
    confirm: async () => { confirmations++; return new Promise(resolve => { resolveBooking = resolve; }); },
  });
  const flow = () => render('useBookingWizard', { catalog, onNeedAuth() {} });
  flow().open('summary'); flow(); await settle();
  flow().pickService(2); flow().pickTime(1140); flow(); await settle();
  const current = flow();
  const first = current.submit('venue', null);
  const second = current.submit('venue', null);
  await settle();
  assert.equal(confirmations, 1);
  resolveBooking({ status: 'pending', next_action: 'wait_confirmation' });
  await Promise.all([first, second]);
});

test('returning from card payment updates booking status only from the current server record', async () => {
  let checks = 0;
  const listeners = new Map();
  const render = await setup('../src/hooks/useBookingWizard.ts', {
    document: { visibilityState: 'visible', addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } },
    availability: async () => ({ slots: [{ local_start: '2026-10-08T19:00:00', starts_at: '2026-10-08T17:00:00Z', teacher_ids: [7] }] }),
    quote: async () => quote,
    confirm: async () => ({ reservation_id: 41, status: 'hold', next_action: 'pay', payment_url: 'https://checkout.stripe.com/test' }),
    readQuote: async () => { checks++; return { reservation_id: 41, status: 'active', next_action: 'none', payment_url: null }; },
  });
  const flow = () => render('useBookingWizard', { catalog, onNeedAuth() {} });
  flow().open('summary'); flow(); await settle();
  flow().pickService(2); flow().pickTime(1140); flow(); await settle();
  await flow().submit('card', null);
  assert.equal(flow().booking.status, 'hold');
  listeners.get('visibilitychange')?.(); await settle();
  assert.equal(checks, 1);
  assert.equal(flow().booking.status, 'active');
  assert.equal(flow().booking.payment_url, null);
});

test('failed or still-pending verification keeps the existing payment link available', async () => {
  let checks = 0;
  const render = await setup('../src/hooks/useBookingWizard.ts', {
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    availability: async () => ({ slots: [{ local_start: '2026-10-08T19:00:00', starts_at: '2026-10-08T17:00:00Z', teacher_ids: [7] }] }),
    quote: async () => quote,
    confirm: async () => ({ reservation_id: 41, status: 'hold', next_action: 'pay', payment_url: 'https://checkout.stripe.com/test' }),
    readQuote: async () => {
      if (++checks === 1) throw new Error('Offline');
      return { reservation_id: 41, status: 'hold', next_action: 'pay', payment_url: null };
    },
  });
  const flow = () => render('useBookingWizard', { catalog, onNeedAuth() {} });
  flow().open('summary'); flow(); await settle();
  flow().pickService(2); flow().pickTime(1140); flow(); await settle();
  await flow().submit('card', null);
  assert.equal(typeof flow().checkPayment, 'function');
  await flow().checkPayment();
  assert.equal(flow().paymentCheckError, true);
  assert.equal(flow().booking.status, 'hold');
  await flow().checkPayment();
  assert.equal(flow().paymentCheckError, false);
  assert.equal(flow().booking.payment_url, 'https://checkout.stripe.com/test');
});

test('browser confirmation preserves the held booking instead of unloading the app', async () => {
  const render = await setup('../src/hooks/useBookingWizard.ts', {
    window: { location: { assign() { assert.fail('Browser booking must stay available for retry'); } } },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    availability: async () => ({ slots: [{ local_start: '2026-10-08T19:00:00', starts_at: '2026-10-08T17:00:00Z', teacher_ids: [7] }] }),
    quote: async () => quote,
    confirm: async () => ({ reservation_id: 41, status: 'hold', next_action: 'pay', payment_url: 'https://checkout.stripe.com/test' }),
  });
  const flow = () => render('useBookingWizard', { catalog, onNeedAuth() {} });
  flow().open('summary'); flow(); await settle();
  flow().pickService(2); flow().pickTime(1140); flow(); await settle();
  await flow().submit('card', null);
  assert.equal(flow().notice, null);
  assert.equal(flow().isOpen, true);
  assert.equal(flow().booking.payment_url, 'https://checkout.stripe.com/test');
});

test('a browser with the Telegram script keeps native checkout link navigation', async () => {
  let sdkCalls = 0, intercepted = false;
  const render = await setup('../src/hooks/useBookingWizard.ts', {
    telegram: { isInTelegram: false, tg: { openLink() { sdkCalls++; } } },
  });
  const flow = render('useBookingWizard', { catalog, onNeedAuth() {} });
  flow.openPayment('https://checkout.stripe.com/test', { preventDefault() { intercepted = true; } });
  assert.equal(sdkCalls, 0);
  assert.equal(intercepted, false);
});

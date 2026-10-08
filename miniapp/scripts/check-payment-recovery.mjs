import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const quote = { total_price: 25, total_price_str: '€25', fully_covered: false };

async function setup(file, extra = {}, environment = {}) {
  let cursor = 0;
  let pending = [];
  const state = [], timers = new Map();
  let timerId = 0;
  const context = vm.createContext({ console, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }, ...environment });
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) {
      const i = cursor++, old = state[i];
      if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) {
        old?.cleanup?.();
        state[i] = { deps };
        pending.push(() => { state[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-i18next': { useTranslation: () => ({ t: key => key, i18n: { language: 'en' } }) },
    Sheet: { Sheet: 'sheet', SheetAction: 'action' }, CheckoutBreakdown: { default: 'breakdown' }, CheckoutOptions: { default: 'options' },
    PaymentModal: { default: 'payment' }, useCheckoutCalc: { useCheckoutCalc: () => ({ calc: quote, isCalculating: false }) },
    useTelegram: { useTelegram: () => ({ tg: null, vibrateLight() {} }) },
    user: { calculateCheckout: async () => quote }, money: { money: value => `€${value}` },
    utils: { cn: (...items) => items.filter(Boolean).join(' ') },
    'framer-motion': { motion: { button: 'button', div: 'div' }, useReducedMotion: () => true },
    SettingRow: { default: 'setting' }, ...extra,
    PassCarousel: { default: 'carousel' }, PassArt: { default: 'pass-art' },
    PassDetails: { default: 'pass-details' }, Ring: { default: 'ring' },
    material: { materialsOf: () => new Map() },
    selection: { createSelection: index => ({ get: () => ({ index }) }), useSelection: selection => selection.get() },
    guilloche: { guilloche() {} }, idle: { whenIdle: () => undefined },
    useIsDesktop: { useIsDesktop: () => false },
  };
  const source = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(name => {
    const exports = dependencies[name] ?? dependencies[name.split('/').at(-1)];
    if (!exports) throw new Error(`Missing dependency ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return {
    render(name, ...args) {
      cursor = 0;
      const result = mod.namespace[name](...args);
      const effects = pending; pending = []; effects.forEach(fn => fn());
      return result;
    },
    async flush() { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); await settle(); },
    unmount() { for (const slot of state) slot?.cleanup?.(); },
  };
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type), ...nodes(tree.props?.footer, type)];
}

function openPurchase(view, props) {
  const tree = view.render('default', props);
  nodes(tree, 'sheet')[0].footer.props.onPay();
  return view.render('default', props);
}

test('package quote stops being payable immediately when a promo changes, before debounce', async () => {
  const view = await setup('../src/hooks/useCheckoutCalc.ts');
  view.render('useCheckoutCalc', 2, {}); await view.flush();
  assert.equal(view.render('useCheckoutCalc', 2, {}).calc.total_price, 25);
  const next = view.render('useCheckoutCalc', 2, { promo_code: 'NEW' });
  assert.equal(next.calc, null);
  assert.equal(next.isCalculating, true);
});

test('a failed package quote provides a retry without losing the entered promo', async () => {
  let requests = 0;
  const view = await setup('../src/hooks/useCheckoutCalc.ts', { user: { calculateCheckout: async (id, options) => {
    assert.equal(options.promo_code, 'SAVE');
    if (++requests === 1) throw new Error('Offline');
    return quote;
  } } });
  view.render('useCheckoutCalc', 2, { promo_code: 'SAVE' }); await view.flush();
  const failed = view.render('useCheckoutCalc', 2, { promo_code: 'SAVE' });
  assert.equal(failed.calcError, true);
  failed.retry(); view.render('useCheckoutCalc', 2, { promo_code: 'SAVE' }); await view.flush();
  assert.equal(view.render('useCheckoutCalc', 2, { promo_code: 'SAVE' }).calc.total_price, 25);
  assert.equal(requests, 2);
});

test('a response arriving after closing cannot be reused as a fresh quote on reopen', async () => {
  let resolveOld;
  const view = await setup('../src/hooks/useCheckoutCalc.ts', { user: { calculateCheckout: () => new Promise(resolve => { resolveOld = resolve; }) } });
  view.render('useCheckoutCalc', 2, {}); await view.flush();
  view.render('useCheckoutCalc', null, {});
  resolveOld(quote); await settle();
  const reopened = view.render('useCheckoutCalc', 2, {});
  assert.equal(reopened.calc, null);
  assert.equal(reopened.isCalculating, true);
});

test('checkout requires a current final quote and prevents rapid duplicate requests', async () => {
  let payments = 0, resolvePayment;
  const view = await setup('../src/components/modals/PaymentModal.tsx');
  const props = { isOpen: true, onClose() {}, itemName: 'Pass', amountStr: '€25', calc: null,
    isCalculating: false, options: {}, onOptionsChange() {}, onPay: () => { payments++; return new Promise(resolve => { resolvePayment = resolve; }); } };
  assert.equal(nodes(view.render('default', props), 'action')[0].disabled, true);
  const action = nodes(view.render('default', { ...props, calc: quote }), 'action')[0];
  const first = action.onClick(); const second = action.onClick();
  assert.equal(payments, 1);
  resolvePayment(); await Promise.all([first, second]);
});

test('booking payment invalidates its previous preview immediately after editing a voucher', async () => {
  const preview = { total: 25, currency: 'EUR', base_price: 25, discounts: [], certificate_applied: 0, bonuses_applied: 0, deposit_applied: 0 };
  const view = await setup('../src/components/wizard/WizardPaySheet.tsx', { 'hybrid.api': { hybridApi: { paymentPreview: async () => preview } } });
  const props = { isOpen: true, quoteId: 'q1', subtitle: '', canPayOnline: true, venueAllowed: true, saving: false, onClose() {}, onPay() {} };
  view.render('default', props); await view.flush();
  const tree = view.render('default', props);
  assert.equal(nodes(tree, 'action')[0].disabled, false);
  nodes(tree, 'input')[1].onChange({ target: { value: 'GIFT' } });
  assert.equal(nodes(view.render('default', props), 'action')[0].disabled, true);
});

test('booking payment cannot silently discard a voucher after a failed preview', async () => {
  let payments = 0;
  const view = await setup('../src/components/wizard/WizardPaySheet.tsx', { 'hybrid.api': { hybridApi: { paymentPreview: async () => { throw new Error('Offline'); } } } });
  const props = { isOpen: true, quoteId: 'q1', subtitle: '', canPayOnline: true, venueAllowed: true, saving: false, onClose() {}, onPay() { payments++; } };
  view.render('default', props); await view.flush();
  const action = nodes(view.render('default', props), 'action')[0];
  assert.equal(action.disabled, true);
  action.onClick();
  assert.equal(payments, 0);
});

test('an incomplete checkout response cannot activate a subscription', async () => {
  let activations = 0, closes = 0;
  const view = await setup('../src/components/modals/BuyModal.tsx', {
    user: { createCheckoutSession: async () => ({ paid: false, url: null }) }, notify: { notify() {} },
  });
  const props = { isOpen: true, initialPackageId: 2, canPayOnline: true,
    packages: [{ id: 2, name: 'Pass', final_price_str: '€25' }], onClose() { closes++; }, onSuccess() { activations++; } };
  const payment = nodes(openPurchase(view, props), 'payment')[0];
  await assert.rejects(payment.onPay());
  assert.equal(activations, 0);
  assert.equal(closes, 0);
});

test('checkout freezes payment options during the request and exposes a recoverable failure', async () => {
  let rejectPayment;
  const view = await setup('../src/components/modals/PaymentModal.tsx');
  const props = { isOpen: true, onClose() {}, itemName: 'Pass', amountStr: '€25', calc: quote,
    isCalculating: false, options: {}, onOptionsChange() {}, onPay: () => new Promise((resolve, reject) => { rejectPayment = reject; }) };
  const pending = nodes(view.render('default', props), 'action')[0].onClick();
  assert.equal(nodes(view.render('default', props), 'fieldset')[0]?.disabled, true);
  rejectPayment(new Error('Checkout is temporarily unavailable')); await pending;
  const failed = view.render('default', props);
  assert.equal(nodes(failed, 'action')[0].disabled, false);
  assert.equal(nodes(failed, 'div').some(row => row.role === 'alert'), true);
});

test('package checkout sends the reviewed total and refreshes a changed price without resubmitting', async () => {
  let retries = 0, requests = 0;
  const view = await setup('../src/components/modals/BuyModal.tsx', {
    useCheckoutCalc: { useCheckoutCalc: () => ({ calc: quote, isCalculating: false, retry() { retries++; } }) },
    user: { createCheckoutSession: async (id, options, expectedTotal) => {
      requests++;
      assert.equal(expectedTotal, 25);
      throw Object.assign(new Error('Price changed'), { status: 409, code: 'checkout.price_changed' });
    } }, notify: { notify() {} },
  });
  const props = { isOpen: true, initialPackageId: 2, canPayOnline: true,
    packages: [{ id: 2, name: 'Pass', final_price_str: '€25' }], onClose() {} };
  const payment = nodes(openPurchase(view, props), 'payment')[0];
  await assert.rejects(payment.onPay());
  assert.equal(requests, 1);
  assert.equal(retries, 1);
});

test('the underlying purchase sheet cannot close while a session request is pending', async () => {
  let closes = 0, resolveSession;
  const view = await setup('../src/components/modals/BuyModal.tsx', {
    user: { createCheckoutSession: () => new Promise(resolve => { resolveSession = resolve; }) }, notify: { notify() {} },
  });
  const props = { isOpen: true, initialPackageId: 2, canPayOnline: true,
    packages: [{ id: 2, name: 'Pass', final_price_str: '€25' }], onClose() { closes++; } };
  const tree = openPurchase(view, props);
  const pending = nodes(tree, 'payment')[0].onPay();
  nodes(tree, 'sheet')[0].onClose();
  assert.equal(closes, 0);
  resolveSession({ paid: true, url: null }); await pending;
  assert.equal(closes, 1);
});

test('failed Telegram handoff does not leave a return listener that closes the form later', async () => {
  let listeners = 0;
  const view = await setup('../src/components/modals/BuyModal.tsx', {
    user: { createCheckoutSession: async () => ({ paid: false, url: 'https://checkout.stripe.com/test' }) },
    useTelegram: { useTelegram: () => ({ isInTelegram: true, tg: { openLink() { throw new Error('Cannot open payment'); } }, vibrateLight() {} }) }, notify: { notify() {} },
  }, { document: { addEventListener() { listeners++; }, removeEventListener() { listeners--; } } });
  const props = { isOpen: true, initialPackageId: 2, canPayOnline: true,
    packages: [{ id: 2, name: 'Pass', final_price_str: '€25' }], onClose() {} };
  await assert.rejects(nodes(openPurchase(view, props), 'payment')[0].onPay());
  assert.equal(listeners, 0);
});

test('leaving the purchase screen removes its pending Telegram return listener', async () => {
  let listeners = 0;
  const view = await setup('../src/components/modals/BuyModal.tsx', {
    user: { createCheckoutSession: async () => ({ paid: false, url: 'https://checkout.stripe.com/test' }) },
    useTelegram: { useTelegram: () => ({ isInTelegram: true, tg: { openLink() {} }, vibrateLight() {} }) }, notify: { notify() {} },
  }, { document: { addEventListener() { listeners++; }, removeEventListener() { listeners--; } } });
  const props = { isOpen: true, initialPackageId: 2, canPayOnline: true,
    packages: [{ id: 2, name: 'Pass', final_price_str: '€25' }], onClose() {} };
  await nodes(openPurchase(view, props), 'payment')[0].onPay();
  assert.equal(listeners, 1);
  view.unmount();
  assert.equal(listeners, 0);
});

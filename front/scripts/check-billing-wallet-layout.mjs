import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function paymentFields(paymentKind) {
  const context = vm.createContext({});
  const modules = new Map();
  function mock(name, values) {
    modules.set(name, new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context }));
  }
  const hooks = [];
  let cursor = 0;
  mock('react', {
    useMemo: factory => factory(),
    useRef(value) { const index = cursor++; hooks[index] ??= { current: value }; return hooks[index]; },
    useState(value) { const index = cursor++; if (!(index in hooks)) hooks[index] = value;
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; },
  });
  mock('react-i18next', { useTranslation: () => ({ t: key => key }) });
  mock('@stripe/stripe-js/pure', { loadStripe: () => Promise.resolve(null) });
  mock('@stripe/react-stripe-js/checkout', { CheckoutElementsProvider: 'CheckoutProvider',
    useCheckoutElements: () => ({ type: 'loading' }), PaymentElement: 'CheckoutPayment', ExpressCheckoutElement: 'CheckoutExpress' });
  mock('@stripe/react-stripe-js', { Elements: 'ElementsProvider', PaymentElement: 'InvoicePayment',
    ExpressCheckoutElement: 'InvoiceExpress', useElements: () => null, useStripe: () => null });
  mock('./PaymentContext', { PaymentContext: { Provider: 'PaymentUiProvider' } });
  mock('./checkoutAmounts', { hasPayableTotal: amount => typeof amount === 'number' && amount > 0, uniformTaxRate: () => null });
  mock('./CheckoutPage.module.css', { default: { wallets: 'wallets' } });
  const node = (type, props) => ({ type, props });
  mock('react/jsx-runtime', { jsx: node, jsxs: node, Fragment: 'Fragment' });
  const code = ts.transpileModule(await readFile(new URL('../src/pages/dashboard/Billing/components/checkout/StripePayment.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = new vm.SourceTextModule(code, { context });
  await module.link(name => { assert.ok(modules.has(name), `Unexpected Stripe dependency: ${name}`); return modules.get(name); });
  await module.evaluate();
  const provider = module.namespace.default({ session: { payment_kind: paymentKind, client_secret: 'secret', publishable_key: 'pk_test', amount_due: 5445 },
    profile: { country: 'CZ', line1: 'Street 1', postal_code: '11000', city: 'Prague' }, children: null });
  const payment = provider.props.children;
  const render = () => { cursor = 0; return payment.type(payment.props).props.value.fields; };
  return { fields: render(), render };
}
function descendants(value) {
  if (Array.isArray(value)) return value.flatMap(descendants);
  if (!value || typeof value !== 'object') return [];
  return [value, ...descendants(value.props?.children)];
}
function express(fields, kind) {
  return descendants(fields).find(node => node.type === (kind === 'checkout' ? 'CheckoutExpress' : 'InvoiceExpress'));
}
function walletHidden(fields) {
  return Boolean(descendants(fields).find(node => node.props?.className === 'wallets').props['data-hidden']);
}
for (const kind of ['checkout', 'invoice']) {
  test(`${kind}: wallet layout satisfies the Stripe SDK overflow constraint`, async () => {
    const { fields } = await paymentFields(kind);
    const wallet = express(fields, kind);
    assert.ok(wallet, 'The actual payment UI must mount its Express Checkout Element');
    const layout = wallet.props.options.layout;
    assert.ok(layout.overflow !== 'never' || layout.maxRows === 0,
      'Stripe only permits overflow=never with maxRows=0; a bounded row count must allow automatic overflow');
  });
  test(`${kind}: PayPal is disabled and Revolut Pay is offered through Payment Element`, async () => {
    const { fields } = await paymentFields(kind);
    const options = express(fields, kind).props.options;
    assert.equal(options.paymentMethods.paypal, 'never');
    assert.deepEqual(Array.from(options.paymentMethodOrder), ['apple_pay', 'google_pay']);
    assert.ok(!('paypal' in options.buttonTheme));
    const payment = descendants(fields).find(node => node.type === (kind === 'checkout' ? 'CheckoutPayment' : 'InvoicePayment'));
    assert.deepEqual(Array.from(payment.props.options.paymentMethodOrder), ['card', 'revolut_pay']);
  });
  test(`${kind}: late wallet changes update visibility, disabled PayPal never reveals an empty row`, async () => {
    const ui = await paymentFields(kind);
    const ready = availablePaymentMethods => express(ui.render(), kind).props.onReady({ availablePaymentMethods });
    const changed = paymentMethods => express(ui.render(), kind).props.onAvailablePaymentMethodsChange({ paymentMethods });
    ready(undefined);
    assert.equal(walletHidden(ui.render()), true);
    ready({ paypal: true, applePay: false, googlePay: false });
    assert.equal(walletHidden(ui.render()), true, 'Disabled PayPal must not create an empty wallet section');
    changed({ paypal: { available: true }, applePay: { available: false }, googlePay: { available: false } });
    assert.equal(walletHidden(ui.render()), true);
    for (const method of ['applePay', 'googlePay']) {
      changed({ [method]: { available: true } });
      assert.equal(walletHidden(ui.render()), false, `Late ${method} must be visible`);
      changed({ [method]: { available: false } });
      assert.equal(walletHidden(ui.render()), true);
    }
    changed({ applePay: { available: true } });
    changed(undefined);
    assert.equal(walletHidden(ui.render()), true);
  });
}

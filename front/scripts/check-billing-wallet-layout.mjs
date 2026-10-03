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
  mock('react', { useMemo: factory => factory(), useRef: value => ({ current: value }), useState: value => [value, () => {}] });
  mock('react-i18next', { useTranslation: () => ({ t: key => key }) });
  mock('@stripe/stripe-js/pure', { loadStripe: () => Promise.resolve(null) });
  mock('@stripe/react-stripe-js/checkout', { CheckoutElementsProvider: 'CheckoutProvider',
    useCheckoutElements: () => ({ type: 'loading' }), PaymentElement: 'CheckoutPayment', ExpressCheckoutElement: 'CheckoutExpress' });
  mock('@stripe/react-stripe-js', { Elements: 'ElementsProvider', PaymentElement: 'InvoicePayment',
    ExpressCheckoutElement: 'InvoiceExpress', useElements: () => null, useStripe: () => null });
  mock('./PaymentContext', { PaymentContext: { Provider: 'PaymentUiProvider' } });
  mock('./checkoutAmounts', { hasPayableTotal: amount => typeof amount === 'number' && amount > 0, uniformTaxRate: () => null });
  mock('./CheckoutPage.module.css', { default: {} });
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
  return payment.type(payment.props).props.value.fields;
}
function descendants(value) {
  if (Array.isArray(value)) return value.flatMap(descendants);
  if (!value || typeof value !== 'object') return [];
  return [value, ...descendants(value.props?.children)];
}
for (const kind of ['checkout', 'invoice']) test(`${kind}: wallet layout satisfies the Stripe SDK overflow constraint`, async () => {
  const fields = await paymentFields(kind);
  const wallet = descendants(fields).find(node => node.type === (kind === 'checkout' ? 'CheckoutExpress' : 'InvoiceExpress'));
  assert.ok(wallet, 'The actual payment UI must mount its Express Checkout Element');
  const layout = wallet.props.options.layout;
  assert.ok(layout.overflow !== 'never' || layout.maxRows === 0,
    'Stripe only permits overflow=never with maxRows=0; a bounded row count must allow automatic overflow');
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function setup(status, pdf_url = null) {
  const context = vm.createContext({});
  const modules = new Map();
  const requests = [];
  function mock(name, exports) {
    modules.set(name, new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context }));
  }
  mock('react', { useState: value => [value, () => {}] });
  mock('react-i18next', { useTranslation: () => ({ t: key => key }) });
  const node = (type, props) => ({ type, props });
  mock('react/jsx-runtime', { jsx: node, jsxs: node, Fragment: 'Fragment' });
  mock('../ui/BillingIcons', { HistoryIcon: 'HistoryIcon', DownloadIcon: 'DownloadIcon', RefreshIcon: 'RefreshIcon' });
  mock('../../../../../api/billing/billing.api', { billingApi: {
    openReceipt: async (id, url) => { requests.push({ id, url }); }, exportInvoicesCsv: async () => {},
  } });
  mock('../../../../../lib/money', { formatMoney: value => String(value) });
  mock('../../../../../lib/plan', { planLabel: value => value });
  mock('../../../../../components/ui/index', { useToast: () => ({ error() {}, info() {}, success() {} }) });
  const path = '../src/pages/dashboard/Billing/components/tabs/InvoicesTab.tsx';
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const source = new vm.SourceTextModule(code, { context });
  await source.link(name => {
    assert.ok(modules.has(name), `Unexpected dependency ${name}`);
    return modules.get(name);
  });
  await source.evaluate();
  const tree = source.namespace.default({ loaded: true, currency: 'EUR', syncInvoice: async () => {}, invoices: [{
    id: 7, plan_name: 's5', period_months: 1, amount: 5445, payment_method: 'card',
    paid_at: '2026-10-02T10:00:00Z', status, pdf_url,
  }] });
  function descendants(value) {
    if (Array.isArray(value)) return value.flatMap(descendants);
    if (!value || typeof value !== 'object') return [];
    return [value, ...descendants(value.props?.children)];
  }
  return { requests, download: descendants(tree).find(node => node.type === 'button'
    && Array.isArray(node.props.children) && node.props.children.includes('PDF')) };
}

test('new paid invoices expose their server PDF download', async () => {
  const ui = await setup('paid');
  assert.ok(ui.download);
  await ui.download.props.onClick();
  assert.deepEqual(ui.requests, [{ id: 7, url: null }]);
});

test('fully refunded invoices keep access to the original and credit note through the server', async () => {
  const ui = await setup('refunded', 'https://files.stripe.com/old-invoice.pdf');
  assert.ok(ui.download);
  await ui.download.props.onClick();
  assert.deepEqual(ui.requests, [{ id: 7, url: null }]);
});

test('unpaid, failed and unsupported partial statuses do not expose a paid fiscal document', async () => {
  for (const status of ['pending', 'failed', 'partially_refunded', 'unknown']) {
    const ui = await setup(status, 'https://files.stripe.com/old-invoice.pdf');
    assert.equal(ui.download, undefined);
    assert.equal(ui.requests.length, 0);
  }
});

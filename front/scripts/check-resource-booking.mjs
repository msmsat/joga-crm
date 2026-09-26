// Exercise the real form handlers with deterministic API responses and hook state.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const services = [
  { id: 1, name: 'Group', booking_mode: 'event', is_bookable: true },
  { id: 2, name: 'Individual', booking_mode: 'resource', is_bookable: true },
  { id: 3, name: 'Other specialist', booking_mode: 'resource', is_bookable: true },
];
const slot = { starts_at: '2026-10-01T09:00:00Z', local_start: '2026-10-01T11:00:00', teacher_ids: [7] };
const quoted = { quote_id: 'quote-1', terms: { domain: { local_start: slot.local_start,
  trainer_name: 'Alex', funding: { price: 25, currency: 'EUR' } }, duration_min: 60 } };
// Чек шага оплаты (payment-preview): 25 € наличными, скидок нет.
const receipt = { currency: 'EUR', base_price: 25, covered_by: null, discounts: [],
  first_lesson_offered: false, first_lesson_applied: false, first_lesson_percent: null,
  promo_valid: null, promo_outweighed: false, certificate_error: null,
  certificate_amount: 0, certificate_applied: 0, total: 25 };
// Ответы приходят через несколько микрозадач (условия → чек) — ждём макрозадачу.
const settle = () => new Promise(done => setTimeout(done, 0));

async function setup(file, api = {}) {
  let cursor = 0;
  const state = [];
  const calls = [];
  const context = vm.createContext({ console });
  const queryKeys = { services: ['services'], branches: ['branches'], staff: ['staff'], resourceStaff: ['resource-staff'] };
  const react = {
    useMemo: fn => fn(),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return state[index] ??= { current: initial };
    },
  };
  const jsx = (type, props) => ({ type, props });
  const deps = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    '@tanstack/react-query': { useQuery: options => {
      const key = options.queryKey[0];
      return { data: key === 'services' ? services : key === 'branches' ? [{ id: 5, name: 'Main' }]
        : key === 'staff' ? [{ id: 7, name: 'Alex', is_specialist: true }]
        : key === 'resource-staff' ? { staff: [
          { teacher_id: 7, name: 'Alex', service_ids: [2], branch_ids: [5], service_prices: { 2: 25 }, service_durations: { 2: 45 } },
          { teacher_id: 8, name: 'Other', service_ids: [3], branch_ids: [5], service_prices: {}, service_durations: {} },
        ] } : { slots: [slot] }, refetch: async () => { calls.push('refetch'); } };
    } },
  };
  const other = {
    queryKeys,
    formatMoney: (n, currency) => `${n} ${currency}`,
    useDurationLabel: () => n => `${n} min`,
    usePriceLabel: () => n => String(n),
    useStudioCurrency: () => 'EUR',
    scheduleApi: {},
    useBusinessTerms: () => ({ ready: false }),
    useToast: () => ({ error: error => calls.push(error) }),
    getUserRoleFromToken: () => 'owner',
    errorMessage: error => String(error),
    servicesApi: {}, studioApi: {}, staffApi: {},
    hybridApi: {
      quote: async request => { calls.push(request); return api.quote ? api.quote(request) : quoted; },
      paymentPreview: async (id, codes) => (api.paymentPreview ? api.paymentPreview(id, codes) : receipt),
      confirm: async (id, payment) => { calls.push(id); api.paid = payment; if (api.confirm) await api.confirm(id); },
    },
  };
  for (const name of ['Select', 'ModalShell', 'ModalHeader', 'ModalBody', 'ModalFooter', 'GhostButton', 'PrimaryButton', 'ResourceClientPicker', 'ResourceKeypadModal', 'BookingPayment', 'BookingWizard']) other[name] = name;
  other.usePhone = () => false; // desktop: the sheet, not the phone keypad form
  // Follow the extracted production hooks and pure time utilities as real modules.
  // Stubbing useResourceBooking here would only test our imitation of the form.
  async function load(url) {
    const code = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const mod = new vm.SourceTextModule(code, { context, identifier: url.href, initializeImportMeta(meta) { meta.env = { DEV: false }; } });
    await mod.link((name, parent) => {
      if (/\/(useResourceBooking|useResourceBookingChoice|useBookingPayment|utils|constants)$/.test(name)) {
        return load(new URL(`${name}.ts`, parent.identifier));
      }
      const exports = deps[name] ?? other;
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    return mod;
  }
  const mod = await load(new URL(file, import.meta.url));
  await mod.evaluate();
  return { calls, render(name, props) {
    cursor = 0;
    // The exported modal picks a layout (sheet or phone keypad) and returns that
    // component as an element — unwrap it so the checks see the real form.
    let tree = mod.namespace[name](props);
    while (tree && typeof tree.type === 'function') tree = tree.type(tree.props);
    return tree;
  } };
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}
const formPath = '../src/pages/dashboard/Journal/components/modals/ResourceBookingModal.tsx';
const props = { defaultDate: '2026-10-01', defaultServiceId: 2, teacherId: 7, onClose() {}, onCreated() {} };

test('creation offers individual services; event editing still excludes them', async () => {
  const app = await setup('../src/pages/dashboard/Journal/hooks/useServiceOptions.ts');
  assert.deepEqual(Array.from(app.render('useServiceOptions', true).options, item => item.value), ['1', '2', '3', '__create_service__']);
  assert.deepEqual(Array.from(app.render('useServiceOptions', false).options, item => item.value), ['1', '__create_service__']);
});
test('individual booking carries client, selected service, branch, specialist and time to confirmation', async () => {
  const app = await setup(formPath);
  let tree = app.render('ResourceBookingModal', props);
  assert.equal(nodes(tree, 'PrimaryButton')[0].disabled, true);
  assert.equal(nodes(tree, 'Select')[0].value, '2');
  assert.equal(nodes(tree, 'Select')[0].options.length, 1); // selected master's service
  nodes(tree, 'ResourceClientPicker')[0].onChange(901);
  tree = app.render('ResourceBookingModal', props);
  await nodes(tree, 'button').find(button => button.children === '11:00').onClick();
  await settle();
  assert.equal(app.calls[0].client_id, 901);
  assert.equal(app.calls[0].service_id, 2);
  assert.equal(app.calls[0].branch_id, 5);
  assert.equal(app.calls[0].teacher_id, 7);
  assert.equal(app.calls[0].starts_at, slot.starts_at);
  assert.equal(app.calls[0].first_lesson, true); // скидка первого занятия — сама, если положена
  tree = app.render('ResourceBookingModal', props);
  assert.equal(nodes(tree, 'PrimaryButton')[0].disabled, false);
  await nodes(tree, 'PrimaryButton')[0].onClick();
  assert.equal(app.calls[1], 'quote-1');
});
test('confirmation waits for the payment receipt and takes exactly its total in cash', async () => {
  let release;
  const api = { paymentPreview: () => new Promise(done => { release = done; }) };
  const app = await setup(formPath, api);
  let tree = app.render('ResourceBookingModal', props);
  nodes(tree, 'ResourceClientPicker')[0].onChange(901);
  tree = app.render('ResourceBookingModal', props);
  await nodes(tree, 'button').find(button => button.children === '11:00').onClick();
  await settle();
  // Условия есть, чека ещё нет: сумму, которую примут наличными, назвать нечем.
  tree = app.render('ResourceBookingModal', props);
  assert.equal(nodes(tree, 'PrimaryButton')[0].disabled, true);
  release({ ...receipt, total: 20, discounts: [{ kind: 'studio', amount: 5 }] });
  await settle();
  tree = app.render('ResourceBookingModal', props);
  assert.equal(nodes(tree, 'PrimaryButton')[0].disabled, false);
  await nodes(tree, 'PrimaryButton')[0].onClick();
  assert.deepEqual({ ...api.paid }, { promo_code: null, certificate_code: null, expected_total: 20 });
});
test('late quote for the previous client cannot enable confirmation', async () => {
  let resolve;
  const app = await setup(formPath, { quote: () => new Promise(done => { resolve = done; }) });
  let tree = app.render('ResourceBookingModal', { ...props, clientId: null });
  nodes(tree, 'ResourceClientPicker')[0].onChange(1);
  tree = app.render('ResourceBookingModal', props);
  nodes(tree, 'button').find(button => button.children === '11:00').onClick();
  nodes(tree, 'ResourceClientPicker')[0].onChange(2);
  resolve(quoted);
  await settle();
  tree = app.render('ResourceBookingModal', props);
  assert.equal(nodes(tree, 'PrimaryButton')[0].disabled, true);
});

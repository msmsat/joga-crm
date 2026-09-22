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

async function setup(file, api = {}) {
  let cursor = 0;
  const state = [];
  const calls = [];
  const context = vm.createContext({ console });
  const queryKeys = { services: ['services'], branches: ['branches'], staff: ['staff'] };
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
        : { slots: [slot] }, refetch: async () => { calls.push('refetch'); } };
    } },
  };
  const other = {
    queryKeys,
    useBusinessTerms: () => ({ ready: false }),
    useToast: () => ({ error: error => calls.push(error) }),
    getUserRoleFromToken: () => 'owner',
    errorMessage: error => String(error),
    servicesApi: {}, studioApi: {}, staffApi: {},
    hybridApi: {
      quote: async request => { calls.push(request); return api.quote ? api.quote(request) : quoted; },
      confirm: async id => { calls.push(id); if (api.confirm) await api.confirm(id); },
    },
  };
  for (const name of ['Select', 'ModalShell', 'ModalHeader', 'ModalBody', 'ModalFooter', 'GhostButton', 'PrimaryButton', 'ResourceClientPicker']) other[name] = name;
  const code = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const mod = new vm.SourceTextModule(code, { context });
  await mod.link(name => {
    const exports = deps[name] ?? other;
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return { calls, render(name, props) { cursor = 0; return mod.namespace[name](props); } };
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
  assert.equal(nodes(tree, 'Select')[0].options.length, 2);
  nodes(tree, 'ResourceClientPicker')[0].onChange(901);
  tree = app.render('ResourceBookingModal', props);
  await nodes(tree, 'button').find(button => button.children === '11:00').onClick();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(app.calls[0].client_id, 901);
  assert.equal(app.calls[0].service_id, 2);
  assert.equal(app.calls[0].branch_id, 5);
  assert.equal(app.calls[0].teacher_id, 7);
  assert.equal(app.calls[0].starts_at, slot.starts_at);
  tree = app.render('ResourceBookingModal', props);
  assert.equal(nodes(tree, 'PrimaryButton')[0].disabled, false);
  await nodes(tree, 'PrimaryButton')[0].onClick();
  assert.equal(app.calls[1], 'quote-1');
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
  for (let i = 0; i < 5; i++) await Promise.resolve();
  tree = app.render('ResourceBookingModal', props);
  assert.equal(nodes(tree, 'PrimaryButton')[0].disabled, true);
});

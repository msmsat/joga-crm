// Run with: node --experimental-vm-modules scripts/check-service-duration.mjs
// Real component handlers; only React's host and unrelated UI/network hooks are stubbed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function setup(file) {
  const state = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useEffect() {}, useMemo: fn => fn(),
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }];
    },
  };
  const translate = (key, p) => key === 'booking.duration' ? `${p.min} min`
    : key;
  const deps = {
    react: { ...react, default: react },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-dom': { createPortal: tree => tree },
    'react-router-dom': { useNavigate: () => () => {} },
    'react-i18next': { useTranslation: () => ({ t: translate }) },
    '@tanstack/react-query': { useQuery: () => ({ data: [] }) },
  };
  const other = {
    formatMoney: (n, currency) => `${n} ${currency}`,
    useDurationLabel: () => n => `${n} min`,
    useBusinessTerms: () => ({ ready: false }),
    SheetAction: 'SheetAction', TimeStep: 'TimeStep', default: 'TimeStep',
    DoneStep: 'DoneStep', QuoteStep: 'QuoteStep',
    useServiceOptions: () => ({ services: [], options: [], priceFor: () => 100 }),
    useStudioCurrency: () => 'EUR', usePhone: () => false,
    useNotePhotos: () => ({ photos: [], pending: [], add() {}, remove() {} }),
    queryKeys: { branches: ['branches'] }, studioApi: {}, TIMES: [],
    formatIndexToTimeStr: n => `${n}:00`, generateTimeIntervals: () => [], parseTimeToIndex: Number,
    CREATE_SERVICE_OPTION: '__create_service__', Select: 'Select', ConfirmModal: 'ConfirmModal',
    NotePhotos: 'NotePhotos', NoteDropZone: 'NoteDropZone', Plus: 'Plus', X: 'X', Check: 'Check',
  };
  const context = vm.createContext({ document: { body: {} }, console });
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
  return (name, props) => { cursor = 0; return mod.namespace[name](props); };
}

function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, predicate));
  return [...(predicate(tree) ? [tree.props] : []), ...nodes(tree.props?.children, predicate)];
}

async function picker(own = { 1: 45 }, base = 60) {
  const render = await setup('../src/components/ui/ServicePricePicker.tsx');
  let value = { ids: [1], prices: { 1: 120 }, durations: own };
  let calls = 0;
  const view = () => render('ServicePricePicker', {
    services: [{ id: 1, name: 'Haircut', price: 100, duration_min: base }], value,
    onChange(next) { calls++; value = next; },
  });
  return {
    view, value: () => value, calls: () => calls,
    enter(text, finish = 'blur', field = 'duration') {
      nodes(view(), n => n.props?.className === `v-svc-${field}`)[0].onClick();
      nodes(view(), n => n.type === 'input')[0].onChange({ target: { value: text } });
      const input = nodes(view(), n => n.type === 'input')[0];
      if (finish === 'blur') input.onBlur();
      else input.onKeyDown({ key: finish, preventDefault() {}, stopPropagation() {} });
    },
  };
}

for (const entered of ['1500', '0', '-45', '1.5', 'abc']) {
  test(`invalid duration ${entered} keeps the previous value and reports an error`, async () => {
    const app = await picker();
    app.enter(entered);
    assert.equal(app.value().durations[1], 45);
    assert.equal(app.calls(), 0);
    assert.equal(nodes(app.view(), n => n.props?.role === 'alert').length, 1);
  });
}
test('empty duration restores inheritance without removing a custom price', async () => {
  const app = await picker(); app.enter('');
  assert.equal(app.value().durations[1], undefined);
  assert.equal(app.value().prices[1], 120);
});
test('valid duration is saved with Enter; Escape cancels an edit', async () => {
  const app = await picker(); app.enter('90', 'Enter');
  assert.equal(app.value().durations[1], 90);
  app.enter('30', 'Escape');
  assert.equal(app.value().durations[1], 90);
});
test('opening an unchanged custom duration equal to the catalog keeps it custom', async () => {
  const app = await picker({ 1: 60 }); app.enter('60');
  assert.equal(app.value().durations[1], 60);
});
test('a free price stays zero', async () => {
  const app = await picker(); app.enter('0', 'blur', 'price');
  assert.equal(app.value().prices[1], 0);
});

for (const step of ['quote', 'confirming', 'done']) {
  test(`sheet uses exact server duration and master on ${step}`, async () => {
    const render = await setup('../../miniapp/src/components/booking/useResourceSheet.tsx');
    const flow = { service: { name: 'Haircut', duration_str: '45–90 min', price_str: '100–200 EUR' },
      teacherName: null, step, close() {}, quote: { terms: { duration_min: 45,
        domain: { trainer_name: 'Anna', funding: { kind: 'pay', price: 100, currency: 'EUR' } } } } };
    assert.equal(render('useResourceSheet', flow).subtitle, 'Anna · 45 min · 100 EUR');
  });
}
test('before a quote, the sheet keeps the range', async () => {
  const render = await setup('../../miniapp/src/components/booking/useResourceSheet.tsx');
  const flow = { service: { name: 'Haircut', duration_str: '45–90 min' }, teacherName: null,
    step: 'select_time', close() {}, quote: null };
  assert.equal(render('useResourceSheet', flow).subtitle, 'booking.anyMaster · 45–90 min');
});
test('group form displays the duration it will actually save', async () => {
  const render = await setup('../src/pages/dashboard/Journal/components/modals/NewBookingModal.tsx');
  const props = { trainers: [], halls: [], newBookingSlot: { trainer: 1, timeStart: 10, timeEnd: 11.5 },
    newForm: { serviceId: 1, title: 'Group', maxClients: '5', hall: '', branchId: null },
    newFormPos: { x: 0, y: 0 }, modalRef: { current: null }, timeStep: 15,
    setNewBookingSlot() {}, setNewForm() {}, closeNewForm() {}, onCreate() {} };
  const tree = render('NewBookingModal', props);
  const label = nodes(tree, n => n.props?.className === 'kp-price-v')[0];
  assert.equal(label.children.join(''), '100 EUR · 90 min');
});

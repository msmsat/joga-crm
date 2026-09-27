import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(pathToFileURL(`${root}/package.json`));
const ts = require('typescript');
const base = 'src/pages/dashboard/Journal/components/modals/booking-wizard/';
async function harness(file, extra = {}) {
  let cursor = 0;
  const state = [];
  const context = vm.createContext({ console, get localStorage() { return globalThis.localStorage; } });
  const jsx = (type, props) => ({ type, props });
  const deps = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
        return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
      },
      useRef: initial => ({ current: initial }), useMemo: fn => fn(), useEffect: () => {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-i18next': { useTranslation: () => ({ t: key => key, i18n: { language: 'en' } }) },
    '../../../utils': { toDateStr: date => date.toISOString().slice(0, 10) },
    './useBookingWizard': { isTime: value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value), TIME_STEPS: [1, 2, 5, 15] },
    './timeOptions': { useTimeOptions: () => ({ times: ['10:00', '10:05'], loading: false }) },
    './WizardParts': { WizardEmpty: 'empty' },
    '../../../../../../components/Icons': { Clock: 'clock', Check: 'check' },
    index: { PillSelect: 'PillSelect' },
    ...extra,
  };
  async function load(path) {
    const code = ts.transpileModule(await readFile(path, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const mod = new vm.SourceTextModule(code, { context, identifier: path.href });
    await mod.link((name, parent) => {
      if (name === './whenInput') return load(new URL(`${name}.ts`, parent.identifier));
      const exports = deps[name] ?? deps[name.split('/').at(-1)];
      if (!exports) throw new Error(`Missing dependency: ${name}`);
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    return mod;
  }
  const mod = await load(pathToFileURL(`${root}/${file}`));
  await mod.evaluate();
  return { render(name, props) { cursor = 0; return mod.namespace[name](props); } };
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}
const wizard = () => ({ date: '2026-10-01', time: '10:00', masters: [], resource: {},
  availability: { times: ['10:00', '10:05'], loading: false }, timeStep: 5, setTimeStep() {},
  setWhen(day, time) { this.date = day; this.time = time; }, advance() { this.advanced = true; },
  pickTime(time) { this.time = time; this.advanced = true; } });

for (const text of ['', '12:', '29:99']) {
  test(`editing time to ${JSON.stringify(text)} clears previous completed selection`, async () => {
    const app = await harness(`${base}TimeStep.tsx`);
    const w = wizard();
    nodes(app.render('TimeStep', { w }), 'input')[0].onChange({ target: { value: text } });
    assert.equal(w.time, '');
    nodes(app.render('TimeStep', { w }), 'input')[0].onKeyDown({ key: 'Enter' });
    assert.equal(w.advanced, undefined);
  });
}
test('complete manual time applies immediately and Enter advances', async () => {
  const app = await harness(`${base}TimeStep.tsx`);
  const w = wizard();
  nodes(app.render('TimeStep', { w }), 'input')[0].onChange({ target: { value: '1235' } });
  assert.equal(w.time, '12:35');
  nodes(app.render('TimeStep', { w }), 'input')[0].onKeyDown({ key: 'Enter' });
  assert.equal(w.advanced, true);
});

async function navigation(overrides = {}) {
  const noop = () => {};
  const resource = { choice: { serviceOptions: [], masterOptions: [] }, slots: [],
    setDate: noop, setClient: noop, setTeacherId: noop };
  const app = await harness(`${base}useBookingWizard.ts`, {
    '@tanstack/react-query': { useQuery: () => ({ data: undefined, isFetched: true, isFetching: false }) },
    index: { useToast: () => ({ info: noop, error: noop }) },
    schedule: { scheduleApi: {} }, 'services.api': { servicesApi: {} }, 'studio.api': { studioApi: {} },
    errorMessage: { errorMessage: noop },
    queryKeys: { queryKeys: { client: id => ['client', id] } },
    useResourceBooking: { useResourceBooking: () => resource },
    useBusinessTerms: { useBusinessTerms: () => ({ spaceIsAxis: false }) },
    staff: { staffApi: {} }, 'clients.api': { clientsApi: {} }, money: { formatMoney: () => '' },
    useStudioCurrency: { useStudioCurrency: () => 'EUR' },
    '../../../utils': { staffToTrainer: noop, toDateStr: date => date.toISOString().slice(0, 10) },
    './freeTimes': { eventFreeTimes: () => ({ isFree: () => true }) },
    './masterAvailability': { lessonToJoin: noop, useMasterAvailability: () => new Map() },
    './useWizardAvailability': { useWizardAvailability: () => ({ serviceStates: new Map(), masterStates: new Map(),
      times: [], loading: false, conflict: false, branchFor: () => undefined }) },
    'hybrid.api': { hybridApi: {} },
    useNotePhotos: { useNotePhotos: () => ({ photos: [], pending: [], add: noop, remove: noop }) },
    ...overrides,
  });
  return (extra = {}) => {
    const options = { defaultTeacherId: null, defaultDate: '2026-10-01', onClose: noop, onCreated: noop, ...extra };
    return () => app.render('useBookingWizard', options);
  };
}
test('sections and swipes work before selecting a client; time is not automatically completed', async () => {
  const render = (await navigation())();
  let w = render();
  assert.equal(w.done(0), false);
  w.goTo(2);
  w = render();
  assert.equal(w.step, 2);
  w.pickService({ id: 1, booking_mode: 'event', masters: [], duration_min: 60 });
  w = render();
  assert.equal(w.service.id, 1);
  assert.equal(w.client, null);
  w.goTo(0);
  w = render();
  w.swipe(1);
  assert.equal(render().step, 1);
  render().swipe(-1);
  assert.equal(render().step, 0);
  render().swipe(-1);
  assert.equal(render().step, 0);
  render().pickTime('10:05');
  assert.equal(render().done(0), true);
});
test('wizard opens on the summary with only the tapped time and column master preselected', async () => {
  const render = (await navigation())({ defaultTime: '10:30', defaultTeacherId: 7 });
  const w = render();
  assert.equal(w.step, 4);
  assert.equal(w.time, '10:30');
  assert.equal(w.teacherId, 7);
  assert.equal(w.masterChosen, true);
  assert.equal(w.done(0), true);
  assert.equal(w.done(1), false);
  assert.equal(w.timeStep, 15);
  w.goTo(0);
  render().pickTime('11:00');
  assert.equal(render().time, '11:00');
  assert.equal(render().step, 1);
});
test('time step defaults to 15 and is remembered for the next booking', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    // Каждая запись — свой экземпляр: состояние поддельного React у него своё.
    const fresh = async () => (await navigation())()();
    const render = (await navigation())();
    assert.equal(render().timeStep, 15);
    render().setTimeStep(5);
    assert.equal(render().timeStep, 5);
    assert.equal((await fresh()).timeStep, 5);
    store.set('journal:wizardTimeStep', '7');
    assert.equal((await fresh()).timeStep, 15);
  } finally {
    delete globalThis.localStorage;
  }
});
test('opened without context: summary with nothing chosen', async () => {
  const w = (await navigation())()();
  assert.equal(w.step, 4);
  assert.equal(w.time, '');
  assert.equal(w.masterChosen, false);
});
test('from the client card the client is chosen but still changeable', async () => {
  const render = (await navigation())({ clientId: 5 });
  const w = render();
  assert.equal(w.step, 4);
  assert.equal(w.client.id, 5);
  assert.equal(w.steps.includes(1), true);
  w.goTo(1);
  render().pickClient(9, 'Other');
  assert.equal(render().client.id, 9);
});
async function groupBooking(joined) {
  const calls = [];
  const scheduleApi = {
    createLesson: async body => { calls.push(['create', body]); return { id: 50 }; },
    createReservation: async (client, lesson) => { calls.push(['reserve', client, lesson]); },
    updateLesson: async (id, body) => { calls.push(['update', id, body]); },
  };
  const noop = () => {};
  const render = (await navigation({
    schedule: { scheduleApi },
    './masterAvailability': { lessonToJoin: () => joined },
    useNotePhotos: { useNotePhotos: () => ({ photos: ['/static/notes/a.jpg'], pending: [], add: noop, remove: noop }) },
  }))({ defaultTime: '10:00', defaultTeacherId: 7 });
  render().pickClient(3, 'Anna');
  render().pickService({ id: 1, booking_mode: 'event', masters: [], duration_min: 60 });
  render().setNotes('  Bring a mat  ');
  await render().submit();
  return calls;
}
test('note goes into a new group lesson', async () => {
  const calls = await groupBooking(undefined);
  const [, body] = calls.find(c => c[0] === 'create');
  assert.equal(body.notes, 'Bring a mat');
  assert.deepEqual(Array.from(body.photos), ['/static/notes/a.jpg']);
  assert.equal(calls.some(c => c[0] === 'update'), false);
});
test('joining an existing lesson appends the note with the client name', async () => {
  const calls = await groupBooking({ id: 9, notes: 'Hall B', photos: ['/static/notes/old.jpg'] });
  assert.equal(calls.some(c => c[0] === 'create'), false);
  const [, id, body] = calls.find(c => c[0] === 'update');
  assert.equal(id, 9);
  assert.equal(body.notes, 'Hall B\n\nAnna: Bring a mat');
  assert.deepEqual(Array.from(body.photos), ['/static/notes/old.jpg', '/static/notes/a.jpg']);
});
test('choosing a master with an offered time skips the now completed time section', async () => {
  const render = (await navigation())();
  render().pickClient(1, 'Client');
  render().pickService({ id: 1, booking_mode: 'event', masters: [], duration_min: 60 });
  render().goTo(3);
  render().pickMaster(7, '10:05');
  assert.equal(render().time, '10:05');
  assert.equal(render().step, 4);
});
test('available time and date can be picked directly', async () => {
  const app = await harness(`${base}TimeStep.tsx`);
  const w = wizard();
  let tree = app.render('TimeStep', { w });
  nodes(tree, 'button').find(p => p.children === '10:05').onClick();
  assert.equal(w.time, '10:05');
  assert.equal(w.advanced, true);
  tree = app.render('TimeStep', { w });
  const day = nodes(tree, 'button').find(p => p.className?.startsWith('bw-day') && !p.className.includes('active'));
  day.onClick();
  assert.notEqual(w.date, '2026-10-01');
  assert.equal(w.time, '10:05');
});
test('time screen exposes all four step choices and preserves selection', async () => {
  const app = await harness(`${base}TimeStep.tsx`);
  const w = wizard();
  w.setTimeStep = value => { w.timeStep = value; };
  const tree = app.render('TimeStep', { w });
  const picker = nodes(tree, 'PillSelect')[0];
  assert.deepEqual(Array.from(picker.options, p => p.value), [1, 2, 5, 15]);
  assert.equal(picker.value, 5);
  picker.onChange(2);
  assert.equal(w.timeStep, 2);
  assert.equal(w.time, '10:00');
});
test('time indicator is not a button or an interactive element', async () => {
  const app = await harness(`${base}WhenPicker.tsx`);
  const tree = app.render('WhenChip', { w: wizard() });
  assert.equal(nodes(tree, 'button').length, 0);
  assert.equal(tree.props.onClick, undefined);
  assert.equal(tree.props.tabIndex, undefined);
});
test('conflicting time and service tabs are red, editable and have no completion badge', async () => {
  const app = await harness(`${base}WizardTabs.tsx`, {
    './useBookingWizard': { TIME_STEP: 0, CLIENT_STEP: 1, SERVICE_STEP: 2, MASTER_STEP: 3, SUMMARY_STEP: 4 },
  });
  let destination;
  const w = { step: 3, steps: [0, 1, 2, 3, 4], service: { id: 1 }, conflict: true, masterChosen: false,
    done: () => true, goTo: value => { destination = value; } };
  const buttons = nodes(app.render('WizardTabs', { w, payable: false }), 'button');
  for (const index of [0, 2]) {
    assert.equal(buttons[index].disabled, false);
    assert.equal(buttons[index]['aria-invalid'], true);
    assert.equal(buttons[index].className.includes('conflict'), true);
    assert.equal(buttons[index].className.includes('done'), false);
  }
  buttons[0].onClick();
  assert.equal(destination, 0);
});

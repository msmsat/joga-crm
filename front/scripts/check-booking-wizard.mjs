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
      if (name === './whenInput' || name === './pastSlot') return load(new URL(`${name}.ts`, parent.identifier));
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
  return {
    render(name, props) {
      cursor = 0;
      let tree = mod.namespace[name](props);
      while (tree && typeof tree.type === 'function') tree = tree.type(tree.props);
      return tree;
    },
    call(name, args) { return mod.namespace[name](...args); },
  };
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

// Каталог по умолчанию смешанный: есть индивидуальная услуга с мастером —
// значит, пока услуга не выбрана, раздел «Клиент» нужен.
const MIXED = { services: [{ id: 2, booking_mode: 'resource', masters: [] }],
  resourceStaff: { staff: [{ teacher_id: 7, service_ids: [2] }] } };
async function navigation(overrides = {}, catalog = MIXED) {
  const noop = () => {};
  const resource = { choice: { serviceOptions: [], masterOptions: [] }, slots: [],
    setDate: noop, setClient: noop, setTeacherId: noop };
  const app = await harness(`${base}useBookingWizard.ts`, {
    '@tanstack/react-query': { useQuery: ({ queryKey }) => ({ data: catalog[queryKey?.[0]], isFetched: true, isFetching: false }) },
    index: { useToast: () => ({ info: noop, error: noop }) },
    schedule: { scheduleApi: {} }, 'services.api': { servicesApi: {} }, 'studio.api': { studioApi: {} },
    errorMessage: { errorMessage: noop },
    queryKeys: { queryKeys: { client: id => ['client', id], services: ['services'], resourceStaff: ['resourceStaff'] } },
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
    useWizardSettle: { useWizardSettle: () => ({ ready: true, settle: () => ({ payment: null }) }) },
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
  // У группового занятия раздела «Клиент» нет — свайп с времени ведёт к услуге.
  w.swipe(1);
  assert.equal(render().step, 2);
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
async function groupBooking(joined, extra = {}) {
  const calls = [];
  const scheduleApi = {
    createLesson: async body => { calls.push(['create', body]); return { id: 50 }; },
    createReservation: async (client, lesson) => { calls.push(['reserve', client, lesson]); },
    updateLesson: async (id, body) => { calls.push(['update', id, body]); },
  };
  const noop = () => {};
  const created = [];
  const render = (await navigation({
    schedule: { scheduleApi },
    './masterAvailability': { lessonToJoin: () => joined },
    useNotePhotos: { useNotePhotos: () => ({ photos: ['/static/notes/a.jpg'], pending: [], add: noop, remove: noop }) },
  }))({ defaultTime: '10:00', defaultTeacherId: 7, onCreated: date => created.push(date),
    onClose: () => created.push('closed'), ...extra });
  if (extra.clientId != null) render().pickClient(extra.clientId, 'Anna');
  render().pickService({ id: 1, booking_mode: 'event', masters: [], duration_min: 60 });
  render().setNotes('  Bring a mat  ');
  const w = render();
  await w.submit();
  return { calls, w, created };
}
test('group lesson from the journal has no client section and reports the created date', async () => {
  const { calls, w, created } = await groupBooking(undefined);
  assert.equal(w.needsClient, false);
  assert.equal(w.steps.includes(1), false);
  assert.equal(w.ready, true);
  const [, body] = calls.find(c => c[0] === 'create');
  assert.equal(body.notes, 'Bring a mat');
  assert.deepEqual(Array.from(body.photos), ['/static/notes/a.jpg']);
  assert.equal(calls.some(c => c[0] === 'reserve'), false);
  assert.equal(calls.some(c => c[0] === 'update'), false);
  assert.deepEqual(created, [w.date, 'closed']);
});
test('without a client an existing lesson at that time is busy, not joined', async () => {
  const { calls, w } = await groupBooking({ id: 9, notes: '', photos: [] });
  assert.equal(w.joined, undefined);
  assert.equal(calls.some(c => c[0] === 'update' || c[0] === 'reserve'), false);
});
test('choosing a group service skips the client section', async () => {
  const render = (await navigation())({ defaultTime: '10:00' });
  render().goTo(2);
  render().pickService({ id: 1, booking_mode: 'event', masters: [], duration_min: 60 });
  assert.equal(render().step, 3);
  render().pickMaster(7);
  assert.equal(render().step, 4);
});
test('studio with only group services has no client section from the start', async () => {
  const groupOnly = { services: [{ id: 1, booking_mode: 'event', masters: [] }], resourceStaff: { staff: [] } };
  const render = (await navigation({}, groupOnly))({ defaultTime: '10:00', defaultTeacherId: 7 });
  const w = render();
  assert.equal(w.needsClient, false);
  assert.deepEqual(Array.from(w.steps), [0, 2, 3, 4]);
  w.goTo(0);
  render().pickTime('11:00');
  assert.equal(render().step, 2);
  // Из карточки клиента клиент остаётся и в такой студии.
  const card = (await navigation({}, groupOnly))({ clientId: 5 })();
  assert.equal(card.steps.includes(1), true);
});
test('from the client card a group booking still books the client and reports the created date', async () => {
  const { calls, w, created } = await groupBooking(undefined, { clientId: 3 });
  assert.deepEqual(calls.find(c => c[0] === 'reserve'), ['reserve', 3, 50]);
  assert.deepEqual(created, [w.date, 'closed']);
});
test('joining an existing lesson appends the note and reports the date of the selected lesson', async () => {
  const { calls, w, created } = await groupBooking({ id: 9, notes: 'Hall B', photos: ['/static/notes/old.jpg'] }, { clientId: 3 });
  assert.equal(calls.some(c => c[0] === 'create'), false);
  const [, id, body] = calls.find(c => c[0] === 'update');
  assert.equal(id, 9);
  assert.equal(body.notes, 'Hall B\n\nAnna: Bring a mat');
  assert.deepEqual(Array.from(body.photos), ['/static/notes/old.jpg', '/static/notes/a.jpg']);
  assert.deepEqual(created, [w.date, 'closed']);
});

test('manual date and time, available time, and a master time notify the journal of the selected day', async () => {
  const days = [];
  const render = (await navigation())({ defaultDate: '2099-05-12', onDateChange: date => days.push(date) });
  render().setWhen('2099-05-20', '12:35');
  assert.equal(render().date, '2099-05-20');
  assert.equal(render().time, '12:35');
  assert.equal(days.at(-1), '2099-05-20');
  const afterManual = days.length;
  render().pickTime('13:00');
  assert.equal(render().time, '13:00');
  assert.equal(days.at(-1), '2099-05-20');
  assert.equal(days.length, afterManual + 1);
  render().pickMaster(7, '13:30');
  assert.equal(render().time, '13:30');
  assert.equal(days.at(-1), '2099-05-20');
  assert.equal(days.length, afterManual + 2);
});

test('creating a group lesson after changing the date reports the selected day before closing', async () => {
  const events = [];
  let createdBody;
  const render = (await navigation({ schedule: { scheduleApi: { createLesson: async body => {
    createdBody = body;
    return { id: 50 };
  } } } }))({ defaultDate: '2099-05-12', defaultTime: '10:00', defaultTeacherId: 7,
    onCreated: date => events.push(date), onClose: () => events.push('closed') });
  render().pickService({ id: 1, booking_mode: 'event', masters: [], duration_min: 60 });
  render().setWhen('2099-05-20', '14:30');
  await render().submit();
  assert.equal(createdBody.start_time, '2099-05-20T14:30:00');
  assert.deepEqual(events, ['2099-05-20', 'closed']);
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

test('past slot is detected and the same hour ahead is offered', async () => {
  const app = await harness(`${base}pastSlot.ts`);
  const mod = { isPastSlot: (...a) => app.call('isPastSlot', a), nextSameTime: (...a) => app.call('nextSameTime', a) };
  const noon = new Date(2026, 4, 20, 12, 0);
  assert.equal(mod.isPastSlot('2026-05-12', '18:00', noon), true);
  assert.equal(mod.isPastSlot('2026-05-20', '11:59', noon), true);
  assert.equal(mod.isPastSlot('2026-05-20', '12:00', noon), false);
  assert.equal(mod.isPastSlot('2026-05-21', '08:00', noon), false);
  // Сегодня 18:00 — до него 6 часов, успеваем; 14:00 — меньше трёх, завтра.
  assert.equal(mod.nextSameTime('18:00', noon).time, '18:00');
  assert.equal(mod.nextSameTime('18:00', noon).date, '2026-05-20');
  assert.equal(mod.nextSameTime('14:00', noon).date, '2026-05-21');
});
test('wizard opened on a past slot asks; continue takes the offered time, own time opens the time section', async () => {
  const acceptedDays = [];
  const render = (await navigation())({ defaultDate: '2020-05-12', defaultTime: '18:00', defaultTeacherId: 7,
    onDateChange: date => acceptedDays.push(date) });
  let w = render();
  assert.equal(w.pastAsk.time, '18:00');
  assert.ok(w.pastAsk.date > '2020-05-12');
  assert.equal(w.ready, false);
  const offered = w.pastAsk;
  w.acceptPast();
  w = render();
  assert.equal(w.pastAsk, null);
  assert.equal(w.date, offered.date);
  assert.equal(w.time, '18:00');
  assert.equal(acceptedDays.at(-1), offered.date);

  const ownDays = [];
  const own = (await navigation())({ defaultDate: '2020-05-12', defaultTime: '18:00',
    onDateChange: date => ownDays.push(date) });
  own().choosePastOwn();
  w = own();
  assert.equal(w.pastAsk, null);
  assert.equal(w.step, 0);
  assert.equal(w.time, '');
  assert.ok(w.date > '2020-05-12');
  assert.equal(ownDays.at(-1), w.date);
});
test('future slot and past day without time do not ask', async () => {
  assert.equal((await navigation())({ defaultDate: '2099-05-12', defaultTime: '18:00' })().pastAsk, null);
  const w = (await navigation())({ defaultDate: '2020-05-12' })();
  assert.equal(w.pastAsk, null);
  assert.ok(w.date > '2020-05-12');
});

// Real desktop form handlers and creation mutations; API/DOM boundaries stay deterministic.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const settle = () => new Promise(done => setTimeout(done, 0));
const event = () => ({ preventDefault() {}, stopPropagation() {} });
const plain = value => JSON.parse(JSON.stringify(value));

function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}

async function loadModule(file, dependencies, context) {
  const url = new URL(file, import.meta.url);
  const output = ts.transpileModule(await readFile(url, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const mod = new vm.SourceTextModule(output, {
    context, identifier: url.href, initializeImportMeta(meta) { meta.env = { DEV: false }; },
  });
  await mod.link((name, parent) => {
    if (/\/(utils|constants|staffColors)$/.test(name)) {
      return loadModule(new URL(`${name}.ts`, parent.identifier).href, dependencies, context);
    }
    const exports = dependencies[name] ?? dependencies[name.split('/').at(-1)];
    if (!exports) throw new Error(`Missing test dependency: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  return mod;
}

async function desktopForm(onCreate, photoState = { photos: [], pending: [], add() {}, remove() {} }) {
  let cursor = 0;
  const state = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return state[index] ??= { current: initial }; },
    useMemo: fn => fn(), useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const context = vm.createContext({ console, document: { body: {} } });
  const dependencies = {
    react: { ...react, default: react },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-dom': { createPortal: tree => tree },
    'react-router-dom': { useNavigate: () => () => {} },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    '@tanstack/react-query': { useQuery: () => ({ data: [] }) },
    Icons: { Plus: 'Plus', X: 'X', Check: 'Check' },
    studio: { studioApi: {} },
    'studio.api': { studioApi: {} },
    queryKeys: { queryKeys: { branches: ['branches'] } },
    useServiceOptions: { CREATE_SERVICE_OPTION: '__create_service__', useServiceOptions: () => ({
      services: [
        { id: 3, name: 'Pilates', booking_mode: 'event' },
        { id: 4, name: 'Yoga', booking_mode: 'event', max_clients: 15 },
        { id: 5, name: 'Private', booking_mode: 'event', max_clients: 1 },
      ],
      options: [{ value: '3', label: 'Pilates' }, { value: '4', label: 'Yoga' }, { value: '5', label: 'Private' }],
      priceFor: () => 75,
    }) },
    // Поле мест проверяется отдельно (spotsField ниже); форме оно — граница.
    SpotsField: { SpotsField: 'SpotsField' },
    index: { Select: 'Select', ConfirmModal: 'ConfirmModal', NotePhotos: 'NotePhotos', NoteDropZone: 'NoteDropZone' },
    useNotePhotos: { useNotePhotos: () => photoState },
    usePhone: { usePhone: () => false },
    useStudioCurrency: { useStudioCurrency: () => 'EUR' },
    money: { formatMoney: (amount, currency) => `${amount} ${currency}` },
    useDurationLabel: { useDurationLabel: () => duration => `${duration} min` },
    // Уход окна (анимация) — граница DOM: здесь закрытие сразу, как и было.
    useLeave: { useLeave: close => [false, close] },
  };
  const mod = await loadModule('../src/pages/dashboard/Journal/components/modals/NewBookingModal.tsx', dependencies, context);
  await mod.evaluate();
  const closed = [];
  const dates = [];
  const props = {
    trainers: [{ id: 7, name: 'Alex', full: 'Alex Brown', initials: 'AB', color: '#123456', bg: '#eee' }],
    halls: ['Main'], newBookingSlot: { trainer: 7, timeStart: 4.5, timeEnd: 5.5 },
    newForm: { serviceId: 3, title: 'Pilates', hall: 'Main', maxClients: '8', branchId: null },
    setNewBookingSlot(value) { props.newBookingSlot = typeof value === 'function' ? value(props.newBookingSlot) : value; },
    setNewForm(value) { props.newForm = typeof value === 'function' ? value(props.newForm) : value; },
    modalRef: { current: null }, timeStep: 15,
    closeNewForm: () => closed.push('closed'), onCreate, spaceIsAxis: true,
    date: '2026-10-03', onDateChange: date => dates.push(date),
  };
  function render() { cursor = 0; return mod.namespace.NewBookingModal(props); }
  render(); // The form synchronizes its controlled time inputs during its first render.
  const create = tree => nodes(tree, 'button').find(button => button.children === 'newBooking.create');
  return { render, props, closed, dates, create, photoState };
}

test('desktop creation stays open during saving, submits the draft once, and closes after success', async () => {
  let release;
  const submitted = [];
  const app = await desktopForm(form => { submitted.push(plain(form)); return new Promise(done => { release = done; }); });
  let tree = app.render();
  nodes(tree, 'textarea')[0].onChange({ target: { value: '  Bring mat  ' } });
  tree = app.render();
  const create = app.create(tree);
  create.onMouseDown(event());
  create.onMouseDown(event()); // A second click before React rerenders must not create a duplicate.
  assert.equal(submitted.length, 1);
  assert.deepEqual(submitted[0], {
    serviceId: 3, title: 'Pilates', hall: 'Main', branchId: null, maxClients: 8,
    notes: 'Bring mat', photos: [], price: 75,
  });
  assert.deepEqual(app.closed, []);
  tree = app.render();
  assert.equal(app.create(tree).disabled, true);
  nodes(tree, 'button').find(button => button.children === 'newBooking.cancel').onMouseDown(event());
  nodes(tree, 'div').find(div => div.className === 'kp-backdrop').onMouseDown();
  assert.deepEqual(app.closed, []);
  release(true);
  await settle();
  assert.deepEqual(app.closed, ['closed']);
});

test('a failed creation preserves entered notes, date and service and allows a retry', async () => {
  let attempt = 0;
  const submitted = [];
  const app = await desktopForm(async form => { submitted.push(plain(form)); return ++attempt === 2; });
  nodes(app.render(), 'textarea')[0].onChange({ target: { value: 'Keep this draft' } });
  app.create(app.render()).onMouseDown(event());
  await settle();
  assert.deepEqual(app.closed, []);
  const tree = app.render();
  assert.equal(nodes(tree, 'textarea')[0].value, 'Keep this draft');
  assert.equal(nodes(tree, 'input').find(input => input.type === 'date').value, '2026-10-03');
  assert.equal(nodes(tree, 'Select')[0].value, '3');
  assert.equal(app.create(tree).disabled, false);
  app.create(tree).onMouseDown(event());
  await settle();
  assert.equal(submitted.length, 2);
  assert.deepEqual(submitted[1], submitted[0]);
  assert.deepEqual(app.closed, ['closed']);
});

test('creation waits for attached photos and includes the finished upload', async () => {
  const submitted = [];
  const photoState = { pending: [{ id: 'upload-1' }], photos: [], add() {}, remove() {} };
  const app = await desktopForm(async form => { submitted.push(plain(form)); return true; }, photoState);
  const button = app.create(app.render());
  assert.equal(button.disabled, true);
  button.onMouseDown(event());
  await settle();
  assert.equal(submitted.length, 0);
  assert.deepEqual(app.closed, []);
  photoState.pending = [];
  photoState.photos = ['https://cdn.example/photo.jpg'];
  const ready = app.create(app.render());
  assert.equal(ready.disabled, false);
  ready.onMouseDown(event());
  await settle();
  assert.deepEqual(submitted[0].photos, photoState.photos);
  assert.deepEqual(app.closed, ['closed']);
});

test('the desktop date input reports the selected day and fractional hours render correctly', async () => {
  const app = await desktopForm(async () => true);
  const tree = app.render();
  nodes(tree, 'input').find(input => input.type === 'date').onChange({ target: { value: '2026-11-04' } });
  assert.deepEqual(app.dates, ['2026-11-04']);
  const header = nodes(tree, 'div').find(div => div.className === 'kp-head-sub');
  assert.ok(JSON.stringify(header).includes('11:30'));
  assert.ok(JSON.stringify(header).includes('12:30'));
});

test('a time waiting for past-date confirmation cannot replace the displayed committed draft', async () => {
  const app = await desktopForm(async () => true);
  const asked = [];
  // Journal opens the past-time question before changing its selected slot.
  app.props.onTimeChange = time => asked.push(time);
  let tree = app.render();
  const start = nodes(tree, 'input').find(input => input.className?.includes('kp-time-input'));
  start.onChange({ target: { value: '07:00' } });
  tree = app.render();
  nodes(tree, 'input').find(input => input.className?.includes('kp-time-input'))
    .onBlur({ target: { value: '07:00' } });
  assert.deepEqual(asked, ['07:00']);
  assert.equal(app.props.newBookingSlot.timeStart, 4.5);
  const after = nodes(app.render(), 'input').find(input => input.className?.includes('kp-time-input'));
  assert.equal(after.value, '11:30');
});

test('an end time clamped to its unchanged minimum still displays the actual draft time', async () => {
  const app = await desktopForm(async () => true);
  app.props.newBookingSlot.timeEnd = 4.75;
  app.render();
  let tree = app.render();
  nodes(tree, 'input').filter(input => input.className?.includes('kp-time-input'))[1]
    .onChange({ target: { value: '07:00' } });
  tree = app.render();
  nodes(tree, 'input').filter(input => input.className?.includes('kp-time-input'))[1]
    .onBlur({ target: { value: '07:00' } });
  assert.equal(app.props.newBookingSlot.timeEnd, 4.75);
  const end = nodes(app.render(), 'input').filter(input => input.className?.includes('kp-time-input'))[1];
  assert.equal(end.value, '11:45');
});

test('an individual lesson survives a change of service and is created with one spot', async () => {
  const submitted = [];
  const app = await desktopForm(async form => { submitted.push(plain(form)); return true; });
  let tree = app.render();
  assert.equal(nodes(tree, 'SpotsField')[0].serviceSpots, null);
  // «Индивидуальное» нажато: поле мест отдаёт форме одно место.
  nodes(tree, 'SpotsField')[0].onChange('1');
  tree = app.render();
  nodes(tree, 'Select')[0].onChange('4');
  assert.equal(app.props.newForm.serviceId, 4);
  assert.equal(app.props.newForm.maxClients, '1');
  tree = app.render();
  assert.equal(nodes(tree, 'SpotsField')[0].serviceSpots, 15);
  app.create(tree).onMouseDown(event());
  await settle();
  assert.equal(submitted[0].serviceId, 4);
  assert.equal(submitted[0].maxClients, 1);
});

test('one spot inherited from a private service gives way to the next service capacity', async () => {
  const app = await desktopForm(async () => true);
  nodes(app.render(), 'Select')[0].onChange('4');
  assert.equal(app.props.newForm.maxClients, '15');
  nodes(app.render(), 'Select')[0].onChange('5');
  assert.equal(app.props.newForm.maxClients, '1');
  // Одно место пришло с услугой, человек его не выбирал.
  nodes(app.render(), 'Select')[0].onChange('4');
  assert.equal(app.props.newForm.maxClients, '15');
});

async function spotsField(initial) {
  let cursor = 0;
  const state = [];
  const react = {
    useState(value) {
      const index = cursor++;
      if (!(index in state)) state[index] = value;
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    },
  };
  const jsx = (type, props) => ({ type, props });
  const context = vm.createContext({ console });
  const dependencies = {
    react: { ...react, default: react },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    Icons: { User: 'User', Minus: 'Minus', Plus: 'Plus' },
    MatsCapacity: { MAX_SPOTS: 50 },
  };
  const mod = await loadModule('../src/pages/dashboard/Journal/components/SpotsField.tsx', dependencies, context);
  await mod.evaluate();
  const props = { serviceSpots: null, ...initial, onChange(value) { props.value = value; } };
  const render = () => { cursor = 0; return mod.namespace.SpotsField(props); };
  const solo = () => nodes(render(), 'button').find(button => button.className.startsWith('kp-solo'));
  const steps = () => nodes(render(), 'button').filter(button => button.className === 'kp-step');
  const input = () => nodes(render(), 'input')[0];
  return { props, solo, steps, input };
}

test('«Individual» sets one spot and its second press returns the group size it replaced', async () => {
  const field = await spotsField({ value: '12', serviceSpots: 15 });
  assert.equal(field.solo()['aria-pressed'], false);
  field.solo().onClick();
  assert.equal(field.props.value, '1');
  assert.equal(field.solo()['aria-pressed'], true);
  assert.equal(field.solo().className, 'kp-solo is-on');
  field.solo().onClick();
  assert.equal(field.props.value, '12');
});

test('after a change of service the released «Individual» returns that service capacity', async () => {
  const field = await spotsField({ value: '12', serviceSpots: 15 });
  field.solo().onClick();
  field.props.serviceSpots = 20;
  field.solo().onClick();
  assert.equal(field.props.value, '20');
  // Услуга сама на одно место: вернуть нечего, кроме размера группы по умолчанию.
  const single = await spotsField({ value: '1', serviceSpots: 1 });
  assert.equal(single.solo()['aria-pressed'], true);
  single.solo().onClick();
  assert.equal(single.props.value, '8');
});

test('the stepper stays within 1–50 and the field accepts digits only', async () => {
  const field = await spotsField({ value: '' });
  field.steps()[1].onClick();
  assert.equal(field.props.value, '1');
  assert.equal(field.steps()[0].disabled, true);
  field.props.value = '50';
  assert.equal(field.steps()[1].disabled, true);
  field.props.value = '99';
  field.steps()[0].onClick();
  assert.equal(field.props.value, '50');
  field.input().onChange({ target: { value: '1a2' } });
  assert.equal(field.props.value, '12');
  field.input().onKeyDown({ key: 'ArrowUp', preventDefault() {} });
  assert.equal(field.props.value, '13');
  field.input().onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(field.props.value, '12');
});

async function mutationHarness(createApi) {
  const initial = [{ id: 11, title: 'Existing' }];
  let cache = initial;
  const invalidated = [];
  const context = vm.createContext({ console });
  const queryKeys = { journalLessonsAll: ['journal-lessons'], journalDaysAll: ['journal-days'] };
  const qc = {
    cancelQueries: async () => {}, getQueryData: () => cache,
    setQueryData(_key, data) { cache = data; },
    invalidateQueries({ queryKey }) { invalidated.push(queryKey); },
  };
  const dependencies = {
    '@tanstack/react-query': {
      useQueryClient: () => qc,
      useMutation: options => ({ mutateAsync: async variables => {
        let snapshot;
        try {
          snapshot = await options.onMutate?.(variables);
          return await options.mutationFn(variables);
        } catch (error) {
          await options.onError?.(error, variables, snapshot);
          throw error;
        } finally { await options.onSettled?.(); }
      } }),
    },
    schedule: { scheduleApi: { createLesson: createApi } },
    'hybrid.api': { hybridApi: {} }, queryKeys: { queryKeys },
  };
  const mod = await loadModule('../src/pages/dashboard/Journal/hooks/useJournalMutations.ts', dependencies, context);
  await mod.evaluate();
  const mutations = mod.namespace.useJournalMutations(['journal-lessons', '2026-10-03']);
  return { mutations, cache: () => cache, initial, invalidated };
}

test('creation returns the server lesson id and version used by undo and subsequent edits', async () => {
  let release;
  const payload = { service_id: 3, teacher_id: 7, start_time: '2026-10-03T11:30:00' };
  const optimistic = { id: -123, version: 1, title: 'Pilates', date: '2026-10-03' };
  const app = await mutationHarness(body => {
    assert.deepEqual(plain(body), payload);
    return new Promise(done => { release = done; });
  });
  const saving = app.mutations.createLesson(payload, optimistic);
  await settle();
  assert.equal(app.cache().at(-1).id, -123);
  release({ id: 71, version: 6 });
  const result = await saving;
  assert.equal(result.prev, null);
  assert.equal(result.next.id, 71);
  assert.equal(result.next.version, 6);
  assert.equal(result.next.date, '2026-10-03');
  assert.equal(optimistic.id, -123);
  assert.deepEqual(plain(app.invalidated), [['journal-lessons'], ['journal-days']]);
});

test('a server rejection removes the optimistic lesson and propagates failure to the open form', async () => {
  const app = await mutationHarness(async () => { throw new Error('TIME_SLOT_OCCUPIED'); });
  await assert.rejects(app.mutations.createLesson({}, { id: -123 }), /TIME_SLOT_OCCUPIED/);
  assert.deepEqual(app.cache(), app.initial);
  assert.deepEqual(plain(app.invalidated), [['journal-lessons'], ['journal-days']]);
});

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

async function setup(file, api = {}, { phone = false, now = '2026-09-30T08:00:00' } = {}) {
  let cursor = 0;
  const state = [];
  const calls = [];
  const context = vm.createContext({ console, document: { body: {} }, ...(now ? { Date: class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  } } : {}) });
  const queryKeys = { services: ['services'], branches: ['branches'], staff: ['staff'], resourceStaff: ['resource-staff'] };
  const react = {
    useMemo: fn => fn(),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return state[index] ??= { current: initial };
    },
    useEffect: () => {},
  };
  const jsx = (type, props) => ({ type, props });
  const deps = {
    react: { ...react, default: react },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-dom': { createPortal: tree => tree },
    // i18n — как у настоящего хука: окно форматирует дату по языку. Без
    // services.formatter термин студии остаётся как есть.
    'react-i18next': { useTranslation: () => ({ t: key => key, i18n: { language: 'en', services: {} } }) },
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
    useNotePhotos: () => ({ photos: [], pending: [], add() {}, remove() {} }),
    getUserRoleFromToken: () => 'owner',
    errorMessage: error => String(error),
    servicesApi: {}, studioApi: {}, staffApi: {},
    hybridApi: {
      quote: async request => { calls.push(request); return api.quote ? api.quote(request) : quoted; },
      paymentPreview: async (id, codes) => (api.paymentPreview ? api.paymentPreview(id, codes) : receipt),
      confirm: async (id, payment) => { calls.push(id); api.paid = payment; if (api.confirm) await api.confirm(id); },
    },
  };
  for (const name of ['Select', 'ModalShell', 'ModalHeader', 'ModalBody', 'ModalFooter', 'GhostButton', 'PrimaryButton', 'ResourceClientPicker', 'ResourceKeypadModal', 'ResourceTimeField', 'BookingPayment', 'BookingWizard', 'ConfirmModal', 'NotePhotos', 'NoteDropZone']) other[name] = name;
  other.usePhone = () => phone;
  // Уход окна (анимация) — граница DOM: здесь закрытие сразу, как и было.
  other.useLeave = close => [false, close];
  // Follow the extracted production hooks and pure time utilities as real modules.
  // Stubbing useResourceBooking here would only test our imitation of the form.
  async function load(url) {
    const code = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const mod = new vm.SourceTextModule(code, { context, identifier: url.href, initializeImportMeta(meta) { meta.env = { DEV: false }; } });
    await mod.link((name, parent) => {
      // staffColors — настоящий модуль: из него utils журнала берёт палитру мастеров.
      if (/\/(useResourceBooking|useResourceBookingChoice|useBookingPayment|utils|constants|staffColors)$/.test(name)) {
        return load(new URL(`${name}.ts`, parent.identifier));
      }
      if (name.endsWith('/PastBookingPrompt')) return load(new URL(`${name}.tsx`, parent.identifier));
      if (name.endsWith('/usePastBooking')) return load(new URL(`${name}.ts`, parent.identifier));
      if (name.endsWith('/pastSlot')) return load(new URL(`${name}.ts`, parent.identifier));
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
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props), type);
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}
const modalPath = '../src/pages/dashboard/Journal/components/modals/ResourceBookingModal.tsx';
const formPath = '../src/pages/dashboard/Journal/hooks/useResourceBooking.ts';
const keypadPath = '../src/pages/dashboard/Journal/components/modals/ResourceKeypadModal.tsx';
const props = { defaultDate: '2026-10-01', defaultServiceId: 2, teacherId: 7, onClose() {}, onCreated() {} };

test('a failed quote exposes a persistent reason and can be retried without changing any selection', async () => {
  let attempts = 0;
  const app = await setup(formPath, { quote: () => {
    if (++attempts === 1) throw new Error('Network unavailable');
    return quoted;
  } });
  const form = () => app.render('useResourceBooking', { ...props, checkout: false });
  form().setClient(901);
  assert.equal(await form().pick(slot), 'failed');
  assert.equal(form().quoteError, 'Error: Network unavailable');
  assert.equal(form().quoting, false);
  assert.equal(form().client, 901);
  assert.equal(await form().pick(slot), 'ok');
  assert.equal(form().quoteError, null);
  assert.equal(form().quote.quote_id, 'quote-1');
  assert.deepEqual(app.calls.filter(call => typeof call === 'object')[0], app.calls.filter(call => typeof call === 'object')[1]);
});

test('creation offers individual services; event editing still excludes them', async () => {
  const app = await setup('../src/pages/dashboard/Journal/hooks/useServiceOptions.ts');
  assert.deepEqual(Array.from(app.render('useServiceOptions', true).options, item => item.value), ['1', '2', '3', '__create_service__']);
  assert.deepEqual(Array.from(app.render('useServiceOptions', false).options, item => item.value), ['1', '__create_service__']);
});
test('individual booking carries client, selected service, branch, specialist and time to confirmation', async () => {
  const app = await setup(formPath);
  const created = [];
  const options = { ...props, onCreated: date => created.push(date), onClose: () => created.push('closed') };
  let tree = app.render('useResourceBooking', options);
  assert.equal(!(tree.quote && tree.payment.ready), true);
  assert.equal(tree.serviceId, 2);
  assert.equal(tree.choice.serviceOptions.length, 1); // selected master's service
  tree.setClient(901);
  tree = app.render('useResourceBooking', options);
  await tree.pick(slot);
  await settle();
  assert.equal(app.calls[0].client_id, 901);
  assert.equal(app.calls[0].service_id, 2);
  assert.equal(app.calls[0].branch_id, 5);
  assert.equal(app.calls[0].teacher_id, 7);
  assert.equal(app.calls[0].starts_at, slot.starts_at);
  assert.equal(app.calls[0].first_lesson, true); // скидка первого занятия — сама, если положена
  tree = app.render('useResourceBooking', options);
  assert.equal(tree.quote.terms.domain.local_start, slot.local_start);
  assert.equal(!(tree.quote && tree.payment.ready), false);
  await tree.confirm();
  assert.equal(app.calls[1], 'quote-1');
  assert.deepEqual(created, ['2026-10-01', 'closed']);
});

test('confirmation reports the booked local date from the quote, including a different selected day', async () => {
  const app = await setup(formPath, { quote: () => ({ ...quoted, terms: { ...quoted.terms,
    domain: { ...quoted.terms.domain, local_start: '2026-10-03T00:30:00' } } }) });
  const created = [];
  const options = { ...props, onCreated: date => created.push(date) };
  const form = () => app.render('useResourceBooking', options);
  form().setClient(901);
  await form().pick(slot);
  await settle();
  await form().confirm();
  assert.deepEqual(created, ['2026-10-03']);
});

test('a rejected confirmation keeps the form open and does not navigate to a created booking', async () => {
  const app = await setup(formPath, { confirm: () => { throw new Error('SLOT_TAKEN'); } });
  const events = [];
  const options = { ...props, onCreated: date => events.push(date), onClose: () => events.push('closed') };
  const form = () => app.render('useResourceBooking', options);
  form().setClient(901);
  await form().pick(slot);
  await settle();
  await form().confirm();
  assert.deepEqual(events, []);
  assert.equal(form().quote, null);
  assert.ok(app.calls.includes('Error: SLOT_TAKEN'));
});

test('changing the resource date navigates the journal and invalidates the previous quote', async () => {
  const app = await setup(formPath);
  const selected = [];
  const options = { ...props, onDateChange: date => selected.push(date) };
  const form = () => app.render('useResourceBooking', options);
  form().setClient(901);
  await form().pick(slot);
  await settle();
  assert.equal(form().quote.quote_id, 'quote-1');
  form().setDate('2026-10-03');
  assert.equal(form().date, '2026-10-03');
  assert.equal(form().quote, null);
  assert.deepEqual(selected, ['2026-10-03']);
  await form().confirm();
  assert.equal(app.calls.includes('quote-1'), false);
});
test('confirmation waits for the payment receipt and takes exactly its total in cash', async () => {
  let release;
  const api = { paymentPreview: () => new Promise(done => { release = done; }) };
  const app = await setup(formPath, api);
  let tree = app.render('useResourceBooking', props);
  tree.setClient(901);
  tree = app.render('useResourceBooking', props);
  await tree.pick(slot);
  await settle();
  // Условия есть, чека ещё нет: сумму, которую примут наличными, назвать нечем.
  tree = app.render('useResourceBooking', props);
  assert.equal(!(tree.quote && tree.payment.ready), true);
  release({ ...receipt, total: 20, discounts: [{ kind: 'studio', amount: 5 }] });
  await settle();
  tree = app.render('useResourceBooking', props);
  assert.equal(!(tree.quote && tree.payment.ready), false);
  await tree.confirm();
  // Ручной скидки администратора не давали — поле уходит пустым, а не пропадает.
  assert.deepEqual({ ...api.paid }, {
    promo_code: null, certificate_code: null, manual_discount_percent: null, expected_total: 20,
  });
});
// Шаг оплаты глазами кассира: то, что рисует блок оплаты (его пропсы).
async function paymentStep(api) {
  const app = await setup(formPath, api);
  const step = () => app.render('useResourceBooking', props);
  step().setClient(901);
  await step().pick(slot);
  await settle();
  return { app, step };
}
test('an applied promo is re-judged on every receipt, not only when it was applied', async () => {
  // Первое занятие −50 % выгоднее промокода: скидки не суммируются. Сняли
  // первое занятие выключателем — промокод снова действует, и пометка
  // «проиграл более выгодной скидке» обязана уйти вместе с причиной.
  const { step } = await paymentStep({
    quote: request => ({ ...quoted, quote_id: request.first_lesson ? 'with-first' : 'without-first' }),
    paymentPreview: (id, codes) => ({ ...receipt, first_lesson_offered: true,
      first_lesson_applied: id === 'with-first', promo_valid: codes.promo_code ? true : null,
      promo_outweighed: Boolean(codes.promo_code) && id === 'with-first' }),
  });
  step().payment.edit('promo', 'SPRING');
  await step().payment.apply('promo');
  assert.equal(step().payment.promo.applied, 'SPRING');
  assert.equal(step().payment.promo.error, 'journal:payment.promoOutweighed');
  step().setFirstLesson(false);
  await settle();
  assert.equal(step().firstLesson, false);
  assert.equal(step().payment.promo.applied, 'SPRING');
  assert.equal(step().payment.promo.error, null);
});
test('two codes applied back to back both land on the receipt', async () => {
  // Второй код применили, пока чек под первый ещё считался: первый ответ
  // устарел, но код из него не теряется — он есть в чеке под оба кода.
  const answers = [];
  const { step } = await paymentStep({
    paymentPreview: (id, codes) => answers.length === 0 && !codes.promo_code
      ? receipt
      : new Promise(done => answers.push(() => done({ ...receipt, promo_valid: codes.promo_code ? true : null }))),
  });
  step().payment.edit('promo', 'SPRING');
  const promo = step().payment.apply('promo');
  step().payment.edit('voucher', 'GIFT-1');
  const voucher = step().payment.apply('voucher');
  for (const answer of answers) answer();
  await Promise.all([promo, voucher]);
  await settle();
  assert.equal(step().payment.promo.applied, 'SPRING');
  assert.equal(step().payment.voucher.applied, 'GIFT-1');
  assert.equal(step().payment.ready, true);
});
test('a failed re-quote puts the first-lesson switch back to the terms on screen', async () => {
  // Выключатель — это условия записи. Не удалось взять новые (время заняли,
  // сеть) — на экране остаются прежние, и выключатель обязан показывать их, а
  // не то, что не случилось: иначе подтвердили бы скидку, которую «сняли».
  const { app, step } = await paymentStep({
    quote: request => { if (!request.first_lesson) throw new Error('SLOT_TAKEN'); return quoted; },
    paymentPreview: () => ({ ...receipt, first_lesson_offered: true, first_lesson_applied: true }),
  });
  step().setFirstLesson(false);
  await settle();
  assert.equal(step().firstLesson, true);
  assert.ok(app.calls.includes('Error: SLOT_TAKEN'));
});
test('late quote for the previous client cannot enable confirmation', async () => {
  let resolve;
  const app = await setup(formPath, { quote: () => new Promise(done => { resolve = done; }) });
  let tree = app.render('useResourceBooking', { ...props, clientId: null });
  tree.setClient(1);
  tree = app.render('useResourceBooking', props);
  tree.pick(slot);
  tree.setClient(2);
  resolve(quoted);
  await settle();
  tree = app.render('useResourceBooking', props);
  assert.equal(!(tree.quote && tree.payment.ready), true);
});


test('desktop journal creation presents all fields together in the original sheet', async () => {
  const app = await setup(modalPath);
  const selected = [];
  const options = { ...props, defaultTime: '11:00', onDateChange: date => selected.push(date) };
  const tree = app.render('ResourceBookingModal', options);
  assert.equal(nodes(tree, 'BookingWizard').length, 0);
  assert.equal(nodes(tree, 'ModalShell').length, 1);
  assert.equal(nodes(tree, 'ResourceClientPicker').length, 1);
  assert.equal(nodes(tree, 'Select').length, 3);
  const dateInput = nodes(tree, 'input').find(input => input.type === 'date');
  assert.equal(dateInput.value, props.defaultDate);
  dateInput.onChange({ target: { value: '2026-10-03' } });
  assert.equal(nodes(app.render('ResourceBookingModal', options), 'input').find(input => input.type === 'date').value,
    '2026-10-03');
  assert.deepEqual(selected, ['2026-10-03']);
});

test('phone journal creation uses the wizard and preserves launch context and date navigation', async () => {
  const app = await setup(modalPath, {}, { phone: true });
  const onDateChange = () => {};
  const tree = app.render('ResourceBookingModal', { ...props, clientId: 901, defaultTime: '11:00', onDateChange });
  const wizard = nodes(tree, 'BookingWizard')[0];
  assert.equal(wizard.defaultTeacherId, 7);
  assert.equal(wizard.defaultDate, props.defaultDate);
  assert.equal(wizard.defaultTime, '11:00');
  assert.equal(wizard.clientId, 901);
  assert.equal(wizard.onClose, props.onClose);
  assert.equal(wizard.onCreated, props.onCreated);
  assert.equal(wizard.onDateChange, onDateChange);
});

test('desktop sheet asks about a past date and applies the offered day without switching to the phone wizard', async () => {
  const app = await setup(modalPath, {}, { now: '2026-05-24T12:00:00' });
  const dates = [];
  const options = { ...props, defaultTime: '11:00', onDateChange: day => dates.push(day) };
  const form = () => app.render('ResourceBookingModal', options);
  nodes(form(), 'input').find(input => input.type === 'date').onChange({ target: { value: '2026-05-10' } });
  const prompt = nodes(form(), 'ConfirmModal')[0];
  assert.equal(prompt.title, 'journal:wizard.past.title');
  assert.equal(prompt.cancelText, 'journal:wizard.past.own');
  assert.equal(nodes(form(), 'BookingWizard').length, 0);
  assert.deepEqual(dates, []);
  prompt.onConfirm();
  prompt.onClose(); // Real ConfirmModal closes after confirming as well.
  assert.equal(nodes(form(), 'input').find(input => input.type === 'date').value, '2026-05-25');
  assert.equal(nodes(form(), 'ConfirmModal').length, 0);
  assert.deepEqual(dates, ['2026-05-25']);
});

const keypadProps = { ...props, teacherId: 7, trainers: [], timeStep: 15,
  modalRef: { current: null }, onPreview() {} };

test('desktop keypad manual past time asks and acceptance keeps that hour on the offered day', async () => {
  const app = await setup(keypadPath, {}, { now: '2026-05-24T12:00:00' });
  const dates = [];
  const options = { ...keypadProps, defaultDate: '2026-05-24', defaultTime: '18:00', onDateChange: day => dates.push(day) };
  const form = () => app.render('ResourceKeypadModal', options);
  nodes(form(), 'ResourceTimeField')[0].onCommit('10:15');
  const prompt = nodes(form(), 'ConfirmModal')[0];
  assert.ok(prompt);
  assert.equal(nodes(form(), 'button').find(button => button.className === 'btn-primary-sm').disabled, true);
  prompt.onConfirm();
  prompt.onClose();
  assert.equal(nodes(form(), 'ResourceTimeField')[0].value, '10:15');
  assert.equal(nodes(form(), 'input').find(input => input.type === 'date').value, '2026-05-25');
  assert.deepEqual(dates, ['2026-05-25']);
});

test('own time after a past date stays in the desktop keypad with today and an empty time', async () => {
  const app = await setup(keypadPath, {}, { now: '2026-05-24T12:00:00' });
  const dates = [];
  const options = { ...keypadProps, defaultTime: '18:00', onDateChange: day => dates.push(day) };
  const form = () => app.render('ResourceKeypadModal', options);
  nodes(form(), 'input').find(input => input.type === 'date').onChange({ target: { value: '2026-05-10' } });
  nodes(form(), 'ConfirmModal')[0].onClose();
  assert.equal(nodes(form(), 'ResourceTimeField')[0].value, '');
  assert.equal(nodes(form(), 'input').find(input => input.type === 'date').value, '2026-05-24');
  assert.equal(nodes(form(), 'ConfirmModal').length, 0);
  assert.deepEqual(dates, ['2026-05-24']);
});

// Exercise the real hook and checkout submit handler; React state and UI wrappers are faked.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const billing = JSON.parse(await readFile(new URL('../src/locales/en/billing.json', import.meta.url), 'utf8'));
const translate = key => key.split('.').reduce((value, part) => value?.[part], billing) ?? key;
const profile = overrides => ({ legal_name: 'Alice Example', registration_id: null, country: 'CZ',
  line1: 'Preview street 1', line2: null, postal_code: '11000', city: 'Prague', vat_id: null,
  filled: true, vat_verified: false, ...overrides });

async function setup(initial) {
  const context = vm.createContext({ Intl, console });
  const state = [];
  let index = 0;
  const modules = new Map();
  function mock(name, exports) {
    const module = new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
    modules.set(name, module);
  }
  mock('react', { useMemo: factory => factory(), useState(value) {
    const slot = index++;
    if (!(slot in state)) state[slot] = typeof value === 'function' ? value() : value;
    return [state[slot], next => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }];
  } });
  mock('react-i18next', { useTranslation: () => ({ t: translate, i18n: { language: 'en' } }) });
  mock('../../../../api/client', { ApiError: class extends Error {} });
  mock('../../../../api/errorMessage', { errorMessage: error => error.message });
  const node = (type, props) => ({ type, props });
  mock('react/jsx-runtime', { jsx: node, jsxs: node, Fragment: 'Fragment' });
  mock('lucide-react', { Check: 'Check', MapPin: 'MapPin', Pencil: 'Pencil' });
  mock('./CheckoutCountry', { default: 'CheckoutCountry' });
  mock('./CheckoutPage.module.css', { default: new Proxy({}, { get: (_, key) => key }) });
  mock('../../../../../components/ui/index', Object.fromEntries(
    ['ModalShell', 'ModalHeader', 'ModalBody', 'ModalFooter', 'GhostButton', 'PrimaryButton', 'Input'].map(name => [name, name])));
  mock('../../../../../components/ui/Select', { Select: 'Select' });
  async function source(path) {
    const code = ts.transpileModule(await readFile(new URL(`../src/pages/dashboard/Billing/${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = new vm.SourceTextModule(code, { context });
    await module.link(name => {
      assert.ok(modules.has(name), `Unexpected dependency: ${name}`);
      return modules.get(name);
    });
    await module.evaluate();
    return module.namespace;
  }
  const hook = await source('hooks/useProfileDraft.ts');
  // Share the actual loaded module with the checkout and profile editor.
  mock('../../hooks/useProfileDraft', Object.fromEntries(Object.keys(hook).map(key => [key, hook[key]])));
  const checkout = await source('components/checkout/CheckoutProfile.tsx');
  const editor = await source('components/modals/BillingProfileModal.tsx');
  const saved = [];
  let dirty = 0;
  return {
    draft() { index = 0; return hook.useProfileDraft(initial); },
    checkout() {
      index = 0;
      return checkout.default({ profile: initial, locked: false, busy: false, formRef: { current: null },
        onSave: async input => { saved.push(input); }, onEdit() {}, onDirty() { dirty++; } });
    },
    editor(draft) { index = 0; return editor.BillingProfileFields({ draft, profile: initial }); },
    saved, dirty: () => dirty,
  };
}
function descendants(value) {
  if (Array.isArray(value)) return value.flatMap(descendants);
  if (!value || typeof value !== 'object') return [];
  return [value, ...descendants(value.props?.children)];
}
const field = (tree, name) => descendants(tree).find(node => node.type === 'input' && node.props.name === name);

test('legacy address-only profile cannot pass identity validation or inherit a studio marketing name', async () => {
  const ui = await setup(profile({ legal_name: null, studio_name: 'Marketing alias' }));
  const draft = ui.draft();
  assert.equal(draft.values.legal_name, '');
  assert.equal(draft.validate(), false);
  assert.ok(ui.draft().errors.legal_name);
});

test('checkout never calls payment preparation for an empty or whitespace-only legal name', async () => {
  for (const legal_name of [null, '', '   ']) {
    const ui = await setup(profile({ legal_name }));
    const form = ui.checkout();
    assert.equal(field(form, 'legal_name')?.props.required, true);
    form.props.onSubmit({ preventDefault() {} });
    assert.equal(ui.saved.length, 0);
  }
});

test('explicit payer identity reaches checkout unchanged except surrounding whitespace', async () => {
  const ui = await setup(profile({ legal_name: null, registration_id: '  ABC-123 / 45 ' }));
  let form = ui.checkout();
  field(form, 'legal_name').props.onChange({ target: { value: '  Legal Company s.r.o.  ' } });
  form = ui.checkout();
  form.props.onSubmit({ preventDefault() {} });
  assert.equal(ui.saved.length, 1);
  assert.equal(ui.saved[0].legal_name, 'Legal Company s.r.o.');
  assert.equal(ui.saved[0].registration_id, 'ABC-123 / 45');
  assert.equal(ui.dirty(), 1);
});

test('registration ID and VAT remain optional for a private payer', async () => {
  const ui = await setup(profile());
  const form = ui.checkout();
  assert.equal(field(form, 'registration_id').props.required, false);
  assert.equal(field(form, 'vat_id').props.required, false);
  form.props.onSubmit({ preventDefault() {} });
  assert.equal(ui.saved[0].legal_name, 'Alice Example');
  assert.equal(ui.saved[0].registration_id, null);
  assert.equal(ui.saved[0].vat_id, null);
});

test('changing to a non-EU country retains legal identity and registration ID while clearing EU VAT', async () => {
  const ui = await setup(profile({ registration_id: 'ACME-22', vat_id: 'CZ12345678' }));
  ui.draft().set('country')('US');
  const draft = ui.draft();
  assert.equal(draft.payload().legal_name, 'Alice Example');
  assert.equal(draft.payload().registration_id, 'ACME-22');
  assert.equal(draft.payload().vat_id, null);
});

test('identity length limits are enforced by the shared validator, including the profile editor', async () => {
  const ui = await setup(profile({ legal_name: 'x'.repeat(201), registration_id: 'x'.repeat(41) }));
  let draft = ui.draft();
  assert.equal(draft.validate(), false);
  draft = ui.draft();
  assert.ok(draft.errors.legal_name && draft.errors.registration_id);
  const editor = descendants(ui.editor(draft));
  const legal = editor.find(node => node.type === 'Input' && node.props.label === billing.profile.fields.legalName);
  const registration = editor.find(node => node.type === 'Input' && node.props.value === 'x'.repeat(41));
  assert.ok(legal?.props.error);
  assert.ok(registration?.props.error);
});

test('every billing locale labels the legal name and optional registration ID explicitly', async () => {
  const base = new URL('../src/locales/', import.meta.url);
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const data = JSON.parse(await readFile(new URL(`${entry.name}/billing.json`, base), 'utf8'));
    for (const key of ['legalName', 'legalNamePlaceholder', 'registrationId', 'registrationIdCz', 'registrationIdPlaceholder']) {
      assert.ok(data.profile.fields[key]?.length > 0, `${entry.name}: ${key}`);
    }
    for (const key of ['legalNameRequired', 'legalNameTooLong', 'registrationIdTooLong']) {
      assert.ok(data.profile.errors[key]?.length > 0, `${entry.name}: ${key}`);
    }
  }
});

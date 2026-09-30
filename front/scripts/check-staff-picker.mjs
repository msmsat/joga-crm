import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function harness(file, phone = true) {
  let cursor = 0;
  const state = [];
  const context = vm.createContext({ console });
  const jsx = (type, props) => ({ type, props });
  const react = { Fragment: 'fragment', useMemo: fn => fn(), useId: () => 'picker-id', useState(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
    return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
  } };
  react.useRef = initial => react.useState(() => ({ current: initial }))[0];
  const deps = {
    react: { ...react, default: react },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    usePhone: { usePhone: () => phone }, useBusinessTerms: { useRoleLabel: () => role => role },
    StaffRoleButtons: { StaffRoleButtons: 'StaffRoleButtons' },
    client: { resolveImageUrl: () => null },
    StaffToolbar: { StaffToolbar: 'StaffToolbar' }, EmployeeCard: { EmployeeCard: 'EmployeeCard' },
    MobileStaffPicker: { MobileStaffPicker: 'MobileStaffPicker' }, StaffPickerDialog: { StaffPickerDialog: 'StaffPickerDialog' },
  };
  const source = await readFile(new URL(`../src/pages/dashboard/Staff/components/${file}.${file.startsWith('../hooks/') ? 'ts' : 'tsx'}`, import.meta.url), 'utf8');
  const mod = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText, { context });
  await mod.link(name => {
    const exports = deps[name] || deps[name.split('/').at(-1)];
    if (!exports) throw new Error(`Missing dependency: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await mod.evaluate();
  return props => { cursor = 0; return mod.namespace[file.split('/').at(-1)](props); };
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}
const people = [{ id: 1, role: 'owner' }, { id: 2, role: 'trainer' }];
const props = () => ({ staffList: people, allStaff: people, activeStaffId: 1, searchQuery: '', activeGroup: 'ALL',
  availableGroups: ['ALL', 'owner', 'trainer'], onSearch() {}, onGroupChange() {}, onSelect() {}, onAddClick() {},
  onResendInvite() {}, onCancelInvite() {}, resendingId: null });

test('phone replaces inline employee rail with the picker', async () => {
  const render = await harness('StaffList');
  assert.equal(nodes(render(props()), 'MobileStaffPicker').length, 1);
  assert.equal(nodes(render(props()), 'EmployeeCard').length, 0);
});
test('desktop keeps the existing staff list', async () => {
  const render = await harness('StaffList', false);
  assert.equal(nodes(render(props()), 'MobileStaffPicker').length, 0);
  assert.equal(nodes(render(props()), 'EmployeeCard').length, 2);
});

test('role trigger opens a dialog in that group and clears stale search', async () => {
  const render = await harness('MobileStaffPicker');
  const p = props();
  const changes = [];
  p.searchQuery = 'Previous search';
  p.onSearch = q => changes.push(['search', q]);
  p.onGroupChange = g => changes.push(['group', g]);
  assert.equal(nodes(render(p), 'StaffPickerDialog').length, 0);
  nodes(render(p), 'StaffRoleButtons')[0].onGroupChange('admin', { currentTarget: {} });
  assert.deepEqual(changes, [['search', ''], ['group', 'admin']]);
  assert.equal(nodes(render(p), 'StaffPickerDialog').length, 1);
});
test('employee search opens every role even after filtering', async () => {
  const render = await harness('MobileStaffPicker');
  const p = props(); p.activeGroup = 'trainer';
  let group;
  p.onGroupChange = g => { group = g; };
  nodes(render(p), 'input')[0].onClick({ currentTarget: {} });
  assert.equal(group, 'ALL');
  assert.equal(nodes(render(p), 'StaffPickerDialog').length, 1);
});
test('choosing someone opens their profile and dismisses the picker', async () => {
  const render = await harness('MobileStaffPicker');
  const p = props(); let selected;
  p.onSelect = id => { selected = id; };
  nodes(render(p), 'StaffRoleButtons')[0].onGroupChange('trainer', { currentTarget: {} });
  nodes(render(p), 'StaffPickerDialog')[0].onSelect(2);
  assert.equal(selected, 2);
  assert.equal(nodes(render(p), 'StaffPickerDialog').length, 0);
});
test('closing without selection preserves the employee profile', async () => {
  const render = await harness('MobileStaffPicker');
  const p = props(); let selected = 1;
  p.onSelect = id => { selected = id; };
  nodes(render(p), 'StaffRoleButtons')[0].onGroupChange('owner', { currentTarget: {} });
  nodes(render(p), 'StaffPickerDialog')[0].onClose();
  assert.equal(selected, 1);
  assert.equal(nodes(render(p), 'StaffPickerDialog').length, 0);
});
test('add employee remains available outside the picker', async () => {
  const render = await harness('MobileStaffPicker');
  const p = props(); let added = false;
  p.onAddClick = () => { added = true; };
  nodes(render(p), 'button').find(b => b.className === 'staff-picker-add').onClick();
  assert.equal(added, true);
  assert.equal(nodes(render(p), 'StaffPickerDialog').length, 0);
});
test('all four role buttons survive when a role has no employees', async () => {
  const render = await harness('StaffRoleButtons');
  const buttons = nodes(render({ staff: people, activeGroup: 'ALL', onGroupChange() {}, dialogId: 'picker' }), 'button');
  assert.equal(buttons.length, 4);
  assert.deepEqual(buttons.map(b => nodes(b.children, 'span')[1].children), [2, 1, 0, 1]);
  assert.ok(buttons.every(b => b['aria-haspopup'] === 'dialog'));
});
test('search and role selection filter actual staff data', async () => {
  const render = await harness('../hooks/useStaffFilters');
  const staff = [
    { ...people[0], name: 'Owner', email: '', _resolvedGroupKey: 'owner', _translatedRole: 'Owner' },
    { ...people[1], name: 'Anna', last_name: 'Test', email: '', _resolvedGroupKey: 'trainer', _translatedRole: 'Master' },
  ];
  render(staff).setActiveGroup('trainer');
  render(staff).setSearchQuery('test');
  assert.deepEqual(Array.from(render(staff).staffList, s => s.id), [2]);
  render(staff).setSearchQuery('missing');
  assert.equal(render(staff).staffList.length, 0);
});
test('pending invitation cannot open an empty profile', async () => {
  const render = await harness('EmployeeCard');
  const employee = { ...people[1], name: 'Anna', is_active: false, _translatedRole: 'Master' };
  const tree = render({ employee, isActive: false, onSelect() {} });
  const card = nodes(tree, 'div').find(b => b.className.startsWith('s-item'));
  assert.equal(card.onClick, undefined);
  assert.equal(card.tabIndex, undefined);
  assert.equal(nodes(tree, 'button').length, 2);
});
test('active employee can be selected with a keyboard', async () => {
  const render = await harness('EmployeeCard');
  let selected = false, prevented = false;
  const tree = render({ employee: { ...people[1], name: 'Anna', is_active: true }, onSelect: () => { selected = true; } });
  const card = nodes(tree, 'div').find(b => b.className.startsWith('s-item'));
  const element = {};
  card.onKeyDown({ key: 'Enter', target: element, currentTarget: element, preventDefault() { prevented = true; } });
  assert.equal(selected, true);
  assert.equal(prevented, true);
});


test('popover is anchored to the actual clicked role button', async () => {
  const render = await harness('MobileStaffPicker');
  const p = props(), button = {};
  nodes(render(p), 'StaffRoleButtons')[0].onGroupChange('trainer', { currentTarget: button });
  assert.equal(nodes(render(p), 'StaffPickerDialog')[0].anchorRef.current, button);
});
test('clicking the same trigger again closes its popover', async () => {
  const render = await harness('MobileStaffPicker');
  const p = props(), button = {};
  nodes(render(p), 'StaffRoleButtons')[0].onGroupChange('trainer', { currentTarget: button });
  nodes(render(p), 'StaffRoleButtons')[0].onGroupChange('trainer', { currentTarget: button });
  assert.equal(nodes(render(p), 'StaffPickerDialog').length, 0);
});


test('main employee field searches while keeping the dropdown anchored to the input', async () => {
  const render = await harness('MobileStaffPicker');
  const p = props(), input = { value: 'Anna' };
  let query;
  p.onSearch = value => { query = value; };
  const field = nodes(render(p), 'input')[0];
  assert.equal(field.type, 'search');
  field.onChange({ currentTarget: input, target: input });
  assert.equal(query, 'Anna');
  const dropdown = nodes(render(p), 'StaffPickerDialog')[0];
  assert.equal(dropdown.anchorRef.current, input);
  assert.equal(dropdown.searchAtAnchor, true);
});
test('selection clears the main employee search and closes the dropdown', async () => {
  const render = await harness('MobileStaffPicker');
  const p = props(); let query = 'Anna';
  p.onSearch = value => { query = value; };
  nodes(render(p), 'input')[0].onClick({ currentTarget: {} });
  nodes(render(p), 'StaffPickerDialog')[0].onSelect(2);
  assert.equal(query, '');
  assert.equal(nodes(render(p), 'StaffPickerDialog').length, 0);
});

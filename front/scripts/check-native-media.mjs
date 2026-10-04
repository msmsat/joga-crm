import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function moduleAt(path, mocks = {}, globals = {}) {
  const context = vm.createContext({ console, AbortController, ...globals });
  const source = await readFile(new URL('../src/' + path, import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(ts.transpileModule(source, { fileName: path, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText, { context, initializeImportMeta: meta => { meta.env = { DEV: false }; } });
  await module.link(name => {
    const values = mocks[name] ?? {};
    return new vm.SyntheticModule(Object.keys(values), function () {
      Object.entries(values).forEach(([key, value]) => this.setExport(key, value));
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}
const paths = await moduleAt('components/ui/mediaPaths.ts');
const jsx = (type, props) => ({ type, props });
test('imported completion does not fabricate attendance or payment', async () => {
  const utils = await moduleAt('pages/dashboard/Journal/utils.ts', {
    './constants': { TIMES: [] }, '../../../lib/staffColors': { STAFF_PALETTE: [], staffColor: () => '' },
  });
  assert.equal(utils.attendanceOf({ status: 'active', attendance_known: false }, true), 'unknown');
  assert.equal(utils.attendanceOf({ status: 'attended', attendance_known: true }, true), 'came');
  assert.equal(utils.attendanceOf({ status: 'active', no_show: true, attendance_known: true }, true), 'missed');
  assert.equal(utils.attendanceOf({ status: 'active' }, false), 'waiting');
  const marks = await moduleAt('pages/dashboard/Journal/components/lesson/VisitMarks.tsx', {
    'react': { useState: x => [x, () => {}] }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    '../../../../../components/Icons': { CardIcon: () => {}, CashIcon: () => {}, UserCheck: () => {} },
    './AttendChoice': { AttendChoice: () => {} },
  });
  const client = { booking_channel: 'import', debt: 0, payment: null, by_subscription: false, paid_amount: 0 };
  assert.equal(marks.PayMark({ client, canPay: true, onPay() {} }).props.state, 'idle');
  assert.equal(marks.PayMark({ client: { ...client, debt: 1200 }, canPay: true, onPay() {} }).props.state, 'due');
  assert.equal(marks.PayMark({ client: { ...client, paid_amount: 1200 }, canPay: true, onPay() {} }).props.state, 'done');
});
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

test('only issued photo URLs can enter native galleries', () => {
  assert.equal(paths.ownedMediaPath('/clients/7/media/12'), true);
  assert.equal(paths.ownedMediaPath('/static/notes/' + 'a'.repeat(32) + '.jpg'), true);
  for (const url of ['https://example.com/pixel', 'javascript:alert(1)', 'data:image/png;base64,abc',
    '/clients/0/media/1', '/clients/7/media/12?token=secret', '/static/notes/../../file.jpg']) {
    assert.equal(paths.ownedMediaPath(url), false, url);
  }
});

test('client avatar uses authenticated image or stable initials', async () => {
  const avatar = await moduleAt('components/ui/ClientAvatar.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    './useMediaSources': { useMediaSources: urls => ({ ref: null, sources: new Map(urls.map(u => [u, 'blob:photo'])) }) },
  });
  const loaded = avatar.ClientAvatar({ url: '/clients/7/media/1', initials: 'АГ' });
  assert.equal(loaded.props.children.type, 'img');
  assert.equal(loaded.props.children.props.src, 'blob:photo');
  assert.equal(avatar.ClientAvatar({ initials: 'АГ' }).props.children, 'АГ');
});

test('native note preserves private photos, stable gallery order and retry', async () => {
  const a = '/clients/7/media/1', b = '/clients/7/media/2', c = '/clients/7/media/3';
  let stateIndex = 0;
  const Gallery = () => {};
  const notes = await moduleAt('components/ui/NotePhotos.tsx', {
    'react': { useRef: () => ({ current: null }), useState: value => [stateIndex++ === 0 ? c : value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'framer-motion': { motion: { button: 'button', span: 'span' } },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    './Lightbox': { Lightbox: Gallery }, './photoLayoutId': { photoLayoutId: src => src },
    './mediaPaths': { ownedMediaPath: paths.ownedMediaPath },
    './useMediaSources': { useMediaSources: () => ({ ref: null,
      sources: new Map([[a, 'blob:one'], [b, null], [c, 'blob:three']]), failed: 1, retry: () => {} }) },
  });
  const tree = notes.NotePhotos({ photos: [a, b, c, 'https://evil.invalid/tracker'] });
  const all = nodes(tree);
  assert.deepEqual(all.filter(n => n.type === 'img').map(n => n.props.src), ['blob:one', 'blob:three']);
  const gallery = all.find(n => n.type === Gallery);
  assert.deepEqual(Array.from(gallery.props.photos), ['blob:one', 'blob:three']);
  assert.equal(gallery.props.index, 1);
  assert.ok(all.some(n => n.props.children === 'notePhotos.retry'));
});

test('private image loader caps requests and releases late results after account switch', async () => {
  const { loadPhotos } = await moduleAt('components/ui/photoLoader.ts');
  let active = 0, peak = 0;
  const controller = new AbortController();
  const result = await loadPhotos([1, 2, 3, 4], {
    signal: controller.signal, current: () => true,
    load: async id => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return id; },
    create: id => `blob:${id}`, release: () => {}, update: () => {},
  });
  assert.equal(peak, 2);
  assert.deepEqual(Array.from(result.urls), ['blob:1', 'blob:2', 'blob:3', 'blob:4']);
  let current = true, created = 0;
  await loadPhotos([1], { signal: controller.signal, current: () => current,
    load: async () => { current = false; return 1; }, create: () => { created++; return 'blob:late'; },
    release: () => {}, update: () => {} });
  assert.equal(created, 0);
});

test('ordinary client profile and lesson popup contain no separate source profile action', async () => {
  const profile = await readFile(new URL('../src/pages/dashboard/Clients/components/ClientProfileSlider.tsx', import.meta.url), 'utf8');
  const popup = await readFile(new URL('../src/pages/dashboard/Journal/components/BookingPopup.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(profile, /BumpixProfileData|BumpixHistory|useBumpixProfiles|bumpix:tab/);
  assert.doesNotMatch(popup, /NativeSourceDetails/);
});

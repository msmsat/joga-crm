import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function moduleAt(relative, mocks = {}, globals = {}) {
  const context = vm.createContext({ console, Intl, Date, AbortController, DOMException, URLSearchParams, ...globals });
  const source = await readFile(new URL('../src/' + relative, import.meta.url), 'utf8');
  const mod = new vm.SourceTextModule(ts.transpileModule(source, { fileName: relative, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText, { context, initializeImportMeta: meta => { meta.env = { VITE_API_URL: 'http://fixture.invalid' }; } });
  await mod.link(name => {
    const exports = mocks[name] ?? {};
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return mod.namespace;
}

const model = await moduleAt('pages/dashboard/Clients/bumpix/model.ts');

test('history exposes both original All and all retained records with their own counts', async () => {
  const jsx = (type, props) => ({ type, props });
  const hooks = [];
  const History = await moduleAt('pages/dashboard/Clients/bumpix/BumpixHistory.tsx', {
    react: { useState: initial => [initial, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    '../../../../components/ui/index': { Button: 'Button', EmptyState: 'EmptyState', Select: 'Select' },
    './BumpixEventCard': { BumpixEventCard: 'EventCard' },
    './model': { uniqueEvents: () => [] },
    './useBumpix': { useBumpixEvents: (id, filter) => { hooks.push([id, filter]); return { isPending: true }; } },
    './bumpix.module.css': { default: {} },
  });
  const tree = History.BumpixHistory({ clientId: 42, profiles: [{ counts: { all: 8, all_source: 5 } }] });
  const nodes = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    nodes.push(node); walk(node.props?.children);
  }
  walk(tree);
  const options = nodes.find(node => node.type === 'Select').props.options;
  assert.equal(options.find(row => row.value === 'all_source')?.hint, '5');
  assert.equal(options.find(row => row.value === 'all')?.hint, '8');
  assert.deepEqual(hooks, [[42, 'all_source']]);
});

test('source wall clock survives browser timezone differences and midnight rollover', () => {
  assert.match(model.eventDate('2026-10-03T23:45:00', 'ru'), /3 окт.*23:45/);
  assert.match(model.eventDate('2026-10-04T00:00:00', 'en'), /Oct 4.*00:00/);
  assert.equal(model.eventDate('2026-02-30T12:00:00', 'ru'), null);
  assert.equal(model.eventDate('bad', 'ru'), null);
});

test('birthdays accept source UTC millis without inventing zero dates', () => {
  assert.equal(model.birthday(0, 'ru'), null);
  assert.match(model.birthday(Date.UTC(1990, 0, 2), 'ru'), /2 января.*1990/);
  assert.equal(model.birthday('bad', 'ru'), null);
});

test('master IDs stay strings and missing source names are explicit', () => {
  const lookups = [{ lookups: { masters: [{ '0': '1.10', '2': 'First' }, { '0': '1.100', '2': 'Second' }] } }];
  assert.equal(model.masterName(lookups, '1.10'), 'First');
  assert.equal(model.masterName(lookups, '1.100'), 'Second');
  assert.equal(model.masterName(lookups, '1.999'), null);
  assert.equal(model.masterName([...lookups, { lookups: { masters: [{ '0': '1.10', '2': 'Other account' }] } }], '1.10'), null);
});

test('pagination follows server totals; overlapping pages do not duplicate cards', () => {
  assert.equal(model.nextOffset({ offset: 0, total: 55, items: Array(25).fill({}) }), 25);
  assert.equal(model.nextOffset({ offset: 50, total: 55, items: Array(5).fill({}) }), undefined);
  assert.throws(() => model.validatePage({ offset: 25, total: 55, limit: 25, items: [] }, 25), /Incomplete Bumpix page/);
  assert.equal(model.nextOffset({ offset: 25, total: 55, items: [] }), undefined);
  const items = model.uniqueEvents([{ items: [{ id: 1, source_event_id: '1.10' }] },
    { items: [{ id: 1, source_event_id: '1.10' }, { id: 2, source_event_id: '1.100' }] }]);
  assert.equal(items.length, 2);
});

test('profile categories retain names and map string source IDs when available', () => {
  const profile = { profile: { categories: ['1.10', 'VIP', '1.100'] },
    lookups: { categories: [{ '0': '1.10', '2': 'First' }, { '0': '1.100', '2': 'Second' }] } };
  assert.equal(model.categoryNames(profile), 'First, VIP, Second');
});

test('API uses exact filter, offset and authenticated numeric media route', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const api = await moduleAt('api/clients/bumpix.api.ts', { '../client': { client: {
    get: async (...args) => { calls.push(args); return {}; },
    blob: async (...args) => { calls.push(args); return {}; },
  } } });
  await api.bumpixApi.events(12, 'canceled', 25, signal);
  await api.bumpixApi.photo(12, { id: 9, url: 'https://foreign.example/token' }, signal);
  assert.equal(calls[0][0], '/clients/12/bumpix/events?status=canceled&offset=25&limit=25');
  assert.equal(calls[1][0], '/clients/12/bumpix/media/9');
  assert.equal(calls[1][1].signal, signal);
});

test('query cache separates clients, filters, studios and role contexts', async () => {
  const { queryKeys } = await moduleAt('api/queryKeys.ts');
  const keys = [queryKeys.bumpixProfile(12, '1:owner'), queryKeys.bumpixProfile(12, '1:trainer'),
    queryKeys.bumpixProfile(12, '2:owner'), queryKeys.bumpixProfile(13, '1:owner'),
    queryKeys.bumpixEvents(12, 'new', '1:owner'), queryKeys.bumpixEvents(12, 'completed', '1:owner')];
  assert.equal(new Set(keys.map(JSON.stringify)).size, keys.length);
});

test('protected blob GET sends Bearer and abort signal; 401 keeps shared session handling', async () => {
  let token = 'fictional-token';
  let response = new Response(new Blob(['photo'], { type: 'image/png' }));
  let called;
  let cleared = false;
  const location = { pathname: '/dashboard/clients', href: '' };
  const http = await moduleAt('api/client.ts', {
    '../utils/auth': { getActiveToken: () => token, clearActiveToken: () => { cleared = true; token = null; }, getUserRoleFromToken: () => 'owner' },
    '../lib/authFailure': { reactTo401: () => 'end-session' },
  }, { fetch: async (...args) => { called = args; return response; }, window: { location } });
  // import.meta.env in the real module is populated by this loader below.
  const controller = new AbortController();
  const blob = await http.client.blob('/clients/12/bumpix/media/9', { signal: controller.signal });
  assert.equal(await blob.text(), 'photo');
  assert.equal(called[1].headers.Authorization, 'Bearer fictional-token');
  assert.equal(called[1].signal, controller.signal);
  response = new Response(JSON.stringify({ detail: 'expired' }), { status: 401 });
  await assert.rejects(http.client.blob('/clients/12/bumpix/media/9'), error => error.status === 401);
  assert.equal(cleared, true);
  assert.equal(location.href, '/login');
});

test('photo loading is bounded, retains image order and reports failed files', async () => {
  let active = 0, maximum = 0;
  const released = [], updates = [];
  const loader = await moduleAt('pages/dashboard/Clients/bumpix/photoLoader.ts');
  const controller = new AbortController();
  const results = await loader.loadPhotos([1, 2, 3, 4], {
    signal: controller.signal,
    load: async id => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, id === 1 ? 15 : 1));
      active--; if (id === 2) throw new Error('missing');
      return { id };
    },
    current: () => true, create: body => 'blob:' + body.id, release: url => released.push(url),
    update: row => updates.push(row),
  });
  assert.ok(maximum <= 2);
  assert.deepEqual(JSON.parse(JSON.stringify(results.urls)), ['blob:1', null, 'blob:3', 'blob:4']);
  assert.equal(results.failed, 1);
  assert.equal(results.completed, 4);
  assert.equal(released.length, 0);
  assert.equal(updates.length, 4);
});

test('late photo response after client/account switch creates no usable object URL', async () => {
  const loader = await moduleAt('pages/dashboard/Clients/bumpix/photoLoader.ts');
  let current = true, created = 0, updated = 0;
  await loader.loadPhotos([1], {
    signal: new AbortController().signal, load: async () => { current = false; return {}; },
    current: () => current, create: () => { created++; return 'blob:old'; },
    release: () => {}, update: () => { updated++; },
  });
  assert.equal(created, 0);
  assert.equal(updated, 0);
});

test('cancellation releases every URL already created, including late results', async () => {
  const loader = await moduleAt('pages/dashboard/Clients/bumpix/photoLoader.ts');
  const controller = new AbortController();
  const released = [];
  await loader.loadPhotos([1, 2], {
    signal: controller.signal, load: async id => {
      if (id === 2) { await new Promise(resolve => setTimeout(resolve, 5)); controller.abort(); }
      return { id };
    },
    current: () => !controller.signal.aborted, create: body => 'blob:' + body.id,
    release: url => released.push(url), update: () => {},
  });
  assert.deepEqual(released, ['blob:1']);
});

test('an inconsistent empty page fails in the request before reaching infinite-query observers', async () => {
  let page = { offset: 25, total: 30, limit: 25, items: [] };
  const hooks = await moduleAt('pages/dashboard/Clients/bumpix/useBumpix.ts', {
    '@tanstack/react-query': { useInfiniteQuery: options => options, useQuery: options => options },
    '../../../../api/clients/bumpix.api': { bumpixApi: { events: async () => page } },
    '../../../../api/queryKeys': { queryKeys: { bumpixEvents: () => ['fixture'] } },
    '../../../../utils/auth': { getActiveContextKey: () => 'fixture' },
    './model': { nextOffset: model.nextOffset, validatePage: model.validatePage },
  });
  const options = hooks.useBumpixEvents(42, 'all_source');
  await assert.rejects(options.queryFn({ pageParam: 25, signal: new AbortController().signal }), /Incomplete Bumpix page/);
  page = { ...page, items: Array(5).fill({ id: 1 }) };
  assert.equal((await options.queryFn({ pageParam: 25 })).items.length, 5);
});

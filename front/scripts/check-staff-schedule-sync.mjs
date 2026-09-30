// The real staff API and query cache, with two browser storage contexts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

async function browser(peerEvents = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  const events = new Map(), writes = [];
  let reply = async () => ({ ok: true });
  let storageFails = false;
  const context = vm.createContext({ console, Date, Math,
    window: { addEventListener: (name, callback) => events.set(name, callback) },
    localStorage: { setItem: (key, newValue) => {
      if (storageFails) throw new Error('storage disabled');
      writes.push({ key, newValue });
      for (const peer of peerEvents) peer.get('storage')?.({ key, newValue });
    } },
  });
  const modules = new Map();
  const synthetic = (names, values) => new vm.SyntheticModule(names, function () {
    for (const name of names) this.setExport(name, values[name]);
  }, { context });
  modules.set('api/client', synthetic(['client'], { client: Object.fromEntries(['get','post','put','delete'].map(method => [method, (...args) => reply(method, ...args)])) }));
  modules.set('api/queryClient', synthetic(['queryClient'], { queryClient: qc }));
  async function load(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(await readFile(new URL(`../src/${path}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const mod = new vm.SourceTextModule(code, { context });
    modules.set(path, mod);
    await mod.link(name => {
      const resolved = new URL(name, `file:///${path}`).pathname.slice(1);
      return load(resolved);
    });
    return mod;
  }
  const api = await load('api/staff/staff.api'); await api.evaluate();
  const keysModule = await load('api/queryKeys'); await keysModule.evaluate();
  const keys = keysModule.namespace.queryKeys;
  for (const key of [keys.journalStaffBlocks('2026-10-05','2026-10-05'), keys.journalStaffBlocks('2026-10-05','2026-10-11'), keys.staffScheduleEditor(7,'2026-10-05')]) qc.setQueryData(key, []);
  return { qc, keys, events, writes, api: api.namespace.staffApi,
    respond: fn => { reply = fn; }, failStorage: () => { storageFails = true; } };
}

const changes = [
  ['weekly hours', api => api.saveScheduleEditor(7, { week_start:'2026-10-05', repeat_weekly:true, days:[] })],
  ['dated hours', api => api.saveScheduleEditor(7, { week_start:'2026-10-05', repeat_weekly:false, days:[] })],
  ['day off', api => api.setDayOverride(7,'2026-10-05',false)],
  ['reset day', api => api.setDayOverride(7,'2026-10-05',null)],
  ['add absence', api => api.createBusy(7,{ start_time:'2026-10-05T13:00:00', end_time:'2026-10-05T14:00:00' })],
  ['remove absence', api => api.deleteBusy(7,12)],
  ['profile hours', api => api.update(7,{ schedule:[] })],
];
for (const [label, mutate] of changes) test(`${label} refreshes every cached Journal range in this and the other tab`, async () => {
  const other = await browser(); const own = await browser([other.events]);
  await mutate(own.api);
  for (const tab of [own, other]) for (const entry of tab.qc.getQueryCache().getAll()) assert.equal(entry.state.isInvalidated,true);
  assert.equal(own.writes.length,1);
  assert.equal(other.writes.length,0); // no rebroadcast loop
});

test('an already open Journal fetches the new break immediately after a save in another tab', async () => {
  const other = await browser(); const own = await browser([other.events]);
  const key = other.keys.journalStaffBlocks('2026-10-05','2026-10-05');
  const pause = [{ staff_id:7, kind:'break', start_minute:780, end_minute:840 }];
  let fetches = 0;
  const observer = new QueryObserver(other.qc,{ queryKey:key, queryFn:async () => { fetches++; return pause; } });
  const unsubscribe = observer.subscribe(() => {});
  await own.api.saveScheduleEditor(7,{ week_start:'2026-10-05', repeat_weekly:true, days:[] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetches,1);
  assert.deepEqual(other.qc.getQueryData(key),pause);
  unsubscribe();
});

test('a rejected save does not signal or change the caches', async () => {
  const tab = await browser();
  tab.respond(async () => { throw new Error('lesson conflict'); });
  await assert.rejects(tab.api.createBusy(7,{start_time:'a',end_time:'b'}), /lesson conflict/);
  assert.equal(tab.writes.length,0);
  for (const entry of tab.qc.getQueryCache().getAll()) assert.equal(entry.state.isInvalidated,false);
});

test('disabled storage still refreshes the current tab and preserves the successful result', async () => {
  const tab = await browser(); tab.failStorage();
  assert.equal((await tab.api.setDayOverride(7,'2026-10-05',true)).ok,true);
  assert.equal(tab.qc.getQueryState(tab.keys.journalStaffBlocks('2026-10-05','2026-10-05')).isInvalidated,true);
});

test('unrelated storage and profile changes do not refresh the Journal', async () => {
  const tab = await browser();
  tab.events.get('storage')?.({ key:'unrelated', newValue:'x' });
  await tab.api.update(7,{ name:'Petr' });
  for (const entry of tab.qc.getQueryCache().getAll()) assert.equal(entry.state.isInvalidated,false);
  assert.equal(tab.writes.length,0);
});

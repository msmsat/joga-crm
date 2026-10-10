import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function client(fetch, session = null) {
  const timers = new Map();
  let nextTimer = 0;
  let cleared = 0;
  let reloads = 0;
  const stubs = {
    '../i18n': { __esModule: true, default: { t: (key) => key } },
    './config': { BASE_URL: 'https://api.invalid' },
    '../lib/session': {
      getSession: () => session,
      clearSession: () => { cleared++; },
    },
    '../lib/entry': { getStudioRef: () => 'studio/example' },
  };
  function load(path) {
    const module = { exports: {} };
    const source = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
    }).outputText;
    vm.runInNewContext(source, {
      module, exports: module.exports,
      require: (name) => stubs[name] ?? load(resolve(dirname(path), name + '.ts')),
      fetch, AbortController, Error, Promise,
      setTimeout: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
      clearTimeout: (id) => timers.delete(id),
      window: { location: { reload: () => { reloads++; } } },
    }, { filename: path });
    return module.exports;
  }
  return {
    api: load(resolve(root, 'src/api/client.ts')),
    expire: () => { for (const callback of [...timers.values()]) callback(); },
    state: () => ({ timers: timers.size, cleared, reloads }),
  };
}

async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('request stayed pending after deadline')), 100);
    })]);
  } finally { clearTimeout(timer); }
}

// A stalled HTTP transport must release Auth's busy state, even if it ignores abort.
let signal;
const stalled = client((_url, init) => { signal = init.signal; return new Promise(() => {}); }, { token: 'active' });
const request = stalled.api.apiPost('/global/auth/email/request', { email: 'client@example.test' });
await flush();
stalled.expire();
await assert.rejects(bounded(request), (error) => error.code === 'REQUEST_TIMEOUT');
assert.equal(signal.aborted, true);
assert.deepEqual(stalled.state(), { timers: 0, cleared: 0, reloads: 0 });

// Receiving headers is insufficient: a stalled JSON body must also time out.
const body = client(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }));
const bodyRequest = body.api.apiGet('/global/studio');
await flush();
body.expire();
await assert.rejects(bounded(bodyRequest), (error) => error.code === 'REQUEST_TIMEOUT');

// A response arriving after its deadline must not clear a newer live session.
let finishErrorBody;
const late = client(async () => ({
  ok: false, status: 401,
  json: () => new Promise((resolve) => { finishErrorBody = resolve; }),
}), { token: 'active' });
const lateRequest = late.api.apiGet('/global/me');
await flush();
late.expire();
await assert.rejects(bounded(lateRequest), (error) => error.code === 'REQUEST_TIMEOUT');
finishErrorBody({ detail: 'Expired' });
await flush();
assert.deepEqual(late.state(), { timers: 0, cleared: 0, reloads: 0 });

let url;
let options;
const success = client(async (target, init) => {
  url = target; options = init;
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
}, { token: 'active' });
assert.equal((await success.api.apiPost('/global/auth/email/verify', { code: '123456' }, true)).ok, true);
assert.equal(url, 'https://api.invalid/global/auth/email/verify?studio_id=studio%2Fexample');
assert.equal(options.headers.Authorization, undefined);
assert.equal(options.body, '{"code":"123456"}');
assert.equal(success.state().timers, 0);

const failed = client(async () => ({ ok: false, status: 503, json: async () => ({ detail: 'Mail unavailable' }) }));
await assert.rejects(failed.api.apiPost('/global/auth/email/request'), (error) => error.status === 503 && error.message === 'Mail unavailable');
assert.equal(failed.state().timers, 0);
const suspended = client(async () => ({ ok: false, status: 402,
  json: async () => ({ detail: { code: 'billing.suspended', message: 'Studio payments are unavailable' } }),
}));
await assert.rejects(suspended.api.apiPost('/global/bookings/quote'), error =>
  error.status === 402 && error.code === 'billing.suspended' && error.message === 'Studio payments are unavailable');
const expired = client(async () => ({ ok: false, status: 401, json: async () => ({ detail: 'Expired' }) }), { token: 'expired' });
await assert.rejects(expired.api.apiGet('/global/me'), (error) => error.status === 401);
assert.equal(expired.state().cleared, 1);
assert.equal(expired.state().reloads, 1);
const empty = client(async () => ({ ok: true, status: 204 }));
assert.equal(await empty.api.apiDelete('/global/bookings/1'), undefined);
assert.equal(empty.state().timers, 0);
console.log('API client: deadline, stalled body, session, errors and success passed');

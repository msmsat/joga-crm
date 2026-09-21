// Exercise the real HTTP client; only fetch, storage and navigation are faked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function setup() {
  let token = 'session-A';
  let reply = async () => new Response('{}', { status: 401 });
  const location = { href: '', pathname: '/dashboard' };
  const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    AbortController, DOMException, console,
    fetch: (...args) => reply(...args), window: { location },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const modules = new Map();
  modules.set('../utils/auth', new vm.SyntheticModule(
    ['getActiveToken', 'clearActiveToken', 'rememberAccountName'], function () {
      this.setExport('getActiveToken', () => token);
      this.setExport('clearActiveToken', () => { token = null; });
      this.setExport('rememberAccountName', () => {});
    }, { context }));
  async function load(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(await readFile(new URL(`../src/${path}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    }).outputText;
    const mod = new vm.SourceTextModule(code, { context, initializeImportMeta: meta => { meta.env = {}; } });
    modules.set(path, mod);
    await mod.link(name => {
      if (modules.has(name)) return modules.get(name);
      const mapped = { '../lib/authFailure': 'lib/authFailure', '../client': 'api/client',
        '../api/auth/auth.api': 'api/auth/auth.api' }[name];
      assert.ok(mapped, `Unexpected dependency: ${name}`);
      return load(mapped);
    });
    return mod;
  }
  const clientModule = await load('api/client');
  await clientModule.evaluate();
  return {
    client: clientModule.namespace.client, location, timers,
    token: () => token, setToken: value => { token = value; },
    respond: fn => { reply = fn; },
    async checker() { const mod = await load('lib/sessionCheck'); await mod.evaluate(); return mod.namespace.startSessionCheck; },
  };
}
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

test('late 401 for an old token does not log out a newly selected account', async () => {
  const b = await setup();
  let respond;
  b.respond(() => new Promise(resolve => { respond = resolve; }));
  const pending = b.client.get('/auth/me');
  b.setToken('session-B');
  respond(new Response('{}', { status: 401 }));
  await assert.rejects(pending, error => error.status === 401);
  assert.equal(b.token(), 'session-B');
  assert.equal(b.location.href, '');
});

test('401 for the active session still logs out; public login errors do not', async () => {
  const b = await setup();
  await assert.rejects(b.client.post('/auth/login', {}, { auth: false }));
  assert.equal(b.token(), 'session-A');
  await assert.rejects(b.client.get('/auth/me'));
  assert.equal(b.token(), null);
  assert.equal(b.location.href, '/login');
});

test('a request sent without a token cannot log out a subsequent login', async () => {
  const b = await setup();
  b.setToken(null);
  b.respond(async () => { b.setToken('session-B'); return new Response('{}', { status: 401 }); });
  await assert.rejects(b.client.get('/auth/me'));
  assert.equal(b.token(), 'session-B');
});

for (const failure of ['503', 'network', 'timeout']) {
  test(`${failure} keeps the session and automatically recovers after restart`, async () => {
    const b = await setup();
    let calls = 0;
    b.respond((_url, { signal }) => {
      calls++;
      if (calls > 1) return Promise.resolve(new Response(JSON.stringify({ email: 'a@example.test', is_onboarded: true })));
      if (failure === '503') return Promise.resolve(new Response('Restarting', { status: 503 }));
      if (failure === 'network') return Promise.reject(new TypeError('Failed to fetch'));
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError'))));
    });
    const start = await b.checker();
    let user = null;
    let errors = 0;
    const check = start('session-A', { onSuccess: data => { user = data; }, onError: () => { errors++; } });
    if (failure === 'timeout') {
      const [id, timer] = [...b.timers].find(([, value]) => value.delay === 10_000);
      b.timers.delete(id); timer.fn();
    }
    await flush();
    assert.equal(b.token(), 'session-A');
    assert.equal(b.location.href, '');
    assert.equal(user, null, 'protected content must remain hidden until validation succeeds');
    assert.equal(errors, 1);
    const [id, timer] = [...b.timers][0];
    b.timers.delete(id); timer.fn();
    await flush();
    assert.equal(user.email, 'a@example.test');
    assert.equal(calls, 2);
    check.retry(); await flush();
    assert.equal(calls, 2, 'successful checks stop retrying');
    check.stop();
    assert.equal(b.timers.size, 0);
  });
}

test('unmount cancels pending work without clearing the token or updating UI', async () => {
  const b = await setup();
  let signal;
  b.respond((_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError'))));
  });
  const start = await b.checker();
  let updates = 0;
  const check = start('session-A', { onSuccess: () => { updates++; }, onError: () => { updates++; } });
  check.stop(); await flush();
  assert.equal(signal.aborted, true);
  assert.equal(b.token(), 'session-A');
  assert.equal(b.timers.size, 0);
  assert.equal(updates, 0);
});

test('late profile results are ignored after account switching', async () => {
  const b = await setup();
  let respond;
  b.respond(() => new Promise(resolve => { respond = resolve; }));
  const start = await b.checker();
  let updates = 0;
  const check = start('session-A', { onSuccess: () => { updates++; }, onError: () => { updates++; } });
  b.setToken('session-B');
  respond(new Response(JSON.stringify({ email: 'old@example.test' })));
  await flush();
  assert.equal(updates, 0);
  assert.equal(b.token(), 'session-B');
  assert.equal(b.timers.size, 0);
  check.stop();
});

test('revoked sessions end immediately and are never retried', async () => {
  const b = await setup();
  const start = await b.checker();
  let success = false;
  const check = start('session-A', { onSuccess: () => { success = true; }, onError: () => {} });
  await flush();
  assert.equal(b.token(), null);
  assert.equal(b.location.href, '/login');
  assert.equal(success, false);
  assert.equal(b.timers.size, 0);
  check.stop();
});

test('retry clicks cannot start overlapping requests and cleanup removes delayed retries', async () => {
  const b = await setup();
  let calls = 0;
  let rejectRequest;
  b.respond(() => { calls++; return new Promise((_resolve, reject) => { rejectRequest = reject; }); });
  const start = await b.checker();
  const check = start('session-A', { onSuccess: () => {}, onError: () => {} });
  check.retry(); check.retry();
  assert.equal(calls, 1);
  rejectRequest(new TypeError('Offline')); await flush();
  assert.equal(b.timers.size, 1);
  check.stop();
  assert.equal(b.timers.size, 0);
  check.retry();
  assert.equal(calls, 1);
});

test('a cancelled request cannot invalidate the active session', async () => {
  const b = await setup();
  const controller = new AbortController();
  b.respond(async () => { controller.abort(); return new Response('{}', { status: 401 }); });
  await assert.rejects(b.client.get('/auth/me', { signal: controller.signal }));
  assert.equal(b.token(), 'session-A');
  assert.equal(b.location.href, '');
});

test('persistent outages back off to 30 seconds; manual retry can recover sooner', async () => {
  const b = await setup();
  b.respond(async () => new Response('{}', { status: 503 }));
  const start = await b.checker();
  let user;
  const check = start('session-A', { onSuccess: data => { user = data; }, onError: () => {} });
  for (const expectedDelay of [5000, 10000, 15000, 20000, 25000, 30000, 30000]) {
    await flush();
    assert.equal(b.timers.size, 1);
    const [id, timer] = [...b.timers][0];
    assert.equal(timer.delay, expectedDelay);
    b.timers.delete(id); timer.fn();
  }
  await flush();
  assert.equal(b.token(), 'session-A');
  b.respond(async () => new Response(JSON.stringify({ email: 'recovered@example.test' })));
  check.retry(); await flush();
  assert.equal(user.email, 'recovered@example.test');
  assert.equal(b.timers.size, 0);
  check.stop();
});

test('a non-transient denial stays closed without an automatic retry loop', async () => {
  const b = await setup();
  b.respond(async () => new Response('{}', { status: 404 }));
  const start = await b.checker();
  let updates = 0;
  const check = start('session-A', { onSuccess: () => assert.fail('access denied'), onError: () => { updates++; } });
  await flush();
  assert.equal(updates, 1);
  assert.equal(b.timers.size, 0);
  assert.equal(b.token(), 'session-A');
  check.stop();
});

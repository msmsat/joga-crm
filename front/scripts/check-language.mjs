// Run with node --experimental-vm-modules scripts/check-language.mjs.
// Real language modules; only the browser, i18next and HTTP boundary are faked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function browser(saved = {}, reply = { language: 'de', source: 'ip' }) {
  const storage = new Map(Object.entries(saved));
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  const context = vm.createContext({ localStorage });
  const i18n = { language: 'en', changeLanguage(lang) { this.language = lang; } };
  let response = reply;
  const authApi = { getLocale: () => Promise.resolve(typeof response === 'function' ? response() : response) };
  const modules = new Map();
  async function source(path) {
    const url = new URL(path, import.meta.url);
    const code = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    }).outputText;
    return new vm.SourceTextModule(code, { context, identifier: url.href });
  }
  const lang = await source('../src/utils/lang.ts');
  modules.set('../utils/lang', lang);
  for (const [name, exports] of Object.entries({
    '../i18n': { default: i18n },
    '../api/auth/auth.api': { authApi },
    '../utils/auth': { getActiveToken: () => storage.get('token') ?? null },
  })) {
    modules.set(name, new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context }));
  }
  const detect = await source('../src/lib/detectLanguage.ts');
  await detect.link(name => {
    assert.ok(modules.has(name), `Unexpected dependency: ${name}`);
    return modules.get(name);
  });
  await detect.evaluate();
  i18n.language = lang.namespace.initialLang();
  return { storage, i18n, lang: lang.namespace, detect: detect.namespace.detectLanguage,
    respond: value => { response = value; } };
}

test('old automatic Russian caches do not override the English first render or German IP', async () => {
  const b = await browser({ ui_language: 'ru', geo_language: 'ru' });
  assert.equal(b.i18n.language, 'en');
  await b.detect();
  assert.equal(b.i18n.language, 'de');
});

test('an expired token does not block the country returned by the server', async () => {
  const b = await browser({ token: 'expired' });
  await b.detect();
  assert.equal(b.i18n.language, 'de');
});

test('explicit Russian survives reload and a German VPN', async () => {
  const first = await browser();
  first.lang.rememberLang('ru');
  const next = await browser(Object.fromEntries(first.storage));
  await next.detect();
  assert.equal(next.i18n.language, 'ru');
});

test('a known manual choice from onboarding is preserved', async () => {
  const b = await browser({ onboarding_language: 'ru' });
  await b.detect();
  assert.equal(b.i18n.language, 'ru');
});

test('the selector exposes every completed UI locale and migrates legacy Czech', async () => {
  const b = await browser({ ui_language_choice: 'cz' });
  assert.deepEqual(
    Array.from(b.lang.LANGUAGES, ({ value }) => value),
    ['en', 'ru', 'sq', 'bg', 'hr', 'cs', 'da', 'fi', 'fr', 'de', 'el', 'hu', 'it', 'no', 'pl', 'pt', 'ro', 'sr', 'es', 'sv', 'tr', 'uk'],
  );
  assert.equal(b.lang.chosenLang(), 'cs');
});

test('a new visit detects a new VPN country without preserving automatic German', async () => {
  const first = await browser();
  await first.detect();
  const next = await browser(Object.fromEntries(first.storage), { language: 'cs', source: 'ip' });
  assert.equal(next.i18n.language, 'en');
  await next.detect();
  assert.equal(next.i18n.language, 'cs');
});

test('unknown country clears a previous automatic language to English', async () => {
  const b = await browser();
  await b.detect();
  b.respond({ language: null, source: 'ip' });
  await b.detect();
  assert.equal(b.i18n.language, 'en');
});

test('a manual choice made while detection is pending wins, even if it matches the first render', async () => {
  let finish;
  const b = await browser({}, () => new Promise(resolve => { finish = resolve; }));
  const pending = b.detect();
  b.lang.rememberLang('en');
  finish({ language: 'ru', source: 'account' });
  await pending;
  assert.equal(b.i18n.language, 'en');
});

test('an explicit account language is remembered and beats the IP on the next visit', async () => {
  const b = await browser({}, { language: 'ru', source: 'account' });
  await b.detect();
  const next = await browser(Object.fromEntries(b.storage));
  await next.detect();
  assert.equal(next.i18n.language, 'ru');
});

test('a failed detection keeps the English default', async () => {
  const b = await browser({ ui_language: 'ru', geo_language: 'ru' }, () => Promise.reject(new Error('offline')));
  await b.detect();
  assert.equal(b.i18n.language, 'en');
});

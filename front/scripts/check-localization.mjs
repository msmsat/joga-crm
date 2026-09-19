// Real request/error and category modules, with only HTTP and browser boundaries stubbed.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import i18next from 'i18next';

const localeRoot = new URL('../src/locales/', import.meta.url);
const resources = {};
for (const entry of await readdir(localeRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const lang = entry.name;
  resources[lang] = {};
  for (const ns of ['common', 'billing', 'finances']) {
    resources[lang][ns] = JSON.parse(await readFile(new URL(`${lang}/${ns}.json`, localeRoot), 'utf8'));
  }
}

async function clientFor(lang, status, detail) {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: lang, fallbackLng: 'en', resources, defaultNS: 'common' });
  let cleared = false;
  const events = [];
  const location = { href: '', pathname: '/login' };
  const context = vm.createContext({
    fetch: async () => ({ status, ok: status < 400, json: async () => ({ detail }) }),
    window: { location, dispatchEvent: e => events.push(e) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  const modules = new Map();
  function synthetic(key, exports) {
    const module = new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
    modules.set(key, module);
  }
  synthetic('../i18n', { default: i18n });
  synthetic('../utils/auth', { getActiveToken: () => 'existing-token', clearActiveToken: () => { cleared = true; } });
  async function source(path) {
    const url = new URL(path, import.meta.url);
    const code = ts.transpileModule(await readFile(url, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    return new vm.SourceTextModule(code, { context, identifier: url.href,
      initializeImportMeta: meta => { meta.env = {}; } });
  }
  const client = await source('../src/api/client.ts');
  await client.link(async (specifier, parent) => {
    if (modules.has(specifier)) return modules.get(specifier);
    const url = new URL(`${specifier}.ts`, parent.identifier);
    return source(url.href);
  });
  await client.evaluate();
  return { client: client.namespace.client, i18n, events, location, cleared: () => cleared };
}

test('invalid credentials use the selected locale and keep the existing session', async () => {
  for (const lang of Object.keys(resources)) {
    const b = await clientFor(lang, 401, { code: 'invalid_credentials', message: 'Неверный email, телефон или пароль' });
    await assert.rejects(b.client.post('/auth/login', {}, { auth: false }), err => {
      assert.equal(err.message, resources[lang].common.errors.invalid_credentials, lang);
      assert.equal(err.code, 'invalid_credentials');
      return true;
    });
    assert.equal(b.cleared(), false);
    assert.equal(b.location.href, '');
  }
});

test('legacy login response is translated during a rolling deployment', async () => {
  const b = await clientFor('de', 401, 'Неверный email, телефон или пароль');
  await assert.rejects(b.client.post('/auth/login', {}, { auth: false }), err => {
    assert.equal(err.message, resources.de.common.errors.invalid_credentials);
    return true;
  });
});

test('plan-limit events contain localized messages', async () => {
  const b = await clientFor('fr', 403, { code: 'limit_exceeded', message: 'Достигнут лимит тарифа' });
  await assert.rejects(b.client.post('/clients', {}));
  assert.equal(b.events[0].detail.message, resources.fr.common.errors.limit_exceeded);
});

test('unknown server diagnostics remain available', async () => {
  const b = await clientFor('en', 409, 'A custom server explanation');
  await assert.rejects(b.client.post('/example'), { message: 'A custom server explanation' });
});

test('localized category labels round-trip to canonical server values in every locale', async () => {
  const { categoryLabel, categoryValue } = await import('../src/pages/dashboard/Finances/categoryLabels.ts');
  for (const [lang, namespaces] of Object.entries(resources)) {
    const presets = Object.values(namespaces.finances.operations.categoryPresets).flat();
    for (const preset of presets) {
      assert.equal(categoryValue(preset.label, presets), preset.value, lang);
      assert.equal(categoryLabel(preset.value, presets), preset.label, lang);
    }
    assert.equal(categoryValue('Custom category', presets), 'Custom category');
    assert.equal(categoryValue('Custom ', presets), 'Custom ', 'typing a space must not erase it');
    assert.equal(categoryLabel('Custom category', presets), 'Custom category');
    assert.equal(categoryValue('', presets), '');
  }
});

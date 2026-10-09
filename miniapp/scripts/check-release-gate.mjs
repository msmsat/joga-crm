import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./release-gate.mjs', import.meta.url), 'utf8');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'velora-release-check-'));
const requiredSuites = ['test_miniapp_journey.py', 'test_miniapp_email_auth.py', 'test_miniapp_checkout.py', 'test_mailer_guard.py'];

async function exercise(name, pytestResult) {
  const repository = path.join(root, name);
  const evidence = path.join(repository, 'evidence');
  const tests = path.join(repository, 'back', 'tests');
  fs.mkdirSync(tests, { recursive: true });
  for (const suite of requiredSuites) fs.writeFileSync(path.join(tests, suite), '');
  const processStub = {
    platform: 'linux', exitCode: 0,
    env: {
      CI: 'true', MINIAPP_RELEASE_EVIDENCE: evidence, MINIAPP_E2E_PYTHON: 'python',
      MINIAPP_RELEASE_SHA: 'a'.repeat(40),
      DATABASE_URL: 'postgresql+asyncpg://isolated/unused_app',
      TEST_DATABASE_URL: 'postgresql+asyncpg://isolated/miniapp_test',
    },
  };
  let pytestTemp;
  let browserRan = false;
  const spawnSync = (_command, args) => {
    if (args[1] === 'build') {
      const dist = path.join(repository, 'miniapp', 'dist');
      fs.mkdirSync(dist, { recursive: true });
      fs.writeFileSync(path.join(dist, 'index.html'), '<html>tested candidate</html>');
    }
    if (args[1] === 'pytest') {
      pytestTemp = args.find(arg => arg.startsWith('--basetemp=')).slice('--basetemp='.length);
      // pytest creates a private directory when it starts, including on failure.
      fs.chmodSync(pytestTemp, 0o700);
      fs.mkdirSync(path.join(pytestTemp, 'private-fixture'));
      fs.writeFileSync(path.join(pytestTemp, 'private-fixture', 'temporary.txt'), 'private');
      const report = args.find(arg => arg.startsWith('--junitxml=')).slice('--junitxml='.length);
      fs.writeFileSync(report, '<testsuites><testsuite tests="1"/></testsuites>');
      return pytestResult;
    }
    if (args[1] === 'test:browser') browserRan = true;
    return { status: 0 };
  };
  const context = vm.createContext({
    process: processStub, URL, console: { log() {}, error() {} },
  });
  const imports = {
    'node:child_process': { spawnSync }, 'node:crypto': crypto,
    'node:fs': fs, 'node:os': os, 'node:path': path, 'node:url': url,
  };
  const module = new vm.SourceTextModule(source, {
    context,
    initializeImportMeta(meta) {
      meta.url = url.pathToFileURL(path.join(repository, 'miniapp', 'scripts', 'release-gate.mjs')).href;
    },
  });
  await module.link(specifier => {
    const exports = imports[specifier];
    assert.ok(exports, `Unexpected dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  assert.ok(pytestTemp, 'The gate must execute the backend suite');
  const relativeTemp = path.relative(evidence, pytestTemp);
  assert.ok(relativeTemp.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTemp),
    'Private pytest files must stay outside the uploaded evidence directory');
  assert.equal(fs.existsSync(pytestTemp), false, 'Owned pytest temporary files must be removed after the run');
  assert.ok(fs.existsSync(path.join(evidence, 'backend.xml')), 'Keep the backend report for diagnosis');
  if (pytestResult.status === 0 && !pytestResult.signal) {
    assert.equal(processStub.exitCode, 0);
    assert.equal(browserRan, true);
    const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'release.json'), 'utf8'));
    assert.equal(manifest.sha, processStub.env.MINIAPP_RELEASE_SHA);
    assert.equal(manifest.files['index.html'], crypto.createHash('sha256').update('<html>tested candidate</html>').digest('hex'));
  } else {
    assert.equal(processStub.exitCode, 1, 'Failed checks must still block the release');
    assert.equal(browserRan, false, 'Do not continue after a failed backend check');
    assert.equal(fs.existsSync(path.join(evidence, 'release.json')), false, 'Do not publish a success manifest');
  }
}

try {
  await exercise('failure', { status: 1 });
  await exercise('signal', { status: null, signal: 'SIGTERM' });
  await exercise('success', { status: 0 });
  console.log('Release gate diagnostics checks passed (failure, signal, success).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

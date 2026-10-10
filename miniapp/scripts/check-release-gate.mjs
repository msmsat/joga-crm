import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./release-gate.mjs', import.meta.url), 'utf8');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'velora-release-check-'));
const requiredSuites = ['test_miniapp_journey.py', 'test_miniapp_email_auth.py', 'test_miniapp_checkout.py', 'test_mailer_guard.py',
  'test_payment_lock_incident.py', 'test_payment_lock_startup.py', 'test_schedule_guard.py', 'test_attendance_autopilot.py',
  'test_debt_card_payment.py', 'test_booking_checkout_return.py'];

async function exercise(name, pytestResult, omittedSuite) {
  const repository = path.join(root, name);
  const evidence = path.join(repository, 'evidence');
  const tests = path.join(repository, 'back', 'tests');
  fs.mkdirSync(tests, { recursive: true });
  for (const suite of requiredSuites) {
    if (suite !== omittedSuite) fs.writeFileSync(path.join(tests, suite), '');
  }
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
      for (const suite of requiredSuites) {
        assert.ok(args.includes(`tests/${suite}`), `Release must exercise ${suite}`);
      }
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
  if (omittedSuite) {
    assert.equal(processStub.exitCode, 1, 'Deleting a required regression must block release');
    assert.equal(pytestTemp, undefined);
    assert.equal(browserRan, false);
    assert.equal(fs.existsSync(path.join(evidence, 'release.json')), false);
    return;
  }
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
  await exercise('missing-payment-regression', { status: 0 }, 'test_payment_lock_incident.py');
  await exercise('missing-startup-regression', { status: 0 }, 'test_payment_lock_startup.py');
  await exercise('missing-debt-payment-regression', { status: 0 }, 'test_debt_card_payment.py');
  await exercise('missing-checkout-return-regression', { status: 0 }, 'test_booking_checkout_return.py');
  console.log('Release gate diagnostics checks passed (failure, signal, success, missing required regressions).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const miniapp = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(miniapp, '..');
const evidence = resolve(process.env.MINIAPP_RELEASE_EVIDENCE || join(repository, 'work', 'miniapp-release-evidence'));
const python = process.env.MINIAPP_E2E_PYTHON || (existsSync(join(repository, 'back', 'venv', 'Scripts', 'python.exe'))
  ? join(repository, 'back', 'venv', 'Scripts', 'python.exe') : 'python3');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, cwd, extra = {}) {
  console.log(`\nRelease gate: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd, stdio: 'inherit', env: { ...process.env, PYTHON_DOTENV_DISABLED: '1', APP_ENV: 'dev', ...extra },
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`Release blocked: ${command} failed (${result.error?.message || result.signal || result.status})`);
  }
}

function collectHashes(directory, prefix = '') {
  const result = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release blocked: symlink artifact ${name}`);
    if (entry.isDirectory()) Object.assign(result, collectHashes(path, name));
    else if (entry.isFile()) result[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
  return result;
}

try {
  // No .env is loaded here. CI/deployment must supply a separate fresh database.
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('Release blocked: TEST_DATABASE_URL is required');
  if (!process.env.DATABASE_URL) throw new Error('Release blocked: a distinct DATABASE_URL guard value is required');
  const parsed = new URL(testUrl.replace('postgresql+asyncpg:', 'postgresql:'));
  if (parsed.protocol !== 'postgresql:' || !parsed.pathname.toLowerCase().includes('test')) {
    throw new Error('Release blocked: PostgreSQL database name must contain test');
  }
  if (process.env.DATABASE_URL === testUrl) throw new Error('Release blocked: app and test database must differ');
  if (existsSync(join(repository, 'back', '.env')) && process.env.CI) {
    throw new Error('Release blocked: CI candidate contains a production .env');
  }
  // The miniapp is served by the same API origin at /s/{studio_ref}. Empty
  // explicitly overrides Vite's ignored .env and the localhost dev fallback.
  const publicApi = process.env.MINIAPP_PUBLIC_API_URL || '';
  if (publicApi) {
    const publicUrl = new URL(publicApi);
    if (publicUrl.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(publicUrl.hostname) || publicUrl.username || publicUrl.password) {
      throw new Error('Release blocked: public API URL must be HTTPS without credentials or loopback host');
    }
  }
  mkdirSync(evidence, { recursive: true });
  for (const name of ['release.json', 'backend.xml', 'browser.xml', 'browser-results', 'miniapp-dist']) {
    rmSync(join(evidence, name), { recursive: true, force: true });
  }
  run(python, [join(repository, 'scripts', 'test_release_artifacts.py')], repository);
  run(python, [join(repository, 'scripts', 'test_deploy_gate.py')], repository);
  run(npm, ['run', 'test:checks'], miniapp);
  run(npm, ['run', 'lint'], miniapp);
  run(npm, ['run', 'build'], miniapp, { VITE_API_URL: publicApi });
  const backend = join(repository, 'back');
  run(python, ['-m', 'scripts.init_test_db'], backend);
  const selection = /^test_(miniapp_|public_|resource_|hybrid_|booking_|reservation_|lesson_|checkout_|cancel_|certificate_|subscription_|service_|staff_|notifier(?:_|\.)|notification_|mailer_|gift_|promo_|loyalty_|points_|referral_|i18n_coverage|email|smtp|login_sessions|profile_sessions|test_environment_isolation)/;
  // These schedule inputs also determine whether a published lesson or online
  // specialist slot may overlap a staff block or fall outside working hours.
  const scheduleInputs = new Set(['test_working_hours_gate.py', 'test_studio_time.py']);
  const tests = readdirSync(join(backend, 'tests')).filter(name =>
    name.endsWith('.py') && (selection.test(name) || scheduleInputs.has(name))).sort();
  for (const required of ['test_miniapp_journey.py', 'test_miniapp_email_auth.py', 'test_miniapp_checkout.py', 'test_mailer_guard.py']) {
    if (!tests.includes(required)) throw new Error(`Release blocked: required suite ${required} is missing`);
  }
  writeFileSync(join(evidence, 'backend-selection.json'), JSON.stringify(tests, null, 2));
  const testTemp = mkdtempSync(join(evidence, 'backend-temp-'));
  run(python, ['-m', 'pytest', ...tests.map(name => `tests/${name}`), '-k', 'not browser_server', '-q', '-rA', '--maxfail=1', '-p', 'no:cacheprovider', `--basetemp=${testTemp}`, '--strict-markers', '--strict-config', `--junitxml=${join(evidence, 'backend.xml')}`], backend);
  run(python, [join(repository, 'scripts', 'release_artifacts.py'), 'junit', join(evidence, 'backend.xml')], repository);
  run(npm, ['run', 'test:browser', '--', '--reporter=list,junit', `--output=${join(evidence, 'browser-results')}`], miniapp, {
    MINIAPP_E2E_PYTHON: python, PLAYWRIGHT_JUNIT_OUTPUT_FILE: join(evidence, 'browser.xml'),
  });
  run(python, [join(repository, 'scripts', 'release_artifacts.py'), 'junit', join(evidence, 'browser.xml')], repository);
  const sha = process.env.MINIAPP_RELEASE_SHA;
  if (sha && !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Release blocked: invalid exact candidate SHA');
  cpSync(join(miniapp, 'dist'), join(evidence, 'miniapp-dist'), { recursive: true });
  const files = collectHashes(join(evidence, 'miniapp-dist'));
  if (!files['index.html']) throw new Error('Release blocked: build produced no index.html');
  writeFileSync(join(evidence, 'release.json'), JSON.stringify({ sha: sha || null, publicApi, checkedAt: new Date().toISOString(), files }, null, 2));
  console.log(`\nMiniapp release checks passed. Evidence: ${evidence}`);
} catch (error) {
  rmSync(join(evidence, 'release.json'), { force: true });
  console.error(error.message);
  process.exitCode = 1;
}

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
function discover(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) discover(path);
    else if (entry.name.endsWith('.check.ts') ||
      (directory === join(root, 'scripts') && (/^check-.*\.mjs$/.test(entry.name) || entry.name.endsWith('.test.mjs')))) {
      checks.push(path);
    }
  }
}
discover(root);
if (checks.length < 2) throw new Error('No miniapp self-checks discovered');
for (const path of checks.sort()) {
  console.log(`Checking ${relative(root, path)}`);
  // Existing recovery suites execute the real ES modules in vm.SourceTextModule.
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--import', './scripts/strict-assert.mjs', path], {
    cwd: root, stdio: 'inherit', timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Passed ${checks.length} miniapp self-check files`);

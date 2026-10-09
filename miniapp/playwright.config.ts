import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const backend = resolve(import.meta.dirname, '../back');
const python = process.env.MINIAPP_E2E_PYTHON ??
  (existsSync(resolve(backend, 'venv/Scripts/python.exe')) ? resolve(backend, 'venv/Scripts/python.exe') : 'python');
const apiPort = process.env.MINIAPP_E2E_API_PORT ?? '8017';
const apiURL = `http://127.0.0.1:${apiPort}`;
const previewPort = process.env.MINIAPP_E2E_PREVIEW_PORT ?? '4174';
const previewURL = `http://127.0.0.1:${previewPort}`;
const browserChannel = process.env.MINIAPP_E2E_BROWSER_CHANNEL;

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: previewURL, locale: 'en-US', timezoneId: 'America/New_York',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    ...(browserChannel ? { channel: browserChannel } : {}),
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    {
      command: `"${python}" -m pytest -s -q tests/test_miniapp_journey.py -k browser_server`,
      cwd: backend,
      url: `${apiURL}/__test/health`,
      env: { MINIAPP_BROWSER_SERVER: '1', MINIAPP_E2E_API_PORT: apiPort, MINIAPP_E2E_PREVIEW_PORT: previewPort },
      reuseExistingServer: false, timeout: 90_000,
    },
    {
      command: 'node scripts/browser-preview.mjs',
      url: previewURL,
      env: { MINIAPP_E2E_PREVIEW_PORT: previewPort },
      reuseExistingServer: false, timeout: 60_000,
    },
  ],
});

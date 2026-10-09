import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

export const apiURL = `http://127.0.0.1:${process.env.MINIAPP_E2E_API_PORT ?? '8017'}`;
const previewOrigin = `http://127.0.0.1:${process.env.MINIAPP_E2E_PREVIEW_PORT ?? '4174'}`;
export type Studio = {
  studio: number; code: string; day: string; today: string; email: string; client: number;
  anna: number; boris: number; central: number; riverside: number;
  haircut: number; massage: number; yoga: number; lesson: number; package: number;
};

export const test = base.extend<{ studio: Studio; safeNetwork: void }>({
  studio: async ({ request }, provide) => {
    const response = await request.post(`${apiURL}/__test/reset`);
    expect(response.ok(), await response.text()).toBeTruthy();
    await provide(await response.json());
  },
  safeNetwork: [async ({ context }, provide) => {
    await context.addInitScript(() => {
      localStorage.setItem('velora.lang', 'en');
      localStorage.setItem('i18nextLng', 'en');
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const global = url.pathname.indexOf('/global/');
      if (global !== -1 || url.pathname.endsWith('/presence/beat')) {
        // Test the unchanged production bundle, forwarding only its API traffic
        // to the real local HTTP/PostgreSQL/SMTP fixture.
        const path = global !== -1 ? url.pathname.slice(global) : '/presence/beat';
        try {
          // The test proxy must not reuse sockets across uvicorn's idle close.
          // A fresh loopback connection avoids ECONNRESET without retrying API
          // failures or changing the browser application's request behavior.
          const response = await route.fetch({
            url: `${apiURL}${path}${url.search}`, timeout: 35_000,
            headers: { ...route.request().headers(), connection: 'close' },
          });
          await route.fulfill({ response });
        } catch {
          // Navigation may dispose the original request between fetch and
          // fulfill. It is already handled then; abort only a live request.
          await route.abort('failed').catch((error: unknown) => {
            if (!/already handled|has been closed/i.test(String(error))) throw error;
          });
        }
      } else if (url.origin === previewOrigin) {
        await route.continue();
      } else {
        await route.abort('blockedbyclient');
      }
    });
    await provide();
  }, { auto: true }],
});
export { expect };

export const sheet = (page: Page) => page.locator('.app-sheet:not([aria-hidden="true"]):not([inert])').last();

export async function capturedCode(request: APIRequestContext, email: string) {
  const response = await request.get(`${apiURL}/__test/mail`, { params: { email } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const message = await response.json();
  expect(message.db_connections_at_send).toBe(0);
  expect(message.code).toMatch(/^\d{6}$/);
  expect(message.subject).toContain('Journey Studio');
  return message.code as string;
}

export async function signIn(page: Page, request: APIRequestContext, studio: Studio, email = studio.email, name?: string) {
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByPlaceholder('000000')).toBeVisible();
  if (name) await page.getByPlaceholder("What's your name?").fill(name);
  await page.getByPlaceholder('000000').fill(await capturedCode(request, email));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByPlaceholder('000000')).toHaveCount(0);
}

export async function apiSignIn(page: Page, request: APIRequestContext, studio: Studio) {
  const code = await request.post(`${apiURL}/global/auth/email/request`, {
    data: { studio_id: studio.code, email: studio.email },
  });
  expect(code.status()).toBe(202);
  const auth = await request.post(`${apiURL}/global/auth/email/verify`, {
    data: { studio_id: studio.code, email: studio.email, code: await capturedCode(request, studio.email) },
  });
  expect(auth.ok(), await auth.text()).toBeTruthy();
  const data = await auth.json();
  await page.goto(`/s/${studio.code}`);
  await page.evaluate(({ token, name }) => {
    const session = { token, name };
    localStorage.setItem('velora.session', JSON.stringify(session));
    localStorage.setItem('velora.accounts', JSON.stringify([session]));
  }, { token: data.token, name: data.user.name });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Journey Studio' })).toBeVisible();
  return data.token as string;
}

export async function openBooking(page: Page, start: 'Time' | 'Service' | 'Specialist', mode = 'One-to-one') {
  await page.locator('.home-start').filter({ hasText: new RegExp(`^${start}`) }).click();
  await page.getByRole('button', { name: new RegExp(`^${mode}`) }).click();
  await expect(sheet(page)).toBeVisible();
}

export async function chooseStep(page: Page, label: string) {
  await sheet(page).locator('nav').getByRole('button', { name: new RegExp(`^${label}`, 'i') }).click();
}

export async function chooseResource(page: Page, studio: Studio, start: 'Time' | 'Service' | 'Specialist') {
  const actions = {
    Time: async () => {
      await chooseStep(page, 'Time');
      await sheet(page).locator(`[data-day="${studio.day}"]`).click();
      await sheet(page).getByRole('button', { name: '10:00', exact: true }).click();
    },
    Service: async () => {
      await chooseStep(page, 'Service');
      await sheet(page).getByRole('button', { name: /^Haircut/ }).click();
    },
    Specialist: async () => {
      await chooseStep(page, 'Specialist');
      await sheet(page).getByRole('button', { name: /\bAnna\b/ }).click();
    },
  };
  const order = [start, ...(['Time', 'Service', 'Specialist'] as const).filter((item) => item !== start)];
  for (const item of order) await actions[item]();
  await chooseStep(page, 'Summary');
  await sheet(page).getByRole('button', { name: 'Central', exact: true }).click();
  await expect(sheet(page).getByRole('button', { name: 'Book', exact: true })).toBeEnabled();
}

export async function bookings(request: APIRequestContext) {
  const response = await request.get(`${apiURL}/__test/bookings`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

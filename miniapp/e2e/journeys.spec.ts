import { test, expect, apiURL, apiSignIn, signIn, capturedCode, sheet,
  openBooking, chooseResource, bookings, chooseStep } from './fixtures';

test('studio link opens the guest catalogue; private tabs require login and cancel returns home', async ({ page, studio }) => {
  await page.goto('/');
  await expect(page.getByText('A studio link is needed')).toBeVisible();
  await page.goto(`/s/${studio.code}?tab=my`);
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Journey Studio' })).toBeVisible();
  await expect(page.locator('.home-start')).toHaveCount(3);
  await page.reload();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
});

test('real delivered email, wrong code, correction, session persistence and logout', async ({ page, request, studio }) => {
  await page.goto(`/s/${studio.code}?tab=prof`);
  await page.getByPlaceholder('you@example.com').fill(studio.email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByPlaceholder('000000')).toBeVisible();
  const code = await capturedCode(request, studio.email);
  await page.getByPlaceholder('000000').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Неверный или истёкший код')).toBeVisible();
  await page.getByPlaceholder('000000').fill(code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(studio.email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(studio.email, { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toHaveCount(0);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('velora.session'))).toBeNull();
});

test('SMTP refusal stays on email step and a second attempt really delivers', async ({ page, request, studio }) => {
  await page.goto(`/s/${studio.code}?tab=prof`);
  await request.post(`${apiURL}/__test/mail/reject`);
  await page.getByPlaceholder('you@example.com').fill(studio.email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByText(/Could not send the code|Couldn't send the code/)).toBeVisible();
  await expect(page.getByPlaceholder('000000')).toHaveCount(0);
  await signIn(page, request, studio);
  await expect(page.getByText(studio.email, { exact: true })).toBeVisible();
});

test('expired code can be resent and the fresh code signs in', async ({ page, request, studio }) => {
  await page.goto(`/s/${studio.code}?tab=my`);
  await page.getByPlaceholder('you@example.com').fill(studio.email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await expect(page.getByPlaceholder('000000')).toBeVisible();
  const expired = await capturedCode(request, studio.email);
  await request.post(`${apiURL}/__test/otp/expire`, { data: { email: studio.email } });
  await page.getByPlaceholder('000000').fill(expired);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Неверный или истёкший код')).toBeVisible();
  await page.getByRole('button', { name: 'Change email', exact: true }).click();
  await signIn(page, request, studio);
  await expect(page.getByText('Nothing in this period')).toBeVisible();
});

test('stalled code request has a visible deadline and retry is enabled', async ({ page, studio }) => {
  await page.clock.install();
  await page.goto(`/s/${studio.code}?tab=prof`);
  await page.route('**/global/auth/email/request*', () => {});
  await page.getByPlaceholder('you@example.com').fill(studio.email);
  await page.getByRole('button', { name: 'Send code', exact: true }).click();
  await page.clock.fastForward(31_000);
  await expect(page.getByText('The server did not respond in time. Check your connection and try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send code', exact: true })).toBeEnabled();
  await expect(page.getByPlaceholder('000000')).toHaveCount(0);
});

for (const start of ['Time', 'Service', 'Specialist'] as const) {
  test(`booking starting with ${start} persists chosen service, specialist, location and studio time`, async ({ page, request, studio }) => {
    await apiSignIn(page, request, studio);
    await openBooking(page, start);
    await chooseResource(page, studio, start);
    await sheet(page).getByRole('button', { name: 'Book', exact: true }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Done', exact: true })).toBeVisible();
    const rows = await bookings(request);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'active', client_id: studio.client, service: studio.haircut,
      teacher: studio.anna, branch: studio.central, time: `${studio.day}T10:00:00` });
    await sheet(page).getByRole('button', { name: 'My bookings', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Haircut/ })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'My Lessons', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Haircut/ })).toBeVisible();
    await page.getByRole('button', { name: /^Haircut/ }).click();
    await sheet(page).getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await expect.poll(async () => (await bookings(request))[0].status).toBe('cancelled');
  });
}

test('guest selected booking survives email registration and confirms once', async ({ page, request, studio }) => {
  await page.goto(`/s/${studio.code}`);
  await openBooking(page, 'Service');
  await chooseResource(page, studio, 'Service');
  await sheet(page).getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await signIn(page, request, studio, `new-${studio.code}@miniapp-fixture.net`, 'New Guest');
  await expect(sheet(page)).toContainText('Haircut');
  await expect(sheet(page)).toContainText('Anna');
  await expect(sheet(page).getByRole('button', { name: 'Central', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Email login resumes the chosen quote. The customer confirms its terms
  // after signing in; authentication itself does not create a reservation.
  expect(await bookings(request)).toHaveLength(0);
  await sheet(page).getByRole('button', { name: 'Book', exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Done', exact: true })).toBeVisible();
  expect(await bookings(request)).toHaveLength(1);
  expect((await bookings(request))[0]).toMatchObject({ service: studio.haircut, teacher: studio.anna,
    branch: studio.central, time: `${studio.day}T10:00:00` });
});

test('booking failure shows error, saves nothing and retry confirms exactly once', async ({ page, request, studio }) => {
  await apiSignIn(page, request, studio);
  await openBooking(page, 'Service');
  await chooseResource(page, studio, 'Service');
  let failed = false;
  await page.route('**/global/bookings*', async (route) => {
    if (route.request().method() === 'POST' && !failed) {
      failed = true;
      await route.fulfill({ status: 503, json: { detail: { code: 'UNKNOWN', message: 'Booking unavailable' } } });
    } else await route.fallback();
  });
  await sheet(page).getByRole('button', { name: 'Book', exact: true }).click();
  await expect(sheet(page).getByRole('status')).toContainText('Could not create the booking');
  expect(await bookings(request)).toHaveLength(0);
  await sheet(page).getByRole('button', { name: 'Book', exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Done', exact: true })).toBeVisible();
  expect(await bookings(request)).toHaveLength(1);
});

test('group QR link selects the lesson and persists the selected mat', async ({ page, request, studio }) => {
  await apiSignIn(page, request, studio);
  await page.goto(`/s/${studio.code}?lesson=${studio.lesson}&d=${studio.day}`);
  await expect(sheet(page).getByText('Choose a spot', { exact: true })).toBeVisible();
  await sheet(page).getByRole('button', { name: '3', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Book', exact: true }).click();
  await expect.poll(async () => (await bookings(request)).length).toBe(1);
  expect((await bookings(request))[0]).toMatchObject({ lesson: studio.lesson, spot: 3, status: 'active' });
});

test('service and specialist QR links open the correct resource wizard', async ({ page, studio }) => {
  await page.goto(`/s/${studio.code}?service=${studio.massage}&staff=${studio.anna}`);
  await expect(sheet(page).getByText('When suits you?', { exact: true })).toBeVisible();
  await sheet(page).locator(`[data-day="${studio.day}"]`).click();
  await sheet(page).getByRole('button', { name: '10:00', exact: true }).click();
  await chooseStep(page, 'Summary');
  await expect(sheet(page)).toContainText('Massage');
  await expect(sheet(page)).toContainText('Anna');
});

test('rapid service selection and immediate time navigation always render the active step', async ({ page, studio }) => {
  await page.clock.install({ time: new Date() });
  for (const elapsed of [180, 220, 250]) {
    await test.step(`switch to Time after ${elapsed}ms of the outgoing step`, async () => {
      await page.clock.resume();
      await page.goto(`/s/${studio.code}`);
      await openBooking(page, 'Service');
      await expect(sheet(page).getByRole('button', { name: /^Haircut/ })).toBeVisible();
      const browserNow = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(new Date(browserNow + 1_000));
      // Exercise the rendered controls around the 220ms exit boundary. Do not
      // wait for the automatically chosen Specialist step before navigating.
      await sheet(page).getByRole('button', { name: /^Haircut/ }).dispatchEvent('click');
      await page.clock.runFor(elapsed);
      await sheet(page).locator('nav').getByRole('button', { name: /^Time/i }).dispatchEvent('click');
      await page.clock.runFor(1_000);
      await expect(sheet(page).getByRole('heading', { name: 'When suits you?', exact: true })).toBeVisible();
      await expect(sheet(page).locator(`[data-day="${studio.day}"]`)).toBeVisible({ timeout: 2_000 });
    });
  }
});

test('profile, membership purchase, notification persistence, history, support and club load real data', async ({ page, request, studio }) => {
  const token = await apiSignIn(page, request, studio);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByText(studio.email, { exact: true })).toBeVisible();
  const before = await request.get(`${apiURL}/global/me`, { headers: { Authorization: `Bearer ${token}` } });
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect.poll(async () => (await (await request.get(`${apiURL}/global/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json()).notifs_enabled).toBe(!(await before.json()).notifs_enabled);
  await page.getByRole('button', { name: 'Payment History', exact: true }).click();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Studio Support', exact: true }).click();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /^Buy Subscription/ }).click();
  await expect(sheet(page)).toContainText('Fixture Pass');
  await sheet(page).getByRole('button', { name: /^Fixture Pass/ }).click();
  await sheet(page).getByRole('button', { name: /^Pay/ }).click();
  const confirm = sheet(page).getByRole('button', { name: 'Confirm', exact: true });
  await expect(confirm).toBeEnabled();
  const activated = page.waitForEvent('dialog');
  await confirm.click();
  const dialog = await activated;
  expect(dialog.message()).toBe('Subscription activated');
  await dialog.accept();
  await expect(confirm).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`${apiURL}/global/me/subscriptions`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json()).length).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Club', exact: true }).click();
  await expect(page.getByText('Journey Club', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('25', { exact: true })).toBeVisible();
});

import { test, expect, apiURL, apiSignIn, sheet, openBooking, chooseResource, bookings } from './fixtures';

for (const outcome of ['cancel', 'back', 'paid', 'unavailable'] as const) {
  test(`new online booking redirects once to Stripe and handles ${outcome} from server truth`, async ({ page, request, studio }) => {
    // Cancel covers two Stripe round trips and then a venue booking.
    test.setTimeout(90_000);
    await request.post(`${apiURL}/__test/booking-settings`, {
      data: { prepay_required: false, can_pay_online: true, service_price: 450 },
    });
    await apiSignIn(page, request, studio);
    await page.route('https://checkout.stripe.com/**', async route => {
      const session = route.request().url().split('/').at(-1);
      // A stale keep-alive socket may reset while navigating between origins.
      // Retry only this read of the isolated fixture, never the payment POST.
      const response = await request.get(`${apiURL}/__test/checkout-urls/${session}`, { maxRetries: 2 });
      expect(response.ok()).toBeTruthy();
      const urls = await response.json();
      await route.fulfill({ contentType: 'text/html',
        body: `<h1>Isolated Stripe form</h1><a href="${urls.cancel_url}">Cancel</a><a href="${urls.success_url}">Return after payment</a>` });
    });
    await openBooking(page, 'Time');
    await chooseResource(page, studio, 'Time', 'Pay');
    await sheet(page).getByRole('button', { name: 'Pay', exact: true }).click();
    await expect(sheet(page).getByRole('heading', { name: 'How would you like to pay?' })).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: /^Online/ })).toHaveAttribute('aria-pressed', 'true');
    const go = sheet(page).getByRole('button', { name: /^Go to payment/ });
    await expect(go).toBeEnabled();
    if (process.env.MINIAPP_REVIEW_SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.MINIAPP_REVIEW_SCREENSHOT_DIR}/${test.info().project.name}-payment-choice.png` });
    }
    await go.click();
    await expect(page.getByRole('heading', { name: 'Isolated Stripe form' })).toBeVisible();
    const rows = await bookings(request);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('hold');
    expect((await (await request.get(`${apiURL}/__test/payment-ledger`)).json()).income).toEqual([]);
    if (outcome === 'paid') {
      await request.post(`${apiURL}/__test/confirm-stripe-payment`, { data: { reservation_id: rows[0].id } });
      await page.getByRole('link', { name: 'Return after payment' }).click();
      await expect(page.getByRole('heading', { name: 'Payment complete', exact: true })).toBeVisible();
      await expect.poll(async () => (await bookings(request))[0].status).toBe('active');
      await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage)
        .filter(key => key.startsWith('velora:booking-checkout:')))).toEqual([]);
      expect((await (await request.get(`${apiURL}/__test/payment-ledger`)).json()).income).toEqual([450]);
      await page.reload();
      expect((await (await request.get(`${apiURL}/__test/payment-ledger`)).json()).income).toEqual([450]);
    } else {
      if (outcome === 'unavailable') {
        await page.route('**/global/bookings/*/checkout-return*', route => route.fulfill({
          status: 503, json: { detail: { code: 'PAYMENT_UNAVAILABLE' } },
        }));
      }
      if (outcome === 'back') await page.goBack();
      else await page.getByRole('link', { name: 'Cancel', exact: true }).click();
      await expect(sheet(page).getByRole('heading', { name: 'How would you like to pay?' })).toBeVisible();
      await expect(sheet(page)).toContainText('Haircut');
      await expect(page.getByRole('heading', { name: 'Done', exact: true })).toHaveCount(0);
      if (outcome === 'unavailable') {
        await expect(sheet(page).getByText(/could not safely close/)).toBeVisible();
        await expect(sheet(page).getByRole('button', { name: /^At the studio/ })).toBeDisabled();
        expect((await bookings(request))[0].status).toBe('hold');
        await page.unroute('**/global/bookings/*/checkout-return*');
        await sheet(page).getByRole('button', { name: 'Check payment status', exact: true }).click();
      }
      await expect.poll(async () => (await bookings(request))[0].status).toBe('cancelled');
      await expect(sheet(page).getByRole('button', { name: /^Online/ })).toHaveAttribute('aria-pressed', 'true');
      if (outcome === 'cancel') {
        // A fresh online attempt must use a new form after the old one expired.
        await sheet(page).getByRole('button', { name: /^Go to payment/ }).click();
        await expect(page.getByRole('heading', { name: 'Isolated Stripe form' })).toBeVisible();
        const again = await bookings(request);
        expect(again.filter((row: { status: string }) => row.status === 'hold')).toHaveLength(1);
        expect(again).toHaveLength(2);
        await page.getByRole('link', { name: 'Cancel', exact: true }).click();
        await expect(sheet(page).getByRole('heading', { name: 'How would you like to pay?' })).toBeVisible();
        await expect.poll(async () => (await bookings(request)).filter((row: { status: string }) => row.status === 'hold').length).toBe(0);
      }
      await sheet(page).getByRole('button', { name: /^At the studio/ }).click();
      await sheet(page).getByRole('button', { name: /^Book · .* at the studio/ }).click();
      await expect(sheet(page).getByRole('heading', { name: 'Done', exact: true })).toBeVisible();
      const result = await bookings(request);
      expect(result.filter((row: { status: string }) => row.status === 'active')).toHaveLength(1);
      expect((await (await request.get(`${apiURL}/__test/payment-ledger`)).json()).income).toEqual([]);
    }
  });
}

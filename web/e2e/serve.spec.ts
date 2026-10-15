import { expect, test } from '@playwright/test';

test.describe('static server', () => {
  test('serves the app shell for an app route', async ({ request }) => {
    const res = await request.get('/org/Acme');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<app-root');
  });

  test('404s a missing asset instead of serving the app shell', async ({ request }) => {
    const res = await request.get('/main-doesnotexist.js');
    expect(res.status()).toBe(404);
  });
});

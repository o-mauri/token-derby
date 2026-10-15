import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';

const NOT_FOUND = { status: 404, body: { code: 'ORG_NOT_FOUND', message: 'No such org' } };

test.describe('fake API', () => {
  test('records API calls it has no fixture for, and the page still settles', async ({ page }) => {
    const api = await fakeApi(page, {});
    await page.goto('/org/Acme');
    await expect(page.locator('[data-page]').first()).toBeVisible();
    await expect.poll(() => api.unmatched).toContain('GET /api/organisations/Acme/races');
    api.unmatched.length = 0; // acknowledged, so the shared check passes
  });

  test('answers from fixtures and records the requests', async ({ page }) => {
    const api = await fakeApi(page, {
      'GET /api/organisations/Acme/races': NOT_FOUND,
      'GET /api/organisations/Acme/league/standings': NOT_FOUND,
    });
    await page.goto('/org/Acme');
    await expect(page.locator('td-not-found')).toBeVisible();
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toContain('GET /api/organisations/Acme/races');
  });
});

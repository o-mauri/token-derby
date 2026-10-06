import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';
import { accountRoutes } from './support/fixtures';
import { signIn } from './support/session';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

const signedOut = (page: import('@playwright/test').Page) => page.evaluate(() => localStorage.getItem('td_org_session') === null);

test('renames you', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page, accountRoutes());
  await page.goto('/account');
  await page.locator('input.name').fill('Omar Mauri');
  await page.locator('button.save').click();
  await expect(page.locator('.saved')).toHaveText('Saved.');
  expect(api.requests.find((r) => r.method === 'PUT')?.body).toEqual({ display_name: 'Omar Mauri' });
});

test('Sign out goes home signed out', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, accountRoutes());
  await page.goto('/account');
  await page.locator('button.signout:not(.signout-all)').click();
  await expect(page.locator('[data-page="home"] td-google-button')).toBeVisible();
  expect(await signedOut(page)).toBe(true);
});

test('Sign out of all browsers asks first, then signs out everywhere', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page, accountRoutes());
  await page.goto('/account');
  await page.locator('button.signout-all').click();
  await expect(page.locator('td-confirm .box')).toContainText('every other browser');
  await page.locator('td-confirm button.confirm').click();
  await expect(page.locator('[data-page="home"] td-google-button')).toBeVisible();
  expect(api.requests.some((r) => r.method === 'DELETE' && r.path === '/api/web-sessions/all')).toBe(true);
  expect(await signedOut(page)).toBe(true);
});

test('revokes a device after confirming', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page, accountRoutes());
  await page.goto('/account/devices');
  await page.getByRole('button', { name: 'Revoke old-laptop' }).click();
  await page.locator('td-confirm button.confirm').click();
  await expect(page.locator('td-device-list')).not.toContainText('old-laptop');
  expect(api.requests.some((r) => r.method === 'DELETE' && r.path === '/api/devices/d2')).toBe(true);
});

test('a 401 from the API signs you out', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, { ...accountRoutes(), 'GET /api/devices': { status: 401, body: { code: 'UNAUTHENTICATED', message: 'expired' } } });
  await page.goto('/account/devices');
  await expect(page.locator('td-google-button')).toBeVisible();
  expect(await signedOut(page)).toBe(true);
});

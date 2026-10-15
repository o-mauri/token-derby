import { expect } from '@playwright/test';
import { fakeApi, ok, test } from '../support/fake-api';
import { adminRoutes, adminSignIn } from './fixtures';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

test('signs in and lands on Users', async ({ page }) => {
  const api = await fakeApi(page, { ...adminRoutes(), 'POST /api/admin/login': ok({ token: 'tok', expires_at: new Date(Date.now() + 3_600_000).toISOString() }) });
  await page.goto('/users');
  await expect(page).toHaveURL('/login?return_to=%2Fusers');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('pw');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/users');
  await expect(page.locator('[data-page="users"] tbody tr')).toHaveCount(3);
  expect(api.requests.find((r) => r.path === '/api/admin/login')?.body).toEqual({ username: 'admin', password: 'pw' });
});

test('renames a jockey from their page', async ({ page }) => {
  await adminSignIn(page);
  const api = await fakeApi(page, adminRoutes());
  await page.goto('/users');
  await page.getByRole('link', { name: 'Omar' }).click();
  await expect(page).toHaveURL('/users/u1');
  await page.getByRole('button', { name: 'Rename jockey' }).click();
  await page.locator('.jockey input').fill('Omar M');
  await page.locator('.jockey button.save').click();
  await expect(page.locator('.jockey .name')).toHaveText('Omar M');
  await expect(page.locator('td-crumbs')).toContainText('Omar M');
  expect(api.requests.find((r) => r.method === 'PUT')?.body).toEqual({ display_name: 'Omar M' });
});

test('removes the hat shown after confirming', async ({ page }) => {
  await adminSignIn(page);
  const api = await fakeApi(page, adminRoutes());
  await page.goto('/users/u1');
  await page.locator('.horse').first().locator('button.hats-toggle').click();
  await page.locator('.hat').first().getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('td-confirm .box')).toContainText('Remove Cowboy Hat from Gallopz?');
  await page.locator('td-confirm button.confirm').click();
  await expect(page.locator('.horse').first().locator('.hat')).toHaveCount(1);
  expect(api.requests.some((r) => r.method === 'DELETE' && r.path === '/api/admin/users/u1/horses/h1/hats/1')).toBe(true);
});

test('generates a claim token', async ({ page }) => {
  await adminSignIn(page);
  await fakeApi(page, adminRoutes());
  await page.goto('/claims');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.locator('.result td-copy-field')).toContainText('NEWC-0DE1');
});

test('a 401 sends you back to login, remembering the page', async ({ page }) => {
  await adminSignIn(page);
  await fakeApi(page, { ...adminRoutes(), 'GET /api/admin/users': { status: 401, body: { code: 'UNAUTHENTICATED', message: 'expired' } } });
  await page.goto('/users/u1');
  await expect(page).toHaveURL('/login?return_to=%2Fusers%2Fu1');
});

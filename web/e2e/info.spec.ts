import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

test('catalog tabs keep the chosen horse', async ({ page }) => {
  await fakeApi(page, {});
  await page.goto('/catalog/rare?horse=grey');
  await page.locator('td-tabs a', { hasText: 'Epic' }).click();
  await expect(page).toHaveURL('/catalog/epic?horse=grey');
});

test('About lists the releases under the current versions', async ({ page }) => {
  await fakeApi(page, {});
  await page.goto('/about');
  await expect(page.locator('.versions')).toContainText('Site v');
  expect(await page.locator('li.entry').count()).toBeGreaterThan(0);
});

test('Privacy has its four sections', async ({ page }) => {
  await fakeApi(page, {});
  await page.goto('/privacy');
  await expect(page.locator('h2')).toHaveText(['What is stored', 'What is not stored', 'Sharing', 'Deletion']);
});

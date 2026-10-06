import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';
import { PREVIEW_JOIN_CODE, notFound, raceRoutes } from './support/fixtures';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

test('a finished race shows its results', async ({ page }) => {
  await fakeApi(page, raceRoutes('finished'));
  await page.goto(`/race/${PREVIEW_JOIN_CODE}`);
  await expect(page.locator('td-finished')).toBeVisible();
});

test('a pending race shows the countdown', async ({ page }) => {
  await fakeApi(page, raceRoutes('pending'));
  await page.goto(`/race/${PREVIEW_JOIN_CODE}`);
  await expect(page.locator('td-pending-banner')).toBeVisible();
});

test('an unknown race shows not-found', async ({ page }) => {
  await fakeApi(page, { 'GET /api/races/ZZZ999': notFound('RACE_NOT_FOUND', 'Race not found') });
  await page.goto('/race/ZZZ999');
  await expect(page.locator('td-not-found')).toBeVisible();
});

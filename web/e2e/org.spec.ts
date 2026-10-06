import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';
import { PREVIEW_ORG, notFound, orgRoutes } from './support/fixtures';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

test('the dashboard renders from its races and standings', async ({ page }) => {
  await fakeApi(page, orgRoutes());
  await page.goto(`/org/${PREVIEW_ORG}`);
  await expect(page.locator('[data-page="org"] td-crumbs')).toContainText(PREVIEW_ORG);
  await expect(page.locator('td-loader')).toHaveCount(0);
});

test('the races tab lists races and the league tab shows standings', async ({ page }) => {
  await fakeApi(page, orgRoutes());
  await page.goto(`/org/${PREVIEW_ORG}/races`);
  await expect(page.locator('[data-page="org-races"] td-race-list')).toBeVisible();
  await page.goto(`/org/${PREVIEW_ORG}/league`);
  await expect(page.locator('[data-page="org-league"] td-league-table').first()).toBeVisible();
});

test('an unknown org shows not-found naming it', async ({ page }) => {
  await fakeApi(page, {
    'GET /api/organisations/Nope/races': notFound('ORG_NOT_FOUND'),
    'GET /api/organisations/Nope/league/standings': notFound('ORG_NOT_FOUND'),
  });
  await page.goto('/org/Nope');
  await expect(page.locator('td-not-found')).toContainText('Nope');
});

test('a slow org shows the loader, then the dashboard', async ({ page }) => {
  const routes = orgRoutes();
  const races = `GET /api/organisations/${PREVIEW_ORG}/races`;
  const answer = routes[races];
  if (!answer || typeof answer === 'function') throw new Error(`${races} must be a plain fixture`);
  await fakeApi(page, { ...routes, [races]: { ...answer, delayMs: 1500 } });
  await page.goto(`/org/${PREVIEW_ORG}`);
  await expect(page.locator('td-loader')).toBeVisible();
  await expect(page.locator('td-loader')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('[data-page="org"] td-crumbs')).toContainText(PREVIEW_ORG);
});

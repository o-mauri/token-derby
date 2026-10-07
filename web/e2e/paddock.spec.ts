import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';
import { paddockRoutes, myOrgs } from './support/fixtures';
import { signIn } from './support/session';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

test('shows your totals and your stable', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, paddockRoutes());
  await page.goto('/paddock');
  await expect(page.locator('.career .name')).toHaveText('Omar');
  await expect(page.locator('.career .total').first()).toContainText('2');
  await expect(page.locator('.stable .horse .name')).toHaveText(['Gallopz', 'Comet']);
  await expect(page.locator('td-panel.trophies')).toContainText('Coming soon');
});

test("opens a horse's hats", async ({ page }) => {
  await signIn(page);
  await fakeApi(page, paddockRoutes());
  await page.goto('/paddock');
  await page.getByRole('button', { name: 'Hats for Gallopz' }).click();
  await expect(page.locator('.hats .hat-name')).toHaveText(['Cowboy Hat', 'Party Hat']);
  await expect(page.locator('.hats .hat').first().locator('.equipped')).toBeVisible();
});

test('says when you have no horses yet', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, paddockRoutes([]));
  await page.goto('/paddock');
  await expect(page.locator('.stable .empty')).toContainText('No horses yet.');
});

test('the home card opens your paddock', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, { ...myOrgs(), ...paddockRoutes() });
  await page.goto('/');
  await page.locator('td-you-card a').click();
  await expect(page).toHaveURL('/paddock');
  await expect(page.locator('[data-page="paddock"] .stable .horse')).toHaveCount(2);
});

test('every panel label fits on a 1366×768 laptop', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, paddockRoutes());
  await page.goto('/paddock');
  await expect(page.locator('.stable .horse').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const clipped = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-page="paddock"] td-panel .spine')]
    .filter((s) => s.scrollHeight > s.clientHeight + 1).map((s) => `${s.textContent?.trim()} ${s.scrollHeight}/${s.clientHeight}`));
  expect(clipped).toEqual([]);
});

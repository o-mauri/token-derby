import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';
import { meRoutes, myOrgs } from './support/fixtures';
import { signIn } from './support/session';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

test('shows your totals and your stable', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, meRoutes());
  await page.goto('/me');
  await expect(page.locator('.you .name')).toHaveText('Omar');
  await expect(page.locator('.you .total').first()).toContainText('2');
  await expect(page.locator('.stable .horse .name')).toHaveText(['Gallopz', 'Comet']);
  await expect(page.locator('td-panel.trophies')).toContainText('Coming soon');
});

test("opens a horse's hats", async ({ page }) => {
  await signIn(page);
  await fakeApi(page, meRoutes());
  await page.goto('/me');
  await page.getByRole('button', { name: 'Hats for Gallopz' }).click();
  await expect(page.locator('.hats .hat-name')).toHaveText(['Cowboy Hat', 'Party Hat']);
  await expect(page.locator('.hats .hat').first().locator('.equipped')).toBeVisible();
});

test('says when you have no horses yet', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, meRoutes([]));
  await page.goto('/me');
  await expect(page.locator('.stable .empty')).toContainText('No horses yet.');
});

test('the home card opens your page', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, { ...myOrgs(), ...meRoutes() });
  await page.goto('/');
  await page.locator('td-you-card a').click();
  await expect(page).toHaveURL('/me');
  await expect(page.locator('[data-page="me"] .stable .horse')).toHaveCount(2);
});

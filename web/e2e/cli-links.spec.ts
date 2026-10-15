import { expect, type Page } from '@playwright/test';
import type { WebSessionExchangeResponse } from '@token-derby/shared';
import { fakeApi, ok, test, type Routes } from './support/fake-api';
import { myOrgs } from './support/fixtures';

// The site pages the CLI opens, each with the one-time `#code=` it appends to sign you in.
test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

const exchange: Routes = {
  'POST /api/web-sessions/exchange': ok<WebSessionExchangeResponse>({
    token: 'e2e', expires_at: new Date(Date.now() + 86_400_000).toISOString(), user: { user_id: 'u1', display_name: 'Omar' },
  }),
};
const signedIn = (page: Page) => page.evaluate(() => localStorage.getItem('td_org_session'));

test('`token-derby web` signs you in on the home page', async ({ page }) => {
  await fakeApi(page, { ...exchange, ...myOrgs() });
  await page.goto('/#code=grant-1');
  await expect(page.locator('[data-page="home"] td-you-card')).toContainText('Omar');
  expect(await signedIn(page)).toBe('e2e');
});

test('older CLIs opening /org-manager still land home signed in', async ({ page }) => {
  await fakeApi(page, { ...exchange, ...myOrgs() });
  await page.goto('/org-manager#code=grant-1');
  await expect(page).toHaveURL('/');
  await expect(page.locator('[data-page="home"] td-you-card')).toContainText('Omar');
});

test('`token-derby login` opens the approve page signed in', async ({ page }) => {
  await fakeApi(page, exchange);
  await page.goto('/cli#code=grant-1');
  await expect(page.locator('[data-page="cli"] td-code-input')).toBeVisible();
  expect(await signedIn(page)).toBe('e2e');
});

test('`token-derby link` goes on to Google', async ({ page }) => {
  await fakeApi(page, { ...exchange, 'POST /api/auth/link/start': ok({ authorize_url: '/about?from=google' }) });
  await page.goto('/link#code=grant-1');
  await expect(page).toHaveURL('/about?from=google');
});

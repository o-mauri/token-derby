import { expect, test } from '@playwright/test';

test('v1 by default; the prompt and switch move to v2 and back on the same URL', async ({ page, context }) => {
  await page.goto('/about');
  await expect(page.locator('.v2-prompt')).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.reload();
  await expect(page.locator('.v2-prompt')).toHaveCount(0);

  await page.getByRole('switch', { name: /V2/ }).click();
  await page.waitForURL('**/about');
  await expect(page.locator('td-version-switch')).toBeVisible();

  await page.getByRole('switch', { name: /V2/ }).click();
  await page.waitForURL('**/about');
  await expect(page.locator('.v2-toggle')).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === 'td_site')).toBeUndefined();
});

test('the theme and a signed-in session carry across', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('td_theme', 'matrix');
    localStorage.setItem('td_theme_event', '2026-09-derby-reset');
    localStorage.setItem('td_org_session', 'tok');
    localStorage.setItem('td_org_uid', 'u1');
    localStorage.setItem('td_v2_prompt', 'done');
  });
  await context.addCookies([{ name: 'td_site', value: 'v2', url: 'http://localhost:4302' }]);
  await page.goto('/account');
  await expect(page.locator('[data-page]').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix');
});

test('the TV view stays v1 with the cookie set', async ({ page, context }) => {
  await context.addCookies([{ name: 'td_site', value: 'v2', url: 'http://localhost:4302' }]);
  await page.goto('/org/acme/live');
  await expect(page.locator('td-version-switch')).toHaveCount(0);
});

test('a v2-only link on v1 offers Try v2', async ({ page }) => {
  await page.goto('/paddock');
  await expect(page.getByRole('heading', { name: 'Only on the new site' })).toBeVisible();
  await expect(page.locator('#app').getByRole('button', { name: 'Try v2' })).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';

const ORIGIN = 'http://localhost:4302';

// Same-origin page files that failed or came back 4xx/5xx; the fake API's own 404s are ignored.
function failedFiles(page: Page): string[] {
  const bad: string[] = [];
  const ours = (url: string) => url.startsWith(ORIGIN) && !new URL(url).pathname.startsWith('/api/');
  page.on('requestfailed', (r) => { if (ours(r.url())) bad.push(`${r.url()} failed`); });
  page.on('response', (r) => { if (ours(r.url()) && r.status() >= 400) bad.push(`${r.url()} ${r.status()}`); });
  return bad;
}

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

test('the theme and a signed-in session carry across, both ways', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('td_theme', 'matrix');
    localStorage.setItem('td_theme_event', '2026-09-derby-reset');
    localStorage.setItem('td_org_session', 'tok');
    localStorage.setItem('td_org_uid', 'u1');
    localStorage.setItem('td_session_name', 'Omar');
    localStorage.setItem('td_session_expires', new Date(Date.now() + 6 * 86_400_000).toISOString());
    localStorage.setItem('td_v2_prompt', 'done');
  });
  await context.addCookies([{ name: 'td_site', value: 'v2', url: ORIGIN }]);
  await page.goto('/account');
  await expect(page.locator('[data-page]').first()).toBeVisible();
  await expect(page.getByText('Sign in to see your account')).toHaveCount(0);
  await expect(page.locator('td-account-menu')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix');
  expect(await page.evaluate(() => localStorage.getItem('td_org_session'))).toBe('tok');

  await page.getByRole('switch', { name: /V2/ }).click();
  await page.waitForURL('**/org-manager');
  await expect(page.locator('.v2-toggle')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix');
  expect(await page.evaluate(() => localStorage.getItem('td_org_session'))).toBe('tok');
});

test('sign-in returns to v2 when opted in', async ({ page, context }) => {
  await context.addCookies([{ name: 'td_site', value: 'v2', url: ORIGIN }]);
  await page.goto('/api/auth/google/start?return_to=%2Faccount');
  await page.waitForURL('**/account');
  await expect(page.locator('td-version-switch')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('td_org_session'))).toBe('tok');
  expect(new URL(page.url()).hash).toBe('');
});

test('sign-in returns to v1 by default', async ({ page }) => {
  await page.goto('/api/auth/google/start?return_to=%2Forg-manager');
  await page.waitForURL('**/org-manager');
  await expect(page.locator('.v2-toggle')).toBeVisible();
  await expect(page.locator('td-version-switch')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('td_org_session'))).toBe('tok');
  expect(new URL(page.url()).hash).toBe('');
});

test('the TV view stays v1 with the cookie set, its files included', async ({ page, context }) => {
  await context.addCookies([{ name: 'td_site', value: 'v2', url: ORIGIN }]);
  const bad = failedFiles(page);
  await page.goto('/org/acme/live');
  await expect(page.locator('body.tv')).toBeAttached(); // added by v1's main.js
  await expect(page.locator('#app > *').first()).toBeAttached();
  await expect(page.locator('app-root')).toHaveCount(0);
  await expect(page.locator('td-version-switch')).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(bad).toEqual([]);
});

test('an open v1 tab still loads v1 files after another tab opts in', async ({ page, context }) => {
  const bad = failedFiles(page);
  await page.goto('/about');
  await expect(page.locator('.v2-toggle')).toBeVisible();
  const files = await page.evaluate(() => [
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'), (s) => s.src),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet], link[rel=icon]'), (l) => l.href),
  ].filter((u) => u.startsWith(location.origin)));
  const before = await page.evaluate((urls) => Promise.all(urls.map((u) => fetch(u).then((r) => r.text()))), files);

  await context.addCookies([{ name: 'td_site', value: 'v2', url: ORIGIN }]);
  const after = await page.evaluate((urls) => Promise.all(urls.map((u) => fetch(u, { cache: 'no-store' })
    .then(async (r) => ({ status: r.status, body: await r.text() })))), files);
  expect(files.length).toBeGreaterThan(2);
  expect(after.map((r) => r.status)).toEqual(files.map(() => 200));
  expect(after.map((r) => r.body)).toEqual(before);
  expect(bad).toEqual([]);
});

test('an open v2 tab still loads its lazy pages after opting out', async ({ page, context }) => {
  await context.addCookies([{ name: 'td_site', value: 'v2', url: ORIGIN }]);
  const bad = failedFiles(page);
  await page.goto('/about');
  await expect(page.locator('td-version-switch')).toBeVisible();

  await context.clearCookies({ name: 'td_site' });
  await page.getByRole('link', { name: '← Home' }).click();
  await page.waitForURL(`${ORIGIN}/`);
  await expect(page.locator('app-root td-version-switch')).toBeVisible();
  await expect(page.locator('.v2-toggle')).toHaveCount(0);
  expect(bad).toEqual([]);
});

test('a v2-only link on v1 offers Try v2', async ({ page }) => {
  await page.goto('/paddock');
  await expect(page.getByRole('heading', { name: 'Only on the new site' })).toBeVisible();
  await expect(page.locator('#app').getByRole('button', { name: 'Try v2' })).toBeVisible();
});

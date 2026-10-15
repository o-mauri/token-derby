import { expect } from '@playwright/test';
import { fakeApi, test } from '../support/fake-api';
import { USERS, adminRoutes, adminSignIn } from './fixtures';
import { ok } from '../support/fake-api';

const PAGES = ['/login', '/users', '/users/u1', '/organisations', '/claims'];

for (const path of PAGES) {
  test(`${path} fits the screen`, async ({ page, isMobile }, info) => {
    if (path !== '/login') await adminSignIn(page);
    await fakeApi(page, adminRoutes());
    await page.goto(path);
    await expect(page.locator('[data-page]').last()).toBeVisible();
    await expect(page.locator('td-loader')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => ({ innerWidth, innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }));
    if (isMobile) expect(m.innerWidth, 'viewport stays at device width').toBe(info.project.use.viewport?.width);
    expect(m.sw, 'no sideways scroll').toBeLessThanOrEqual(m.innerWidth);
    if (!isMobile) expect(m.sh, 'no page scroll on desktop').toBeLessThanOrEqual(m.innerHeight);
  });
}

test('a confirm on a scrolled phone page covers the screen and keeps your place', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only');
  await adminSignIn(page);
  const horse = USERS.users[0]!.horses[0]!;
  const many = { users: [{ ...USERS.users[0]!, horses: [1, 2, 3, 4, 5, 6].map((n) => ({ ...horse, stable_horse_id: `h${n}`, name: `Horse ${n}` })) }] };
  await fakeApi(page, { ...adminRoutes(), 'GET /api/admin/users': ok(many) });
  await page.goto('/users/u1');
  const last = page.locator('.horse button.delete').last();
  await last.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(0);
  await last.click();
  const box = await page.locator('td-confirm .backdrop, td-confirm .box').first().boundingBox();
  const after = await page.evaluate(() => scrollY);
  expect(Math.abs(after - before), 'page stays where it was').toBeLessThan(5);
  expect(box!.y, 'confirm is on screen').toBeGreaterThanOrEqual(0);
});

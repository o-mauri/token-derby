import { expect } from '@playwright/test';
import { fakeApi, test } from '../support/fake-api';
import { adminRoutes, adminSignIn } from './fixtures';

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

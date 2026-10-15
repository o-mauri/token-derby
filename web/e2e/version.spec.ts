import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';
import { PREVIEW_ORG, orgRoutes } from './support/fixtures';

test('the V2 switch clears the opt-in and leaves for the v1 page', async ({ page, context }) => {
  await context.addCookies([{ name: 'td_site', value: 'v2', url: 'http://localhost:4300' }]);
  await fakeApi(page, orgRoutes());
  await page.goto(`/org/${PREVIEW_ORG}/league`);
  const sw = page.getByRole('switch', { name: /V2/ });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await Promise.all([page.waitForURL(`**/org/${PREVIEW_ORG}`), sw.click()]);
  expect((await context.cookies()).find((c) => c.name === 'td_site')).toBeUndefined();
});

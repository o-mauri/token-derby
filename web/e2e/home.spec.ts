import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';
import { PREVIEW_ORG, memberOrgRoutes, myOrgs, orgRoutes } from './support/fixtures';
import { signIn } from './support/session';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

test('signed out, Find an org opens that org', async ({ page }) => {
  await fakeApi(page, orgRoutes());
  await page.goto('/');
  await expect(page.locator('td-google-button')).toBeVisible();
  await page.locator('td-go-box.org input').fill(PREVIEW_ORG);
  await page.locator('td-go-box.org button').click();
  await expect(page).toHaveURL(`/org/${PREVIEW_ORG}`);
  await expect(page.locator('[data-page="org"]')).toBeVisible();
});

test('signed in, shows you and your orgs, and opens one', async ({ page }) => {
  await signIn(page, { display_name: 'Omar' });
  await fakeApi(page, { ...myOrgs(), ...memberOrgRoutes() });
  await page.goto('/');
  await expect(page.locator('td-you-card')).toContainText('Omar');
  const list = page.locator('td-org-list');
  await expect(list).toContainText('NightOwls');
  await list.getByText(PREVIEW_ORG, { exact: true }).click();
  await expect(page).toHaveURL(`/org/${PREVIEW_ORG}`);
});

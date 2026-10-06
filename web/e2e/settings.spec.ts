import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';
import { PREVIEW_ORG, settingsRoutes } from './support/fixtures';
import { signIn } from './support/session';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

test('the owner reaches every settings tab from the dashboard', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, settingsRoutes(true));
  await page.goto(`/org/${PREVIEW_ORG}`);
  await page.locator('a.settings').click();
  await expect(page.locator('[data-tab="members"]')).toBeVisible();
  for (const [name, tab] of [['Access', 'access'], ['Racing', 'racing'], ['Race settings', 'race-settings'], ['Notifications', 'notifications']]) {
    await page.locator('td-tabs a', { hasText: name }).click();
    await expect(page.locator(`[data-tab="${tab}"]`)).toBeVisible();
  }
});

test('someone else is told only the owner can change settings', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, settingsRoutes(false));
  await page.goto(`/org/${PREVIEW_ORG}`);
  await expect(page.locator('[data-page="org"] td-crumbs')).toContainText(PREVIEW_ORG);
  await expect(page.locator('a.settings')).toHaveCount(0);
  await page.goto(`/org/${PREVIEW_ORG}/settings`);
  await expect(page.locator('.message')).toContainText('Only the owner');
});

test('leaving with an unsaved change asks first, and Stay keeps you there', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, settingsRoutes(true));
  await page.goto(`/org/${PREVIEW_ORG}/settings/race-settings`);
  await page.locator('td-modifier-card [role="switch"]').first().click();
  await expect(page.locator('[data-tab="race-settings"] button.save')).toBeEnabled();
  await page.locator('td-tabs a', { hasText: 'Members' }).click();
  await expect(page.locator('td-confirm .box')).toBeVisible();
  await page.locator('td-confirm button.cancel').click();
  await expect(page).toHaveURL(`/org/${PREVIEW_ORG}/settings/race-settings`);
});

import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';
import { cliApproved } from './support/fixtures';
import { signIn } from './support/session';

test.beforeEach(({ isMobile }) => test.skip(isMobile, 'behaviour runs on desktop'));

async function enterCode(page: import('@playwright/test').Page, code: string) {
  await page.locator('td-code-input input').first().click();
  await page.keyboard.type(code);
  await page.locator('button.lookup').click();
}

test('looks up a code, then approves that device', async ({ page }) => {
  await signIn(page);
  const api = await fakeApi(page, { 'POST /api/auth/cli/approve': cliApproved('omar-mbp') });
  await page.goto('/cli');
  await enterCode(page, 'K7QX2M');
  await expect(page.locator('.confirm-label')).toHaveText('"omar-mbp"');
  await page.locator('button.approve').click();
  await expect(page.locator('.done')).toContainText('Approved');
  expect(api.requests.map((r) => r.body)).toEqual([{ user_code: 'K7QX2M', preview: true }, { user_code: 'K7QX2M' }]);
});

test('a code that matches nothing says so', async ({ page }) => {
  await signIn(page);
  await fakeApi(page, { 'POST /api/auth/cli/approve': { status: 404, body: { code: 'CLI_AUTH_NOT_FOUND', message: 'nope' } } });
  await page.goto('/cli');
  await enterCode(page, 'ZZZZZZ');
  await expect(page.locator('.error')).toContainText("That code didn't match");
});

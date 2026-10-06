import { test } from './support/fake-api';

// Self-tests for the shared guard: each of these must fail, or the guard has stopped protecting the suite.
test.describe('guard', () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, 'runs once, on desktop'));

  test('fails a test that never set up the fake API but called it', async ({ page }) => {
    test.fail();
    await page.goto('/org/Acme');
    await page.locator('[data-page="org"]').waitFor();
    await page.waitForTimeout(300);
  });

  test('fails a test whose page failed to load an asset', async ({ page }) => {
    test.fail();
    const { fakeApi } = await import('./support/fake-api');
    await fakeApi(page, {});
    await page.goto('/about');
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = '/missing-sprite.png';
      document.body.append(img);
    });
    await page.waitForTimeout(300);
  });
});

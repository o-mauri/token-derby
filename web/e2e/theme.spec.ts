import { expect } from '@playwright/test';
import { fakeApi, test } from './support/fake-api';

test('applies a saved theme before Angular starts', async ({ page, request }) => {
  // The pre-paint script resets the theme once per event; mark the current event as seen.
  const eventTag = /var eventTag = '([^']*)'/.exec(await (await request.get('/about')).text())?.[1] ?? '';
  await fakeApi(page, {});
  await page.addInitScript((tag) => {
    localStorage.setItem('td_theme', 'matrix');
    localStorage.setItem('td_theme_event', tag);
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { __themeAtDcl?: string }).__themeAtDcl = document.documentElement.dataset['theme'];
    });
  }, eventTag);
  await page.goto('/about');
  expect(await page.evaluate(() => (window as unknown as { __themeAtDcl?: string }).__themeAtDcl)).toBe('matrix');
});

import { defineConfig, devices } from '@playwright/test';

const SITE = 4300;
const ADMIN = 4301;
// Relative to e2e/, where the web servers run.
const ADMIN_ROOT = '../dist/admin/browser';

const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } };
const PHONE = { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const PHONE_SMALL = { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const SITE_ONLY = { testIgnore: [/admin\//, /opt-in\//], use: { baseURL: `http://localhost:${SITE}` } };
const ADMIN_ONLY = { testMatch: /admin\/.*\.spec\.ts/, use: { baseURL: `http://localhost:${ADMIN}` } };

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  webServer: [
    { command: 'node serve.mjs', port: SITE, reuseExistingServer: !process.env['CI'] },
    { command: 'node serve.mjs', port: ADMIN, env: { PORT: String(ADMIN), ROOT: ADMIN_ROOT }, reuseExistingServer: !process.env['CI'] },
  ],
  projects: [
    { name: 'desktop', ...SITE_ONLY, use: { ...DESKTOP, ...SITE_ONLY.use } },
    { name: 'phone', ...SITE_ONLY, use: { ...PHONE, ...SITE_ONLY.use } },
    { name: 'phone-small', ...SITE_ONLY, use: { ...PHONE_SMALL, ...SITE_ONLY.use } },
    { name: 'admin-desktop', ...ADMIN_ONLY, use: { ...DESKTOP, ...ADMIN_ONLY.use } },
    { name: 'admin-phone', ...ADMIN_ONLY, use: { ...PHONE, ...ADMIN_ONLY.use } },
    { name: 'admin-phone-small', ...ADMIN_ONLY, use: { ...PHONE_SMALL, ...ADMIN_ONLY.use } },
  ],
});

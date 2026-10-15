import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4302', trace: 'retain-on-failure' },
  webServer: { command: 'node serve-both.mjs', cwd: __dirname, port: 4302, reuseExistingServer: !process.env['CI'] },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } }],
});

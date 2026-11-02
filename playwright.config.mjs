import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome' },
  webServer: { command: 'node scripts/preview.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  reporter: 'list',
});

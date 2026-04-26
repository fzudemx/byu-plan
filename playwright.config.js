// @ts-check
const { defineConfig } = require('/opt/node22/lib/node_modules/playwright/test.js');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:4173/byu-plan',
    headless: true,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro
    ignoreHTTPSErrors: true,
  },
  reporter: [['list']],
});

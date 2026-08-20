import { defineConfig, devices } from '@playwright/test';
import { FRONT_URL, API_URL } from './e2e/helpers/fixtures.js';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: FRONT_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(/^https?:\/\/(?!localhost)/i.test(FRONT_URL)
    ? {}
    : {
        webServer: {
          command: 'npm run dev -- --host 0.0.0.0 --port 4258',
          url: FRONT_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
  metadata: { apiUrl: API_URL, frontUrl: FRONT_URL },
});

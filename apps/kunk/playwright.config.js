import { defineConfig, devices } from '@playwright/test';

const FRONT_URL = process.env.E2E_FRONT_URL || process.env.KUNK_URL || 'http://localhost:4257';
const API_URL = process.env.E2E_API_URL || `${FRONT_URL}/api/v1`;

const isRemote = /^https?:\/\/(?!localhost)/i.test(FRONT_URL);

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
  ...(isRemote
    ? {}
    : {
        webServer: {
          command: 'npm run dev -- --host 0.0.0.0 --port 4257',
          url: FRONT_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
  metadata: { apiUrl: API_URL },
});

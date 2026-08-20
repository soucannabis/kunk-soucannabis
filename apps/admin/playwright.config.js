import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { FRONT_URL, API_URL } from './e2e/helpers/fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isRemote = /^https?:\/\/(?!localhost)/i.test(FRONT_URL);

export default defineConfig({
  testDir: path.join(__dirname, 'e2e'),
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
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: FRONT_URL,
      },
    },
  ],
  ...(isRemote
    ? {}
    : {
        webServer: {
          command: 'npm run dev -- --host 0.0.0.0 --port 4256',
          cwd: __dirname,
          url: FRONT_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
  metadata: { apiUrl: API_URL, frontUrl: FRONT_URL },
});

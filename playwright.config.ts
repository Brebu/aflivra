import {defineConfig, devices} from '@playwright/test';

// The vinext/workerd dev server cold-starts slowly and the live loaders budget 6-18s
// per upstream call, so the readiness and per-action budgets stay generous
// (Advocate D5: never weaken an assertion to green — widen the timeout instead).
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/',
  timeout: 120_000,
  expect: {timeout: 15_000},
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', {outputFolder: 'playwright-report', open: process.env.CI ? 'never' : 'on-failure'}]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    acceptDownloads: true,
    ...devices['Desktop Chrome'],
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: {
    command: 'corepack pnpm dev',
    url: 'http://127.0.0.1:5173',
    timeout: 180_000,
    // A leftover dev server on :5173 is reused instead of racing a second one.
    reuseExistingServer: !process.env.CI,
  },
});

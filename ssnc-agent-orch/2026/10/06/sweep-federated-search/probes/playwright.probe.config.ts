import { defineConfig } from '@playwright/test';

// Session probe config — runs only the probes in this directory against the
// already-running dev server (reuse discipline; never starts or restarts it).
export default defineConfig({
  testDir: '.',
  timeout: 120000,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:5173' },
});

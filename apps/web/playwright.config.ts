import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a running stack (API + worker + web) with seeded demo data:
 *
 *   docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev
 *   pnpm test:e2e
 *
 * E2E_BASE_URL overrides the target (e.g. the Docker stack on http://localhost:8080).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

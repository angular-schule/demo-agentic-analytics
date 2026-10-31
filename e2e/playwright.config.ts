import { defineConfig } from '@playwright/test';

// Runs against the app on http://localhost:8080, started with the fake LLM:
//   docker compose -f compose.yaml -f compose.test.yaml --profile node up -d --build
// The installed Google Chrome is used, so Playwright downloads no browser.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env['APP_URL'] ?? 'http://localhost:8080',
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
});

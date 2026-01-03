import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 15000,
  expect: {
    timeout: 5000,
  },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    // baseURL provided by fixtures.ts (reads port from global-setup)
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 5000,
  },
});

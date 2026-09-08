import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 12000 },
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command:
      "WATCHPACK_POLLING=true npm run dev -w @ledgerroot/web -- --webpack --hostname 127.0.0.1",
    url: "http://127.0.0.1:3100/documents",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

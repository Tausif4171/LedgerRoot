import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Live gateway UI with intercepted API responses, not real inference or user data.
export default defineConfig({
  ...base,
  testDir: "tests/e2e-live",
  use: { ...base.use, baseURL: "http://127.0.0.1:3103" },
  webServer: {
    command:
      "NEXT_PUBLIC_MODE=live NEXT_DIST_DIR=.next-live-ui-test WATCHPACK_POLLING=true npm run dev -w @ledgerroot/web -- --webpack --port 3103 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3103/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});

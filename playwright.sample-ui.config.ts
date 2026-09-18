import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// An isolated sample server; do not reuse a real-mode server on port 3100.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: "http://127.0.0.1:3102" },
  webServer: {
    command:
      "NEXT_PUBLIC_MODE=sample NEXT_DIST_DIR=.next-completeness WATCHPACK_POLLING=true npm run dev -w @ledgerroot/web -- --webpack --port 3102 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3102/documents",
    reuseExistingServer: false,
    timeout: 120000,
  },
});

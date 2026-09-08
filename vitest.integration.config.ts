import { defineConfig } from "vitest/config";
import { config } from "dotenv";
config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("Configure the local database before integration tests.");
const testDatabase = new URL(process.env.DATABASE_URL);
testDatabase.pathname = "/ledgerroot_test";
process.env.DATABASE_URL = testDatabase.toString();
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

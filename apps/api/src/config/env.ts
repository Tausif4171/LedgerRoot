import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";
export const root = resolve(import.meta.dirname, "../../../..");
config({ path: resolve(root, ".env"), quiet: true });
const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("ledgerroot"),
  S3_ACCESS_KEY: z.string().min(3),
  S3_SECRET_KEY: z.string().min(8),
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().url().default("http://localhost:3100"),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5:7b"),
  PORT: z.coerce.number().default(4100),
});
export function environment() {
  return schema.parse(process.env);
}

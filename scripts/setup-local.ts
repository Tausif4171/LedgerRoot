import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const password = randomBytes(24).toString("hex");
let content = await readFile(".env.example", "utf8");
content = content
  .replaceAll("replace-with-local-password", password)
  .replace("replace-with-local-storage-secret", randomBytes(24).toString("hex"))
  .replace("replace-with-a-random-secret-at-least-32-characters", randomBytes(32).toString("hex"))
  .replace("replace-with-local-owner-password", randomBytes(18).toString("hex"));
try {
  await writeFile(".env", content, { flag: "wx", mode: 0o600 });
  console.log("Created gitignored local configuration. Credentials remain in .env, not logs.");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  console.log("Existing .env preserved unchanged.");
}

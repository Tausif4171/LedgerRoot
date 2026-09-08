import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
const failures = [];
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".next"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}
const styles = await readFile("apps/web/src/styles/globals.css", "utf8");
const colors = new Set((styles.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((c) => c.toUpperCase()));
const allowed = ["#F7F8F5", "#FFFFFF", "#17241F", "#245D46", "#8A4B08", "#B42318"];
if (colors.size !== 6 || [...colors].some((c) => !allowed.includes(c)))
  failures.push("Expected exactly the six approved base colors.");
for (const path of await walk("apps/web/src")) {
  if (!/\.tsx?$/.test(path)) continue;
  const text = await readFile(path, "utf8");
  if (/#[\da-f]{6}\b/i.test(text)) failures.push(`${path}: use semantic color tokens`);
  if (/from ['"].*(@prisma|apps\/api|infrastructure\/storage)/.test(text))
    failures.push(`${path}: server import in browser code`);
}
for (const dir of ["packages/contracts/src", "packages/domain/src"])
  for (const path of await walk(dir)) {
    const text = await readFile(path, "utf8");
    if (/from ['"](node:|@prisma|better-auth|@aws-sdk)/.test(text))
      failures.push(`${path}: server dependency in shared package`);
  }
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("Design tokens and shared-package boundaries passed.");

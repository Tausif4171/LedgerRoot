import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { environment } from "../apps/api/src/config/env.js";
import { db } from "../apps/api/src/infrastructure/database.js";

// Run only with LedgerRoot API, dispatcher, and workers stopped.
const url = new URL(environment().DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/ledgerroot")
  throw new Error("This helper only migrates the local ledgerroot database.");
const before = await db.document.count();
const backup = execFileSync(
  "docker",
  [
    "exec",
    "ledgerroot-postgres-1",
    "pg_dump",
    "-U",
    decodeURIComponent(url.username),
    "-d",
    "ledgerroot",
    "-Fc",
  ],
  { maxBuffer: 100 * 1024 * 1024 },
);
await mkdir(".cache/migrations", { recursive: true, mode: 0o700 });
const path = `.cache/migrations/before-collaboration-${randomUUID()}.dump`;
await writeFile(path, backup, { mode: 0o600, flag: "wx" });
execFileSync("docker", ["exec", "-i", "ledgerroot-postgres-1", "pg_restore", "--list"], {
  input: backup,
  stdio: ["pipe", "ignore", "pipe"],
});
console.log(`Verified backup archive: ${path}`);
execFileSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "apps/api/prisma/schema.prisma",
  ],
  { stdio: "inherit" },
);
const missing = await db.$queryRaw<
  Array<{ count: bigint }>
>`SELECT COUNT(*) FROM "Document" d LEFT JOIN "SourceRevision" s ON s.id=d."currentSourceId" AND s."documentId"=d.id WHERE s.id IS NULL`;
if ((await db.document.count()) !== before || Number(missing[0]?.count) !== 0)
  throw new Error(
    "Post-migration verification failed. Keep services stopped and inspect the backup.",
  );
await db.$disconnect();
console.log(`Verified ${before} documents retained with valid current-source references.`);

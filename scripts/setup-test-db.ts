import { execFileSync } from "node:child_process";
import { environment } from "../apps/api/src/config/env.js";
import { db } from "../apps/api/src/infrastructure/database.js";
const url = new URL(environment().DATABASE_URL);
url.pathname = "/ledgerroot_test";
const existing = await db.$queryRaw<
  Array<{ datname: string }>
>`SELECT datname FROM pg_database WHERE datname='ledgerroot_test'`;
if (!existing.length) await db.$executeRawUnsafe("CREATE DATABASE ledgerroot_test");
await db.$disconnect();
execFileSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "apps/api/prisma/schema.prisma",
  ],
  { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "inherit" },
);

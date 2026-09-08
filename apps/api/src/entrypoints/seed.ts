import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../infrastructure/database.js";
import { Storage } from "../infrastructure/storage.js";
import { environment } from "../config/env.js";
environment();
const email = process.env.SEED_EMAIL;
const password = process.env.SEED_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error("Set SEED_EMAIL and SEED_PASSWORD (12+ characters).");
let user = await db.user.findUnique({ where: { email } });
if (!user) {
  const id = randomUUID();
  user = await db.user.create({
    data: {
      id,
      email,
      name: "Tausif Khan",
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
}
const workspace = await db.workspace.upsert({
  where: { id: "ledgerroot-local" },
  create: { id: "ledgerroot-local", name: "LedgerRoot workspace" },
  update: {},
});
await db.membership.upsert({
  where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
  create: { userId: user.id, workspaceId: workspace.id, role: "OWNER" },
  update: {},
});
await new Storage().ensureBucket();
await db.$disconnect();
console.log("Local owner, workspace, and private storage are ready.");

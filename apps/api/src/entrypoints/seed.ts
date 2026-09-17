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
const reviewerEmail = process.env.SEED_REVIEWER_EMAIL;
const reviewerPassword = process.env.SEED_REVIEWER_PASSWORD;
if (reviewerEmail || reviewerPassword) {
  if (
    !reviewerEmail ||
    !reviewerPassword ||
    reviewerPassword.length < 12 ||
    reviewerEmail === email
  )
    throw new Error(
      "Set a different SEED_REVIEWER_EMAIL and SEED_REVIEWER_PASSWORD (12+ characters).",
    );
  let reviewer = await db.user.findUnique({ where: { email: reviewerEmail } });
  if (!reviewer) {
    const id = randomUUID();
    reviewer = await db.user.create({
      data: {
        id,
        email: reviewerEmail,
        name: "Local teammate",
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password: await hashPassword(reviewerPassword),
          },
        },
      },
    });
  }
  await db.membership.upsert({
    where: { userId_workspaceId: { userId: reviewer.id, workspaceId: workspace.id } },
    create: { userId: reviewer.id, workspaceId: workspace.id, role: "REVIEWER" },
    update: {},
  });
}
await new Storage().ensureBucket();
await db.$disconnect();
console.log("Local owner, workspace, and private storage are ready.");

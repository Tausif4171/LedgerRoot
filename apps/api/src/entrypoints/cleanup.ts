import { db } from "../infrastructure/database.js";
import { Storage } from "../infrastructure/storage.js";
await new Storage().cleanup(
  async (objectKey) =>
    !!(await db.sourceRevision.findUnique({ where: { objectKey }, select: { id: true } })) ||
    !!(await db.document.findUnique({ where: { objectKey }, select: { id: true } })) ||
    !!(await db.artifact.findUnique({ where: { objectKey }, select: { id: true } })),
);
await db.$disconnect();
console.log("Removed only unreferenced LedgerRoot bucket objects older than 24 hours.");

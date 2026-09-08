import { db } from "../../infrastructure/database.js";
export async function dispatchOnce(
  publish: (runId: string) => Promise<unknown>,
  workspaceId?: string,
) {
  for (const row of await db.outbox.findMany({
    where: { sentAt: null, ...(workspaceId ? { run: { document: { workspaceId } } } : {}) },
    take: 25,
    orderBy: { createdAt: "asc" },
  })) {
    await publish(row.runId);
    await db.$transaction([
      db.processingRun.updateMany({
        where: { id: row.runId, stage: "PENDING_DISPATCH" },
        data: { stage: "QUEUED" },
      }),
      db.outbox.update({ where: { id: row.id }, data: { sentAt: new Date() } }),
    ]);
  }
}

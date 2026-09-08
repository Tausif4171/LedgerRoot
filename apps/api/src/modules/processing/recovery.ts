import { db } from "../../infrastructure/database.js";

/** DB leases fence dead workers; the queue is rebuildable transport, not the source of truth. */
export async function recoverOnce(
  queue: { state: (id: string) => Promise<string>; removeTerminal: (id: string) => Promise<void> },
  workspaceId?: string,
  now = new Date(),
) {
  const runs = await db.processingRun.findMany({
    where: {
      stage: { notIn: ["READY", "FAILED"] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      ...(workspaceId ? { document: { workspaceId } } : {}),
    },
    take: 50,
    orderBy: { updatedAt: "asc" },
  });
  for (const run of runs) {
    if (run.leaseUntil) {
      await db.$transaction(async (tx) => {
        const owned = await tx.processingRun.updateMany({
          where: { id: run.id, generation: run.generation, leaseUntil: { lt: now } },
          data: {
            leaseUntil: null,
            stage: run.attempts >= 3 ? "FAILED" : "RETRY_WAIT",
            error: "Worker lease expired before completion.",
          },
        });
        if (!owned.count) return;
        await tx.processingAttempt.updateMany({
          where: { runId: run.id, generation: run.generation, finishedAt: null },
          data: { finishedAt: now, error: "Worker lease expired." },
        });
        await tx.auditEvent.create({
          data: {
            documentId: run.documentId,
            actor: "Recovery dispatcher",
            action: run.attempts >= 3 ? "Processing failed" : "Expired worker recovered",
            note: "The expired worker cannot publish results. The original remains preserved.",
          },
        });
      });
      if (run.attempts >= 3) continue;
    }
    const state = await queue.state(run.id);
    if (!["missing", "failed", "completed"].includes(state)) continue;
    if (state !== "missing") await queue.removeTerminal(run.id);
    // Only terminal/missing queue jobs are removed; never interrupt an active worker.
    await db.outbox.updateMany({
      where: { runId: run.id, run: { stage: { notIn: ["READY", "FAILED"] }, leaseUntil: null } },
      data: { sentAt: null },
    });
  }
}

import { ApiError, type Extraction } from "@ledgerroot/contracts";
import { db } from "../../infrastructure/database.js";
import { Storage, type ObjectStore } from "../../infrastructure/storage.js";
import { extractFields, readImage } from "../../infrastructure/extraction.js";
import { json } from "../documents/service.js";
import sharp from "sharp";
export async function processRun(
  runId: string,
  store: ObjectStore = new Storage(),
  extract?: (bytes: Buffer) => Promise<Extraction>,
) {
  const run = await db.processingRun.findUnique({
    where: { id: runId },
    include: { document: true, result: true },
  });
  if (!run || run.result || ["READY", "FAILED"].includes(run.stage)) return;
  const claim = await db.processingRun.updateMany({
    where: {
      id: runId,
      generation: run.generation,
      stage: { notIn: ["READY", "FAILED"] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: {
      generation: { increment: 1 },
      attempts: { increment: 1 },
      stage: "OCR",
      leaseUntil: new Date(Date.now() + 240000),
    },
  });
  if (!claim.count)
    throw new ApiError("LEASE_BUSY", "Another worker is processing this run.", 503, true);
  const generation = run.generation + 1;
  await db.processingAttempt.create({ data: { runId, generation } });
  try {
    const source = await db.sourceRevision.findFirstOrThrow({
      where: { id: run.sourceId, documentId: run.documentId },
    });
    const bytes = await store.get(source.objectKey);
    const artifacts: Array<{ kind: string; objectKey: string }> = [];
    let result: Extraction;
    if (extract) result = await extract(bytes);
    else {
      const { normalized, spans } = await readImage(bytes);
      const imageKey = `derived/${runId}/${generation}/normalized.png`;
      const ocrKey = `derived/${runId}/${generation}/ocr.json`;
      const thumbnailKey = `derived/${runId}/${generation}/thumbnail.png`;
      await store.put(imageKey, normalized, "image/png");
      await store.put(ocrKey, Buffer.from(JSON.stringify(spans)), "application/json");
      await store.put(
        thumbnailKey,
        await sharp(normalized).resize({ width: 96, height: 128, fit: "inside" }).png().toBuffer(),
        "image/png",
      );
      artifacts.push(
        { kind: "normalized", objectKey: imageKey },
        { kind: "ocr", objectKey: ocrKey },
        { kind: "thumbnail", objectKey: thumbnailKey },
      );
      const owned = await db.processingRun.updateMany({
        where: { id: runId, generation, leaseUntil: { gt: new Date() } },
        data: { stage: "EXTRACTING" },
      });
      if (!owned.count)
        throw new ApiError("STALE_ATTEMPT", "This attempt no longer owns the run.", 409);
      result = await extractFields(spans);
    }
    await db.processingRun.updateMany({
      where: { id: runId, generation, leaseUntil: { gt: new Date() } },
      data: { stage: "VALIDATING" },
    });
    await db.$transaction(async (tx) => {
      const owned = await tx.processingRun.updateMany({
        where: {
          id: runId,
          generation,
          leaseUntil: { gt: new Date() },
          stage: { notIn: ["READY", "FAILED"] },
        },
        data: { stage: "READY", leaseUntil: null, error: null },
      });
      if (!owned.count)
        throw new ApiError("STALE_ATTEMPT", "This attempt no longer owns the run.", 409);
      await tx.extractionResult.create({ data: { runId, payload: json(result) } });
      for (const artifact of artifacts) await tx.artifact.create({ data: { runId, ...artifact } });
      await tx.processingAttempt.update({
        where: { runId_generation: { runId, generation } },
        data: { finishedAt: new Date() },
      });
      // Only populate fields before any human review revision exists.
      const humanReview = await tx.reviewRevision.findFirst({
        where: {
          documentId: run.documentId,
          action: { in: ["save", "approve", "reject", "needs-information"] },
        },
      });
      await tx.document.updateMany({
        where: {
          id: run.documentId,
          latestRunId: runId,
          currentSourceId: run.sourceId,
          reviewStatus: "NOT_READY",
        },
        data: {
          reviewStatus: "PENDING",
          ...(!humanReview && source.version === 1 ? { fields: json(result.fields) } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          documentId: run.documentId,
          actor: "Processing worker",
          action: "Extraction ready",
          note: `${result.model}; ${result.promptVersion}. Human review required.`,
        },
      });
    });
  } catch (error) {
    const terminal = (error instanceof ApiError && !error.retryable) || run.attempts + 1 >= 3;
    const reason =
      error instanceof ApiError
        ? error.message
        : "Processing could not finish. Check the local services and retry.";
    const owned = await db.processingRun.updateMany({
      where: { id: runId, generation, leaseUntil: { gt: new Date() }, stage: { not: "READY" } },
      data: { stage: terminal ? "FAILED" : "RETRY_WAIT", leaseUntil: null, error: reason },
    });
    if (owned.count) {
      await db.processingAttempt.update({
        where: { runId_generation: { runId, generation } },
        data: { finishedAt: new Date(), error: reason },
      });
      await db.auditEvent.create({
        data: {
          documentId: run.documentId,
          actor: "Processing worker",
          action: terminal ? "Processing failed" : "Retry scheduled",
          note: reason,
        },
      });
    }
    throw error;
  }
}

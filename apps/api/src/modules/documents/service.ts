import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  ApiError,
  emptyFields,
  fieldsSchema,
  resultSchema,
  documentSchema,
  type Identity,
  type Mutation,
  type ReviewAction,
} from "@ledgerroot/contracts";
import { reviewTransition } from "@ledgerroot/domain";
import { db } from "../../infrastructure/database.js";
import { validateImage } from "../../infrastructure/extraction.js";
import type { ObjectStore } from "../../infrastructure/storage.js";
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const includeDocument = {
  runs: { include: { result: true } },
  audit: { orderBy: { createdAt: "asc" as const } },
};
type Loaded = Prisma.DocumentGetPayload<{ include: typeof includeDocument }>;
export function serialize(d: Loaded, identity: Identity) {
  const run = d.runs.find((r) => r.id === d.latestRunId);
  return documentSchema.parse({
    id: d.id,
    filename: d.filename,
    createdAt: d.createdAt.toISOString(),
    checksum: d.checksum,
    sourceUrl: `/api/v1/documents/${d.id}/source`,
    thumbnailUrl: run?.result ? `/api/v1/documents/${d.id}/source?thumbnail=1` : undefined,
    stage: run?.stage ?? "FAILED",
    reviewStatus: d.reviewStatus,
    revision: d.revision,
    runId: d.latestRunId,
    fields: fieldsSchema.parse(d.fields),
    extraction: run?.result ? resultSchema.parse(run.result.payload) : null,
    history: d.audit.map((a) => ({
      id: a.id,
      at: a.createdAt.toISOString(),
      actor: a.actor,
      action: a.action,
      note: a.note,
      before: a.before ?? null,
      after: a.after ?? null,
    })),
    failure: run?.error ?? null,
    canReview: identity.role !== "VIEWER",
    sample: false,
  });
}
export async function getDocument(id: string, identity: Identity) {
  const d = await db.document.findFirst({
    where: { id, workspaceId: identity.workspaceId },
    include: includeDocument,
  });
  if (!d) throw new ApiError("NOT_FOUND", "Document not found.", 404);
  return serialize(d, identity);
}
async function cached(
  tx: Prisma.TransactionClient,
  scope: string,
  key: string,
  requestHash: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope}/${key}`},0))`;
  const old = await tx.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
  if (old && old.requestHash !== requestHash)
    throw new ApiError(
      "IDEMPOTENCY_CONFLICT",
      "This request key was already used for a different action.",
      409,
    );
  return old;
}
export async function upload(
  bytes: Buffer,
  filename: string,
  identity: Identity,
  key: string,
  store: ObjectStore,
) {
  const mime = await validateImage(bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const scope = `${identity.workspaceId}/${identity.userId}/upload`;
  const requestHash = hash(`${filename}/${checksum}`);
  const existing = await db.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new ApiError("IDEMPOTENCY_CONFLICT", "Request key used for another file.", 409);
    return existing.response;
  }
  const objectKey = `originals/${identity.workspaceId}/${randomUUID()}`;
  await store.put(objectKey, bytes, mime);
  return db.$transaction(
    async (tx) => {
      const old = await cached(tx, scope, key, requestHash);
      if (old) return old.response;
      // Serialize same-checksum uploads independently of each request's idempotency key.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${identity.workspaceId}/${checksum}`},0))`;
      let document = await tx.document.findUnique({
        where: { workspaceId_checksum: { workspaceId: identity.workspaceId, checksum } },
      });
      const duplicate = !!document;
      if (!document) {
        const runId = randomUUID();
        document = await tx.document.create({
          data: {
            workspaceId: identity.workspaceId,
            filename: filename.slice(0, 200),
            checksum,
            objectKey,
            mime,
            bytes: bytes.length,
            fields: json(emptyFields),
            latestRunId: runId,
            runs: { create: { id: runId, outbox: { create: {} } } },
            audit: {
              create: {
                actor: identity.name,
                action: "Uploaded",
                note: "Original preserved; queued for processing.",
              },
            },
          },
        });
      }
      const response = { id: document.id, duplicate };
      await tx.idempotencyRecord.create({ data: { scope, key, requestHash, response } });
      return response;
    },
    { timeout: 15000 },
  );
}
export async function mutate(
  id: string,
  identity: Identity,
  key: string,
  action: ReviewAction,
  input: Mutation,
) {
  if (identity.role === "VIEWER")
    throw new ApiError("FORBIDDEN", "Viewer access cannot change documents.", 403);
  const scope = `${identity.workspaceId}/${identity.userId}/${id}`;
  const requestHash = hash(JSON.stringify({ action, input }));
  return db.$transaction(
    async (tx) => {
      const old = await cached(tx, scope, key, requestHash);
      if (old) return old.response;
      const d = await tx.document.findFirst({
        where: { id, workspaceId: identity.workspaceId },
        include: includeDocument,
      });
      if (!d) throw new ApiError("NOT_FOUND", "Document not found.", 404);
      const current = serialize(d, identity);
      const status = reviewTransition(current, action, input);
      const runId = action === "retry" ? randomUUID() : d.latestRunId;
      const nextFields =
        action === "retry" || action === "reopen" ? fieldsSchema.parse(d.fields) : input.fields;
      const changed = await tx.document.updateMany({
        where: { id, revision: input.expectedRevision, latestRunId: input.runId },
        data: {
          revision: { increment: 1 },
          reviewStatus: status,
          fields: json(nextFields),
          latestRunId: runId,
        },
      });
      if (changed.count !== 1)
        throw new ApiError(
          "REVISION_CONFLICT",
          "Another reviewer changed this document. Your edits are preserved.",
          409,
        );
      if (action === "retry")
        await tx.processingRun.create({
          data: { id: runId, documentId: id, outbox: { create: {} } },
        });
      await tx.reviewRevision.create({
        data: {
          documentId: id,
          revision: d.revision + 1,
          runId,
          actorId: identity.userId,
          action,
          fields: json(nextFields),
          note: input.note || null,
        },
      });
      await tx.auditEvent.create({
        data: {
          documentId: id,
          actor: identity.name,
          action,
          note: input.note || null,
          before: json(d.fields),
          after: json(nextFields),
        },
      });
      const updated = await tx.document.findUniqueOrThrow({
        where: { id },
        include: includeDocument,
      });
      const response = serialize(updated, identity);
      await tx.idempotencyRecord.create({
        data: { scope, key, requestHash, response: json(response) },
      });
      return response;
    },
    { timeout: 15000 },
  );
}

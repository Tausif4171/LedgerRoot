import { createHash, randomUUID } from "node:crypto";
import {
  ApiError,
  replaceSourceSchema,
  type Identity,
  type RequestState,
} from "@ledgerroot/contracts";
import {
  assertCollaborator,
  assertDocumentGuard,
  assertSourceReplaceable,
  requestTransition,
} from "@ledgerroot/domain";
import { db } from "../../infrastructure/database.js";
import { validateImage } from "../../infrastructure/extraction.js";
import type { ObjectStore } from "../../infrastructure/storage.js";
import { cached, json } from "../documents/service.js";
import { lockDocument } from "../requests/service.js";

export async function replaceSource(
  id: string,
  identity: Identity,
  key: string,
  value: unknown,
  bytes: Buffer,
  filename: string,
  store: ObjectStore,
) {
  assertCollaborator(identity.role);
  const input = replaceSourceSchema.parse(value);
  // Authorize before expensive validation or storing bytes. Recheck under lock below.
  if (!(await db.document.findFirst({ where: { id, workspaceId: identity.workspaceId } })))
    throw new ApiError("NOT_FOUND", "Document not found.", 404);
  const mime = await validateImage(bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const scope = `${identity.workspaceId}/${identity.userId}/source/${id}`;
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ input, checksum, filename }))
    .digest("hex");
  const replay = await db.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
  if (replay) {
    if (replay.requestHash !== requestHash)
      throw new ApiError(
        "IDEMPOTENCY_CONFLICT",
        "This request key was used for another upload.",
        409,
      );
    return replay.response;
  }
  const objectKey = `originals/${identity.workspaceId}/${randomUUID()}`;
  await store.put(objectKey, bytes, mime);
  return db.$transaction(
    async (tx) => {
      const old = await cached(tx, scope, key, requestHash);
      if (old) return old.response;
      const { d, state } = await lockDocument(tx, id, identity);
      assertDocumentGuard(state, input);
      assertSourceReplaceable(state);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${identity.workspaceId}/${checksum}`},0))`;
      const duplicate = await tx.sourceRevision.findUnique({
        where: { workspaceId_checksum: { workspaceId: identity.workspaceId, checksum } },
      });
      if (duplicate) {
        const response = {
          duplicate: true,
          id: duplicate.documentId,
          sourceId: duplicate.id,
          version: duplicate.version,
          current: duplicate.id === d.currentSourceId,
        };
        // No request response or current-source change is made for identical bytes.
        await tx.idempotencyRecord.create({ data: { scope, key, requestHash, response } });
        return response;
      }
      const request = input.requestId
        ? await tx.correctionRequest.findFirst({ where: { id: input.requestId, documentId: id } })
        : null;
      if (input.requestId && !request) throw new ApiError("NOT_FOUND", "Request not found.", 404);
      if (request)
        requestTransition(
          { ...request, state: request.state as RequestState },
          {
            expectedRevision: input.expectedRevision,
            runId: input.runId,
            sourceId: input.sourceId,
            action: "respond",
            expectedRequestVersion: input.expectedRequestVersion!,
            message: input.reason,
          },
          identity,
          state,
        );
      const previous = await tx.sourceRevision.findFirstOrThrow({
        where: { documentId: id },
        orderBy: { version: "desc" },
      });
      const sourceId = randomUUID();
      const runId = randomUUID();
      await tx.sourceRevision.create({
        data: {
          id: sourceId,
          documentId: id,
          workspaceId: identity.workspaceId,
          version: previous.version + 1,
          filename: filename.slice(0, 200),
          checksum,
          objectKey,
          mime,
          bytes: bytes.length,
          uploaderId: identity.userId,
          uploaderName: identity.name,
          reason: input.reason,
        },
      });
      await tx.processingRun.create({
        data: { id: runId, documentId: id, sourceId, outbox: { create: {} } },
      });
      await tx.document.update({
        where: { id },
        data: {
          currentSourceId: sourceId,
          latestRunId: runId,
          revision: { increment: 1 },
          reviewStatus: "NOT_READY",
        },
      });
      if (request)
        await tx.correctionRequest.update({
          where: { id: request.id },
          data: {
            state: "RESPONDED",
            version: { increment: 1 },
            events: {
              create: {
                actorId: identity.userId,
                actorName: identity.name,
                action: "respond",
                message: input.reason,
                sourceId,
              },
            },
          },
        });
      await tx.auditEvent.create({
        data: {
          documentId: id,
          actor: identity.name,
          action: "Clearer photo uploaded",
          note: `Source version ${previous.version + 1}: ${input.reason}. Previous values retained; fresh review required.`,
        },
      });
      const response = { duplicate: false, id, sourceId, version: previous.version + 1, runId };
      await tx.idempotencyRecord.create({
        data: { scope, key, requestHash, response: json(response) },
      });
      return response;
    },
    { timeout: 15000 },
  );
}

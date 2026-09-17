import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  ApiError,
  createRequestSchema,
  requestCommandSchema,
  type Identity,
  type Stage,
  type ReviewStatus,
  type RequestState,
} from "@ledgerroot/contracts";
import {
  assertCollaborator,
  assertDocumentGuard,
  assertRequestCreatable,
  requestTransition,
} from "@ledgerroot/domain";
import { db } from "../../infrastructure/database.js";
import { cached, json } from "../documents/service.js";

export async function lockDocument(tx: Prisma.TransactionClient, id: string, identity: Identity) {
  await tx.$queryRaw`SELECT id FROM "Document" WHERE id=${id} AND "workspaceId"=${identity.workspaceId} FOR UPDATE`;
  const d = await tx.document.findFirst({
    where: { id, workspaceId: identity.workspaceId },
    include: { runs: true },
  });
  if (!d) throw new ApiError("NOT_FOUND", "Document not found.", 404);
  return {
    d,
    state: {
      revision: d.revision,
      runId: d.latestRunId,
      sourceId: d.currentSourceId,
      stage: (d.runs.find((r) => r.id === d.latestRunId)?.stage ?? "FAILED") as Stage,
      reviewStatus: d.reviewStatus as ReviewStatus,
    },
  };
}
export async function eligible(tx: Prisma.TransactionClient, userId: string, workspaceId: string) {
  const member = await tx.membership.findFirst({
    where: { userId, workspaceId, role: { in: ["OWNER", "REVIEWER"] } },
  });
  if (!member)
    throw new ApiError("INVALID_ASSIGNEE", "Choose an owner or reviewer in this workspace.", 422);
}
export async function createRequest(
  documentId: string,
  identity: Identity,
  key: string,
  value: unknown,
) {
  assertCollaborator(identity.role);
  const input = createRequestSchema.parse(value);
  const scope = `${identity.workspaceId}/${identity.userId}/request/create/${documentId}`;
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return db.$transaction(async (tx) => {
    const old = await cached(tx, scope, key, requestHash);
    if (old) return old.response;
    const { state } = await lockDocument(tx, documentId, identity);
    assertDocumentGuard(state, input);
    const active = await tx.correctionRequest.findFirst({
      where: { documentId, state: { in: ["OPEN", "RESPONDED"] } },
    });
    assertRequestCreatable(state, !!active);
    await eligible(tx, input.assigneeId, identity.workspaceId);
    const request = await tx.correctionRequest.create({
      data: {
        id: randomUUID(),
        documentId,
        sourceId: state.sourceId,
        assigneeId: input.assigneeId,
        question: input.question,
        field: input.field,
        events: {
          create: {
            actorId: identity.userId,
            actorName: identity.name,
            action: "created",
            message: input.question,
            assigneeId: input.assigneeId,
            sourceId: state.sourceId,
          },
        },
      },
    });
    await tx.document.update({
      where: { id: documentId },
      data: { revision: { increment: 1 }, reviewStatus: "NEEDS_INFORMATION" },
    });
    await tx.auditEvent.create({
      data: {
        documentId,
        actor: identity.name,
        action: "Information requested",
        note: input.question,
      },
    });
    const response = json(request);
    await tx.idempotencyRecord.create({ data: { scope, key, requestHash, response } });
    return response;
  });
}
export async function changeRequest(id: string, identity: Identity, key: string, value: unknown) {
  assertCollaborator(identity.role);
  const input = requestCommandSchema.parse(value);
  const scope = `${identity.workspaceId}/${identity.userId}/request/${id}`;
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return db.$transaction(async (tx) => {
    const old = await cached(tx, scope, key, requestHash);
    if (old) return old.response;
    const found = await tx.correctionRequest.findFirst({
      where: { id, document: { workspaceId: identity.workspaceId } },
    });
    if (!found) throw new ApiError("NOT_FOUND", "Request not found.", 404);
    const { state } = await lockDocument(tx, found.documentId, identity);
    const request = await tx.correctionRequest.findUniqueOrThrow({ where: { id } });
    const next = requestTransition(
      { ...request, state: request.state as RequestState },
      input,
      identity,
      state,
    );
    if (input.action === "reassign") await eligible(tx, input.assigneeId!, identity.workspaceId);
    const updated = await tx.correctionRequest.update({
      where: { id },
      data: {
        state: next,
        version: { increment: 1 },
        ...(input.action === "reassign" ? { assigneeId: input.assigneeId } : {}),
        events: {
          create: {
            actorId: identity.userId,
            actorName: identity.name,
            action: input.action,
            message: input.message,
            assigneeId: input.assigneeId,
            sourceId: state.sourceId,
          },
        },
      },
    });
    await tx.document.update({
      where: { id: request.documentId },
      data: {
        revision: { increment: 1 },
        ...(next === "RESOLVED" ? { reviewStatus: "PENDING" } : {}),
      },
    });
    await tx.auditEvent.create({
      data: {
        documentId: request.documentId,
        actor: identity.name,
        action: `Request ${input.action}`,
        note: input.message || null,
      },
    });
    const response = json(updated);
    await tx.idempotencyRecord.create({ data: { scope, key, requestHash, response } });
    return response;
  });
}

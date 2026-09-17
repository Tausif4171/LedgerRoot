import {
  ApiError,
  requestCommandSchema,
  type DocumentGuard,
  type RequestCommand,
  type RequestState,
  type ReviewStatus,
  type Role,
  type Stage,
} from "@ledgerroot/contracts";

export interface CollaborationDocument {
  revision: number;
  runId: string;
  sourceId: string;
  stage: Stage;
  reviewStatus: ReviewStatus;
}

export function assertDocumentGuard(current: CollaborationDocument, expected: DocumentGuard) {
  if (
    current.revision !== expected.expectedRevision ||
    current.runId !== expected.runId ||
    current.sourceId !== expected.sourceId
  )
    throw new ApiError(
      "REVISION_CONFLICT",
      "This document changed. Compare the latest version before continuing.",
      409,
    );
}
export function assertCollaborator(role: Role) {
  if (role !== "OWNER" && role !== "REVIEWER")
    throw new ApiError(
      "FORBIDDEN",
      "Only owners and reviewers can change requests or source images.",
      403,
    );
}
export function isActiveRequest(state: RequestState) {
  return state === "OPEN" || state === "RESPONDED";
}
export function assertSourceReplaceable(document: CollaborationDocument) {
  if (!["READY", "FAILED"].includes(document.stage))
    throw new ApiError(
      "PROCESSING_ACTIVE",
      "Wait for processing to finish before uploading another photo.",
      409,
    );
  if (["APPROVED", "REJECTED"].includes(document.reviewStatus))
    throw new ApiError("REOPEN_REQUIRED", "Reopen this record before replacing its photo.", 409);
}
export function assertRequestCreatable(document: CollaborationDocument, active: boolean) {
  if (active)
    throw new ApiError("ACTIVE_REQUEST", "Resolve or cancel the existing request first.", 409);
  if (
    document.stage !== "READY" ||
    !["PENDING", "NEEDS_INFORMATION"].includes(document.reviewStatus)
  )
    throw new ApiError(
      "NOT_REVIEWABLE",
      "Open a ready record for review before requesting information.",
      409,
    );
}

/** Membership and transaction locking remain server responsibilities. */
export function requestTransition(
  current: { state: RequestState; version: number; assigneeId: string },
  command: RequestCommand,
  actor: { userId: string; role: Role },
  document: CollaborationDocument,
): RequestState {
  command = requestCommandSchema.parse(command);
  assertCollaborator(actor.role);
  assertDocumentGuard(document, command);
  if (current.version !== command.expectedRequestVersion)
    throw new ApiError(
      "REQUEST_CONFLICT",
      "This request changed. Reload it before continuing.",
      409,
    );
  if (!isActiveRequest(current.state))
    throw new ApiError(
      "REQUEST_CLOSED",
      "This request is closed. Create a new request if needed.",
      409,
    );
  switch (command.action) {
    case "respond":
      if (actor.userId !== current.assigneeId)
        throw new ApiError("FORBIDDEN", "Only the assigned teammate can respond.", 403);
      if (current.state !== "OPEN")
        throw new ApiError("INVALID_TRANSITION", "This response is already awaiting review.", 409);
      return "RESPONDED";
    case "follow-up":
      if (current.state !== "RESPONDED")
        throw new ApiError("INVALID_TRANSITION", "Wait for a response before following up.", 409);
      return "OPEN";
    case "reassign":
      // A new assignee must explicitly respond; an earlier person's answer is retained as history.
      return "OPEN";
    case "resolve":
      if (current.state !== "RESPONDED" || document.stage !== "READY")
        throw new ApiError(
          "NOT_RESOLVABLE",
          "A response and successful processing are required before resolution.",
          409,
        );
      return "RESOLVED";
    case "cancel":
      return "CANCELED";
  }
}

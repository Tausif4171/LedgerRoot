import { describe, expect, it } from "vitest";
import {
  createRequestSchema,
  replaceSourceSchema,
  requestCommandSchema,
  type RequestCommand,
} from "@ledgerroot/contracts";
import {
  assertDocumentGuard,
  assertRequestCreatable,
  assertSourceReplaceable,
  requestTransition,
  type CollaborationDocument,
} from "./collaboration.js";

const document: CollaborationDocument = {
  revision: 3,
  runId: "run-1",
  sourceId: "source-1",
  stage: "READY",
  reviewStatus: "NEEDS_INFORMATION",
};
const actor = { userId: "reviewer", role: "REVIEWER" as const };
const current = { state: "OPEN" as const, version: 1, assigneeId: actor.userId };
const command = (action: RequestCommand["action"]): RequestCommand => ({
  action,
  expectedRevision: 3,
  runId: "run-1",
  sourceId: "source-1",
  expectedRequestVersion: 1,
  message: "Please check the total.",
  ...(action === "reassign" ? { assigneeId: "other" } : {}),
});

describe("correction request rules", () => {
  it("supports response, follow-up, resolution and cancellation without approving", () => {
    expect(requestTransition(current, command("respond"), actor, document)).toBe("RESPONDED");
    const responded = { ...current, state: "RESPONDED" as const };
    expect(requestTransition(responded, command("follow-up"), actor, document)).toBe("OPEN");
    expect(requestTransition(responded, command("resolve"), actor, document)).toBe("RESOLVED");
    expect(requestTransition(current, command("cancel"), actor, document)).toBe("CANCELED");
    expect(document.reviewStatus).toBe("NEEDS_INFORMATION");
  });
  it("requires a new response after reassignment", () => {
    expect(
      requestTransition({ ...current, state: "RESPONDED" }, command("reassign"), actor, document),
    ).toBe("OPEN");
  });
  it("keeps viewers read-only and limits responding to the assignee", () => {
    expect(() =>
      requestTransition(current, command("respond"), { ...actor, role: "VIEWER" }, document),
    ).toThrow("Only owners");
    expect(() =>
      requestTransition(current, command("respond"), { ...actor, userId: "other" }, document),
    ).toThrow("assigned teammate");
  });
  it("rejects stale request and document versions", () => {
    expect(() =>
      requestTransition(
        current,
        { ...command("respond"), expectedRequestVersion: 0 },
        actor,
        document,
      ),
    ).toThrow("request changed");
    for (const change of [{ revision: 4 }, { runId: "new-run" }, { sourceId: "new-source" }])
      expect(() => assertDocumentGuard({ ...document, ...change }, command("respond"))).toThrow(
        "document changed",
      );
  });
  it("rejects resolution before a response or while processing is unsuccessful", () => {
    expect(() => requestTransition(current, command("resolve"), actor, document)).toThrow(
      "response and successful",
    );
    for (const stage of ["OCR", "FAILED", "PENDING_DISPATCH"] as const)
      expect(() =>
        requestTransition({ ...current, state: "RESPONDED" }, command("resolve"), actor, {
          ...document,
          stage,
        }),
      ).toThrow("response and successful");
  });
  it("closed requests cannot be changed", () => {
    for (const state of ["RESOLVED", "CANCELED"] as const)
      expect(() =>
        requestTransition({ ...current, state }, command("respond"), actor, document),
      ).toThrow("closed");
  });
  it("requires ready open records and no existing active request", () => {
    expect(() => assertRequestCreatable(document, false)).not.toThrow();
    expect(() => assertRequestCreatable(document, true)).toThrow("existing request");
    expect(() => assertRequestCreatable({ ...document, reviewStatus: "APPROVED" }, false)).toThrow(
      "ready record",
    );
  });
});

describe("source revision rules", () => {
  it("allows ready or failed processing but requires reopening terminal reviews", () => {
    expect(() => assertSourceReplaceable(document)).not.toThrow();
    expect(() => assertSourceReplaceable({ ...document, stage: "FAILED" })).not.toThrow();
    expect(() => assertSourceReplaceable({ ...document, stage: "OCR" })).toThrow("processing");
    for (const reviewStatus of ["APPROVED", "REJECTED"] as const)
      expect(() => assertSourceReplaceable({ ...document, reviewStatus })).toThrow("Reopen");
  });
  it("requires confirmation, a reason, and paired request identity/version", () => {
    const value = {
      expectedRevision: 3,
      runId: "run-1",
      sourceId: "source-1",
      reason: "Clearer total",
      confirmedSameDocument: true,
    };
    expect(replaceSourceSchema.safeParse(value).success).toBe(true);
    for (const change of [
      { confirmedSameDocument: false },
      { reason: " " },
      { requestId: "request" },
      { expectedRequestVersion: 1 },
    ])
      expect(replaceSourceSchema.safeParse({ ...value, ...change }).success).toBe(false);
  });
});

describe("request boundary validation", () => {
  it("requires a meaningful question and eligible-field shape", () => {
    const value = {
      expectedRevision: 3,
      runId: "r",
      sourceId: "s",
      question: "Check total",
      assigneeId: "reviewer",
    };
    expect(createRequestSchema.safeParse(value).success).toBe(true);
    expect(createRequestSchema.safeParse({ ...value, question: " " }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...value, field: "password" }).success).toBe(false);
  });
  it("rejects blank replies and malformed reassignment", () => {
    expect(requestCommandSchema.safeParse({ ...command("respond"), message: " " }).success).toBe(
      false,
    );
    expect(
      requestCommandSchema.safeParse({ ...command("reassign"), assigneeId: undefined }).success,
    ).toBe(false);
    expect(
      requestCommandSchema.safeParse({ ...command("respond"), assigneeId: "other" }).success,
    ).toBe(false);
  });
});

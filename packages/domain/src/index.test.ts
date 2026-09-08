import { describe, it, expect } from "vitest";
import { emptyFields, fieldsSchema, type Mutation } from "@ledgerroot/contracts";
import { parseMoney, moneyInput, missingFields, reviewTransition } from "./index.js";
const fields = {
  ...emptyFields,
  documentType: "receipt" as const,
  vendor: "Cedar",
  documentDate: "2026-09-02",
  totalCents: 1001,
  currency: "USD" as const,
};
const current = {
  stage: "READY" as const,
  reviewStatus: "PENDING" as const,
  revision: 0,
  runId: "run-1",
};
const input: Mutation = { expectedRevision: 0, runId: "run-1", fields, note: "", confirmed: true };
describe("Exact money", () => {
  it.each([
    ["0", 0],
    ["0.01", 1],
    ["10.1", 1010],
    ["999.99", 99999],
    ["", null],
  ])("parses %s without floating point arithmetic", (v, expected) =>
    expect(parseMoney(String(v))).toBe(expected),
  );
  it.each(["-1", "1.234", "1e2", "Infinity", "1,000", "$9", "999999999999999999"])(
    "rejects %s",
    (v) => expect(() => parseMoney(v)).toThrow(),
  );
  it("round trips cents", () => {
    for (let i = 0; i < 10000; i += 7) expect(parseMoney(moneyInput(i))).toBe(i);
  });
});
describe("Review boundaries", () => {
  it("requires explicit confirmation", () =>
    expect(() => reviewTransition(current, "approve", { ...input, confirmed: false })).toThrow(
      /Confirm/,
    ));
  it("requires every core field", () => {
    for (const key of missingFields(emptyFields))
      expect(() =>
        reviewTransition(current, "approve", { ...input, fields: { ...fields, [key]: null } }),
      ).toThrow();
  });
  it("accepts a reviewed zero total", () =>
    expect(
      reviewTransition(current, "approve", { ...input, fields: { ...fields, totalCents: 0 } }),
    ).toBe("APPROVED"));
  it("detects a stale revision", () =>
    expect(() => reviewTransition(current, "save", { ...input, expectedRevision: 1 })).toThrow(
      /changed/,
    ));
  it("detects a stale extraction run", () =>
    expect(() => reviewTransition(current, "save", { ...input, runId: "old" })).toThrow(/changed/));
  it("reject requires a reason", () =>
    expect(() => reviewTransition(current, "reject", input)).toThrow(/reason/));
  it("keeps needs-information visible when saving", () =>
    expect(reviewTransition({ ...current, reviewStatus: "NEEDS_INFORMATION" }, "save", input)).toBe(
      "NEEDS_INFORMATION",
    ));
  it("requires reopening an approved record", () =>
    expect(() => reviewTransition({ ...current, reviewStatus: "APPROVED" }, "save", input)).toThrow(
      /Reopen/,
    ));
  it("reopens approved records", () =>
    expect(reviewTransition({ ...current, reviewStatus: "APPROVED" }, "reopen", input)).toBe(
      "PENDING",
    ));
  it("retries only failed runs", () => {
    expect(() => reviewTransition(current, "retry", input)).toThrow();
    expect(reviewTransition({ ...current, stage: "FAILED" }, "retry", input)).toBe("NOT_READY");
  });
  it("does not review incomplete processing", () =>
    expect(() => reviewTransition({ ...current, stage: "OCR" }, "approve", input)).toThrow(
      /processing/,
    ));
  it("rejects impossible dates", () =>
    expect(fieldsSchema.safeParse({ ...fields, documentDate: "2026-02-30" }).success).toBe(false));
  it("rejects unrecognized fields", () =>
    expect(fieldsSchema.safeParse({ ...fields, approve: true }).success).toBe(false));
});

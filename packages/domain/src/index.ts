import {
  ApiError,
  fieldsSchema,
  type Fields,
  type ReviewAction,
  type ReviewStatus,
  type Stage,
  type Mutation,
} from "@ledgerroot/contracts";

export function parseMoney(input: string): number | null {
  const value = input.trim();
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new ApiError("INVALID_MONEY", "Enter a positive amount with at most two decimals.", 422);
  const [whole = "0", fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > 999_999_999n)
    throw new ApiError("INVALID_MONEY", "Amount exceeds the supported limit.", 422);
  return Number(cents);
}
export function moneyInput(cents: number | null) {
  return cents === null ? "" : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
export function formatMoney(cents: number | null) {
  return cents === null
    ? "Not extracted"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
export function missingFields(fields: Fields) {
  return (["documentType", "vendor", "documentDate", "totalCents", "currency"] as const).filter(
    (k) => fields[k] === null,
  );
}
export function reviewTransition(
  current: { stage: Stage; reviewStatus: ReviewStatus; revision: number; runId: string },
  action: ReviewAction,
  input: Mutation,
): ReviewStatus {
  if (current.revision !== input.expectedRevision || current.runId !== input.runId)
    throw new ApiError(
      "REVISION_CONFLICT",
      "This record changed. Your edits are preserved; compare with the latest version.",
      409,
    );
  fieldsSchema.parse(input.fields);
  if (action === "retry") {
    if (current.stage !== "FAILED")
      throw new ApiError("INVALID_TRANSITION", "Only failed processing can be retried.", 409);
    return "NOT_READY";
  }
  if (current.stage !== "READY")
    throw new ApiError("NOT_READY", "Wait for processing to finish before reviewing.", 409);
  if (action === "reopen") {
    if (!["APPROVED", "REJECTED", "NEEDS_INFORMATION"].includes(current.reviewStatus))
      throw new ApiError("INVALID_TRANSITION", "This record is already open.", 409);
    return "PENDING";
  }
  if (!["PENDING", "NEEDS_INFORMATION"].includes(current.reviewStatus))
    throw new ApiError("INVALID_TRANSITION", "Reopen this record before making changes.", 409);
  if (action === "approve") {
    if (missingFields(input.fields).length)
      throw new ApiError(
        "MISSING_FIELDS",
        "Confirm the document type, vendor, date, total, and currency.",
        422,
      );
    if (!input.confirmed)
      throw new ApiError(
        "CONFIRMATION_REQUIRED",
        "Confirm that you reviewed the required fields against the source.",
        422,
      );
    return "APPROVED";
  }
  if (action === "reject" || action === "needs-information") {
    if (!input.note.trim())
      throw new ApiError(
        "REASON_REQUIRED",
        "Add a reason so the next reviewer knows what to do.",
        422,
      );
    return action === "reject" ? "REJECTED" : "NEEDS_INFORMATION";
  }
  return current.reviewStatus;
}
export const stageLabels: Record<Stage, string> = {
  PENDING_DISPATCH: "Waiting to dispatch",
  QUEUED: "Queued",
  OCR: "Reading image",
  EXTRACTING: "Extracting fields",
  VALIDATING: "Checking evidence",
  READY: "Ready",
  RETRY_WAIT: "Waiting to retry",
  FAILED: "Processing failed",
};
export const reviewLabels: Record<ReviewStatus, string> = {
  NOT_READY: "Processing",
  PENDING: "Needs review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  NEEDS_INFORMATION: "Needs information",
};

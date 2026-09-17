import type { DocumentRecord } from "@ledgerroot/contracts";
import { formatMoney } from "@ledgerroot/domain";

export function documentCompleteness(document: Pick<DocumentRecord, "fields" | "stage">) {
  // Report saved values, not original model output: human corrections can fill gaps.
  const total =
    document.fields.totalCents !== null
      ? formatMoney(document.fields.totalCents)
      : document.stage === "READY"
        ? "Total not extracted"
        : document.stage === "FAILED"
          ? "Unavailable"
          : "Processing";
  return { total };
}

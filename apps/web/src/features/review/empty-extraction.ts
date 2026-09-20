import { type DocumentRecord } from "@ledgerroot/contracts";

export function reviewWarnings(
  document: Pick<DocumentRecord, "stage" | "extraction" | "reviewStatus">,
): string[] {
  const warnings = document.extraction?.warnings ?? [];
  if (["APPROVED", "REJECTED"].includes(document.reviewStatus) || !hasEmptyExtraction(document))
    return warnings;
  return warnings.filter(
    (warning) =>
      !/^(documentType|vendor|documentDate|totalCents|currency|invoiceNumber|dueDate): needs human confirmation\.$/.test(
        warning,
      ),
  );
}

// Inspect the recorded model output, never the human's saved values or unsaved draft.
export function hasEmptyExtraction(
  document: Pick<DocumentRecord, "stage" | "extraction">,
): boolean {
  return (
    document.stage === "READY" &&
    document.extraction != null &&
    Object.values(document.extraction.fields).every((value) => value === null)
  );
}

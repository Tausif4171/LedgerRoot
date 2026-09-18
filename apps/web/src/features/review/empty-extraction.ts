import { type DocumentRecord } from "@ledgerroot/contracts";

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

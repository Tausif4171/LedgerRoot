import { expect, test } from "vitest";
import { emptyFields, type DocumentRecord } from "@ledgerroot/contracts";
import { hasEmptyExtraction } from "./empty-extraction";

const extraction: NonNullable<DocumentRecord["extraction"]> = {
  fields: emptyFields,
  evidence: {
    documentType: [],
    vendor: [],
    documentDate: [],
    totalCents: [],
    currency: [],
    invoiceNumber: [],
    dueDate: [],
  },
  spans: [],
  durationMs: 0,
  warnings: [],
  model: "test",
  modelDigest: "test",
  promptVersion: "test",
  provenance: "live",
};

test("completed extraction with no values receives guidance", () => {
  expect(hasEmptyExtraction({ stage: "READY", extraction })).toBe(true);
});

test("partial extraction, including zero or an optional field, is not empty", () => {
  for (const fields of [
    { ...emptyFields, vendor: "Vendor" },
    { ...emptyFields, totalCents: 0 },
    { ...emptyFields, invoiceNumber: "INV-1" },
  ]) {
    expect(hasEmptyExtraction({ stage: "READY", extraction: { ...extraction, fields } })).toBe(
      false,
    );
  }
});

test("processing, failure, and absent results are not empty successful extractions", () => {
  for (const stage of ["QUEUED", "FAILED"] as const) {
    expect(hasEmptyExtraction({ stage, extraction })).toBe(false);
  }
  expect(hasEmptyExtraction({ stage: "READY", extraction: null })).toBe(false);
});

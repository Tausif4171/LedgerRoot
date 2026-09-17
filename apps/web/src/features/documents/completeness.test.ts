import { expect, test } from "vitest";
import { emptyFields } from "@ledgerroot/contracts";
import { documentCompleteness } from "./completeness";

test("labels only the absent total, not the entire extraction", () => {
  expect(documentCompleteness({ stage: "READY", fields: emptyFields })).toEqual({
    total: "Total not extracted",
  });
});
test("partial extraction does not label an extracted date as missing", () => {
  const result = documentCompleteness({
    stage: "READY",
    fields: {
      ...emptyFields,
      vendor: "Prairie Equipment",
      documentDate: "2026-09-02",
      invoiceNumber: "INV-1043",
    },
  });
  expect(result).toEqual({ total: "Total not extracted" });
});
test("completed saved corrections and zero totals are not missing", () => {
  expect(
    documentCompleteness({
      stage: "READY",
      fields: {
        ...emptyFields,
        documentType: "invoice",
        vendor: "Vendor",
        documentDate: "2026-09-02",
        totalCents: 0,
        currency: "USD",
      },
    }),
  ).toEqual({ total: "$0.00" });
});
test("processing and failure do not prematurely report extraction gaps", () => {
  expect(documentCompleteness({ stage: "QUEUED", fields: emptyFields })).toEqual({
    total: "Processing",
  });
  expect(documentCompleteness({ stage: "FAILED", fields: emptyFields })).toEqual({
    total: "Unavailable",
  });
});

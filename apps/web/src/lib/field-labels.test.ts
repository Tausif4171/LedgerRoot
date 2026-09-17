import { test, expect } from "vitest";
import { readableWarning } from "./field-labels";

test("technical warning prefixes use human-readable field names", () => {
  expect(readableWarning("documentType: needs human confirmation.")).toBe(
    "Document type: needs human confirmation.",
  );
  expect(readableWarning("documentDate: needs human confirmation.")).toBe(
    "Document date: needs human confirmation.",
  );
  expect(readableWarning("totalCents: needs human confirmation.")).toBe(
    "Total amount: needs human confirmation.",
  );
});
test("other warnings remain unchanged", () => {
  const warning = "Multiple total labels found. Compare the final total against the source.";
  expect(readableWarning(warning)).toBe(warning);
});

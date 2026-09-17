import type { FieldName } from "@ledgerroot/contracts";
import { formatMoney } from "@ledgerroot/domain";
export const fieldLabels: Record<FieldName, string> = {
  documentType: "Document type",
  vendor: "Vendor",
  documentDate: "Document date",
  totalCents: "Total amount",
  currency: "Currency",
  invoiceNumber: "Invoice number",
  dueDate: "Due date",
};
export function fieldValue(field: FieldName, value: string | number | null) {
  if (value === null) return "Not supplied";
  return field === "totalCents" && typeof value === "number" ? formatMoney(value) : String(value);
}

// Presentation only: retain the original extraction warnings in persisted history.
export function readableWarning(warning: string) {
  return warning.replace(
    /\b(documentType|vendor|documentDate|totalCents|currency|invoiceNumber|dueDate)(?=:)/g,
    (field) => fieldLabels[field as FieldName],
  );
}

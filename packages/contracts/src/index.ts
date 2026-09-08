import { z } from "zod";

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 24_000_000;
export const fieldNames = [
  "documentType",
  "vendor",
  "documentDate",
  "totalCents",
  "currency",
  "invoiceNumber",
  "dueDate",
] as const;
export type FieldName = (typeof fieldNames)[number];
export const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Enter a valid calendar date");
export const fieldsSchema = z
  .object({
    documentType: z.enum(["receipt", "invoice"]).nullable(),
    vendor: z.string().trim().min(1).max(200).nullable(),
    documentDate: dateValue.nullable(),
    totalCents: z.number().int().min(0).max(999_999_999).nullable(),
    currency: z.literal("USD").nullable(),
    invoiceNumber: z.string().trim().min(1).max(100).nullable(),
    dueDate: dateValue.nullable(),
  })
  .strict();
export type Fields = z.infer<typeof fieldsSchema>;
export const emptyFields: Fields = {
  documentType: null,
  vendor: null,
  documentDate: null,
  totalCents: null,
  currency: null,
  invoiceNumber: null,
  dueDate: null,
};
export const spanSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type Span = z.infer<typeof spanSchema>;
export const extractionSchema = z
  .object({
    fields: fieldsSchema,
    evidence: z.record(z.enum(fieldNames), z.array(z.string()).max(12)),
  })
  .strict();
export const resultSchema = extractionSchema.extend({
  spans: z.array(spanSchema),
  warnings: z.array(z.string()),
  model: z.string(),
  modelDigest: z.string(),
  promptVersion: z.string(),
  durationMs: z.number(),
  provenance: z.enum(["live", "authored-fixture"]),
});
export type Extraction = z.infer<typeof resultSchema>;
export const stages = [
  "PENDING_DISPATCH",
  "QUEUED",
  "OCR",
  "EXTRACTING",
  "VALIDATING",
  "READY",
  "RETRY_WAIT",
  "FAILED",
] as const;
export type Stage = (typeof stages)[number];
export const reviewStatuses = [
  "NOT_READY",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NEEDS_INFORMATION",
] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];
export const historySchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.string(),
  action: z.string(),
  note: z.string().nullable(),
  before: fieldsSchema.nullable(),
  after: fieldsSchema.nullable(),
});
export type HistoryEvent = z.infer<typeof historySchema>;
export const documentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  createdAt: z.string(),
  checksum: z.string(),
  sourceUrl: z.string(),
  thumbnailUrl: z.string().optional(),
  stage: z.enum(stages),
  reviewStatus: z.enum(reviewStatuses),
  revision: z.number().int(),
  runId: z.string(),
  fields: fieldsSchema,
  extraction: resultSchema.nullable(),
  history: z.array(historySchema),
  failure: z.string().nullable(),
  canReview: z.boolean(),
  sample: z.boolean(),
});
export type DocumentRecord = z.infer<typeof documentSchema>;
export const actions = [
  "save",
  "approve",
  "reject",
  "needs-information",
  "reopen",
  "retry",
] as const;
export type ReviewAction = (typeof actions)[number];
export const mutationSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    runId: z.string().min(1).max(100),
    fields: fieldsSchema,
    note: z.string().trim().max(1000).default(""),
    confirmed: z.boolean().default(false),
  })
  .strict();
export type Mutation = z.infer<typeof mutationSchema>;
export type Role = "OWNER" | "REVIEWER" | "VIEWER";
export interface Identity {
  userId: string;
  name: string;
  workspaceId: string;
  role: Role;
}
export const listSchema = z.object({
  items: z.array(documentSchema),
  nextCursor: z.string().nullable(),
});
export const summarySchema = z.object({
  total: z.number().int(),
  attention: z.number().int(),
  approved: z.number().int(),
});
export interface ListQuery {
  q?: string;
  status?: string;
  cursor?: string;
}
export const evaluationSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  datasetVersion: z.string(),
  model: z.string(),
  modelDigest: z.string(),
  promptVersion: z.string(),
  hardware: z.string(),
  split: z.enum(["development", "holdout", "all"]),
  cases: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      expectedCount: z.number(),
      attempted: z.number(),
      correct: z.number(),
      unsupported: z.number(),
      durationMs: z.number(),
      error: z.string().nullable(),
    }),
  ),
});
export type Evaluation = z.infer<typeof evaluationSchema>;
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryable = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

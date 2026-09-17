import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const message = z.string().trim().min(1).max(1000);
export const requestStates = ["OPEN", "RESPONDED", "RESOLVED", "CANCELED"] as const;
export type RequestState = (typeof requestStates)[number];
export const documentGuardSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  runId: id,
  sourceId: id,
});
export const createRequestSchema = documentGuardSchema
  .extend({
    question: message,
    assigneeId: id,
    field: z
      .enum([
        "documentType",
        "vendor",
        "documentDate",
        "totalCents",
        "currency",
        "invoiceNumber",
        "dueDate",
      ])
      .nullable()
      .default(null),
  })
  .strict();
export const requestCommandSchema = documentGuardSchema
  .extend({
    expectedRequestVersion: z.number().int().nonnegative(),
    action: z.enum(["respond", "follow-up", "reassign", "resolve", "cancel"]),
    message: z.string().trim().max(1000).default(""),
    assigneeId: id.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (["respond", "follow-up", "cancel"].includes(value.action) && !value.message)
      ctx.addIssue({ code: "custom", path: ["message"], message: "Add a response or reason." });
    if (value.action === "reassign" && !value.assigneeId)
      ctx.addIssue({
        code: "custom",
        path: ["assigneeId"],
        message: "Choose an eligible teammate.",
      });
    if (value.action !== "reassign" && value.assigneeId)
      ctx.addIssue({
        code: "custom",
        path: ["assigneeId"],
        message: "Assignee is only valid for reassignment.",
      });
  });
export const replaceSourceSchema = documentGuardSchema
  .extend({
    confirmedSameDocument: z.literal(true),
    reason: message,
    requestId: id.optional(),
    expectedRequestVersion: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.requestId === undefined) !== (value.expectedRequestVersion === undefined))
      ctx.addIssue({
        code: "custom",
        path: ["requestId"],
        message: "Provide both the request and its expected version.",
      });
  });
export type RequestCommand = z.infer<typeof requestCommandSchema>;
export type DocumentGuard = z.infer<typeof documentGuardSchema>;

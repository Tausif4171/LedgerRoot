import express, { type Request, type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { mkdtemp, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { ApiError, MAX_BYTES, mutationSchema, actions, type Identity } from "@ledgerroot/contracts";
import { db } from "./infrastructure/database.js";
import { Storage, type ObjectStore } from "./infrastructure/storage.js";
import { logger } from "./infrastructure/logger.js";
import { environment } from "./config/env.js";
import { createAuth } from "./modules/auth/service.js";
import { createRequest, changeRequest } from "./modules/requests/service.js";
import { replaceSource } from "./modules/sources/service.js";
import { uploadFilename } from "./modules/documents/upload-filename.js";
import {
  getDocument,
  includeDocument,
  mutate,
  serialize,
  upload,
} from "./modules/documents/service.js";
export async function createApp(
  options: { store?: ObjectStore; identity?: (req: Request) => Promise<Identity> } = {},
) {
  const env = environment();
  const app = express();
  const store = options.store ?? new Storage();
  const auth = createAuth();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId);
    if (req.path.startsWith("/api/v1")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/health/live", (_req, res) => res.json({ status: "alive" }));
  app.get("/health/ready", async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  });
  app.all("/api/auth/*splat", toNodeHandler(auth));
  app.use(express.json({ limit: "64kb" }));
  app.use(
    "/api/v1",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(new ApiError("RATE_LIMIT", "Too many requests. Please wait a minute.", 429, true)),
    }),
  );
  app.use("/api/v1", async (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("origin") !== env.APP_ORIGIN)
      throw new ApiError("ORIGIN_REJECTED", "Request origin is not allowed.", 403);
    if (options.identity) {
      res.locals.identity = await options.identity(req);
      return next();
    }
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new ApiError("UNAUTHENTICATED", "Sign in to access your documents.", 401);
    const membership = await db.membership.findFirst({
      where: {
        userId: session.user.id,
        ...(req.get("x-workspace-id") ? { workspaceId: req.get("x-workspace-id") } : {}),
      },
    });
    if (!membership) throw new ApiError("FORBIDDEN", "No workspace access.", 403);
    res.locals.identity = {
      userId: session.user.id,
      name: session.user.name,
      workspaceId: membership.workspaceId,
      role: membership.role,
    };
    next();
  });
  app.get("/api/v1/me", (_req, res) => res.json(res.locals.identity));
  app.get("/api/v1/request-assignees", async (_req, res) => {
    const rows = await db.membership.findMany({
      where: { workspaceId: res.locals.identity.workspaceId, role: { in: ["OWNER", "REVIEWER"] } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { userId: "asc" },
    });
    res.json(rows.map((m) => m.user));
  });
  app.get("/api/v1/requests-summary", async (_req, res) => {
    const identity = res.locals.identity as Identity;
    if (identity.role === "VIEWER") return res.json({ actionable: 0 });
    const actionable = await db.correctionRequest.count({
      where: {
        document: { workspaceId: identity.workspaceId },
        OR: [{ state: "OPEN", assigneeId: identity.userId }, { state: "RESPONDED" }],
      },
    });
    res.json({ actionable });
  });
  app.get("/api/v1/requests", async (req, res) => {
    const query = z
      .object({
        view: z.enum(["mine", "review", "all", "active"]).default("mine"),
        documentId: z.string().max(100).optional(),
        cursor: z.string().max(100).optional(),
        q: z.string().max(200).default(""),
      })
      .parse(req.query);
    const identity = res.locals.identity as Identity;
    const rows = await db.correctionRequest.findMany({
      where: {
        document: { workspaceId: identity.workspaceId },
        ...(query.documentId ? { documentId: query.documentId } : {}),
        ...(query.view === "mine"
          ? { assigneeId: identity.userId, state: "OPEN" }
          : query.view === "review"
            ? { state: "RESPONDED" }
            : query.view === "active"
              ? { state: { in: ["OPEN", "RESPONDED"] } }
              : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        question: { contains: query.q, mode: "insensitive" },
      },
      include: {
        document: { select: { filename: true } },
        events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
      orderBy: { id: "asc" },
      take: 51,
    });
    res.json({ items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null });
  });
  app.post("/api/v1/documents/:id/requests", async (req, res) =>
    res
      .status(201)
      .json(
        await createRequest(
          String(req.params.id),
          res.locals.identity,
          z.string().min(8).max(128).parse(req.get("idempotency-key")),
          req.body,
        ),
      ),
  );
  for (const [path, action] of Object.entries({
    responses: "respond",
    "follow-up": "follow-up",
    reassign: "reassign",
    resolve: "resolve",
    cancel: "cancel",
  })) {
    app.post(`/api/v1/requests/:id/${path}`, async (req, res) =>
      res.json(
        await changeRequest(
          String(req.params.id),
          res.locals.identity,
          z.string().min(8).max(128).parse(req.get("idempotency-key")),
          { ...req.body, action },
        ),
      ),
    );
  }
  app.get("/api/v1/documents-summary", async (_req, res) => {
    const { workspaceId } = res.locals.identity as Identity;
    const [summary] = await db.$queryRaw<
      Array<{ total: number; attention: number; approved: number }>
    >`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE d."reviewStatus" IN ('PENDING','NEEDS_INFORMATION') OR r.stage='FAILED')::int AS attention,
        COUNT(*) FILTER (WHERE d."reviewStatus"='APPROVED')::int AS approved
      FROM "Document" d JOIN "ProcessingRun" r ON r.id=d."latestRunId" WHERE d."workspaceId"=${workspaceId}`;
    res.json(summary);
  });
  const temp = await mkdtemp(join(tmpdir(), "ledgerroot-upload-"));
  const receive = multer({
    dest: temp,
    limits: { fileSize: MAX_BYTES, files: 1, fields: 1, fieldSize: 8192, parts: 3 },
  }).single("file");
  const receiveSource = multer({
    dest: temp,
    limits: { fileSize: MAX_BYTES, files: 1, fields: 2, fieldSize: 8192, parts: 4 },
  }).single("file");
  app.post("/api/v1/documents/:id/sources", (req, res, next) => {
    if ((res.locals.identity as Identity).role === "VIEWER")
      return next(new ApiError("FORBIDDEN", "Viewer access cannot upload.", 403));
    receiveSource(req, res, (error) => {
      if (error) return next(error);
      void (async () => {
        if (!req.file) throw new ApiError("FILE_REQUIRED", "Select a JPEG or PNG image.", 422);
        try {
          const metadata = z.string().max(8192).parse(req.body.metadata);
          let value: unknown;
          try {
            value = JSON.parse(metadata);
          } catch {
            throw new ApiError("INVALID_JSON", "Upload metadata must be JSON.", 422);
          }
          const result = await replaceSource(
            String(req.params.id),
            res.locals.identity,
            z.string().min(8).max(128).parse(req.get("idempotency-key")),
            value,
            await readFile(req.file.path),
            uploadFilename(req.body.filename, req.file.originalname),
            store,
          );
          const duplicate = z.object({ duplicate: z.boolean(), id: z.string() }).parse(result);
          if (duplicate.duplicate && duplicate.id !== String(req.params.id)) {
            res.status(409).json({
              ...(result as object),
              error: {
                code: "DUPLICATE_DOCUMENT",
                message: "This image belongs to another document in your workspace.",
                retryable: false,
                requestId: res.locals.requestId,
              },
            });
          } else res.status(duplicate.duplicate ? 200 : 202).json(result);
        } finally {
          await unlink(req.file.path);
        }
      })().catch(next);
    });
  });
  app.get("/api/v1/documents/:id/sources", async (req, res) => {
    const documentId = String(req.params.id);
    const cursor = z.coerce.number().int().positive().optional().parse(req.query.cursor);
    const doc = await db.document.findFirst({
      where: { id: documentId, workspaceId: res.locals.identity.workspaceId },
      select: { currentSourceId: true },
    });
    if (!doc) throw new ApiError("NOT_FOUND", "Document not found.", 404);
    const sources = await db.sourceRevision.findMany({
      where: { documentId, ...(cursor ? { version: { lt: cursor } } : {}) },
      orderBy: { version: "desc" },
      take: 21,
    });
    const runs = await db.processingRun.findMany({
      where: { documentId, sourceId: { in: sources.slice(0, 20).map((s) => s.id) } },
      include: { result: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      items: sources.slice(0, 20).map((s) => {
        const run = runs.find((r) => r.sourceId === s.id);
        return {
          id: s.id,
          version: s.version,
          filename: s.filename,
          uploaderName: s.uploaderName,
          reason: s.reason,
          createdAt: s.createdAt,
          current: s.id === doc.currentSourceId,
          stage: run?.stage ?? "FAILED",
          extraction: run?.result?.payload ?? null,
          sourceUrl: `/api/v1/documents/${documentId}/sources/${s.id}/source${run ? `?runId=${run.id}` : ""}`,
        };
      }),
      nextCursor: sources.length > 20 ? sources[19]!.version : null,
    });
  });
  app.get("/api/v1/documents/:id/sources/:sourceId/source", async (req, res) => {
    const source = await db.sourceRevision.findFirst({
      where: {
        id: String(req.params.sourceId),
        documentId: String(req.params.id),
        document: { workspaceId: res.locals.identity.workspaceId },
      },
    });
    if (!source) throw new ApiError("NOT_FOUND", "Source not found.", 404);
    // Historical evidence requires the normalized derivative from this exact source's run.
    const run = await db.processingRun.findFirst({
      where: {
        sourceId: source.id,
        documentId: source.documentId,
        ...(req.query.runId ? { id: z.string().min(1).max(100).parse(req.query.runId) } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (req.query.runId && !run)
      throw new ApiError("NOT_FOUND", "Processing run not found for this source.", 404);
    const artifact =
      run && req.query.original !== "1"
        ? await db.artifact.findUnique({
            where: {
              runId_kind: {
                runId: run.id,
                kind: req.query.thumbnail === "1" ? "thumbnail" : "normalized",
              },
            },
          })
        : null;
    res.redirect(302, await store.url(artifact?.objectKey ?? source.objectKey));
  });
  app.post("/api/v1/documents", (req, res, next) => {
    if ((res.locals.identity as Identity).role === "VIEWER")
      return next(new ApiError("FORBIDDEN", "Viewer access cannot upload.", 403));
    receive(req, res, (error) => {
      if (error) return next(error);
      void (async () => {
        if (!req.file) throw new ApiError("FILE_REQUIRED", "Select a JPEG or PNG image.", 422);
        try {
          const key = z.string().min(8).max(128).parse(req.get("idempotency-key"));
          const result = await upload(
            await readFile(req.file.path),
            uploadFilename(req.body.filename, req.file.originalname),
            res.locals.identity,
            key,
            store,
          );
          res.status((result as { duplicate: boolean }).duplicate ? 200 : 202).json(result);
        } finally {
          await unlink(req.file.path);
        }
      })().catch(next);
    });
  });
  app.get("/api/v1/documents", async (req, res) => {
    const q = z
      .object({
        q: z.string().max(200).optional(),
        status: z
          .enum(["all", "review", "processing", "approved", "failed", "rejected"])
          .default("all"),
        cursor: z.string().max(100).optional(),
      })
      .parse(req.query);
    const identity = res.locals.identity as Identity;
    // Stable ID pagination; enforce workspace/filter scope before applying the cursor.
    const status =
      q.status === "review"
        ? Prisma.sql`d."reviewStatus" IN ('PENDING','NEEDS_INFORMATION')`
        : q.status === "approved"
          ? Prisma.sql`d."reviewStatus"='APPROVED'`
          : q.status === "rejected"
            ? Prisma.sql`d."reviewStatus"='REJECTED'`
            : q.status === "failed"
              ? Prisma.sql`r.stage='FAILED'`
              : q.status === "processing"
                ? Prisma.sql`r.stage NOT IN ('READY','FAILED')`
                : Prisma.sql`TRUE`;
    const ids = await db.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT d.id FROM "Document" d JOIN "ProcessingRun" r ON r.id=d."latestRunId" WHERE d."workspaceId"=${identity.workspaceId} AND d.id>${q.cursor ?? ""} AND (d.filename ILIKE ${`%${q.q ?? ""}%`} OR d.fields->>'vendor' ILIKE ${`%${q.q ?? ""}%`}) AND ${status} ORDER BY d.id ASC LIMIT 51`,
    );
    const rows = await db.document.findMany({
      where: { id: { in: ids.slice(0, 50).map((d) => d.id) }, workspaceId: identity.workspaceId },
      include: includeDocument,
      orderBy: { id: "asc" },
    });
    const items = rows.map((d) => serialize(d, identity));
    res.json({ items, nextCursor: ids.length > 50 ? items.at(-1)!.id : null });
  });
  app.get("/api/v1/documents/:id", async (req, res) =>
    res.json(await getDocument(String(req.params.id), res.locals.identity)),
  );
  app.get("/api/v1/documents/:id/history", async (req, res) =>
    res.json((await getDocument(String(req.params.id), res.locals.identity)).history),
  );
  app.get("/api/v1/documents/:id/source", async (req, res) => {
    const d = await db.document.findFirst({
      where: {
        id: String(req.params.id),
        workspaceId: (res.locals.identity as Identity).workspaceId,
      },
    });
    if (!d) throw new ApiError("NOT_FOUND", "Document not found.", 404);
    const preview =
      req.query.original === "1"
        ? null
        : await db.artifact.findUnique({
            where: {
              runId_kind: {
                runId: d.latestRunId,
                kind: req.query.thumbnail === "1" ? "thumbnail" : "normalized",
              },
            },
          });
    const source = await db.sourceRevision.findFirstOrThrow({
      where: { id: d.currentSourceId, documentId: d.id },
    });
    res.redirect(302, await store.url(preview?.objectKey ?? source.objectKey));
  });
  app.patch("/api/v1/documents/:id/review", async (req, res) =>
    res.json(
      await mutate(
        String(req.params.id),
        res.locals.identity,
        z.string().min(8).max(128).parse(req.get("idempotency-key")),
        "save",
        mutationSchema.parse(req.body),
      ),
    ),
  );
  app.post("/api/v1/documents/:id/:action", async (req, res) => {
    const action = z.enum(actions).parse(req.params.action);
    res.json(
      await mutate(
        String(req.params.id),
        res.locals.identity,
        z.string().min(8).max(128).parse(req.get("idempotency-key")),
        action,
        mutationSchema.parse(req.body),
      ),
    );
  });
  app.get("/api/v1/evaluations", async (_req, res) =>
    res.json(
      (await db.evaluationRun.findMany({ orderBy: { createdAt: "desc" }, take: 10 })).map(
        (r) => r.payload,
      ),
    ),
  );
  app.use("/api/v1", () => {
    throw new ApiError("NOT_FOUND", "Endpoint not found.", 404);
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const isZod = error instanceof z.ZodError;
    const limit = error instanceof multer.MulterError;
    const malformed =
      error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed";
    const status =
      error instanceof ApiError ? error.status : isZod ? 422 : limit ? 413 : malformed ? 400 : 500;
    const code =
      error instanceof ApiError
        ? error.code
        : isZod
          ? "VALIDATION_ERROR"
          : limit
            ? "UPLOAD_LIMIT"
            : malformed
              ? "INVALID_JSON"
              : "INTERNAL_ERROR";
    if (status >= 500) logger.error({ requestId: res.locals.requestId, code }, "Request failed");
    res.status(status).json({
      error: {
        code,
        message:
          error instanceof ApiError
            ? error.message
            : isZod
              ? "Check the submitted fields."
              : limit
                ? "Upload one image up to 10 MiB."
                : malformed
                  ? "The request body must be valid JSON."
                  : "The request could not be completed.",
        fieldErrors: isZod ? error.flatten().fieldErrors : undefined,
        requestId: res.locals.requestId,
        retryable: error instanceof ApiError ? error.retryable : status >= 500,
      },
    });
  };
  app.use(errors);
  return app;
}

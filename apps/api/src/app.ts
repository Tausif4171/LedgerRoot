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
    limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 2 },
  }).single("file");
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
            req.file.originalname,
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
    res.redirect(302, await store.url(preview?.objectKey ?? d.objectKey));
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

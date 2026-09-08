import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import {
  ApiError,
  emptyFields,
  fieldNames,
  type Identity,
  type Extraction,
} from "@ledgerroot/contracts";
import { createApp } from "../../apps/api/src/app.js";
import { db } from "../../apps/api/src/infrastructure/database.js";
import { processRun } from "../../apps/api/src/modules/processing/service.js";
import { dispatchOnce } from "../../apps/api/src/modules/processing/dispatch.js";
import { recoverOnce } from "../../apps/api/src/modules/processing/recovery.js";
import { getDocument, mutate, upload } from "../../apps/api/src/modules/documents/service.js";
const workspaceId = `test-${randomUUID()}`;
const otherId = `test-${randomUUID()}`;
const identity: Identity = {
  workspaceId,
  userId: "test-owner",
  name: "Test reviewer",
  role: "OWNER",
};
const bytes = await readFile("apps/web/public/samples/sample-01.png");
const objects = new Map<string, Buffer>();
const store = {
  async put(key: string, b: Buffer) {
    objects.set(key, b);
  },
  async get(key: string) {
    const b = objects.get(key);
    if (!b) throw new Error("Missing");
    return b;
  },
  async url(key: string) {
    return `http://example.test/${key}`;
  },
};
const fields = {
  ...emptyFields,
  documentType: "receipt" as const,
  vendor: "Cedar Field Supply",
  documentDate: "2026-09-02",
  totalCents: 14850,
  currency: "USD" as const,
};
const extracted: Extraction = {
  fields,
  evidence: Object.fromEntries(fieldNames.map((k) => [k, []])) as Extraction["evidence"],
  spans: [],
  warnings: [],
  model: "deterministic-test-provider",
  modelDigest: "fixture",
  promptVersion: "test",
  durationMs: 1,
  provenance: "authored-fixture",
};
let app: Express;
beforeAll(async () => {
  await db.workspace.createMany({
    data: [
      { id: workspaceId, name: "Isolated tests" },
      { id: otherId, name: "Other isolated workspace" },
    ],
  });
  app = await createApp({
    store,
    identity: async (req) => {
      if (!req.get("x-test-user")) throw new ApiError("UNAUTHENTICATED", "Sign in.", 401);
      return { ...identity, role: req.get("x-test-user") === "viewer" ? "VIEWER" : "OWNER" };
    },
  });
});
afterAll(async () => {
  const docs = await db.document.findMany({
    where: { workspaceId: { in: [workspaceId, otherId] } },
    select: { id: true },
  });
  const ids = docs.map((d) => d.id);
  const runs = await db.processingRun.findMany({
    where: { documentId: { in: ids } },
    select: { id: true },
  });
  const runIds = runs.map((r) => r.id);
  await db.$transaction([
    db.idempotencyRecord.deleteMany({
      where: {
        OR: [
          { scope: { startsWith: `${workspaceId}/` } },
          { scope: { startsWith: `${otherId}/` } },
        ],
      },
    }),
    db.auditEvent.deleteMany({ where: { documentId: { in: ids } } }),
    db.reviewRevision.deleteMany({ where: { documentId: { in: ids } } }),
    db.artifact.deleteMany({ where: { runId: { in: runIds } } }),
    db.extractionResult.deleteMany({ where: { runId: { in: runIds } } }),
    db.processingAttempt.deleteMany({ where: { runId: { in: runIds } } }),
    db.outbox.deleteMany({ where: { runId: { in: runIds } } }),
    db.processingRun.deleteMany({ where: { id: { in: runIds } } }),
    db.document.deleteMany({ where: { id: { in: ids } } }),
    db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherId] } } }),
  ]);
  await db.$disconnect();
});
describe("Database-backed workflow", () => {
  it("rejects corrupt and forged uploads before acknowledging persistence", async () => {
    const before = await db.document.count({ where: { workspaceId } });
    const result = await request(app)
      .post("/api/v1/documents")
      .set("x-test-user", "owner")
      .set("origin", "http://localhost:3100")
      .set("idempotency-key", randomUUID())
      .attach("file", Buffer.from("not a PNG"), {
        filename: "forged.png",
        contentType: "image/png",
      });
    expect(result.status).toBe(422);
    expect(await db.document.count({ where: { workspaceId } })).toBe(before);
  });
  it("enforces authentication, origin and viewer permissions", async () => {
    expect((await request(app).get("/api/v1/documents")).status).toBe(401);
    expect((await request(app).post("/api/v1/documents").set("x-test-user", "owner")).status).toBe(
      403,
    );
    expect(
      (
        await request(app)
          .post("/api/v1/documents")
          .set("x-test-user", "viewer")
          .set("origin", "http://localhost:3100")
      ).status,
    ).toBe(403);
  });
  it("deduplicates simultaneous uploads and preserves durable outbox work", async () => {
    const results = (await Promise.all([
      upload(bytes, "a.png", identity, randomUUID(), store),
      upload(bytes, "a.png", identity, randomUUID(), store),
    ])) as { id: string; duplicate: boolean }[];
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    const d = await getDocument(results[0]!.id, identity);
    expect(d.stage).toBe("PENDING_DISPATCH");
    expect(await db.outbox.count({ where: { runId: d.runId, sentAt: null } })).toBe(1);
  });
  it("runs once, protects revisions and rejects cross-workspace access", async () => {
    const { id } = (await upload(bytes, "a.png", identity, randomUUID(), store)) as { id: string };
    let d = await getDocument(id, identity);
    await processRun(d.runId, store, async () => extracted);
    await processRun(d.runId, store, async () => {
      throw new Error("Must not run again");
    });
    d = await getDocument(id, identity);
    expect(d.stage).toBe("READY");
    expect(d.reviewStatus).toBe("PENDING");
    expect(await db.extractionResult.count({ where: { runId: d.runId } })).toBe(1);
    const input = {
      expectedRevision: d.revision,
      runId: d.runId,
      fields: { ...fields, totalCents: 15100 },
      note: "Compared with original",
      confirmed: true,
    };
    const key = randomUUID();
    await mutate(id, identity, key, "approve", input);
    await mutate(id, identity, key, "approve", input);
    expect(await db.reviewRevision.count({ where: { documentId: id, action: "approve" } })).toBe(1);
    await expect(mutate(id, identity, randomUUID(), "save", input)).rejects.toMatchObject({
      status: 409,
    });
    await expect(mutate(id, identity, key, "save", input)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await expect(getDocument(id, { ...identity, workspaceId: otherId })).rejects.toMatchObject({
      status: 404,
    });
    const saved = await getDocument(id, identity);
    expect(saved.fields.totalCents).toBe(15100);
    expect(saved.extraction?.fields.totalCents).toBe(14850);
  });
  it("retains failures and manual retries as separate runs", async () => {
    const scoped = { ...identity, workspaceId: otherId };
    const { id } = (await upload(bytes, "b.png", scoped, randomUUID(), store)) as { id: string };
    let d = await getDocument(id, scoped);
    const first = d.runId;
    for (let n = 0; n < 3; n++)
      await expect(
        processRun(first, store, async () => {
          throw new ApiError("TEMPORARY", "Model unavailable", 503, true);
        }),
      ).rejects.toThrow();
    d = await getDocument(id, scoped);
    expect(d.stage).toBe("FAILED");
    await mutate(id, scoped, randomUUID(), "retry", {
      expectedRevision: d.revision,
      runId: d.runId,
      fields: d.fields,
      note: "",
      confirmed: false,
    });
    d = await getDocument(id, scoped);
    expect(d.runId).not.toBe(first);
    expect(d.stage).toBe("PENDING_DISPATCH");
    expect(await db.processingAttempt.count({ where: { runId: first } })).toBe(3);
    await processRun(d.runId, store, async () => extracted);
    expect((await getDocument(id, scoped)).stage).toBe("READY");
  });
  it("restores dispatch after an unavailable queue without an inline extraction", async () => {
    const image = await readFile("apps/web/public/samples/sample-03.png");
    const { id } = (await upload(image, "dispatch.png", identity, randomUUID(), store)) as {
      id: string;
    };
    const d = await getDocument(id, identity);
    await expect(
      dispatchOnce(async () => {
        throw new Error("Redis unavailable");
      }, workspaceId),
    ).rejects.toThrow();
    expect((await getDocument(id, identity)).stage).toBe("PENDING_DISPATCH");
    const published: string[] = [];
    await dispatchOnce(async (id) => {
      published.push(id);
    }, workspaceId);
    expect(published).toContain(d.runId);
    expect((await getDocument(id, identity)).stage).toBe("QUEUED");
    const repeated: string[] = [];
    await dispatchOnce(async (id) => {
      repeated.push(id);
    }, workspaceId);
    expect(repeated).toEqual([]);
    await processRun(d.runId, store, async () => extracted);
  });
  it("fences an expired worker and publishes only its replacement result", async () => {
    const image = await readFile("apps/web/public/samples/sample-04.png");
    const { id } = (await upload(image, "crash.png", identity, randomUUID(), store)) as {
      id: string;
    };
    const d = await getDocument(id, identity);
    let entered!: () => void;
    let release!: () => void;
    const running = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const old = processRun(d.runId, store, async () => {
      entered();
      await blocked;
      return extracted;
    });
    await running;
    await db.processingRun.update({
      where: { id: d.runId },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    await recoverOnce(
      { state: async () => "missing", removeTerminal: async () => {} },
      workspaceId,
    );
    const replacement = { ...extracted, fields: { ...fields, vendor: "Replacement result" } };
    await processRun(d.runId, store, async () => replacement);
    const rejected = expect(old).rejects.toMatchObject({ code: "STALE_ATTEMPT" });
    release();
    await rejected;
    expect((await getDocument(id, identity)).fields.vendor).toBe("Replacement result");
    expect(await db.extractionResult.count({ where: { runId: d.runId } })).toBe(1);
    expect(await db.processingAttempt.count({ where: { runId: d.runId } })).toBe(2);
  });
  it("allows only one of two simultaneous reviewers to commit", async () => {
    const image = await readFile("apps/web/public/samples/sample-05.png");
    const { id } = (await upload(image, "review.png", identity, randomUUID(), store)) as {
      id: string;
    };
    let d = await getDocument(id, identity);
    await processRun(d.runId, store, async () => extracted);
    d = await getDocument(id, identity);
    const base = {
      expectedRevision: d.revision,
      runId: d.runId,
      fields,
      note: "",
      confirmed: false,
    };
    const outcomes = await Promise.allSettled([
      mutate(id, identity, randomUUID(), "save", {
        ...base,
        fields: { ...fields, vendor: "Reviewer one" },
      }),
      mutate(id, { ...identity, userId: "reviewer-two" }, randomUUID(), "save", {
        ...base,
        fields: { ...fields, vendor: "Reviewer two" },
      }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(await db.reviewRevision.count({ where: { documentId: id } })).toBe(1);
    expect((await getDocument(id, identity)).revision).toBe(1);
    const summary = await request(app).get("/api/v1/documents-summary").set("x-test-user", "owner");
    expect(summary.status).toBe(200);
    expect(summary.body.total).toBe(await db.document.count({ where: { workspaceId } }));
  });
});

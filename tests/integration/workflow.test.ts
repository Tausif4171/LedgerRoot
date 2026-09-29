import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
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
import { createRequest, changeRequest } from "../../apps/api/src/modules/requests/service.js";
import { replaceSource } from "../../apps/api/src/modules/sources/service.js";
const workspaceId = `test-${randomUUID()}`;
const otherId = `test-${randomUUID()}`;
const teammateId = `${workspaceId}-teammate`;
const authenticatedOwnerId = `${workspaceId}-owner`;
const testPassword = randomUUID();
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
  await db.user.create({
    data: {
      id: teammateId,
      name: "Test teammate",
      email: `${teammateId}@example.test`,
      memberships: { create: { workspaceId, role: "REVIEWER" } },
      accounts: {
        create: {
          id: randomUUID(),
          accountId: teammateId,
          providerId: "credential",
          password: await hashPassword(testPassword),
        },
      },
    },
  });
  await db.user.create({
    data: {
      id: authenticatedOwnerId,
      name: "Authenticated owner",
      email: `${authenticatedOwnerId}@example.test`,
      memberships: { create: { workspaceId, role: "OWNER" } },
      accounts: {
        create: {
          id: randomUUID(),
          accountId: authenticatedOwnerId,
          providerId: "credential",
          password: await hashPassword(testPassword),
        },
      },
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
    db.requestEvent.deleteMany({ where: { request: { documentId: { in: ids } } } }),
    db.correctionRequest.deleteMany({ where: { documentId: { in: ids } } }),
    db.reviewRevision.deleteMany({ where: { documentId: { in: ids } } }),
    db.artifact.deleteMany({ where: { runId: { in: runIds } } }),
    db.extractionResult.deleteMany({ where: { runId: { in: runIds } } }),
    db.processingAttempt.deleteMany({ where: { runId: { in: runIds } } }),
    db.outbox.deleteMany({ where: { runId: { in: runIds } } }),
    db.processingRun.deleteMany({ where: { id: { in: runIds } } }),
    db.sourceRevision.deleteMany({ where: { documentId: { in: ids } } }),
    db.document.deleteMany({ where: { id: { in: ids } } }),
    db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherId] } } }),
    db.user.delete({ where: { id: teammateId } }),
    db.user.delete({ where: { id: authenticatedOwnerId } }),
  ]);
  await db.$disconnect();
});
describe("Database-backed workflow", () => {
  async function readyFixture(label: string) {
    const image = Buffer.concat([bytes, Buffer.from(label)]);
    const { id } = (await upload(image, `${label}.png`, identity, randomUUID(), store)) as {
      id: string;
    };
    const queued = await getDocument(id, identity);
    await processRun(queued.runId, store, async () => extracted);
    return { image, d: await getDocument(id, identity) };
  }
  it("keeps request idempotency, follow-ups, reassignment and cancellation accountable", async () => {
    let { d } = await readyFixture("request-lifecycle");
    const input = {
      expectedRevision: d.revision,
      runId: d.runId,
      sourceId: d.sourceId!,
      question: "Check total",
      assigneeId: teammateId,
    };
    await expect(
      createRequest(d.id, identity, randomUUID(), { ...input, assigneeId: "not-a-member" }),
    ).rejects.toMatchObject({ code: "INVALID_ASSIGNEE" });
    const key = randomUUID();
    const a = await createRequest(d.id, identity, key, input);
    expect(await createRequest(d.id, identity, key, input)).toEqual(a);
    await expect(
      createRequest(d.id, identity, key, { ...input, question: "Different" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const task = await db.correctionRequest.findFirstOrThrow({ where: { documentId: d.id } });
    let version = 0;
    for (const action of ["respond", "follow-up", "reassign", "respond", "cancel"] as const) {
      d = await getDocument(d.id, identity);
      const actor = action === "respond" ? { ...identity, userId: teammateId } : identity;
      await changeRequest(task.id, actor, randomUUID(), {
        expectedRevision: d.revision,
        runId: d.runId,
        sourceId: d.sourceId,
        expectedRequestVersion: version++,
        action,
        message: "Recorded test response",
        ...(action === "reassign" ? { assigneeId: teammateId } : {}),
      });
    }
    expect((await getDocument(d.id, identity)).reviewStatus).toBe("NEEDS_INFORMATION");
    expect(await db.requestEvent.count({ where: { requestId: task.id } })).toBe(6);
    expect((await db.correctionRequest.findUniqueOrThrow({ where: { id: task.id } })).state).toBe(
      "CANCELED",
    );
  });
  it("safely rejects storage failure, duplicate images and simultaneous source replacements", async () => {
    const { d, image } = await readyFixture("source-safety");
    const input = {
      expectedRevision: d.revision,
      runId: d.runId,
      sourceId: d.sourceId!,
      reason: "A clearer image",
      confirmedSameDocument: true,
    };
    const replacement = Buffer.concat([image, Buffer.from("clearer")]);
    await expect(
      replaceSource(d.id, identity, randomUUID(), input, replacement, "clearer.png", {
        ...store,
        put: async () => {
          throw new Error("Injected storage failure");
        },
      }),
    ).rejects.toThrow("Injected storage failure");
    expect((await getDocument(d.id, identity)).revision).toBe(d.revision);
    expect(await db.sourceRevision.count({ where: { documentId: d.id } })).toBe(1);
    const duplicate = (await replaceSource(
      d.id,
      identity,
      randomUUID(),
      input,
      image,
      "same.png",
      store,
    )) as { duplicate: boolean; sourceId: string };
    expect(duplicate).toMatchObject({ duplicate: true, sourceId: d.sourceId });
    const outcomes = await Promise.allSettled([
      replaceSource(d.id, identity, randomUUID(), input, replacement, "clearer.png", store),
      replaceSource(d.id, identity, randomUUID(), input, replacement, "clearer.png", store),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const next = await getDocument(d.id, identity);
    expect(next.stage).toBe("PENDING_DISPATCH");
    expect(await db.outbox.count({ where: { runId: next.runId, sentAt: null } })).toBe(1);
    await processRun(next.runId, store, async () => ({ ...extracted, fields: emptyFields }));
    const ready = await getDocument(d.id, identity);
    expect(ready.fields).toEqual(fields);
    const old = (await replaceSource(
      d.id,
      identity,
      randomUUID(),
      { ...input, expectedRevision: ready.revision, runId: ready.runId, sourceId: ready.sourceId! },
      image,
      "old.png",
      store,
    )) as { duplicate: boolean; sourceId: string };
    expect(old).toMatchObject({ duplicate: true, sourceId: d.sourceId });
    expect((await getDocument(d.id, identity)).sourceId).toBe(ready.sourceId);
  });
  it("serializes approval against replacement and blocks unauthorized source access", async () => {
    const { d, image } = await readyFixture("approve-race");
    const sourceInput = {
      expectedRevision: d.revision,
      runId: d.runId,
      sourceId: d.sourceId!,
      reason: "Clearer",
      confirmedSameDocument: true,
    };
    const results = await Promise.allSettled([
      mutate(d.id, identity, randomUUID(), "approve", {
        expectedRevision: d.revision,
        runId: d.runId,
        fields,
        confirmed: true,
        note: "",
      }),
      replaceSource(
        d.id,
        identity,
        randomUUID(),
        sourceInput,
        Buffer.concat([image, Buffer.from("replacement")]),
        "new.png",
        store,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const afterRace = await getDocument(d.id, identity);
    if (afterRace.stage !== "READY")
      await processRun(afterRace.runId, store, async () => extracted);
    await expect(
      replaceSource(
        d.id,
        { ...identity, role: "VIEWER" },
        randomUUID(),
        sourceInput,
        image,
        "new.png",
        store,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      replaceSource(
        d.id,
        { ...identity, workspaceId: otherId },
        randomUUID(),
        sourceInput,
        image,
        "new.png",
        store,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const other = (await upload(
      Buffer.concat([image, Buffer.from("other-workspace")]),
      "other.png",
      { ...identity, workspaceId: otherId },
      randomUUID(),
      store,
    )) as { id: string };
    expect(
      (await request(app).get(`/api/v1/documents/${other.id}/sources`).set("x-test-user", "owner"))
        .status,
    ).toBe(404);
  });
  it("supports two real authenticated sessions through request and source HTTP endpoints", async () => {
    const server = await createApp({ store });
    const bookkeeper = request.agent(server);
    const teammate = request.agent(server);
    for (const [agent, userId] of [
      [bookkeeper, authenticatedOwnerId],
      [teammate, teammateId],
    ] as const) {
      const login = await agent
        .post("/api/auth/sign-in/email")
        .set("origin", "http://localhost:3100")
        .send({ email: `${userId}@example.test`, password: testPassword });
      expect(login.status).toBe(200);
    }
    const image = Buffer.concat([bytes, Buffer.from("authenticated-sessions")]);
    const unicodeName = "Screenshot 11.44.38\u202fPM – reçu.png";
    const legacyUpload = await bookkeeper
      .post("/api/v1/documents")
      .set("origin", "http://localhost:3100")
      .set("idempotency-key", randomUUID())
      .attach("file", Buffer.concat([bytes, Buffer.from("legacy-unicode-header")]), unicodeName);
    expect(legacyUpload.status).toBe(202);
    expect((await bookkeeper.get(`/api/v1/documents/${legacyUpload.body.id}`)).body.filename).toBe(
      unicodeName,
    );
    const uploaded = await bookkeeper
      .post("/api/v1/documents")
      .set("origin", "http://localhost:3100")
      .set("idempotency-key", randomUUID())
      .field("filename", unicodeName)
      .attach("file", image, "receipt.png");
    expect(uploaded.status).toBe(202);
    const id = uploaded.body.id;
    let d = (await bookkeeper.get(`/api/v1/documents/${id}`)).body;
    expect(d.filename).toBe(unicodeName);
    await processRun(d.runId, store, async () => extracted);
    d = (await bookkeeper.get(`/api/v1/documents/${id}`)).body;
    const create = await bookkeeper
      .post(`/api/v1/documents/${id}/requests`)
      .set("origin", "http://localhost:3100")
      .set("idempotency-key", randomUUID())
      .send({
        expectedRevision: d.revision,
        runId: d.runId,
        sourceId: d.sourceId,
        question: "Please confirm the total",
        assigneeId: teammateId,
      });
    expect(create.status).toBe(201);
    expect(
      (await teammate.get("/api/v1/requests?view=mine")).body.items.some(
        (r: { id: string }) => r.id === create.body.id,
      ),
    ).toBe(true);
    d = (await teammate.get(`/api/v1/documents/${id}`)).body;
    const changed = await teammate
      .post(`/api/v1/documents/${id}/sources`)
      .set("origin", "http://localhost:3100")
      .set("idempotency-key", randomUUID())
      .field("filename", "Clearer – reçu.png")
      .field(
        "metadata",
        JSON.stringify({
          expectedRevision: d.revision,
          runId: d.runId,
          sourceId: d.sourceId,
          confirmedSameDocument: true,
          reason: "Clearer copy",
          requestId: create.body.id,
          expectedRequestVersion: 0,
        }),
      )
      .attach("file", Buffer.concat([bytes, Buffer.from("authenticated-clearer")]), "clearer.png");
    expect(changed.status).toBe(202);
    const sourceVersions = (await bookkeeper.get(`/api/v1/documents/${id}/sources`)).body.items;
    expect(sourceVersions.find((source: { current: boolean }) => source.current).filename).toBe(
      "Clearer – reçu.png",
    );
    await processRun(changed.body.runId, store, async () => extracted);
    const oldImage = await bookkeeper.get(d.sourceUrl);
    expect(oldImage.status).toBe(302);
    expect(await store.get(new URL(oldImage.headers.location).pathname.slice(1))).toEqual(image);
    const wrongRun = await bookkeeper.get(
      `/api/v1/documents/${id}/sources/${d.sourceId}/source?runId=${changed.body.runId}`,
    );
    expect(wrongRun.status).toBe(404);
    d = (await bookkeeper.get(`/api/v1/documents/${id}`)).body;
    const resolved = await bookkeeper
      .post(`/api/v1/requests/${create.body.id}/resolve`)
      .set("origin", "http://localhost:3100")
      .set("idempotency-key", randomUUID())
      .send({
        expectedRevision: d.revision,
        runId: d.runId,
        sourceId: d.sourceId,
        expectedRequestVersion: 1,
        message: "Checked",
      });
    expect(resolved.status).toBe(200);
    expect((await bookkeeper.get(`/api/v1/documents/${id}`)).body.reviewStatus).toBe("PENDING");
  });
  it("assigns a request, preserves source versions and corrections, and requires fresh review", async () => {
    const documentBytes = Buffer.concat([bytes, Buffer.from("\ncorrection-request-fixture")]);
    const { id } = (await upload(
      documentBytes,
      "unclear.png",
      { ...identity, workspaceId: otherId },
      randomUUID(),
      store,
    )) as { id: string };
    const owner = { ...identity, workspaceId: otherId };
    await db.membership.create({
      data: { userId: teammateId, workspaceId: otherId, role: "REVIEWER" },
    });
    const teammate = {
      ...owner,
      userId: teammateId,
      name: "Test teammate",
      role: "REVIEWER" as const,
    };
    let d = await getDocument(id, owner);
    await processRun(d.runId, store, async () => extracted);
    d = await getDocument(id, owner);
    const initialSource = d.sourceId!;
    const guard = () => ({ expectedRevision: d.revision, runId: d.runId, sourceId: d.sourceId! });
    const requestInput = {
      ...guard(),
      question: "Please send a clearer total",
      assigneeId: teammateId,
      field: "totalCents",
    };
    const created = await Promise.allSettled([
      createRequest(id, owner, randomUUID(), requestInput),
      createRequest(id, owner, randomUUID(), requestInput),
    ]);
    expect(created.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const task = await db.correctionRequest.findFirstOrThrow({ where: { documentId: id } });
    d = await getDocument(id, owner);
    await expect(
      mutate(id, owner, randomUUID(), "approve", { ...guard(), fields, note: "", confirmed: true }),
    ).rejects.toMatchObject({ code: "ACTIVE_REQUEST" });
    await expect(
      changeRequest(task.id, { ...teammate, role: "VIEWER" }, randomUUID(), {
        ...guard(),
        expectedRequestVersion: task.version,
        action: "respond",
        message: "Here",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const replacementBytes = await readFile("apps/web/public/samples/sample-06.png");
    const outcome = (await replaceSource(
      id,
      teammate,
      randomUUID(),
      {
        ...guard(),
        reason: "Total now visible",
        confirmedSameDocument: true,
        requestId: task.id,
        expectedRequestVersion: task.version,
      },
      replacementBytes,
      "clearer.png",
      store,
    )) as { runId: string; sourceId: string };
    d = await getDocument(id, owner);
    expect(d.fields).toEqual(fields);
    expect(d.sourceId).not.toBe(initialSource);
    expect(await db.sourceRevision.count({ where: { documentId: id } })).toBe(2);
    const originals = await db.sourceRevision.findMany({
      where: { documentId: id },
      orderBy: { version: "asc" },
    });
    expect(await store.get(originals[0]!.objectKey)).toEqual(documentBytes);
    await expect(
      changeRequest(task.id, owner, randomUUID(), {
        ...guard(),
        expectedRequestVersion: 1,
        action: "resolve",
        message: "",
      }),
    ).rejects.toMatchObject({ code: "NOT_RESOLVABLE" });
    await processRun(outcome.runId, store, async (received) => {
      expect(received).toEqual(replacementBytes);
      return { ...extracted, fields: { ...fields, vendor: "New AI suggestion" } };
    });
    d = await getDocument(id, owner);
    expect(d.fields.vendor).toBe(fields.vendor);
    expect(d.extraction?.fields.vendor).toBe("New AI suggestion");
    await changeRequest(task.id, owner, randomUUID(), {
      ...guard(),
      expectedRequestVersion: 1,
      action: "resolve",
      message: "Readable now",
    });
    d = await getDocument(id, owner);
    expect(d.reviewStatus).toBe("PENDING");
    await mutate(id, owner, randomUUID(), "approve", {
      ...guard(),
      fields,
      note: "",
      confirmed: true,
    });
    expect(
      (await db.reviewRevision.findFirstOrThrow({ where: { documentId: id, action: "approve" } }))
        .sourceId,
    ).toBe(outcome.sourceId);
  });
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

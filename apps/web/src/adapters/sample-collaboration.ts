import { z } from "zod";
import {
  ApiError,
  documentSchema,
  resultSchema,
  createRequestSchema,
  requestCommandSchema,
  type DocumentRecord,
} from "@ledgerroot/contracts";
import {
  assertDocumentGuard,
  assertRequestCreatable,
  assertSourceReplaceable,
  requestTransition,
} from "@ledgerroot/domain";
import { persist, readSamples } from "./gateway";

const key = "ledgerroot-collaboration-v1";
export const samplePeople = [
  { id: "sample-bookkeeper", name: "Sample bookkeeper" },
  { id: "sample-teammate", name: "Sample teammate" },
];
const eventSchema = z.object({
  id: z.string(),
  actorName: z.string(),
  action: z.string(),
  message: z.string(),
  createdAt: z.string(),
  sourceId: z.string().nullable(),
});
const taskSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  sourceId: z.string(),
  assigneeId: z.string(),
  question: z.string(),
  field: z.string().nullable(),
  state: z.enum(["OPEN", "RESPONDED", "RESOLVED", "CANCELED"]),
  version: z.number(),
  updatedAt: z.string(),
  document: z.object({ filename: z.string() }),
  events: z.array(eventSchema),
});
const sourceSchema = z.object({
  id: z.string(),
  version: z.number(),
  filename: z.string(),
  uploaderName: z.string().nullable(),
  reason: z.string(),
  createdAt: z.string(),
  current: z.boolean(),
  stage: z.string(),
  sourceUrl: z.string(),
  extraction: resultSchema.nullable(),
});
const stateSchema = z.object({
  actor: z.string(),
  tasks: z.array(taskSchema),
  sources: z.array(sourceSchema),
});
type State = z.infer<typeof stateSchema>;
function read(): State {
  const value = sessionStorage.getItem(key);
  if (!value) return { actor: samplePeople[0]!.id, tasks: [], sources: [] };
  const parsed = stateSchema.safeParse(JSON.parse(value));
  if (!parsed.success)
    throw new ApiError("SAMPLE_STATE", "Reset the demo to recover its sample state.", 409);
  return parsed.data;
}
function write(state: State) {
  sessionStorage.setItem(key, JSON.stringify(state));
}
function person(state: State) {
  return samplePeople.find((p) => p.id === state.actor)!;
}
const scenarioId = "correction-scenario";
async function fixture() {
  const response = await fetch("/samples/correction-scenario.json");
  if (!response.ok) throw new Error("Recorded correction samples are unavailable.");
  return z
    .object({
      recordedAt: z.string(),
      initial: z.object({ sourceUrl: z.string(), extraction: resultSchema }),
      replacement: z.object({ sourceUrl: z.string(), extraction: resultSchema }),
    })
    .parse(await response.json());
}
function guard(d: DocumentRecord) {
  return {
    revision: d.revision,
    runId: d.runId,
    sourceId: d.sourceId!,
    stage: d.stage,
    reviewStatus: d.reviewStatus,
  };
}
export const sampleCollaboration = {
  identity() {
    const state = read();
    return { userId: state.actor, name: person(state).name, role: "REVIEWER" as const };
  },
  switchActor(id: string) {
    if (!samplePeople.some((p) => p.id === id)) throw new Error("Unknown sample actor");
    const s = read();
    s.actor = id;
    write(s);
  },
  async start() {
    const docs = await readSamples();
    if (docs.some((d) => d.id === scenarioId)) return scenarioId;
    const f = await fixture();
    const d = documentSchema.parse({
      id: scenarioId,
      filename: "cropped-receipt.png",
      createdAt: f.recordedAt,
      checksum: "synthetic-scenario",
      sourceUrl: f.initial.sourceUrl,
      stage: "READY",
      reviewStatus: "PENDING",
      revision: 0,
      runId: "sample-cropped-run",
      fields: f.initial.extraction.fields,
      extraction: f.initial.extraction,
      history: [],
      failure: null,
      canReview: true,
      sample: true,
      sourceId: "sample-source-1",
      sourceVersion: 1,
      hasActiveRequest: false,
    });
    const s = read();
    s.sources = [
      {
        id: d.sourceId!,
        version: 1,
        filename: d.filename,
        uploaderName: "Sample teammate",
        reason: "Synthetic cropped image; recorded real-model extraction",
        createdAt: f.recordedAt,
        current: true,
        stage: "READY",
        sourceUrl: d.sourceUrl,
        extraction: d.extraction,
      },
    ];
    write(s);
    persist([...docs, d]);
    return d.id;
  },
  requests(query: { view?: string; documentId?: string; cursor?: string; q?: string }) {
    const s = read();
    const items = s.tasks.filter(
      (r) =>
        (!query.documentId || r.documentId === query.documentId) &&
        (query.view === "all" ||
          (query.view === "active" && ["OPEN", "RESPONDED"].includes(r.state)) ||
          (query.view === "review" && r.state === "RESPONDED") ||
          ((!query.view || query.view === "mine") &&
            r.assigneeId === s.actor &&
            r.state === "OPEN")) &&
        (!query.q || r.question.toLowerCase().includes(query.q.toLowerCase())),
    );
    return { items, nextCursor: null };
  },
  sources(id: string) {
    return id === scenarioId ? read().sources : [];
  },
  async command(path: string, value: unknown) {
    const s = read();
    const docs = await readSamples();
    const d = docs.find((d) => d.id === scenarioId);
    if (!d || (!path.includes(scenarioId) && !s.tasks.some((t) => path.includes(t.id))))
      throw new ApiError(
        "SAMPLE_SCENARIO",
        "Start the correction scenario from Requests to try this workflow.",
        409,
      );
    const at = new Date().toISOString();
    if (path === `/documents/${scenarioId}/requests`) {
      const input = createRequestSchema.parse(value);
      assertDocumentGuard(guard(d), input);
      assertRequestCreatable(
        guard(d),
        s.tasks.some((t) => ["OPEN", "RESPONDED"].includes(t.state)),
      );
      if (!samplePeople.some((p) => p.id === input.assigneeId))
        throw new Error("Choose a sample teammate.");
      s.tasks.push({
        id: crypto.randomUUID(),
        documentId: d.id,
        sourceId: d.sourceId!,
        assigneeId: input.assigneeId,
        question: input.question,
        field: input.field,
        state: "OPEN",
        version: 0,
        updatedAt: at,
        document: { filename: d.filename },
        events: [
          {
            id: crypto.randomUUID(),
            actorName: person(s).name,
            action: "created",
            message: input.question,
            createdAt: at,
            sourceId: d.sourceId!,
          },
        ],
      });
      d.reviewStatus = "NEEDS_INFORMATION";
      d.hasActiveRequest = true;
    } else {
      const task = s.tasks.find((t) => path.split("/")[2] === t.id)!;
      const route = path.split("/").at(-1);
      const input = requestCommandSchema.parse({
        ...z.record(z.string(), z.unknown()).parse(value),
        action: route === "responses" ? "respond" : route,
      });
      if (input.assigneeId && !samplePeople.some((p) => p.id === input.assigneeId))
        throw new Error("Choose a sample teammate.");
      task.state = requestTransition(task, input, { userId: s.actor, role: "REVIEWER" }, guard(d));
      task.version++;
      task.updatedAt = at;
      if (input.assigneeId) task.assigneeId = input.assigneeId;
      task.events.push({
        id: crypto.randomUUID(),
        actorName: person(s).name,
        action: input.action,
        message: input.message,
        createdAt: at,
        sourceId: d.sourceId!,
      });
      if (task.state === "RESOLVED") d.reviewStatus = "PENDING";
      d.hasActiveRequest = ["OPEN", "RESPONDED"].includes(task.state);
    }
    d.revision++;
    d.history.push({
      id: crypto.randomUUID(),
      actor: person(s).name,
      action: "Sample request updated",
      at,
      note: "In-app simulation; no notification sent.",
      before: null,
      after: null,
    });
    write(s);
    persist(docs);
  },
  async replace(base: DocumentRecord, reason: string, request?: { id?: string; version?: number }) {
    const f = await fixture();
    const docs = await readSamples();
    const s = read();
    const d = docs.find((d) => d.id === scenarioId)!;
    if (!d || base.id !== scenarioId) throw new Error("Use the dedicated correction scenario.");
    assertDocumentGuard(guard(d), {
      expectedRevision: base.revision,
      runId: base.runId,
      sourceId: base.sourceId!,
    });
    assertSourceReplaceable(guard(d));
    if (d.sourceVersion !== 1)
      throw new Error("The clearer sample is already present. Reset to repeat the scenario.");
    const task = request?.id ? s.tasks.find((t) => t.id === request.id) : undefined;
    if (request?.id && !task) throw new Error("Request not found.");
    if (task) {
      task.state = requestTransition(
        task,
        {
          expectedRevision: d.revision,
          runId: d.runId,
          sourceId: d.sourceId!,
          expectedRequestVersion: request!.version!,
          action: "respond",
          message: reason,
        },
        { userId: s.actor, role: "REVIEWER" },
        guard(d),
      );
      task.version++;
      task.events.push({
        id: crypto.randomUUID(),
        actorName: person(s).name,
        action: "respond",
        message: reason,
        createdAt: new Date().toISOString(),
        sourceId: "sample-source-2",
      });
    }
    s.sources.forEach((source) => (source.current = false));
    s.sources.push({
      id: "sample-source-2",
      version: 2,
      filename: "clearer-fuel-receipt.png",
      uploaderName: person(s).name,
      reason,
      createdAt: new Date().toISOString(),
      current: true,
      stage: "READY",
      ...f.replacement,
    });
    d.sourceId = "sample-source-2";
    d.sourceVersion = 2;
    d.sourceUrl = f.replacement.sourceUrl;
    d.runId = "sample-clear-run";
    d.extraction = f.replacement.extraction;
    d.revision++;
    d.reviewStatus = "PENDING";
    d.history.push({
      id: crypto.randomUUID(),
      actor: person(s).name,
      action: "Simulated clearer-photo processing",
      at: new Date().toISOString(),
      note: "Replayed saved real-model extraction; no live upload or inference. Saved fields preserved.",
      before: null,
      after: null,
    });
    write(s);
    persist(docs);
  },
};

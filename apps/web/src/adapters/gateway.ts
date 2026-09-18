import { z } from "zod";
import {
  ApiError,
  documentSchema,
  listSchema,
  evaluationSchema,
  summarySchema,
  type DocumentRecord,
  type Mutation,
  type ReviewAction,
  type ListQuery,
} from "@ledgerroot/contracts";
import { reviewTransition } from "@ledgerroot/domain";
export const isSample = process.env.NEXT_PUBLIC_MODE !== "live";
const storageKey = "ledgerroot-sample-v1";
let memory: DocumentRecord[] | null = null;
export async function readSamples() {
  if (memory) return structuredClone(memory);
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = z.array(documentSchema).safeParse(JSON.parse(stored));
      if (parsed.success) {
        memory = parsed.data;
        return structuredClone(memory);
      }
    }
  } catch {
    // A stale or corrupted sample snapshot is disposable, unlike a real document.
  }
  const response = await fetch("/samples/manifest.json", { cache: "no-store" });
  if (!response.ok)
    throw new ApiError("SAMPLES_UNAVAILABLE", "Samples could not load. Try again.", 503, true);
  memory = z.array(documentSchema).parse(await response.json());
  return structuredClone(memory);
}
export function persist(data: DocumentRecord[]) {
  memory = structuredClone(data);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    /* Memory mode remains isolated to the browser tab. */
  }
}
export async function request(path: string, init?: RequestInit) {
  const res = await fetch(`/api/v1${path}`, { credentials: "same-origin", ...init });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "The request failed.",
      res.status,
      !!payload?.error?.retryable,
    );
  }
  return res.json();
}
export const gateway = {
  async summary() {
    if (!isSample) return summarySchema.parse(await request("/documents-summary"));
    const all = await readSamples();
    return {
      total: all.length,
      attention: all.filter(
        (d) => ["PENDING", "NEEDS_INFORMATION"].includes(d.reviewStatus) || d.stage === "FAILED",
      ).length,
      approved: all.filter((d) => d.reviewStatus === "APPROVED").length,
    };
  },
  async list(query: ListQuery = {}) {
    if (!isSample) {
      const params = new URLSearchParams(
        Object.entries(query).filter(([, v]) => !!v) as [string, string][],
      );
      return listSchema.parse(await request(`/documents?${params}`));
    }
    const all = await readSamples();
    const items = all
      .filter(
        (d) =>
          !query.q ||
          `${d.filename} ${d.fields.vendor ?? ""}`.toLowerCase().includes(query.q.toLowerCase()),
      )
      .filter(
        (d) =>
          !query.status ||
          query.status === "all" ||
          (query.status === "review" &&
            ["PENDING", "NEEDS_INFORMATION"].includes(d.reviewStatus)) ||
          (query.status === "approved" && d.reviewStatus === "APPROVED") ||
          (query.status === "rejected" && d.reviewStatus === "REJECTED") ||
          (query.status === "failed" && d.stage === "FAILED") ||
          (query.status === "processing" && !["READY", "FAILED"].includes(d.stage)),
      );
    return { items, nextCursor: null };
  },
  async get(id: string) {
    if (!isSample)
      return documentSchema.parse(await request(`/documents/${encodeURIComponent(id)}`));
    const d = (await readSamples()).find((d) => d.id === id);
    if (!d) throw new ApiError("NOT_FOUND", "Document not found.", 404);
    return d;
  },
  async mutate(id: string, action: ReviewAction, input: Mutation, key: string) {
    if (!isSample)
      return documentSchema.parse(
        await request(
          `/documents/${encodeURIComponent(id)}/${action === "save" ? "review" : action}`,
          {
            method: action === "save" ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": key },
            body: JSON.stringify(input),
          },
        ),
      );
    const data = await readSamples();
    const d = data.find((d) => d.id === id);
    if (!d) throw new ApiError("NOT_FOUND", "Document not found.", 404);
    const before = structuredClone(d.fields);
    d.reviewStatus = reviewTransition(d, action, input);
    if (action === "approve" && d.hasActiveRequest)
      throw new ApiError(
        "ACTIVE_REQUEST",
        "Resolve or cancel the active request before approving.",
        409,
      );
    d.revision++;
    if (action === "retry") {
      d.stage = "READY";
      d.runId = crypto.randomUUID();
      d.reviewStatus = "PENDING";
      d.failure = null;
    } else if (action !== "reopen") d.fields = input.fields;
    const actor = d.sourceId
      ? (await import("./sample-collaboration")).sampleCollaboration.identity().name
      : "Sample reviewer";
    d.history.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actor,
      action: action === "retry" ? "Simulated retry completed" : action,
      note: d.sourceVersion
        ? `Source version ${d.sourceVersion}${input.note ? ` · ${input.note}` : ""}`
        : input.note || null,
      before,
      after: d.fields,
    });
    persist(data);
    return d;
  },
  async reset() {
    memory = null;
    try {
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem("ledgerroot-collaboration-v1");
    } catch {
      /* No persistent browser state. */
    }
  },
  async simulateFailure(id: string) {
    if (!isSample) throw new Error("Sample only");
    const data = await readSamples();
    const d = data.find((d) => d.id === id);
    if (d) {
      d.stage = "FAILED";
      d.reviewStatus = "NOT_READY";
      d.revision++;
      d.failure =
        "Simulated model timeout. Retry replays the previously saved extraction; no inference runs.";
      d.history.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actor: "Sample simulation",
        action: "Simulated processing failure",
        note: d.failure,
        before: null,
        after: null,
      });
      persist(data);
    }
  },
  async evaluations() {
    const value = isSample
      ? await fetch("/samples/evaluations.json", { cache: "no-store" }).then((r) => r.json())
      : await request("/evaluations");
    return z.array(evaluationSchema).parse(value);
  },
  upload(
    file: File,
    onProgress: (value: number) => void,
  ): Promise<{ id: string; duplicate: boolean }> {
    if (isSample)
      return Promise.reject(
        new ApiError(
          "SAMPLE_ONLY",
          "Public uploads are disabled. Use the local app for real processing.",
          403,
        ),
      );
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/v1/documents");
      xhr.setRequestHeader("Idempotency-Key", crypto.randomUUID());
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.timeout = 60000;
      xhr.onerror = () => reject(new Error("Connection lost. Retrying the same file is safe."));
      xhr.ontimeout = () => reject(new Error("Upload timed out. Retrying the same file is safe."));
      xhr.onload = () => {
        let body;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          return reject(new Error("Unexpected server response."));
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.error?.message ?? "Upload failed."));
      };
      const data = new FormData();
      data.append("filename", file.name);
      data.append("file", file);
      xhr.send(data);
    });
  },
};

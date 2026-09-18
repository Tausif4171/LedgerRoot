import { z } from "zod";
import { ApiError, resultSchema } from "@ledgerroot/contracts";
import { isSample, request } from "./gateway";
import { sampleCollaboration, samplePeople } from "./sample-collaboration";

export const requestRecordSchema = z.object({
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
  events: z.array(
    z.object({
      id: z.string(),
      actorName: z.string(),
      action: z.string(),
      message: z.string(),
      createdAt: z.string(),
      sourceId: z.string().nullable(),
    }),
  ),
});
export type CorrectionRequest = z.infer<typeof requestRecordSchema>;
export const sourceRecordSchema = z.object({
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
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
function liveOnly() {
  if (isSample)
    throw new ApiError(
      "SAMPLE_UNAVAILABLE",
      "This workflow currently requires the real local application.",
      403,
    );
}
export const collaborationGateway = {
  async summary() {
    if (isSample)
      return {
        actionable:
          sampleCollaboration.requests({ view: "mine" }).items.length +
          sampleCollaboration.requests({ view: "review" }).items.length,
      };
    return z
      .object({ actionable: z.number().int().nonnegative() })
      .parse(await request("/requests-summary"));
  },
  async identity() {
    if (isSample) return sampleCollaboration.identity();
    return z
      .object({ userId: z.string(), role: z.enum(["OWNER", "REVIEWER", "VIEWER"]) })
      .parse(await request("/me"));
  },
  async assignees() {
    if (isSample) return samplePeople;
    return z
      .array(z.object({ id: z.string(), name: z.string() }))
      .parse(await request("/request-assignees"));
  },
  async requests(query: { view?: string; documentId?: string; cursor?: string; q?: string } = {}) {
    if (isSample) return sampleCollaboration.requests(query);
    return z
      .object({ items: z.array(requestRecordSchema), nextCursor: z.string().nullable() })
      .parse(await request(`/requests?${new URLSearchParams(query)}`));
  },
  async sources(id: string, cursor?: number) {
    if (isSample) return { items: sampleCollaboration.sources(id), nextCursor: null };
    return z
      .object({ items: z.array(sourceRecordSchema), nextCursor: z.number().nullable() })
      .parse(
        await request(
          `/documents/${encodeURIComponent(id)}/sources${cursor ? `?cursor=${cursor}` : ""}`,
        ),
      );
  },
  async command(path: string, body: unknown, key: string) {
    if (isSample) return sampleCollaboration.command(path, body);
    return request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
  },
  upload(
    id: string,
    file: File,
    metadata: unknown,
    onProgress: (value: number) => void,
    key: string,
  ) {
    liveOnly();
    return new Promise<{ duplicate: boolean; id: string; sourceId: string; version: number }>(
      (resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/v1/documents/${encodeURIComponent(id)}/sources`);
        xhr.setRequestHeader("Idempotency-Key", key);
        xhr.timeout = 60000;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onerror = () =>
          reject(
            new Error(
              "Connection lost. Your previous image is preserved. Refresh before retrying.",
            ),
          );
        xhr.ontimeout = () =>
          reject(new Error("Upload timed out. Refresh to check whether it was accepted."));
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText);
            if (
              xhr.status >= 400 &&
              !(xhr.status === 409 && body.error?.code === "DUPLICATE_DOCUMENT")
            )
              return reject(new Error(body.error?.message ?? "Upload failed."));
            resolve(
              z
                .object({
                  duplicate: z.boolean(),
                  id: z.string(),
                  sourceId: z.string(),
                  version: z.number(),
                })
                .parse(body),
            );
          } catch {
            reject(new Error("Unexpected upload response. Refresh before retrying."));
          }
        };
        const data = new FormData();
        data.append("filename", file.name);
        data.append("metadata", JSON.stringify(metadata));
        data.append("file", file);
        xhr.send(data);
      },
    );
  },
};

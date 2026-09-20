"use client";
import { Select } from "@/components/ui/select";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { MAX_BYTES, type DocumentRecord, type FieldName } from "@ledgerroot/contracts";
import { fieldLabels, fieldValue } from "@/lib/field-labels";
import { collaborationGateway } from "@/adapters/collaboration";
import { isSample } from "@/adapters/gateway";
import { sampleCollaboration } from "@/adapters/sample-collaboration";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
const Viewer = dynamic(() => import("./source-viewer"));
export function SourceHistory({ document: d }: { document: DocumentRecord }) {
  const [selected, setSelected] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const query = useInfiniteQuery({
    queryKey: ["sources", d.id, d.runId, d.stage],
    queryFn: ({ pageParam }) => collaborationGateway.sources(d.id, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const sources = query.data?.pages.flatMap((page) => page.items) ?? [];
  const source = sources.find((s) => s.id === selected);
  return (
    <section className="panel review-form collaboration-form">
      <h2>Source versions</h2>
      <p>Earlier images are read-only. Selecting one does not restore it.</p>
      {query.error && <p role="alert">{query.error.message}</p>}
      <label htmlFor="source-version">View a saved source</label>
      <Select
        id="source-version"
        value={selected}
        onValueChange={(value) => {
          setSelected(value);
          setEvidence([]);
        }}
      >
        <option value="">Choose version</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            Version {s.version}
            {s.current ? " · current" : ""} · {s.stage}
          </option>
        ))}
      </Select>
      {query.hasNextPage && (
        <Button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          Load older source versions
        </Button>
      )}
      {source && (
        <>
          <p>
            {source.uploaderName ?? "Uploader not recorded"} ·{" "}
            {new Date(source.createdAt).toLocaleString()}
          </p>
          <p>{source.reason}</p>
          <Viewer
            key={source.id}
            document={{
              ...d,
              filename: source.filename,
              sourceUrl: source.sourceUrl,
              extraction: source.extraction,
            }}
            selected={evidence}
          />
          {source.extraction && (
            <ul>
              {Object.entries(source.extraction.fields).map(([field, value]) => (
                <li key={field}>
                  {fieldLabels[field as FieldName]}: {fieldValue(field as FieldName, value)}{" "}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setEvidence(
                        source.extraction?.evidence[
                          field as keyof typeof source.extraction.evidence
                        ] ?? [],
                      )
                    }
                  >
                    Inspect source
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
export function ReplaceSource({
  document: d,
  request,
  onClose,
}: {
  document: DocumentRecord;
  request: { id?: string; version?: number };
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<{ id: string; version: number } | null>(null);
  // Capture the reviewed base at dialog open; never silently adopt newer polling data.
  const [base] = useState(d);
  async function submit() {
    if ((!file && !isSample) || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      if (file && file.size > MAX_BYTES) throw new Error("Choose an image up to 10 MiB.");
      const result = isSample
        ? (await sampleCollaboration.replace(base, reason, request),
          { duplicate: false, id: d.id, version: 2 })
        : await collaborationGateway.upload(
            d.id,
            file!,
            {
              expectedRevision: base.revision,
              runId: base.runId,
              sourceId: base.sourceId,
              reason,
              confirmedSameDocument: true,
              ...(request.id
                ? { requestId: request.id, expectedRequestVersion: request.version }
                : {}),
            },
            setProgress,
            crypto.randomUUID(),
          );
      await cache.invalidateQueries({ queryKey: ["document", d.id] });
      await cache.invalidateQueries({ queryKey: ["requests"] });
      await cache.invalidateQueries({ queryKey: ["sources", d.id] });
      if (result.duplicate) setDuplicate(result);
      else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title="Upload clearer photo"
      description="Same document only. Earlier images and saved values are preserved; fresh review is required."
    >
      <form
        className="review-form collaboration-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p>JPEG/PNG · English · USD · one document per image · up to 10 MiB and 24 megapixels.</p>
        {isSample ? (
          <p className="callout">
            Uses the supplied clearer synthetic image and saved real-model output. No file is
            uploaded and no inference runs.
          </p>
        ) : (
          <>
            <label htmlFor="clearer-file">Clearer photo</label>
            <input
              id="clearer-file"
              type="file"
              accept="image/jpeg,image/png"
              required
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </>
        )}
        <label htmlFor="replacement-reason">What is clearer?</label>
        <textarea
          id="replacement-reason"
          required
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <label className="confirmation">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{" "}
          This is a clearer photo of the same receipt or invoice, not a changed bill.
        </label>
        {busy && (
          <div role="status">
            {isSample ? (
              "Preparing supplied sample…"
            ) : progress === 100 ? (
              "Saving safely…"
            ) : (
              <>
                <progress aria-label="Upload progress" max={100} value={progress} /> Uploading ·{" "}
                {progress}%
              </>
            )}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {duplicate && (
          <p role="status">
            This image already exists as version {duplicate.version}. Nothing was replaced.{" "}
            <a href={`/documents/${duplicate.id}`}>View document</a>
          </p>
        )}
        <Button
          disabled={busy || (!file && !isSample) || !confirmed || !reason.trim()}
          type="submit"
        >
          {busy ? "Saving…" : isSample ? "Use supplied clearer photo" : "Upload clearer photo"}
        </Button>
      </form>
    </Modal>
  );
}

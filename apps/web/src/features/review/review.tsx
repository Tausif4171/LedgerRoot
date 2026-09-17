"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { gateway, isSample } from "@/adapters/gateway";
import { Status } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { ReviewForm } from "./review-form";
import { Button as ActionButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { ReplaceSource } from "./source-revisions";
const SourceHistory = dynamic(() => import("./source-revisions").then((m) => m.SourceHistory));
const DocumentRequests = dynamic(() => import("@/features/requests/document-requests"));
const SourceViewer = dynamic(() => import("./source-viewer"), {
  loading: () => (
    <div className="panel" aria-busy="true" style={{ height: 600, padding: 30 }}>
      <div className="skeleton" />
    </div>
  ),
});
const History = dynamic(() => import("@/features/history/history"));
export function Review({ id }: { id: string }) {
  const cache = useQueryClient();
  const [tab, setTab] = useState("fields");
  const [evidence, setEvidence] = useState<{ runId: string; ids: string[] }>({
    runId: "",
    ids: [],
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [replacement, setReplacement] = useState<{ id?: string; version?: number } | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<{
    id?: string;
    version?: number;
  } | null>(null);
  const [formGeneration, setFormGeneration] = useState(0);
  function beginReplacement(id?: string, version?: number) {
    if (dirty) setPendingReplacement({ id, version });
    else setReplacement({ id, version });
  }
  const query = useQuery({
    queryKey: ["document", id],
    queryFn: () => gateway.get(id),
    refetchInterval: (q) =>
      q.state.data && !["READY", "FAILED"].includes(q.state.data.stage)
        ? Math.min(30000, 2500 * 2 ** Math.min(q.state.fetchFailureCount, 4))
        : !isSample && q.state.data
          ? Math.min(60000, 15000 * 2 ** Math.min(q.state.fetchFailureCount, 2))
          : false,
    refetchIntervalInBackground: false,
  });
  const d = query.data;
  async function retry() {
    if (!d) return;
    setBusy(true);
    setError("");
    try {
      const next = await gateway.mutate(
        id,
        "retry",
        {
          expectedRevision: d.revision,
          runId: d.runId,
          fields: d.fields,
          note: "",
          confirmed: false,
        },
        crypto.randomUUID(),
      );
      cache.setQueryData(["document", id], next);
      await cache.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed.");
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending)
    return (
      <div aria-busy="true" aria-label="Loading document">
        <div className="skeleton" style={{ height: 40, width: "60%" }} />
        <div className="panel" style={{ height: 500 }} />
      </div>
    );
  if (!d)
    return (
      <div className="empty" role="alert">
        <h1>Document unavailable</h1>
        <p>{query.error?.message}</p>
        <Link href="/documents" className="btn">
          Back to documents
        </Link>
      </div>
    );
  return (
    <>
      <Link href="/documents" className="back">
        <ArrowLeft size={16} />
        All documents
      </Link>
      <div className="review-top">
        <div>
          <h1>{d.fields.vendor ?? "Document review"}</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 7 }}>
            {d.filename}
          </p>
        </div>
        <Status document={d} />
      </div>
      {error && (
        <div className="callout callout-error" role="alert">
          {error}
        </div>
      )}
      {(!isSample || d.id === "correction-scenario") && (
        <>
          <DocumentRequests document={d} onReplace={beginReplacement} />
          {d.canReview &&
            ["READY", "FAILED"].includes(d.stage) &&
            !["APPROVED", "REJECTED"].includes(d.reviewStatus) && (
              <ActionButton onClick={() => beginReplacement()}>Upload clearer photo</ActionButton>
            )}
          {replacement && (
            <ReplaceSource
              document={d}
              request={replacement}
              onClose={() => setReplacement(null)}
            />
          )}
          <Modal
            open={!!pendingReplacement}
            onOpenChange={(open) => {
              if (!open) setPendingReplacement(null);
            }}
            title="You have unsaved changes"
            description="Save your review first, discard the draft, or cancel. Uploading must not silently lose your work."
          >
            <ActionButton
              onClick={() => {
                setPendingReplacement(null);
                setTab("fields");
              }}
            >
              Return to fields to save first
            </ActionButton>
            <ActionButton
              onClick={() => {
                setFormGeneration((n) => n + 1);
                setDirty(false);
                setReplacement(pendingReplacement);
                setPendingReplacement(null);
              }}
            >
              Discard draft and continue
            </ActionButton>
            <ActionButton onClick={() => setPendingReplacement(null)}>Cancel</ActionButton>
          </Modal>
        </>
      )}
      {d.stage !== "READY" && (
        <div className="callout" aria-live="polite">
          <h2>
            {d.stage === "FAILED"
              ? "Processing needs attention"
              : "Your document is being processed"}
          </h2>
          <p>
            {d.failure ?? "The original is preserved. You can leave this page and return later."}
          </p>
          {d.stage === "FAILED" && d.canReview && (
            <Button onClick={retry} disabled={busy}>
              <RotateCcw size={15} />
              {busy ? "Retrying…" : isSample ? "Replay simulated retry" : "Retry processing"}
            </Button>
          )}
        </div>
      )}
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="tabs-list" aria-label="Document view">
          <Tabs.Trigger value="source">Source</Tabs.Trigger>
          <Tabs.Trigger value="fields">Fields</Tabs.Trigger>
          <Tabs.Trigger value="history">History</Tabs.Trigger>
        </Tabs.List>
        <div className="review-grid">
          <Tabs.Content value="source" forceMount className="tab-pane">
            <SourceViewer
              key={d.runId}
              document={d}
              selected={evidence.runId === d.runId ? evidence.ids : []}
            />
          </Tabs.Content>
          <Tabs.Content value="fields" forceMount className="tab-pane">
            {d.stage === "READY" || (d.sourceVersion ?? 1) > 1 ? (
              <ReviewForm
                key={`${d.id}/${formGeneration}`}
                document={d}
                onDirtyChange={setDirty}
                onEvidence={(ids) => {
                  setEvidence({ runId: d.runId, ids });
                  setTab("source");
                }}
              />
            ) : (
              <div className="panel empty">
                <h2>Fields will appear here</h2>
                <p>No financial record is approved while processing is incomplete.</p>
              </div>
            )}
          </Tabs.Content>
          <Tabs.Content value="history" forceMount className="tab-pane history-pane">
            <History events={d.history} />
            {(!isSample || d.id === "correction-scenario") && <SourceHistory document={d} />}
          </Tabs.Content>
        </div>
      </Tabs.Root>
      {isSample && d.stage === "READY" && (
        <div className="footnote">
          <Button
            variant="ghost"
            onClick={async () => {
              await gateway.simulateFailure(id);
              await cache.invalidateQueries({ queryKey: ["document", id] });
              await cache.invalidateQueries({ queryKey: ["documents"] });
            }}
          >
            Simulate a processing failure
          </Button>
          <span> Sample-only simulation. It does not run or interrupt AI.</span>
        </div>
      )}
    </>
  );
}

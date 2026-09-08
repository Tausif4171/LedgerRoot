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
  const [evidence, setEvidence] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["document", id],
    queryFn: () => gateway.get(id),
    refetchInterval: (q) =>
      q.state.data && !["READY", "FAILED"].includes(q.state.data.stage) ? 2500 : false,
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
            <SourceViewer document={d} selected={evidence} />
          </Tabs.Content>
          <Tabs.Content value="fields" forceMount className="tab-pane">
            {d.stage === "READY" ? (
              <ReviewForm
                key={`${d.id}/${d.runId}`}
                document={d}
                onEvidence={(ids) => {
                  setEvidence(ids);
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

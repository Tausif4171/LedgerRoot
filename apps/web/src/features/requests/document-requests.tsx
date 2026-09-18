"use client";
import { useState } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type DocumentRecord, type FieldName } from "@ledgerroot/contracts";
import { gateway } from "@/adapters/gateway";
import { fieldLabels } from "@/lib/field-labels";
import { collaborationGateway } from "@/adapters/collaboration";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";

export default function DocumentRequests({
  document: d,
  onReplace,
}: {
  document: DocumentRecord;
  onReplace: (requestId: string, version: number) => void;
}) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [assignee, setAssignee] = useState("");
  const [field, setField] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState<string | null>(null);
  async function refreshLatest() {
    setRefreshFailed(false);
    try {
      await cache.fetchQuery({
        queryKey: ["document", d.id],
        queryFn: () => gateway.get(d.id),
        staleTime: 0,
      });
      await cache.invalidateQueries({ queryKey: ["requests"] }, { throwOnError: true });
      setError(
        "Latest details loaded. Review the changes, then try your action again. Your typed text has been kept.",
      );
    } catch {
      setRefreshFailed(true);
      setError(
        "Could not load the latest details. Your typed text has been kept. Try loading again before continuing.",
      );
    }
  }
  const query = useQuery({
    queryKey: ["requests", d.id, d.revision],
    queryFn: () => collaborationGateway.requests({ view: "active", documentId: d.id }),
    refetchInterval: (q) => Math.min(60000, 15000 * 2 ** Math.min(q.state.fetchFailureCount, 2)),
    refetchIntervalInBackground: false,
  });
  const previous = useInfiniteQuery({
    queryKey: ["requests", d.id, "history", d.revision],
    queryFn: ({ pageParam }) =>
      collaborationGateway.requests({
        view: "all",
        documentId: d.id,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const members = useQuery({
    queryKey: ["assignees"],
    queryFn: () => collaborationGateway.assignees(),
  });
  const me = useQuery({ queryKey: ["identity"], queryFn: () => collaborationGateway.identity() });
  const active = query.data?.items.find((r) => ["OPEN", "RESPONDED"].includes(r.state));
  const messageIndex = active?.events.findIndex((event) => event.id === oldestMessageId) ?? -1;
  const conversationLimit = Math.max(
    5,
    messageIndex < 0 ? 5 : active!.events.length - messageIndex,
  );
  const guard = { expectedRevision: d.revision, runId: d.runId, sourceId: d.sourceId };
  async function send(action: string) {
    setBusy(true);
    setError("");
    try {
      if (action === "create")
        await collaborationGateway.command(
          `/documents/${d.id}/requests`,
          { ...guard, question: message, assigneeId: assignee, field: field || null },
          crypto.randomUUID(),
        );
      else if (active)
        await collaborationGateway.command(
          `/requests/${active.id}/${action}`,
          {
            ...guard,
            expectedRequestVersion: active.version,
            message,
            ...(action === "reassign" ? { assigneeId: assignee } : {}),
          },
          crypto.randomUUID(),
        );
      setMessage("");
      setOpen(false);
      await cache.invalidateQueries({ queryKey: ["document", d.id] });
      await cache.invalidateQueries({ queryKey: ["requests"] });
      await cache.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      if (
        e instanceof ApiError &&
        ["REVISION_CONFLICT", "REQUEST_CONFLICT", "REQUEST_CLOSED"].includes(e.code)
      ) {
        // Refresh reads only: never replay a mutation against unseen changes.
        await refreshLatest();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Correction requests">
      <div className="panel-heading">
        <h2>Correction requests</h2>
      </div>
      <div className="review-form collaboration-form">
        <p className="muted">In-app only. No email or push notification is sent.</p>
        {(error || query.error) && <p role="alert">{error || query.error?.message}</p>}
        {refreshFailed && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await refreshLatest();
              } finally {
                setBusy(false);
              }
            }}
          >
            Load latest details
          </Button>
        )}
        {query.isPending ? (
          <p role="status">Loading requests…</p>
        ) : active ? (
          <>
            <h3>{active.question}</h3>
            <p>
              {active.state === "OPEN" ? "Waiting for response" : "Response needs review"} ·{" "}
              {members.data?.find((m) => m.id === active.assigneeId)?.name ?? "Assigned teammate"}
            </p>
            <ul className="request-conversation">
              {active.events.slice(-conversationLimit).map((e) => (
                <li key={e.id}>
                  <strong>{e.actorName}</strong> · {e.action.replaceAll("-", " ")}: {e.message}
                  <div className="muted">
                    <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString()}</time>
                  </div>
                </li>
              ))}
            </ul>
            {active.events.length > conversationLimit && (
              <Button
                onClick={() =>
                  setOldestMessageId(
                    active.events[Math.max(0, active.events.length - conversationLimit - 5)]!.id,
                  )
                }
              >
                Show earlier messages
              </Button>
            )}
            {conversationLimit > 5 && (
              <Button variant="ghost" onClick={() => setOldestMessageId(null)}>
                Show fewer messages
              </Button>
            )}
            {d.canReview && !refreshFailed && (
              <>
                <p className="muted">
                  Resolve closes this question. The document still needs review.
                </p>
                <label htmlFor="request-message">Response, follow-up, or cancellation reason</label>
                <textarea
                  id="request-message"
                  maxLength={1000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                {active.state === "OPEN" && me.data?.userId === active.assigneeId && (
                  <>
                    <Button disabled={busy || !message.trim()} onClick={() => send("responses")}>
                      Send response
                    </Button>
                    <Button
                      disabled={busy || !["READY", "FAILED"].includes(d.stage)}
                      onClick={() => onReplace(active.id, active.version)}
                    >
                      Upload clearer photo
                    </Button>
                  </>
                )}
                {active.state === "RESPONDED" && (
                  <>
                    <Button disabled={busy || d.stage !== "READY"} onClick={() => send("resolve")}>
                      Resolve request
                    </Button>
                    <Button disabled={busy || !message.trim()} onClick={() => send("follow-up")}>
                      Request more information
                    </Button>
                  </>
                )}
                <label htmlFor="request-reassign">Reassign to</label>
                <select
                  id="request-reassign"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Choose teammate</option>
                  {members.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <Button disabled={busy || !assignee} onClick={() => send("reassign")}>
                  Reassign request
                </Button>
                <Button disabled={busy || !message.trim()} onClick={() => send("cancel")}>
                  Cancel request
                </Button>
              </>
            )}
          </>
        ) : (
          <>
            <p>No active request.</p>
            {d.canReview &&
              d.stage === "READY" &&
              ["PENDING", "NEEDS_INFORMATION"].includes(d.reviewStatus) && (
                <Button onClick={() => setOpen(true)}>Request information</Button>
              )}
          </>
        )}
        <details>
          <summary>Previous requests</summary>
          {previous.data?.pages
            .flatMap((page) => page.items)
            .filter((r) => !["OPEN", "RESPONDED"].includes(r.state))
            .map((r) => (
              <div key={r.id}>
                <h3>
                  {r.question} · {r.state}
                </h3>
                <ul>
                  {r.events.map((e) => (
                    <li key={e.id}>
                      {e.actorName}: {e.message || e.action}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          {previous.hasNextPage && (
            <Button disabled={previous.isFetchingNextPage} onClick={() => previous.fetchNextPage()}>
              Load more requests
            </Button>
          )}
        </details>
      </div>
      <Modal
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
        title="Request information"
        description={`Ask a teammate about ${d.filename}. Their response will not change financial fields automatically.`}
      >
        <form
          className="review-form collaboration-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send("create");
          }}
        >
          <div className="request-preview">
            <img
              src={d.thumbnailUrl ?? d.sourceUrl}
              alt="Document for this question"
              loading="lazy"
            />
            <span>
              {d.filename}
              <br />
              Source version {d.sourceVersion ?? 1}
            </span>
          </div>
          <label htmlFor="new-question">Question</label>
          <textarea
            id="new-question"
            required
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <label htmlFor="new-assignee">Assign to</label>
          <select
            id="new-assignee"
            required
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Choose teammate</option>
            {members.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <label htmlFor="request-field">Related field (optional)</label>
          <select id="request-field" value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">Whole document</option>
            {[
              "documentType",
              "vendor",
              "documentDate",
              "totalCents",
              "currency",
              "invoiceNumber",
              "dueDate",
            ].map((f) => (
              <option key={f} value={f}>
                {fieldLabels[f as FieldName]}
              </option>
            ))}
          </select>
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy || !message.trim() || !assignee} type="submit">
            {busy ? "Sending…" : "Send request"}
          </Button>
        </form>
      </Modal>
    </section>
  );
}

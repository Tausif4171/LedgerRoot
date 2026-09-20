"use client";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { sampleCollaboration } from "@/adapters/sample-collaboration";
import { collaborationGateway } from "@/adapters/collaboration";
import { isSample } from "@/adapters/gateway";
import { Button } from "@/components/ui/button";
export default function Inbox() {
  const router = useRouter();
  const cache = useQueryClient();
  const [startError, setStartError] = useState("");
  const [view, setView] = useState("mine");
  const [cursor, setCursor] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const members = useQuery({
    queryKey: ["assignees"],
    queryFn: () => collaborationGateway.assignees(),
  });
  const query = useQuery({
    queryKey: ["requests", "inbox", view, cursor, q],
    queryFn: () => collaborationGateway.requests({ view, ...(cursor ? { cursor } : {}), q }),
    refetchInterval: (q) => Math.min(60000, 15000 * 2 ** Math.min(q.state.fetchFailureCount, 2)),
    refetchIntervalInBackground: false,
  });
  return (
    <section className="request-inbox">
      <h1>Requests</h1>
      <p>Questions linked to documents. In-app only: no email or push notifications are sent.</p>
      {isSample && (
        <div className="callout">
          <p>
            Try a cropped receipt → assigned question → clearer photo → fresh review. All processing
            replays recorded results.
          </p>
          <Button
            onClick={async () => {
              try {
                const id = await sampleCollaboration.start();
                await cache.invalidateQueries();
                router.push(`/documents/${id}`);
              } catch (e) {
                setStartError(e instanceof Error ? e.message : "Could not load scenario.");
              }
            }}
          >
            Start correction scenario
          </Button>
          {startError && <p role="alert">{startError}</p>}
        </div>
      )}
      <>
        <label htmlFor="request-view">Show</label>
        <Select
          id="request-view"
          value={view}
          onValueChange={(value) => {
            setView(value);
            setCursor(undefined);
          }}
        >
          <option value="mine">Assigned to me</option>
          <option value="review">Awaiting review</option>
          <option value="all">All requests</option>
        </Select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search);
            setCursor(undefined);
          }}
        >
          <label htmlFor="request-search">Search questions</label>
          <input
            id="request-search"
            maxLength={200}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit">Search</Button>
        </form>
        {query.isPending && <p role="status">Loading requests…</p>}
        {query.error && <p role="alert">{query.error.message}</p>}
        {query.data?.items.length === 0 && <p>No requests in this view.</p>}
        {query.data?.items.map((r) => (
          <article className="panel review-form" key={r.id}>
            <h2>
              <Link href={`/documents/${r.documentId}`}>{r.question}</Link>
            </h2>
            <p>
              {r.document.filename} ·{" "}
              {members.data?.find((m) => m.id === r.assigneeId)?.name ?? "Former teammate"} ·{" "}
              {r.state === "RESPONDED"
                ? "Awaiting review"
                : r.state === "OPEN"
                  ? "Waiting for response"
                  : r.state === "RESOLVED"
                    ? "Resolved"
                    : "Canceled"}{" "}
              · Updated {new Date(r.updatedAt).toLocaleString()}
            </p>
          </article>
        ))}
        {cursor && <Button onClick={() => setCursor(undefined)}>First page</Button>}
        {query.data?.nextCursor && (
          <Button onClick={() => setCursor(query.data!.nextCursor!)}>Next page</Button>
        )}
      </>
    </section>
  );
}

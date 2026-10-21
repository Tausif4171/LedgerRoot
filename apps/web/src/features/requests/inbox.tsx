"use client";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { ApiError } from "@ledgerroot/contracts";
import { loginHref } from "@/lib/login-return";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { sampleCollaboration } from "@/adapters/sample-collaboration";
import { collaborationGateway } from "@/adapters/collaboration";
import { isSample } from "@/adapters/gateway";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/ui/page-heading";
import { LoadingState } from "@/components/ui/loading-state";
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
  const signedOut = !isSample && query.error instanceof ApiError && query.error.status === 401;
  return (
    <section className="request-inbox">
      <PageHeading title="Requests" description="Questions and replies linked to documents." />
      {isSample && (
        <div className="callout callout-info example-callout">
          <div className="example-callout-copy">
            <p>Request a clearer copy of the document, then review the updated details.</p>
            <p className="example-callout-note">Processing is simulated.</p>
            {startError && <p role="alert">{startError}</p>}
          </div>
          <Button
            onClick={async () => {
              try {
                const id = await sampleCollaboration.start();
                await cache.invalidateQueries();
                router.push(`/documents/${id}`);
              } catch (e) {
                setStartError(
                  e instanceof Error ? e.message : "The example couldn’t load. Try again.",
                );
              }
            }}
          >
            Start correction example
          </Button>
        </div>
      )}
      <>
        <div className="request-toolbar">
          <div className="request-view-field">
            <label htmlFor="request-view">View requests</label>
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
          </div>
          <form
            className="request-search-form"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(search);
              setCursor(undefined);
            }}
          >
            <div>
              <label htmlFor="request-search">Search questions</label>
              <input
                id="request-search"
                name="q"
                autoComplete="off"
                placeholder="Search questions…"
                maxLength={200}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </div>
        {query.isPending && <LoadingState label="Loading requests…" rows={3} />}
        {query.error && (
          <div className="callout callout-error" role="alert">
            <p>{signedOut ? "Sign in to view requests." : "Requests couldn’t load."}</p>
            {signedOut ? (
              <Link className="btn btn-primary" href={loginHref("/requests")}>
                Sign in
              </Link>
            ) : (
              <Button onClick={() => query.refetch()}>Try again</Button>
            )}
          </div>
        )}
        {!query.error && query.data?.items.length === 0 && (
          <div className="panel empty">
            <h2>No requests match this view</h2>
            <p>Try another view or search.</p>
          </div>
        )}
        {query.data?.items.map((r) => (
          <article className="panel request-card" key={r.id}>
            <div className="request-card-heading">
              <h2>
                <Link href={`/documents/${r.documentId}`}>{r.question}</Link>
              </h2>
              <span
                className={`badge badge-${r.state === "RESOLVED" ? "brand" : r.state === "OPEN" || r.state === "RESPONDED" ? "warning" : "muted"}`}
              >
                {r.state === "RESPONDED"
                  ? "Awaiting review"
                  : r.state === "OPEN"
                    ? "Waiting for response"
                    : r.state === "RESOLVED"
                      ? "Resolved"
                      : "Canceled"}
              </span>
            </div>
            <p className="request-document">{r.document.filename}</p>
            <div className="request-card-meta">
              <span>
                Assigned to{" "}
                {members.data?.find((m) => m.id === r.assigneeId)?.name ?? "Former teammate"}
              </span>
              <time dateTime={r.updatedAt}>Updated {new Date(r.updatedAt).toLocaleString()}</time>
            </div>
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

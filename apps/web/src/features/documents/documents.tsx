"use client";
import Link from "next/link";
import { ApiError } from "@ledgerroot/contracts";
import { loginHref } from "@/lib/login-return";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowUpFromLine, CheckCheck, Clock3, Files, Search } from "lucide-react";
import { documentCompleteness } from "./completeness";
import { gateway, isSample } from "@/adapters/gateway";
import { Status } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/ui/page-heading";
import { LoadingState } from "@/components/ui/loading-state";
import { UploadDialog } from "@/features/upload/upload-dialog";
const filters = [
  ["all", "All documents"],
  ["review", "Needs review"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["failed", "Failed"],
] as const;
export function Documents() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search);
      setCursor(undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["documents", status, q, cursor],
    queryFn: () => gateway.list({ status, q, cursor }),
    refetchInterval: (query) =>
      query.state.data?.items.some((d) => !["READY", "FAILED"].includes(d.stage)) ? 2500 : false,
    refetchIntervalInBackground: false,
  });
  const all = useQuery({ queryKey: ["documents", "counts"], queryFn: () => gateway.summary() });
  const docs = query.data?.items ?? [];
  const signedOut = !isSample && query.error instanceof ApiError && query.error.status === 401;
  return (
    <>
      <PageHeading
        title="Documents"
        actions={
          <Button variant="primary" disabled={signedOut} onClick={() => setOpen(true)}>
            <ArrowUpFromLine size={16} aria-hidden="true" />
            {isSample ? "Try a sample" : "Upload"}
          </Button>
        }
      />
      <section className="stats document-summary" aria-label="Document summary">
        <div className="stat">
          <div className="stat-title">
            <Files size={16} aria-hidden="true" />
            In this workspace
          </div>
          <div className="stat-value">{all.data?.total ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="stat-title">
            <Clock3 size={16} aria-hidden="true" />
            Needs attention
          </div>
          <div className="stat-value">{all.data?.attention ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="stat-title">
            <CheckCheck size={16} aria-hidden="true" />
            Approved
          </div>
          <div className="stat-value">{all.data?.approved ?? "—"}</div>
        </div>
      </section>
      <div className="toolbar">
        <div className="filters" aria-label="Filter documents">
          {filters.map(([value, label]) => (
            <button
              className="filter"
              key={value}
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setCursor(undefined);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={16} className="muted" aria-hidden="true" />
          <span className="sr-only">Search documents</span>
          <input
            placeholder="Search documents…"
            name="q"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="panel">
        {query.isPending ? (
          <LoadingState label="Loading documents…" />
        ) : query.error ? (
          <div className="empty" role="alert">
            <h2>{signedOut ? "Sign in to view your documents" : "Documents couldn’t load"}</h2>
            {!signedOut && <Button onClick={() => query.refetch()}>Try again</Button>}
            {signedOut && (
              <Link className="btn btn-primary" href={loginHref("/documents")}>
                Sign in
              </Link>
            )}
          </div>
        ) : !docs.length ? (
          <div className={q || status !== "all" ? "empty empty-filter" : "empty"}>
            <Files size={32} className="muted" aria-hidden="true" />
            <h2>
              {q
                ? "No matching documents"
                : status !== "all"
                  ? status === "review"
                    ? "No documents need review"
                    : `No ${status} documents`
                  : "No documents yet"}
            </h2>
            {(q || status === "all") && (
              <p>
                {q
                  ? "Try another vendor or filename."
                  : isSample
                    ? "Sample receipts and invoices are ready to explore."
                    : "Upload a receipt or invoice to start a review."}
              </p>
            )}
            {(q || status !== "all") && (
              <Button
                onClick={() => {
                  setSearch("");
                  setQ("");
                  setStatus("all");
                  setCursor(undefined);
                }}
              >
                Show all documents
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap documents-table-wrap">
              <table className="documents-table">
                <thead>
                  <tr>
                    <th scope="col">Document</th>
                    <th scope="col">Status</th>
                    <th scope="col">Total</th>
                    <th scope="col">Uploaded</th>
                    <th scope="col">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => {
                    const completeness = documentCompleteness(d);
                    return (
                      <tr key={d.id}>
                        <td className="document-main">
                          <div className="doc-cell">
                            {d.thumbnailUrl ? (
                              <img
                                className="doc-thumb"
                                src={d.thumbnailUrl}
                                alt=""
                                loading="lazy"
                                width={40}
                                height={52}
                              />
                            ) : (
                              <Files size={24} aria-hidden="true" />
                            )}
                            <div>
                              <Link className="doc-link" href={`/documents/${d.id}`}>
                                {d.fields.vendor ?? d.filename}
                              </Link>
                              <small>
                                {d.fields.documentType === "invoice"
                                  ? "Invoice"
                                  : d.fields.documentType === "receipt"
                                    ? "Receipt"
                                    : "Document type needs review"}{" "}
                                · {d.fields.invoiceNumber ?? d.filename}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Status document={d} sample={isSample} />
                        </td>
                        <td className="document-total numeric">
                          {completeness.total === "Total not extracted" ? (
                            <span>
                              <span className="sr-only">Total not extracted</span>
                              <span className="total-mobile-prefix" aria-hidden="true">
                                Total{" "}
                              </span>
                              <span aria-hidden="true">Not extracted</span>
                            </span>
                          ) : (
                            completeness.total
                          )}
                        </td>
                        <td className="document-date muted">
                          {new Date(d.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </td>
                        <td className="document-action">
                          <Link
                            className="btn btn-ghost btn-small"
                            href={`/documents/${d.id}`}
                            aria-label={`Review ${d.fields.vendor ?? d.filename}`}
                          >
                            <ArrowUpRight size={16} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>
                {docs.length} document{docs.length === 1 ? "" : "s"}
              </span>
              <div>
                {cursor && (
                  <Button size="small" variant="ghost" onClick={() => setCursor(undefined)}>
                    First page
                  </Button>
                )}
                {query.data?.nextCursor && (
                  <Button size="small" onClick={() => setCursor(query.data!.nextCursor!)}>
                    Next page
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <UploadDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowUpFromLine, CheckCheck, Clock3, Files, Search } from "lucide-react";
import { formatMoney } from "@ledgerroot/domain";
import { gateway, isSample } from "@/adapters/gateway";
import { Status } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/features/upload/upload-dialog";
const filters = [
  ["all", "All documents"],
  ["review", "Needs review"],
  ["approved", "Approved"],
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
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Documents</h1>
          <p>A clear path from source to reviewed record.</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <ArrowUpFromLine size={16} />
          {isSample ? "Try a sample" : "Upload"}
        </Button>
      </div>
      <section className="stats" aria-label="Document summary">
        <div className="stat">
          <div className="stat-title">
            <Files size={16} />
            In this workspace
          </div>
          <div className="stat-value">{all.data?.total ?? "—"}</div>
          <p>Originals preserved</p>
        </div>
        <div className="stat">
          <div className="stat-title">
            <Clock3 size={16} />
            Needs attention
          </div>
          <div className="stat-value">{all.data?.attention ?? "—"}</div>
          <p>Your review makes the difference</p>
        </div>
        <div className="stat">
          <div className="stat-title">
            <CheckCheck size={16} />
            Approved
          </div>
          <div className="stat-value">{all.data?.approved ?? "—"}</div>
          <p>Reviewed, never auto-posted</p>
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
          <Search size={16} className="muted" />
          <span className="sr-only">Search documents</span>
          <input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="panel">
        {query.isPending ? (
          <div aria-label="Loading documents" aria-busy="true">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="skeleton-row">
                <div className="skeleton" style={{ width: "45%" }} />
                <div className="skeleton" style={{ width: "25%" }} />
              </div>
            ))}
          </div>
        ) : query.error ? (
          <div className="empty" role="alert">
            <h2>Documents couldn’t load</h2>
            <p>{query.error.message}</p>
            <Button onClick={() => query.refetch()}>Try again</Button>
            {!isSample && (
              <Link className="btn" href="/login">
                Sign in
              </Link>
            )}
          </div>
        ) : !docs.length ? (
          <div className="empty">
            <Files size={32} className="muted" />
            <h2>{q ? "No matching documents" : "Nothing here yet"}</h2>
            <p>
              {q
                ? "Try another vendor or filename."
                : "Upload a document or choose another filter to continue."}
            </p>
            <Button
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
            >
              Show all documents
            </Button>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="documents-table">
                <thead>
                  <tr>
                    <th scope="col">Document</th>
                    <th scope="col">Status</th>
                    <th scope="col">Total</th>
                    <th scope="col">Added</th>
                    <th scope="col">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td className="document-main">
                        <div className="doc-cell">
                          {d.thumbnailUrl ? (
                            <img
                              className="doc-thumb"
                              src={d.thumbnailUrl}
                              alt=""
                              loading="lazy"
                              width={42}
                              height={54}
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
                                  : "Type needs review"}{" "}
                              · {d.fields.invoiceNumber ?? d.filename}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Status document={d} />
                      </td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatMoney(d.fields.totalCents)}
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
                          <ArrowUpRight size={17} />
                        </Link>
                      </td>
                    </tr>
                  ))}
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
                {!cursor && !query.data?.nextCursor && <span>Human review required</span>}
              </div>
            </div>
          </>
        )}
      </div>
      <p className="footnote">
        Approval stays inside LedgerRoot. No payments, ledger entries, or Ambrook changes are made.
      </p>
      <UploadDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

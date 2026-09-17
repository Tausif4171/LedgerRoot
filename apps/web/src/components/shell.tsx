"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Files, ChartNoAxesCombined, GitBranch, Info, RotateCcw, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collaborationGateway } from "@/adapters/collaboration";
import { sampleCollaboration, samplePeople } from "@/adapters/sample-collaboration";
import { Button } from "./ui/button";
import { gateway, isSample } from "@/adapters/gateway";
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const cache = useQueryClient();
  const identity = useQuery({
    queryKey: ["identity"],
    queryFn: () => collaborationGateway.identity(),
  });
  const requests = useQuery({
    queryKey: ["requests", "count"],
    queryFn: () => collaborationGateway.summary(),
    refetchInterval: (q) => Math.min(60000, 15000 * 2 ** Math.min(q.state.fetchFailureCount, 2)),
    refetchIntervalInBackground: false,
  });
  return (
    <div className="shell">
      <a href="#main" className="skip">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="wordmark" href="/documents" aria-label="LedgerRoot documents">
          <GitBranch size={25} strokeWidth={1.5} />
          LedgerRoot
        </Link>
        <div className="workspace-name">
          <span className="eyebrow">Workspace</span>
          <div style={{ marginTop: 6 }}>Fieldwork & finances</div>
        </div>
        <nav className="nav" aria-label="Main navigation">
          <Link
            href="/documents"
            aria-current={pathname.startsWith("/documents") ? "page" : undefined}
          >
            <Files size={18} />
            Documents
          </Link>
          <Link href="/quality" aria-current={pathname === "/quality" ? "page" : undefined}>
            <ChartNoAxesCombined size={18} />
            Quality
          </Link>
          <Link href="/requests" aria-current={pathname === "/requests" ? "page" : undefined}>
            <Info size={18} />
            Requests {requests.data?.actionable ? `(${requests.data.actionable})` : ""}
          </Link>
        </nav>
        <div className="sidebar-foot">
          <p>
            Every suggestion has a source.
            <br />
            Every decision stays yours.
          </p>
          {isSample && (
            <Button
              onClick={async () => {
                await gateway.reset();
                await cache.invalidateQueries();
              }}
            >
              <RotateCcw size={15} />
              Reset samples
            </Button>
          )}
          <span>
            Independent engineering prototype{" "}
            <ArrowUpRight size={12} style={{ display: "inline" }} />
          </span>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <span>
            Workspace{" "}
            <span className="muted">
              {" "}
              /{" "}
              {pathname === "/quality"
                ? "Quality"
                : pathname === "/requests"
                  ? "Requests"
                  : "Documents"}
            </span>
          </span>
          <div className="topbar-profile">
            {isSample && (
              <label>
                Demo actor{" "}
                <select
                  aria-label="Demo actor (simulation only)"
                  value={identity.data?.userId ?? samplePeople[0]!.id}
                  onChange={async (e) => {
                    sampleCollaboration.switchActor(e.target.value);
                    await cache.invalidateQueries();
                  }}
                >
                  {samplePeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="muted">{isSample ? "Sample workspace" : "Local workspace"}</span>
            <div className="avatar" aria-label="Workspace avatar">
              LR
            </div>
          </div>
        </header>
        <main id="main" className="main">
          {isSample && (
            <div className="sample-notice">
              <Info size={16} />
              <span>
                Sample mode · Synthetic documents. Extraction provenance is shown on each record.
                Review changes stay in this browser tab.
              </span>
              <Button
                size="small"
                variant="ghost"
                aria-label="Reset demo"
                onClick={async () => {
                  await gateway.reset();
                  await cache.invalidateQueries();
                }}
              >
                <RotateCcw size={14} />
              </Button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

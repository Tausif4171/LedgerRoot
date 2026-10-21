"use client";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { ApiError } from "@ledgerroot/contracts";
import { loginHref } from "@/lib/login-return";
import { usePathname } from "next/navigation";
import { Files, ChartNoAxesCombined, GitBranch, Info, RotateCcw } from "lucide-react";
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
  const showSignIn =
    !isSample &&
    identity.error instanceof ApiError &&
    identity.error.status === 401 &&
    pathname !== "/login";
  return (
    <div className="shell">
      <a href="#main" className="skip">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="wordmark" href="/documents" aria-label="LedgerRoot documents">
          <GitBranch size={25} strokeWidth={1.5} aria-hidden="true" />
          LedgerRoot
        </Link>
        <div className="workspace-name">
          <span className="eyebrow">Workspace</span>
          <div style={{ marginTop: 6 }}>{isSample ? "Sample workspace" : "Local workspace"}</div>
        </div>
        <nav className="nav" aria-label="Main navigation">
          <Link
            href="/documents"
            aria-current={pathname.startsWith("/documents") ? "page" : undefined}
          >
            <Files size={18} aria-hidden="true" />
            Documents
          </Link>
          <Link href="/quality" aria-current={pathname === "/quality" ? "page" : undefined}>
            <ChartNoAxesCombined size={18} aria-hidden="true" />
            Evaluation
          </Link>
          <Link href="/requests" aria-current={pathname === "/requests" ? "page" : undefined}>
            <Info size={18} aria-hidden="true" />
            Requests {requests.data?.actionable ? `(${requests.data.actionable})` : ""}
          </Link>
        </nav>
      </aside>
      <div className="content">
        {(isSample || showSignIn) && (
          <header className={`topbar ${isSample ? "sample-header" : "auth-header"}`}>
            {isSample && (
              <div className="sample-notice">
                <Info size={16} aria-hidden="true" />
                <span>Sample workspace. Documents are examples; changes stay in this tab.</span>
              </div>
            )}
            <div className="topbar-profile">
              {showSignIn && (
                <Link className="header-sign-in" href={loginHref(pathname)}>
                  Sign in
                </Link>
              )}
              {isSample && (
                <>
                  <label className="sample-user">
                    Demo user{" "}
                    <Select
                      aria-label="Demo user"
                      value={identity.data?.userId ?? samplePeople[0]!.id}
                      onValueChange={async (value) => {
                        sampleCollaboration.switchActor(value);
                        await cache.invalidateQueries();
                      }}
                    >
                      {samplePeople.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button
                    size="small"
                    variant="ghost"
                    aria-label="Reset sample data"
                    onClick={async () => {
                      await gateway.reset();
                      await cache.invalidateQueries();
                    }}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    Reset sample data
                  </Button>
                </>
              )}
            </div>
          </header>
        )}
        <main id="main" className="main">
          {children}
        </main>
      </div>
    </div>
  );
}

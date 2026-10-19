export function LoadingState({
  label,
  kind = "list",
  rows = 4,
}: {
  label: string;
  kind?: "list" | "review" | "metrics";
  rows?: number;
}) {
  return (
    <div className={`loading-state loading-${kind}`} role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {kind === "review" ? (
          <div className="loading-review-grid">
            <div className="skeleton loading-source" />
            <div className="loading-fields">
              {Array.from({ length: 6 }, (_, n) => (
                <div key={n} className="skeleton" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {kind === "metrics" && (
              <div className="loading-metrics">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="skeleton" />
                ))}
              </div>
            )}
            {Array.from({ length: rows }, (_, n) => (
              <div key={n} className="skeleton-row">
                <div className="skeleton loading-line-long" />
                <div className="skeleton loading-line-short" />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

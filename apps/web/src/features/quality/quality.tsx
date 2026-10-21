"use client";
import { useQuery } from "@tanstack/react-query";
import { gateway } from "@/adapters/gateway";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/ui/page-heading";
import { LoadingState } from "@/components/ui/loading-state";
export function Quality() {
  const query = useQuery({ queryKey: ["evaluations"], queryFn: () => gateway.evaluations() });
  const run = query.data?.[0];
  const cases = run?.cases ?? [];
  const sum = (key: "correct" | "attempted" | "expectedCount" | "unsupported") =>
    cases.reduce((n, c) => n + c[key], 0);
  const percent = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "Not measured");
  return (
    <>
      <PageHeading title="Extraction evaluation" />
      {query.isPending ? (
        <LoadingState label="Loading evaluation…" kind="metrics" />
      ) : query.error ? (
        <div role="alert" className="callout callout-error">
          <p>The evaluation results couldn’t load.</p>
          <Button onClick={() => query.refetch()}>Try again</Button>
        </div>
      ) : !run ? (
        <div className="panel empty">
          <h2>No saved evaluation results yet</h2>
          <p>Run the evaluation locally to create a report.</p>
        </div>
      ) : (
        <>
          <p className="quality-intro">
            Saved evaluation results from {cases.length} synthetic test documents with expected
            values. They are separate from workspace uploads and do not measure live service health
            or production accuracy.
          </p>
          <section className="stats evaluation-summary" aria-label="Evaluation summary">
            <div className="stat">
              <div className="stat-title">Correct / attempted</div>
              <div className="stat-value">
                {sum("correct")} / {sum("attempted")}
              </div>
              <p>{percent(sum("correct"), sum("attempted"))} accuracy among suggestions</p>
            </div>
            <div className="stat">
              <div className="stat-title">Known fields</div>
              <div className="stat-value">{sum("expectedCount")}</div>
              <p>
                {percent(sum("attempted") - sum("unsupported"), sum("expectedCount"))} coverage of
                known fields
              </p>
            </div>
            <div className="stat">
              <div className="stat-title">Unsupported suggestions</div>
              <div className="stat-value">{sum("unsupported")}</div>
              <p>Suggestions without a known answer</p>
            </div>
          </section>
          <section className="quality-metrics" aria-label="Additional evaluation metrics">
            <dl className="quality-metrics-list">
              <div className="quality-metric-row">
                <dt>Unfilled candidate fields, including optional values</dt>
                <dd className="quality-number">
                  {cases.length * 7 - sum("attempted")} / {cases.length * 7}
                </dd>
              </div>
              <div className="quality-metric-row">
                <dt>Incorrect or unsupported suggestions</dt>
                <dd className="quality-number">{sum("attempted") - sum("correct")}</dd>
              </div>
              <div className="quality-metric-row">
                <dt>Processing errors</dt>
                <dd className="quality-number">{cases.filter((c) => c.error).length}</dd>
              </div>
            </dl>
          </section>
          <div
            className="panel table-wrap quality-split quality-splits"
            role="region"
            aria-label="Results by dataset split"
            tabIndex={0}
          >
            <table className="quality-table">
              <caption className="sr-only">Results separated by dataset split</caption>
              <thead>
                <tr>
                  <th>Split</th>
                  <th className="quality-number">Cases</th>
                  <th className="quality-number">Correct / attempted</th>
                  <th className="quality-number">Known fields</th>
                </tr>
              </thead>
              <tbody>
                {["development", "holdout"].map((split) => {
                  const rows = cases.filter((c) => c.category.startsWith(`${split}/`));
                  return (
                    <tr key={split}>
                      <td>{split}</td>
                      <td className="quality-number">{rows.length}</td>
                      <td className="quality-number">
                        {rows.reduce((n, c) => n + c.correct, 0)} /{" "}
                        {rows.reduce((n, c) => n + c.attempted, 0)}
                      </td>
                      <td className="quality-number">
                        {rows.reduce((n, c) => n + c.expectedCount, 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className="panel table-wrap quality-cases"
            role="region"
            aria-label="Evaluation test cases"
            tabIndex={0}
          >
            <table className="quality-table">
              <thead>
                <tr>
                  <th>Test case</th>
                  <th>Category / split</th>
                  <th className="quality-number">Correct / expected</th>
                  <th className="quality-number">Duration</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.id}</td>
                    <td>{c.category}</td>
                    <td className="quality-number">
                      {c.correct} / {c.expectedCount}
                    </td>
                    <td className="quality-number">{(c.durationMs / 1000).toFixed(1)}s</td>
                    <td>
                      {c.error ??
                        (c.correct === c.expectedCount
                          ? "Matched labels"
                          : "Review errors / abstentions")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="panel quality-run-details">
            <summary>Run details</summary>
            <div className="quality-run-content">
              <div className="quality-meta">
                <div>
                  <strong>Model</strong>
                  <p>{run.model}</p>
                </div>
                <div>
                  <strong>Dataset and prompt</strong>
                  <p>
                    {run.datasetVersion} / {run.promptVersion}
                  </p>
                </div>
                <div>
                  <strong>Run date</strong>
                  <p>{new Date(run.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <strong>Hardware</strong>
                  <p>{run.hardware}</p>
                </div>
                <div>
                  <strong>Model digest</strong>
                  <p className="mono">{run.modelDigest}</p>
                </div>
              </div>
              <p className="quality-limit">
                Evidence links are checked separately from value correctness. Confidence scores are
                not calibrated.
              </p>
            </div>
          </details>
        </>
      )}
    </>
  );
}

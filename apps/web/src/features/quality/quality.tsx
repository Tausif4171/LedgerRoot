"use client";
import { useQuery } from "@tanstack/react-query";
import { gateway } from "@/adapters/gateway";
export function Quality() {
  const query = useQuery({ queryKey: ["evaluations"], queryFn: () => gateway.evaluations() });
  const run = query.data?.[0];
  const cases = run?.cases ?? [];
  const sum = (key: "correct" | "attempted" | "expectedCount" | "unsupported") =>
    cases.reduce((n, c) => n + c[key], 0);
  const percent = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "Not measured");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Extraction evaluation</h1>
          <p>Saved test results—not your workspace uploads.</p>
        </div>
      </div>
      <p className="quality-intro">
        Recorded extraction results on synthetic test documents with known answers. Uploading,
        editing or approving workspace documents does not change this report. This is not live
        service health, a production benchmark or evidence of customer demand.
      </p>
      {query.isPending ? (
        <div className="skeleton" />
      ) : query.error ? (
        <div role="alert" className="callout callout-error">
          {query.error.message}
        </div>
      ) : !run ? (
        <div className="panel empty">
          <h2>No evaluation recorded yet</h2>
          <p>
            Run the local evaluation pipeline to generate real measurements. No accuracy numbers are
            assumed.
          </p>
        </div>
      ) : (
        <>
          <p className="quality-intro">
            This recorded run contains {cases.length} test cases. Rows below identify test images,
            not workspace records, and are read-only. Missing answers and processing failures remain
            included in the results.
          </p>
          <section className="stats" aria-label="Evaluation summary">
            <div className="stat">
              <div className="stat-title">Correct / attempted</div>
              <div className="stat-value">
                {sum("correct")} / {sum("attempted")}
              </div>
              <p>{percent(sum("correct"), sum("attempted"))} accuracy among suggestions</p>
            </div>
            <div className="stat">
              <div className="stat-title">Ground-truth fields</div>
              <div className="stat-value">{sum("expectedCount")}</div>
              <p>
                {percent(sum("attempted") - sum("unsupported"), sum("expectedCount"))} coverage of
                known fields
              </p>
            </div>
            <div className="stat">
              <div className="stat-title">Unsupported suggestions</div>
              <div className="stat-value">{sum("unsupported")}</div>
              <p>Suggestions where the label is unknown</p>
            </div>
          </section>
          <p className="footnote">
            {cases.length * 7 - sum("attempted")} of {cases.length * 7} candidate fields left empty
            ({percent(cases.length * 7 - sum("attempted"), cases.length * 7)} abstention, including
            absent optional fields). {sum("attempted") - sum("correct")} incorrect or unsupported
            suggestions. {cases.filter((c) => c.error).length} processing errors.
          </p>
          <div className="panel table-wrap" style={{ marginBottom: 20 }}>
            <table>
              <caption className="sr-only">Results separated by dataset split</caption>
              <thead>
                <tr>
                  <th>Split</th>
                  <th>Cases</th>
                  <th>Correct / attempted</th>
                  <th>Known fields</th>
                </tr>
              </thead>
              <tbody>
                {["development", "holdout"].map((split) => {
                  const rows = cases.filter((c) => c.category.startsWith(`${split}/`));
                  return (
                    <tr key={split}>
                      <td>{split}</td>
                      <td>{rows.length}</td>
                      <td>
                        {rows.reduce((n, c) => n + c.correct, 0)} /{" "}
                        {rows.reduce((n, c) => n + c.attempted, 0)}
                      </td>
                      <td>{rows.reduce((n, c) => n + c.expectedCount, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <div className="quality-meta">
              <div>
                <strong>Model</strong>
                <p>{run.model}</p>
              </div>
              <div>
                <strong>Dataset / prompt</strong>
                <p>
                  {run.datasetVersion} / {run.promptVersion}
                </p>
              </div>
              <div>
                <strong>Run</strong>
                <p>{new Date(run.createdAt).toLocaleString()}</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Test case</th>
                    <th>Category / split</th>
                    <th>Correct / expected</th>
                    <th>Duration</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">{c.id}</td>
                      <td>{c.category}</td>
                      <td>
                        {c.correct} / {c.expectedCount}
                      </td>
                      <td>{(c.durationMs / 1000).toFixed(1)}s</td>
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
          </div>
          <div className="footnote">
            <p>{run.hardware}</p>
            <p className="mono" style={{ overflowWrap: "anywhere" }}>
              Model digest: {run.modelDigest}
            </p>
            <p>
              Evidence links are checked separately from value correctness. No calibrated confidence
              score is claimed.
            </p>
          </div>
        </>
      )}
    </>
  );
}

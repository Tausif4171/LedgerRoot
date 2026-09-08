"use client";
import { useState } from "react";
import type { DocumentRecord } from "@ledgerroot/contracts";
import { ScanLine } from "lucide-react";
export default function SourceViewer({
  document: d,
  selected,
}: {
  document: DocumentRecord;
  selected: string[];
}) {
  const [failed, setFailed] = useState(false);
  const spans = d.extraction?.spans.filter((s) => selected.includes(s.id)) ?? [];
  return (
    <section className="panel" aria-label="Source document">
      <div className="panel-heading">
        <h2>Source document</h2>
        <ScanLine size={18} className="muted" />
      </div>
      <div className="source-stage">
        {failed ? (
          <p role="alert">The source could not load. Refresh to request a new authorized link.</p>
        ) : (
          <div className="source-image">
            <img
              src={d.sourceUrl}
              alt={`Source ${d.fields.documentType ?? "document"} from ${d.fields.vendor ?? d.filename}`}
              onError={() => setFailed(true)}
            />
            {spans.map((s) => (
              <div
                className="evidence-highlight"
                key={s.id}
                style={{
                  left: `${s.x * 100}%`,
                  top: `${s.y * 100}%`,
                  width: `${s.width * 100}%`,
                  height: `${s.height * 100}%`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="source-note" aria-live="polite">
        {spans.length
          ? spans.map((s) => s.text).join(" · ")
          : "Select a source link beside a field to inspect its evidence."}
      </div>
    </section>
  );
}

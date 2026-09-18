"use client";
import { useState } from "react";
import type { HistoryEvent, FieldName } from "@ledgerroot/contracts";
import { Button } from "@/components/ui/button";
import { fieldLabels, fieldValue } from "@/lib/field-labels";
import { History as HistoryIcon } from "lucide-react";
export default function History({ events }: { events: HistoryEvent[] }) {
  const [oldestId, setOldestId] = useState<string | null>(null);
  const newest = events.slice().reverse();
  // Anchor expanded history to an event, so polling does not hide it.
  const shown = Math.min(
    newest.length,
    Math.max(5, newest.findIndex((e) => e.id === oldestId) + 1),
  );
  const actions: Record<string, string> = {
    save: "Review saved",
    approve: "Record approved",
    reject: "Document rejected",
    reopen: "Review reopened",
    "needs-information": "Information needed",
    "Request resolve": "Request resolved",
    "Request respond": "Response received",
    "Request cancel": "Request canceled",
    "Request reassign": "Request reassigned",
  };
  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <h2>Processing & review history</h2>
        <HistoryIcon size={18} className="muted" />
      </div>
      {events.length ? (
        <ol className="history-list">
          {newest.slice(0, shown).map((e) => (
            <li className="history-item" key={e.id}>
              <div className="history-title">{actions[e.action] ?? e.action}</div>
              <p>
                {e.actor}
                {e.note ? ` · ${e.note}` : ""}
              </p>
              <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>
              {e.before &&
                e.after &&
                Object.entries(e.after).some(
                  ([key, value]) => e.before?.[key as FieldName] !== value,
                ) && (
                  <details>
                    <summary>View field changes</summary>
                    <ul>
                      {Object.entries(e.after)
                        .filter(
                          ([key, value]) => e.before?.[key as keyof typeof e.before] !== value,
                        )
                        .map(([key, value]) => (
                          <li key={key}>
                            {fieldLabels[key as FieldName]}:{" "}
                            {fieldValue(key as FieldName, e.before?.[key as FieldName] ?? null)} →{" "}
                            {fieldValue(key as FieldName, value)}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty">
          <p>No processing or review events yet.</p>
        </div>
      )}
      {events.length > 0 && (
        <div className="table-foot">
          <span>
            {shown} of {events.length} events
          </span>
          <div>
            {shown < events.length && (
              <Button
                size="small"
                onClick={() => setOldestId(newest[Math.min(shown + 5, newest.length) - 1]!.id)}
              >
                Show 5 more
              </Button>
            )}
            {shown > 5 && (
              <Button size="small" variant="ghost" onClick={() => setOldestId(null)}>
                Show fewer
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

import type { HistoryEvent } from "@ledgerroot/contracts";
import { History as HistoryIcon } from "lucide-react";
export default function History({ events }: { events: HistoryEvent[] }) {
  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <h2>Processing & review history</h2>
        <HistoryIcon size={18} className="muted" />
      </div>
      {events.length ? (
        <ol className="history-list">
          {events
            .slice()
            .reverse()
            .map((e) => (
              <li className="history-item" key={e.id}>
                <div className="history-title">{e.action}</div>
                <p>
                  {e.actor}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
                <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>
                {e.before && e.after && (
                  <details>
                    <summary>View field changes</summary>
                    <ul>
                      {Object.entries(e.after)
                        .filter(
                          ([key, value]) => e.before?.[key as keyof typeof e.before] !== value,
                        )
                        .map(([key, value]) => (
                          <li key={key}>
                            {key}: {String(e.before?.[key as keyof typeof e.before] ?? "empty")} →{" "}
                            {String(value ?? "empty")}
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
    </section>
  );
}

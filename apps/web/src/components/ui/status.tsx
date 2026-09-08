import type { DocumentRecord } from "@ledgerroot/contracts";
import { reviewLabels, stageLabels } from "@ledgerroot/domain";
export function Status({ document: d }: { document: DocumentRecord }) {
  const text = d.stage === "READY" ? reviewLabels[d.reviewStatus] : stageLabels[d.stage];
  const tone =
    d.stage === "FAILED" || d.reviewStatus === "REJECTED"
      ? "danger"
      : d.reviewStatus === "APPROVED"
        ? "brand"
        : "warning";
  return <span className={`badge badge-${tone}`}>{text}</span>;
}

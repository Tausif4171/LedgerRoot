"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Save } from "lucide-react";
import {
  ApiError,
  fieldsSchema,
  type DocumentRecord,
  type Fields,
  type FieldName,
  type ReviewAction,
} from "@ledgerroot/contracts";
import { moneyInput, parseMoney } from "@ledgerroot/domain";
import { gateway } from "@/adapters/gateway";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
const formSchema = z.object({
  documentType: z.enum(["", "receipt", "invoice"]),
  vendor: z.string().max(200),
  documentDate: z.string(),
  amount: z.string().regex(/^$|^\d+(\.\d{1,2})?$/, "Use at most two decimal places."),
  currency: z.enum(["", "USD"]),
  invoiceNumber: z.string().max(100),
  dueDate: z.string(),
  confirmed: z.boolean(),
});
type Values = z.infer<typeof formSchema>;
const defaults = (f: Fields): Values => ({
  documentType: f.documentType ?? "",
  vendor: f.vendor ?? "",
  documentDate: f.documentDate ?? "",
  amount: moneyInput(f.totalCents),
  currency: f.currency ?? "",
  invoiceNumber: f.invoiceNumber ?? "",
  dueDate: f.dueDate ?? "",
  confirmed: false,
});
export function ReviewForm({
  document: d,
  onEvidence,
}: {
  document: DocumentRecord;
  onEvidence: (ids: string[]) => void;
}) {
  const cache = useQueryClient();
  const [base, setBase] = useState(d);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<DocumentRecord | null>(null);
  const [reasonAction, setReasonAction] = useState<"reject" | "needs-information" | null>(null);
  const [note, setNote] = useState("");
  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults(d.fields),
  });
  const locked = !["PENDING", "NEEDS_INFORMATION"].includes(base.reviewStatus) || !d.canReview;
  async function send(action: ReviewAction, values: Values) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const fields = fieldsSchema.parse({
        documentType: values.documentType || null,
        vendor: values.vendor.trim() || null,
        documentDate: values.documentDate || null,
        totalCents: parseMoney(values.amount),
        currency: values.currency || null,
        invoiceNumber: values.invoiceNumber.trim() || null,
        dueDate: values.dueDate || null,
      });
      const next = await gateway.mutate(
        d.id,
        action,
        {
          expectedRevision: base.revision,
          runId: base.runId,
          fields,
          note,
          confirmed: values.confirmed,
        },
        crypto.randomUUID(),
      );
      setBase(next);
      form.reset(defaults(next.fields));
      cache.setQueryData(["document", d.id], next);
      await cache.invalidateQueries({ queryKey: ["documents"] });
      setSuccess(
        action === "approve"
          ? "Record approved in LedgerRoot. Nothing was posted or paid."
          : "Review saved.",
      );
      setReasonAction(null);
      setNote("");
      setConflict(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The review could not be saved.");
      if (e instanceof ApiError && e.status === 409) setConflict(await gateway.get(d.id));
    } finally {
      setBusy(false);
    }
  }
  const submit = (action: ReviewAction) =>
    void form.handleSubmit((values) => send(action, values))();
  function evidence(name: FieldName) {
    const ids = d.extraction?.evidence[name] ?? [];
    const edited = base.fields[name] !== d.extraction?.fields[name];
    return edited ? (
      <span className="field-origin">Human correction · original extraction retained</span>
    ) : ids.length ? (
      <button type="button" className="evidence-button" onClick={() => onEvidence(ids)}>
        <ExternalLink size={12} />
        Source found
      </button>
    ) : (
      <span className="field-origin">
        {name === "invoiceNumber" || name === "dueDate"
          ? "Not supplied · optional"
          : "No verified source · confirm manually"}
      </span>
    );
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Review extracted fields</h2>
        <span>Revision {base.revision}</span>
      </div>
      <form className="review-form" onSubmit={form.handleSubmit((v) => send("save", v))}>
        {d.extraction?.warnings.length ? (
          <div className="callout">
            <strong>{locked ? "Original extraction warnings" : "Worth a closer look"}</strong>
            <ul>
              {d.extraction.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="callout">
            Source links help you check suggestions. They do not guarantee the values are correct.
          </div>
        )}
        {error && (
          <div className="callout callout-error" role="alert">
            {error}
          </div>
        )}
        {conflict && (
          <div className="callout">
            <strong>Your unsaved edits are still here.</strong>
            <details>
              <summary>Compare latest saved fields</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(conflict.fields, null, 2)}
              </pre>
            </details>
            <Button
              type="button"
              onClick={() => {
                form.reset(defaults(conflict.fields));
                setBase(conflict);
                setConflict(null);
                setError("");
              }}
            >
              Replace form with latest saved values
            </Button>
          </div>
        )}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Document fields</legend>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="documentType">Document type</label>
              <select
                disabled={locked || busy}
                id="documentType"
                {...form.register("documentType")}
              >
                <option value="">Select type</option>
                <option value="receipt">Receipt</option>
                <option value="invoice">Invoice</option>
              </select>
              {evidence("documentType")}
            </div>
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <select disabled={locked || busy} id="currency" {...form.register("currency")}>
                <option value="">Confirm currency</option>
                <option value="USD">USD — US Dollar</option>
              </select>
              {evidence("currency")}
            </div>
            <div className="field field-full">
              <label htmlFor="vendor">Vendor</label>
              <input
                readOnly={locked || busy}
                id="vendor"
                autoComplete="off"
                {...form.register("vendor")}
              />
              {evidence("vendor")}
            </div>
            <div className="field">
              <label htmlFor="documentDate">Document date</label>
              <input
                readOnly={locked || busy}
                id="documentDate"
                type="date"
                {...form.register("documentDate")}
              />
              {evidence("documentDate")}
            </div>
            <div className="field">
              <label htmlFor="amount">Total amount (USD)</label>
              <input
                id="amount"
                readOnly={locked || busy}
                inputMode="decimal"
                aria-invalid={!!form.formState.errors.amount}
                aria-describedby={form.formState.errors.amount ? "amount-error" : undefined}
                {...form.register("amount")}
              />
              {form.formState.errors.amount && (
                <p className="field-error" id="amount-error">
                  {form.formState.errors.amount.message}
                </p>
              )}
              {evidence("totalCents")}
            </div>
            <div className="field">
              <label htmlFor="invoiceNumber">
                Invoice number <span className="muted">(optional)</span>
              </label>
              <input
                readOnly={locked || busy}
                id="invoiceNumber"
                {...form.register("invoiceNumber")}
              />
              {evidence("invoiceNumber")}
            </div>
            <div className="field">
              <label htmlFor="dueDate">
                Due date <span className="muted">(optional)</span>
              </label>
              <input
                readOnly={locked || busy}
                id="dueDate"
                type="date"
                {...form.register("dueDate")}
              />
              {evidence("dueDate")}
            </div>
          </div>
          <label className="confirmation">
            <input disabled={locked || busy} type="checkbox" {...form.register("confirmed")} />
            <span>
              I reviewed the document type, vendor, date, total, and currency against the source.
            </span>
          </label>
        </fieldset>
        <div className="review-actions">
          {!locked ? (
            <>
              <Button type="submit" disabled={busy}>
                <Save size={15} />
                Save changes
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => submit("approve")}
              >
                <Check size={16} />
                Approve record
              </Button>
            </>
          ) : (
            d.canReview && (
              <Button type="button" disabled={busy} onClick={() => submit("reopen")}>
                Reopen for review
              </Button>
            )
          )}
        </div>
        {!locked && (
          <div className="secondary-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setReasonAction("needs-information")}
            >
              Needs information
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setReasonAction("reject")}
            >
              Reject document
            </Button>
          </div>
        )}
        <div aria-live="polite">
          {busy ? (
            <p className="legal-note">Saving your review…</p>
          ) : (
            success && <p className="legal-note">{success}</p>
          )}
        </div>
        <p className="legal-note">
          Approval is local to LedgerRoot. It does not post to a ledger, make a payment, or verify
          tax treatment.
        </p>
        <details style={{ marginTop: 16, fontSize: 12 }}>
          <summary>Extraction provenance</summary>
          <p>
            {d.extraction?.provenance === "live"
              ? "Recorded real model output"
              : "Authored fixture — no real model output"}
          </p>
          <p className="mono" style={{ overflowWrap: "anywhere" }}>
            {d.extraction?.model}
            <br />
            {d.extraction?.modelDigest}
            <br />
            {d.extraction?.promptVersion}
          </p>
        </details>
      </form>
      <Modal
        open={reasonAction !== null}
        onOpenChange={(open) => {
          if (!open) setReasonAction(null);
        }}
        title={reasonAction === "reject" ? "Reject document" : "What information is needed?"}
        description="Leave a reason for the next reviewer. The source and processing history will be preserved."
      >
        <div className="field">
          <label htmlFor="review-reason">Reason</label>
          <textarea
            id="review-reason"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button onClick={() => setReasonAction(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy || !note.trim()}
            onClick={() => reasonAction && submit(reasonAction)}
          >
            Save reason
          </Button>
        </div>
      </Modal>
    </section>
  );
}

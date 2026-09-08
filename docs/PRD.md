# Product requirements

## Position

LedgerRoot explores reliable, evidence-linked receipt/invoice processing and review. Its portfolio purpose is demonstrating judgment, full-stack work, reliability, security boundaries and usability. It does not establish customer demand or a missing Ambrook capability.

Persona: a hypothetical small-business operator/bookkeeper, not an interviewed customer. They need to know whether an upload arrived, what was extracted, what needs correction, and who changed it.

## Acceptance requirements

| Requirement       | Acceptance                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Input             | Genuine JPEG/PNG, English single receipt/invoice, 10 MiB/24 MP; limitations before upload     |
| Durability        | Only acknowledge after original storage and document/run/outbox database transaction          |
| Lifecycle         | Persisted pending/queued/OCR/extracting/validating/ready or retry/failure, survives refresh   |
| Extraction        | Document type, vendor, date, total cents, USD; optional invoice number/due date               |
| Evidence          | Actual OCR span references; source image coordinates; unsupported values withheld             |
| Review            | Save, approve, reject with reason, needs-information with reason, reopen                      |
| Approval          | Human confirmation and all five required fields; exact revision and actor retained            |
| Concurrency       | Expected revision + run required; stale mutation returns 409, local edits retained            |
| Duplicate         | Workspace/checksum uniqueness plus repeated-request idempotency; link existing record         |
| Recovery          | No inline fallback; bounded attempts; expired workers cannot publish; failed history retained |
| Accountability    | Original extraction separate from editable fields and immutable revisions                     |
| Batch             | At most five independent uploads, two concurrent transfers, per-file byte progress            |
| Evaluation        | Thirty labelled synthetic cases, fixed development/holdout families, actual output and timing |
| Public experience | Saved real output, per-tab review state, no arbitrary uploads or model calls                  |

## Non-goals

No general ledger, tax verification, transaction matching, bank integrations, payment, auto-approval, line items, allocations, funding, chatbot, RAG, PDFs, HEIC, multipage, email ingestion, offline sync, fuzzy duplicate detection, custom auth framework or Ambrook integration.

## Release gates

1. A real image completes the local queue/storage/OCR/model/review path.
2. A missing or uncertain field cannot be silently approved.
3. Duplicate uploads and concurrent review cannot duplicate final writes.
4. Retry and stale-worker failure behavior have executable tests.
5. Human changes survive refresh; extraction and history remain distinct.
6. Keyboard/mobile review and automated accessibility checks work; manual gaps are disclosed.
7. Sample provenance and measured evaluation limitations remain visible.
8. Public deployment is verified separately; configuration alone does not count as publication.

The original 2–3/5–8 day estimates are planning estimates, not guarantees. Status belongs in verification/backlog, not in aspirational feature descriptions.

# Architecture and invariants

## Boundaries

`apps/web/src/app` composes feature screens. `features` own UI state and interactions; `components/ui` has no API calls. The REST and sample gateways share browser-safe Zod DTOs from `packages/contracts`. `packages/domain` contains deterministic money and review transitions, not authorization.

`apps/api` contains separate API, dispatcher and worker entrypoints in one modular backend. Routes validate/authorize; services own transactions; storage/OCR/model and queue are explicit boundaries. Jobs contain a run ID, never a stale document snapshot. PostgreSQL is authoritative; Redis is recoverable transport.

## Upload

The authenticated, origin-checked route streams multipart bytes to a bounded temporary file. It decodes the file with Sharp and checks signatures, dimensions and animation. SHA-256 is computed from original bytes, not S3 ETags. The private object key is generated independently of the filename. Conditional S3 writes preserve original objects.

After object storage succeeds, a transaction creates Document, ProcessingRun, Outbox and upload AuditEvent. Workspace/checksum uniqueness plus an advisory lock resolve simultaneous duplicates. A scoped idempotency record binds a request key to its body hash and response. A different payload with the same key is a conflict.

Storage and PostgreSQL are not a distributed transaction. If DB commit fails after storage succeeds, the object is an orphan, not a falsely acknowledged document. A manual cleanup command removes only unreferenced objects older than 24 hours. Temporary multipart files are removed after processing by the HTTP handler; interrupted-upload cleanup needs additional soak testing.

## Dispatch and recovery

Outbox rows remain pending when Redis is unavailable. Dispatcher publishes a deterministic run-based BullMQ job, then marks the outbox sent. Crashing between these operations may repeat dispatch but does not create another logical run.

Workers claim a database generation and four-minute lease before executing. Every publish requires the same generation, an unexpired lease and a nonterminal run. The transaction stores the one extraction result, artifacts, attempt completion, pending review state and audit together. The result is unique per run. A stale worker cannot publish over its replacement. A worker never updates human ReviewRevision rows.

Transient failures use three queue attempts with exponential backoff (2s base); terminal validation failures stop. Manual retry creates a new run and retains old attempts. The dispatcher scans expired leases, closes abandoned attempts and fences their writes. It reconciles missing/failed/completed queue jobs for nonterminal DB runs by restoring dispatch; active queue jobs are never removed. Failure at the third expired attempt becomes a visible terminal failure.

The scan is bounded to 50 candidate runs per iteration. This is sufficient for the prototype, not a fairness/SLO guarantee under large backlogs. Queue retention and long-term database growth require production policies.

## OCR/model

Original bytes remain unchanged. Sharp emits an orientation-normalized PNG and small thumbnail. Tesseract emits line spans in normalized coordinates; the OCR subprocess has a hard wall-time bound that terminates initialization and computation. Ollama receives only bounded text/IDs with a small JSON grammar, a versioned prompt, no tools and no credentials. The HTTP inference request has an abort timeout.

Zod validates shape; deterministic rules reject impossible amounts, unverified currency/date normalization and nonexistent spans. Valid evidence is not proof of semantic correctness. The model may cite a subtotal or abstain unnecessarily; users must still review. The exact model digest, prompt version and timings accompany results.

## Review

Processing state and review state are separate. `READY` does not mean approved. Mutation input includes expected revision and extraction run. A conditional update, immutable ReviewRevision and AuditEvent commit atomically. Two reviewers racing from the same revision yield one commit and one 409. Repeated same-key approval returns its recorded outcome. Human-entered fields are explicitly marked; original model fields are not overwritten.

Approval requires type, vendor, date, total, USD and human confirmation. Reject/needs-information need a reason. Reopen preserves fields and moves to pending. History is append-only through these application operations, not cryptographically tamper-proof or protected from a database administrator.

## Interfaces

Application prefix `/api/v1`; Better Auth `/api/auth`. Every real document/source/history/review operation checks session membership. Roles: owner/reviewer can mutate, viewer can read. API source redirects are authorized and expire after 60 seconds; original access uses `?original=1`, thumbnail uses `?thumbnail=1`.

Endpoints: upload/list/detail/source/history, document summary, save review, approve/reject/needs-information/reopen/retry, evaluation summaries, current identity. List uses stable ID cursor pagination (50 records) with filters applied in SQL before pagination. IDs are opaque: ID order is not chronological order.

Typed errors include code, message, request ID, retryability and validation fields. Logs omit document bytes, OCR, signed URLs and provider responses. The public sample build has no backend credentials and makes no live API calls.

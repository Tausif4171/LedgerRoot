# Architecture decisions

## 001 — Two modes, one UI

Accepted: real local stack plus public saved-result adapter. This preserves the same review interactions without exposing an inference service or inviting arbitrary financial uploads. Cost: samples cannot demonstrate live backend reliability; the real recording/tests do that separately.

## 002 — Durable DB outbox and fenced worker

Accepted: PostgreSQL commit precedes acknowledgment; queue jobs are transport. Generation/lease compare-and-set and unique run results prevent duplicate/stale writes. Cost: a dispatcher/reconciler and lease policy are required. No “exactly once execution” claim: only the final persisted result is constrained.

## 003 — AI output is immutable and fallible

Accepted: preserve result separately from ReviewRevision; null unsupported fields, no self-reported probability. Humans approve with revision checks. Cost: lower coverage and explicit review effort. This is preferable to hiding uncertainty.

## 004 — Small model grammar, strict external validation

Accepted after a real runtime failure: send a simple JSON type grammar to Ollama, enforce the full Zod/money/date/evidence constraints afterward. The initial full schema caused runner failures. Schema conformity still does not prove financial correctness.

## 005 — Existing auth and S3 boundary

Accepted: Better Auth database sessions; no custom registration/auth UI framework. Local MinIO supplies an S3 endpoint. This demonstrates interfaces without copying AIStor or assuming a transferable license. A production storage/auth deployment is out of scope.

## 006 — Explicit UI/hosting target wins

Accepted: Next.js 16 and Vercel sample deployment as requested, not a Sites-generated alternative stack. Optional design skills were unavailable; project design/accessibility rules are implemented and independently tested. The Vercel token currently blocks publication.

# Evidence and honest positioning

Checked September 8, 2026. Public evidence is about relevance, not proof that Ambrook lacks a feature.

- [Ambrook receipt documentation](https://support.ambrook.com/en/articles/10222947-managing-receipts-in-ambrook) describes receipt review, transaction matching, editable extracted information, batch receipt upload, emailed receipts and draft bills created from images. We must not pitch these as missing capabilities.
- [Ambrook Engineering](https://ambrook.com/engineering) describes receipt/invoice capture and AI-assisted financial workflows. It establishes relevance to their engineering domain, not a gap in their internal retry, storage, evaluation or audit mechanisms.
- [BullMQ idempotent-job guidance](https://docs.bullmq.io/patterns/idempotent-jobs) motivates retry-safe persistence. LedgerRoot additionally uses DB ownership/generations, because deterministic queue IDs alone do not make side effects safe.

The design draws on the architectural lessons in the approved plan: DecisionCapture's evidence and review separation; ReplayHQ's identifier-based async ingestion and object/metadata separation; storage integrity and operational UX from MinIO experience. No proprietary MinIO code or reference repository was modified or copied.

Funding investigation is closed as a build direction: the supplied public workflows did not establish a compelling missing feature. UI handoffs and external-office links are not proof of customer pain. Likewise, this prototype's persona is hypothetical; no customer interviews or demand validation are claimed.

Safe founder wording: “I studied your existing receipt workflow and built an independent prototype around reliable processing and evidence-linked review. I’m not assuming these are missing from Ambrook; I wanted to show how I reason about this class of system.”

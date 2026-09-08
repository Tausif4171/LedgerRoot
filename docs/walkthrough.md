# Three-minute founder walkthrough outline

Current actual recording: `demo/live-workflow.webm`. It is short, un-narrated and uses real local services, not artificial processing delays. A polished three-minute narrated clip remains a presentation task.

**0:00–0:25 — Position.** “This is an independent prototype, not an Ambrook integration. Your product already supports receipt review. I focused on how I would make document processing reliable and understandable.”

**0:25–1:05 — Real lifecycle.** Upload a supplied synthetic image. Explain that acknowledgment means object plus DB/outbox are durable. Watch named persisted stages, then open the source and extracted fields. State that the model left a vendor unanswered; do not pretend it extracted everything.

**1:05–1:45 — Human judgment.** Inspect evidence, correct the missing vendor, save and refresh. Confirm required fields before approval. Open history and show the original extraction is still separate. Approval means reviewed here, not paid/posted.

**1:45–2:20 — Reliability.** Upload the identical image and open the existing record. Show the concurrency/recovery tests: stale revisions reject, expired workers cannot publish, manual retry keeps failed history. Do not present deterministic test providers as live-model demonstrations.

**2:20–2:50 — Evaluation.** Show the full saved report: 116/118 attempted correct, 155 known fields, two errors, vendor abstentions. Explain the synthetic dataset and limited coverage. No production accuracy claim.

**2:50–3:00 — Why it matters.** “This is how I combine full-stack product work, storage/worker reliability, evidence and human review. I’d like to bring that judgment to the software engineering team.” No promise of integration or hiring outcome.

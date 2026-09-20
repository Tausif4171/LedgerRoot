# LedgerRoot

Receipt and invoice review, with source evidence and a clear path to resolve missing information.

LedgerRoot helps a bookkeeper review extracted details, ask a teammate for clarification, and review a clearer photo without losing earlier images or saved corrections. AI suggests values; a person decides what to approve.

An independent prototype for receipt and invoice review.

[Quick start](#quick-start) · [Workflow](#the-workflow) · [Architecture](#architecture) · [Evaluation](#extraction-evaluation)

![A receipt beside its extracted fields in the local review workflow](docs/demo/live-review-before.png)

_Earlier local-build screenshot. The current application also includes correction requests and source-image history._

## The workflow

A receipt arrives with an unreadable total. Instead of starting over or keeping the clarification in a separate conversation:

1. **Upload:** preserve the original image and process it in the background.
2. **Review:** compare suggestions with the source and save corrections.
3. **Ask:** assign a question to an authorized teammate. An active request blocks approval.
4. **Respond:** the teammate answers or supplies a clearer photo of the same document.
5. **Compare:** keep earlier images and saved values separate from new suggestions.
6. **Finish:** resolve the request, confirm the fields, and explicitly approve the record.

Approval records a review inside LedgerRoot. It does not create accounting entries, send payments, or verify tax treatment.

## What it supports

- **Evidence-linked review:** inspect the image region behind a suggestion; correct, save, approve, reject, or reopen a record.
- **Correction requests:** an in-app inbox with responses, follow-ups, reassignment, cancellation, and resolution. No email or push notifications.
- **Source-image revisions:** preserve previous photos, extraction results, and review history. Historical images are viewable, not restorable.
- **Reliable processing:** durable dispatch, bounded retries, failure history, and protection against stale workers and conflicting edits.
- **Workspace access:** owners and reviewers can work on records; viewers are read-only. Exact duplicate detection is workspace-scoped.
- **Batch uploads:** up to five files, with individual progress and results.

## Quick start

Use **Node.js 24 and npm 11**. Run these commands from the repository root:

```sh
npm ci
npm run db:generate
npm run dev
```

Open [localhost:3100/documents](http://localhost:3100/documents).

Sample mode needs no running database, storage service, or AI model. It uses synthetic documents and recorded model results. Changes stay in the current browser tab; **Reset samples** restores the demo.

For the two-person flow, open **Requests → Start correction scenario** and switch between the sample bookkeeper and teammate. Actor switching and processing transitions are demo simulations—not real authentication or live inference. Arbitrary uploads are disabled in sample mode.

### Real local processing

After installing dependencies above, start Docker Desktop and the local Ollama service, then run:

```sh
npm run setup:local
npm run infra:up
npm run db:deploy
npm run seed
ollama pull qwen2.5:7b
npm run eval:import
npm run dev:live
```

Wait for PostgreSQL to be healthy before running migrations. Stop the sample server first: both modes use port 3100.

Open [localhost:3100/login](http://localhost:3100/login), matching your configured application origin. Local credentials are in the generated, gitignored `.env`; never publish that file. `eval:import` imports the saved evaluation—it does not run extraction again.

See the [local setup guide](docs/engineering.md) for service prerequisites and recovery, and the [correction workflow guide](docs/correction-workflow.md) for two-user setup and migration precautions.

## Demo and verification

- [Local workflow recording](docs/demo/live-workflow.webm): an earlier, un-narrated real-service check of upload, extraction, correction, approval, and duplicate handling. It does not cover the newer two-person workflow.
- [Recorded verification](docs/demo/live-verification.json) and [testing notes](docs/verification.md): historical checks, their scope, and outstanding release work.
- [Sample deployment guide](docs/deployment.md): instructions for hosting the synthetic demo separately from private live-workspace services.

## Architecture

```text
Next.js review UI → Express API → private S3-compatible storage
                         │
                     PostgreSQL
              documents, sources, reviews, outbox
                         │
                     Dispatcher
                         ↓
                  Redis / BullMQ → Worker
                                      ↓
                           Sharp → Tesseract → Ollama
```

**Stack:** TypeScript, Next.js, React, Tailwind CSS, Radix, Zod, Express, PostgreSQL, Prisma, Redis, BullMQ, and S3-compatible storage.

Key design decisions:

- Original images, AI output, and human revisions are stored separately.
- Each processing run reads its own source version, not whichever image is currently selected.
- Server-side authorization, idempotency, and revision checks protect mutations.
- Replacing an image never silently overwrites saved corrections or approves a record.

See [architecture and invariants](docs/architecture.md) for the implementation details.

## Extraction evaluation

The Evaluation page shows a saved test run on **30 synthetic documents**: 20 development cases and 10 holdout cases. It is separate from workspace uploads and does not change when someone edits or approves a record.

| Recorded measure                            | Result            |
| ------------------------------------------- | ----------------- |
| Correct suggestions / attempted suggestions | 116 / 118 (98.3%) |
| Known fields receiving a suggestion         | 118 / 155 (76.1%) |
| Known fields left unanswered                | 37                |

High correctness among supplied suggestions does not mean every field was extracted. This small synthetic set is not a production-accuracy benchmark; vendor extraction and positive due-date coverage remain limitations.

```sh
npm run eval          # Run extraction against the labelled test documents
npm run eval:import   # Import the saved results into the local application
```

[Recorded results](apps/web/public/samples/evaluations.json) · [Method and limitations](docs/evaluation.md)

## Development checks

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run test:e2e
```

Integration tests require the separate test database described in the [engineering guide](docs/engineering.md). Browser tests and controlled-provider integration tests do not establish real-model accuracy or replace manual accessibility checks.

## Scope and limitations

Built for demonstration and local testing, not production accounting.

- JPEG or PNG; English; USD; one document per image; maximum 10 MiB and 24 megapixels per file.
- No PDF, HEIC, multipage grouping, offline sync, bank connections, ledger entries, or payments.
- No automatic approval, fuzzy duplicate detection, or automatic verification that replacement photos show the same document.

Production use requires further security, reliability, and extraction-quality validation. See the [engineering guide](docs/engineering.md) for operational and dependency-licensing considerations.

## Further reading

- [Product requirements and scope](docs/PRD.md)
- [Correction requests and source-image revisions](docs/correction-workflow.md)
- [UI/UX specification](docs/ui-ux.md)
- [Architecture decisions](docs/decisions.md)
- [Walkthrough outline](docs/walkthrough.md)
- [Prioritized backlog](docs/backlog.md)

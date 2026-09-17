# Correction requests and source-image revisions

An independent prototype for resolving unclear purchase documents without losing saved work. These additions are not verified missing Ambrook features, an integration, or a promise of customer demand.

## What changed

1. An owner/reviewer asks an eligible teammate a specific question about a document.
2. The teammate responds with text or a clearer image of the same document.
3. A reviewer resolves the request once there is a response and the current extraction is ready.
4. The reviewer reconciles values and explicitly approves again.

The existing unassigned Needs information action still works. Request responses do not directly edit financial fields. Resolving a request does not approve a document.

Source history now means **image versions**, in addition to existing field-edit history. Old images remain viewable with their own extraction and evidence. There is no restore/delete-history action. This release supports clearer photographs, not supplier amendments or changed invoices.

## Try the sample scenario

From the repository, with Node 24 and dependencies installed:

```sh
npm run dev
```

Open `http://localhost:3100/requests`.

1. Click **Start correction scenario**. This adds a dedicated synthetic document; the six existing samples remain available.
2. As the sample bookkeeper, click **Request information**. Ask for a clearer total and assign the sample teammate.
3. Verify the request appears and approval is blocked.
4. Change **Demo actor (simulation only)** to the teammate. This is not real authentication.
5. Use the request's **Upload clearer photo** action. Explain what is clearer, confirm it is the same document, then select the supplied image.
6. Switch back to the bookkeeper. Inspect the response and resolve the request.
7. Reconcile the preserved draft if prompted. Compare previous values and new suggestions; fill any missing required fields yourself.
8. Confirm the review and approve. Resolution alone must not produce approval.
9. Open source history and select both versions. The original cropped photo must still be available.
10. Reset the demo. The scenario, actor changes, requests and edits reset only in this tab.

The cropped and clear images have separately recorded local OCR/Ollama outputs in `apps/web/public/samples/correction-scenario.json`. Processing transitions in this scenario replay saved results; they are not live inference or measured processing durations. Arbitrary public uploads remain disabled. No email or external notification is sent.

## Test with two real local users

Stop the sample server before starting live mode; both use port 3100.

In your private `.env`, retain the existing owner credentials and optionally set:

```dotenv
SEED_REVIEWER_EMAIL=teammate@example.test
SEED_REVIEWER_PASSWORD=<choose-a-unique-password-at-least-12-characters>
```

Never commit credentials. The seed creates an optional reviewer but does not reset existing passwords or change existing membership roles.

```sh
npm run infra:up
npm run db:generate
npm run seed
npm run dev:live
```

Use `http://localhost:3100/login`, matching the configured application origin. Sign in as the owner in one browser profile and the reviewer in a separate profile/private window. Do not use two ordinary tabs sharing the same session cookie.

### End-to-end acceptance checklist

- Upload `apps/web/public/samples/correction-cropped.png`, or another synthetic cropped JPEG/PNG. Wait for real processing to finish.
- Save a deliberate vendor correction. Refresh and verify it persists.
- Request a clearer photo from the reviewer. Check the owner's document card and the reviewer's Assigned to me inbox.
- Try approval while the request is active: it must be blocked server-side, not only by a disabled button.
- As the assignee, upload `apps/web/public/samples/correction-clear.png` through the request, with a reason and same-document confirmation.
- Observe real byte progress and persisted processing stages. Refresh during processing; the accepted source must remain current.
- While processing, resolution is unavailable. When ready, inspect the response and resolve it as a reviewer.
- Verify the saved vendor correction is unchanged. A missing new suggestion must not erase an old value.
- Compare old values, new suggestions and the current draft. Explicitly choose or enter the final values, confirm and approve.
- Inspect both images and their evidence. Version 1's evidence must never highlight version 2's image.
- Reopen before another replacement of an approved/rejected document.
- Re-upload the current bytes: no new version/run. Upload older bytes: link to that old version, without restoring it. Another document's identical bytes produce a duplicate link, not another record.
- Test text response, follow-up question, reassignment and cancellation. Canceling must not silently clear Needs information or approve.
- Keep an unsaved field edit in one session while another changes the source. The first session must retain its draft and require explicit reconciliation.

Use synthetic documents only. The application cannot automatically prove that two different photographs depict the same purchase document; the uploader must confirm this.

## Safety and architecture

- `SourceRevision` owns immutable image metadata. `ProcessingRun` and `ReviewRevision` identify the exact source they use.
- `CorrectionRequest` owns assignment/state; `RequestEvent` keeps append-only conversation/action history. Financial edits remain in `ReviewRevision`.
- PostgreSQL row locks and expected document/request versions serialize conflicting changes. Stale mutations return 409.
- A partial unique index allows one Open/Responded request per document. Closed requests remain accessible.
- Mutations use idempotency keys. Reusing a key with different content is a conflict.
- Approval checks active requests inside the same transaction as the approval write.
- New source, current pointer, run and dispatch outbox commit together. Redis downtime does not trigger inline extraction.
- Workers read their run's source; stale workers cannot publish over the current document or saved human corrections.
- Source and thumbnail URLs are bound to a source/run, avoiding new images paired with old OCR after concurrent updates.
- All historical source keys count as referenced during orphan cleanup.
- Owners/reviewers can collaborate; viewers cannot mutate. All queries and image access remain workspace-scoped.
- The inbox is the notification mechanism. It only helps when the teammate opens LedgerRoot; no separate delivery guarantee is claimed.

## Existing database migration

For an existing local installation, stop **API, worker and dispatcher** before migrating. Do not run an old worker against the new schema. The helper does not stop these processes for you.

```sh
node --import tsx scripts/migrate-collaboration.ts
npm run db:generate
```

The helper is restricted to the local `ledgerroot` database/container. It creates a private pg_dump archive under `.cache/migrations`, verifies that archive can be listed, deploys committed migrations and checks retained document counts/current-source references. An archive-list check is not a full restore rehearsal. Keep services stopped if verification fails and inspect the backup; do not reset the database.

The migration backfills source version 1 using existing object keys, with no image copying. Existing runs and reviews reference that version. Unknown historical uploaders are labeled honestly. Legacy original-file columns remain during this additive release.

The SQL includes deferred source-reference foreign keys to support atomic initial document/source creation. Prisma's schema alone does not express that deferrability; preserve it when reviewing future migrations.

On the development machine, the migration retained all six existing documents and verified their current-source references. The pre-migration backup remains private in `.cache/migrations`.

## Verification and release status

September 15 conflict-recovery fix: ready/failed real-mode documents now refresh while visible (15-second interval with error backoff). Request revision conflicts fetch current document/request data without replaying the mutation or clearing typed text. A failed refresh offers an explicit retry. Server revision and approval checks are unchanged. Verified: typecheck, lint, 51 unit tests, 13 integration tests, 16 desktop/mobile browser tests and production build. The new browser regression simulates a concurrent request-version change and checks preserved response text and unsaved field edits; a manual two-session live retest remains recommended.

Automated checks cover pure transitions, actual database transactions, two real authenticated HTTP sessions, authorization, duplicate handling, storage failure, concurrent replacement/approval, preserved corrections, browser sample flows and automated accessibility scans.

Verification on September 11, 2026: **45 unit tests, 13 integration tests and 12 desktop/mobile browser tests passed**, including automated axe checks. Type checking, lint/boundary checks and the production build also passed. Desktop/mobile screenshots were inspected; automated reflow checks include 320 CSS pixels. This does not replace a manual screen-reader review.

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run test:e2e
```

Integration tests use the isolated `ledgerroot_test` database. Their processing/storage substitutes make failures deterministic; those tests are not proof of real OCR quality. Separately, local OCR/Ollama smoke processing and both replacement scenario recordings succeeded with the model digest stored in the sample artifact.

Remaining release checks must not be reported as completed:

- A manual screen-reader pass through the complete two-person workflow.
- A recorded manual live browser walkthrough of these additions using real storage, queue and inference together. Automated authenticated integration tests and separate real extraction runs are narrower evidence.
- A narrated three-minute presentation of the new workflow.
- Public deployment and any outstanding original extraction/evaluation improvements.

Suggested narration: show an unreadable total, assign a request, answer with a clearer photo, compare without losing the saved correction, resolve, approve, then show both images. Explain that approved means reviewed inside LedgerRoot only.

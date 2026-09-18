# Review usability fixes

## Purpose

Make the existing workflow easier to understand without changing who can review,
how extraction works, or how approvals are protected.

## Changes

- Approved/rejected records show their final state instead of an unchecked approval
  checkbox. Reopen is still required for changes. Original AI warnings remain
  available in a collapsed section.
- Empty extracted values with source text use “View source text,” not “Source found.”
  Finding text is not the same as extracting a reliable value. No dates or totals
  are guessed or rewritten.
- History starts with five recent events; older events remain accessible. Saved
  field changes use readable labels and formatted amounts. Request conversations
  also reveal older messages progressively.
- Needs-information notes explicitly say they are workspace-visible and unassigned.
  Resolving a request still does not approve the document. Owner/reviewer permissions
  are unchanged, including the assigned teammate’s ability to resolve.
- Uploads explain all existing limits before file selection, show byte progress
  only during transfer, and distinguish queued processing from completed extraction.
  Dialog spacing and clearer-photo confirmation are consistent.
- New uploads send UTF-8 filename metadata, validated on the server. Legacy clients
  retain their file-header fallback. Storage keys, duplicate detection and filename
  truncation are unchanged. Existing garbled names are not rewritten.
- Rejected documents have a list filter in both modes. Confirmed signed-out users
  get a header sign-in link; login returns only to an allowed workspace page.
  Service errors do not masquerade as sign-out.

## Verification

Verified on 2026-09-17: lint, type checking, 55 unit tests, 13 isolated integration
tests, 22 sample browser tests and 6 mocked live-UI browser tests passed.
The browser suites include automated accessibility checks and desktop/mobile flows.

Run on Node 24, from the repository root:

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e:sample-ui
npm run test:e2e:live-ui
NEXT_DIST_DIR=.next-conflict-check npm run build
```

Run browser suites sequentially. Their servers use ports 3102 and 3103 and separate
build directories, leaving the real app on port 3100 alone. Integration tests use
the isolated test database. Live-UI tests intercept API responses: they check the
live browser gateway, not real extraction or real user accounts.

The added checks cover UTF-8 filenames on upload and source replacement, safe
login destinations, signed-out versus unavailable states, queued upload UI,
rejected filtering/reopening, collapsed historical warnings, missing-value evidence,
and expanding history on desktop/mobile. Existing permission, concurrency, duplicate,
request, source-history, recovery and accessibility regressions remain in the suites.

## Manual acceptance before recording a demo

1. Sign out, visit Requests, sign in, and confirm you return to Requests.
2. Upload a synthetic screenshot with a Unicode filename; inspect its displayed name.
3. Request a clearer photo, respond as the teammate, and resolve as an owner/reviewer.
4. Approve, inspect original warnings/history, then reopen deliberately.
5. Filter rejected records and open one. On mobile, use the History tab to expand events.
6. Check keyboard focus and VoiceOver announcements in the changed dialogs.

Desktop/mobile upload screenshots were visually inspected; automated accessibility
checks are not a replacement for manual VoiceOver testing. A fresh two-user
real-extraction walkthrough and manual screen-reader pass remain manual acceptance
steps. No extraction quality, customer demand, or Ambrook integration claim is made.

## Rollout

No database migration or data cleanup is needed. Restart the API and web app for
the new multipart field and UI to take effect. No saved records, source images,
evaluation reports, or permissions are migrated or deleted.

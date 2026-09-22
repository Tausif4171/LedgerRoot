# Verification record

This file distinguishes completed local checks from release work. It is not a production-readiness certification.

## Focused usability verification — September 22, 2026

### Branding and feedback follow-up

- Added the existing branch mark as SVG and 16/32/48px ICO favicon; verified both routes and metadata in desktop/mobile browser tests and inspected the rendered mark.
- Removed the sidebar prototype label, kept sample disclosures/reset, and made the signed-out header link secondary. Existing signed-out and service-error tests passed.
- Review success now uses one shared, politely announced toast with an eight-second timer, hover/focus pause, keyboard dismissal, and no animation. Errors, persistent status and history remain inline. Repeated confirmations replace the current toast rather than stacking.
- Typecheck, lint, production build, 59 unit tests, 13 integration tests, 38 sample browser tests (34 regression + 4 focused), and 8 mocked live-UI tests passed. The focused checks cover timer expiry, hover/focus pause, dismissal, repeated saves, failed approval, icon loading, axe and 320px reflow. The mobile toast screenshot was inspected.
- Manual VoiceOver and actual light/dark browser-tab appearance remain manual release checks; automated assertions are not a substitute. No authentication, approval, API or database changes were made.

- Typecheck, lint/shared-package boundaries, production build, 59 unit tests and 13 database integration tests passed.
- 34 sample browser tests passed across desktop and mobile, including empty-result manual review, preserved drafts and saved values, null suggestions, source placeholders, all request actions, reset, and exact reopen history counts.
- 8 mocked live-UI browser tests passed, including signed-out recovery, login guidance, service errors and upload feedback. These verify browser behavior, not real extraction or authentication services.
- Keyboard/focus and axe checks passed. Desktop and 320px screenshots were inspected for empty results, comparison layout and actor controls. Reset hover was checked. Complete manual VoiceOver testing remains outstanding.
- The reported duplicate reopen/save event was not reproduced on the pre-change code. The exact-event-count regression passes; explicit button types and an in-flight submission guard provide additional protection. Existing history was not rewritten.
- No API, database schema, role, approval-rule or extraction changes. Existing demo data was not reset or migrated. Sample collaboration remains limited to the supplied correction scenario.
- Test-harness issues found during verification (an ambiguous alert locator and concurrent runs sharing an output folder) were corrected by scoping the locator and rerunning browser suites separately. Final runs passed.

Earlier entries below record previous verification sessions, not the current test totals or deployment status.

## Completed

- Node 24.19.0 / npm 11.19.1 clean `npm ci`: zero reported vulnerabilities at install time. ESLint has been upgraded to supported major version 10; a transitive cron-parser maintenance warning remains.
- Strict TypeScript, ESLint + browser/shared-package boundaries, production API/web build, 34 unit tests and 8 database integration tests passed locally.
- Eight Playwright scenarios passed across desktop Chromium and a mobile Chromium profile: save/refresh/approve/reset, explicit confirmation, simulated retry labels, per-tab isolation, 320px reflow, reduced motion, evidence after approval, keyboard operation, dialogs and focus return.
- axe scans on Documents, Review, Quality and sample dialog reported no violations for the configured WCAG tags. Manual cross-screen-reader auditing remains incomplete.
- A real local browser session authenticated with Better Auth and used private S3 storage, PostgreSQL, Redis/BullMQ, Tesseract and Ollama. Correction survived refresh; approval/history persisted; exact duplicate resolved to one record. [Recording](demo/live-workflow.webm), [verification](demo/live-verification.json).
- A five-file batch completed real processing: [batch verification](demo/batch-verification.json). The worker used a hard OCR subprocess timeout. A separate real-model smoke call returned seven OCR spans and the expected synthetic total after that isolation change.
- Thirty real local model evaluations, fixed dataset/prompt/model digest and both split results are retained. No mocked accuracy numbers. [Evaluation](evaluation.md).
- Local production mobile lab: 390×844, 4× CPU throttle, 150ms emulated latency, 1.6Mbps down, fresh browser contexts, cache disabled. Three final-build LCP measurements: 620/620/620 ms. Measured layout shift approximately 0.000034 each. These meet the project's ≤2.5s/≤0.1 targets for this local page/profile only. [Raw measurements](performance.json).
- Desktop/mobile screenshots were inspected. This caught and corrected an overflowing sidebar button and a null type incorrectly labelled Receipt. Unknown types now read “Type needs review.”
- Reference repositories were not modified. Secrets, model cache, generated builds and node_modules are ignored by Git.

## What tests do and do not establish

Database integration tests use the separate `ledgerroot_test` database, isolated workspaces and deterministic providers. They cover simultaneous duplicate uploads, durable-outbox restoration after a simulated queue outage, repeated delivery, immutable result/history, stale-worker fencing, three failures/manual retry, competing revisions, scoped access and rejected forged uploads. They do not reproduce every real Redis/S3/host failure.

The real recording and batch independently exercise actual local services; they are not stress tests. Performance measurements are local loopback observations, not Vercel measurements, field Core Web Vitals or physical-device benchmarks. The simple layout-shift observer reports no-input shifts in a short window. CI configuration is committed locally but has not run on GitHub because no remote was created/pushed.

## Outstanding release items

- Vercel publication: existing CLI token invalid; user must renew sign-in. No hosted URL is claimed.
- Narrated approximately three-minute founder walkthrough: outline is supplied; current real verification clip is un-narrated.
- Broad assistive-technology coverage, real customer research, independent fixture-label review and natural-document evaluation.
- Explicit cold/warm model timing isolation, sustained failure/load/retention testing and production security hardening.
- Optional design skills were unavailable. No audits from those skills are claimed. The feature-detected read-only sample WebMCP helper was not exercised by a compatible browser agent.

## Maintenance

The lockfile captures the tested dependency graph; `npm ci` reports no advisories on the verification date, but that does not mean every dependency is actively supported forever. ESLint 10 is compatible with the installed TypeScript-ESLint and hooks plugins. BullMQ's cron-parser dependency emits a maintenance warning; follow the upstream upgrade rather than forcing a potentially incompatible parser major. The pinned local MinIO image needs a separate production security/licensing review.

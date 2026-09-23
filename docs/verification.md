# Verification record

This file distinguishes completed local checks from release work. It is not a production-readiness certification.

## Separate field-clear actions — September 24, 2026

- Visual follow-up: Clear uses normal-weight small text, a transparent hover background and an underline on hover. The 44px target and keyboard outline are unchanged. Lint, typecheck, build, 59 unit and 13 integration tests passed again; desktop/mobile dropdown and clear-control tests passed, including axe and 320px screenshots. An initial test incorrectly expected keyboard-only focus styling after mouse interaction; it was corrected to use Shift+Tab and passed. The full browser suite was not repeated for this CSS-only follow-up.

- Document type and Currency now place Clear beside the label, outside the label and dropdown menu. Buttons appear only for nonempty editable values, are disabled during submission, and retain 44px targets and keyboard focus styling.
- Clearing marks the draft dirty, resets review confirmation, and focuses the associated dropdown. It does not save, append history, change source evidence, or bypass required-field approval checks. Other dropdowns are unchanged.
- Browser coverage checks mouse/keyboard clearing, focus return, saved empty values after refresh, approval validation, locked records and 320px layout. Manual VoiceOver remains outstanding.
- Passed lint without warnings, typecheck, formatting, production build, 59 unit tests, 13 integration tests, 46 existing sample browser tests and 8 mocked live-UI tests. Two new clear-field cases passed on desktop/mobile (48 sample cases total); the updated dropdown cases also passed again after the final subscription change. Inspected the 320px screenshot. The existing intermittent Next.js development-router initialization error appeared during the full run without failing assertions.

## Reopen and layout follow-up — September 23, 2026

### Dropdown and dismiss-button audit

- Inspected all eight dropdown uses. Document type and currency now show non-selectable prompts; a separate Clear selection choice preserves the ability to remove an unverified value and save an incomplete review. Assignment/reassignment and source-version prompts already use placeholders. Demo actor, Whole document and inbox filters remain genuine choices. Approval validation is unchanged.
- Toast dismissal retains a 44px target and keyboard focus outline, with a smaller 28px hover background. Reset demo retains its leading reset icon and existing behavior.
- Added browser assertions for both field placeholders, explicit clearing and persistence after refresh, plus the dismiss target and hover dimensions. Manual VoiceOver is still a separate outstanding check.
- Verification passed: lint, typecheck, production build, 59 unit tests, 13 integration tests, 46 sample browser tests and 8 mocked live-UI tests. The four feedback tests were rerun with the added hover-size assertions and passed; the hover screenshot was inspected. One Next.js development-router initialization error appeared during the full browser run without failing a test; no production-runtime guarantee is implied.

- Reproduced the sample duplicate reopen/save on an approved record after a source replacement, using mouse, Enter and Space. Earlier rejected-record coverage did not exercise this path. Reopening could replace the activated button with a submit button before the browser's default click action. Distinct button keys and cancellation of the reopen click's default action prevent the accidental save.
- New desktop/mobile regressions check exactly one revision and one appended reopen event, unchanged fields, and a subsequent explicit save. Existing historical events and stored demo data are untouched.
- Workspace wording now uses Sample workspace / Local workspace once in the sidebar. Removed the decorative LR avatar, simplified the sample banner, labeled Reset demo, made required teammate prompts placeholders, widened bounded dropdown menus, and adjusted warning/comparison/conflict spacing and toast sizing.
- Lint, type checking, production build, 59 unit tests, 13 isolated database integration tests, 44 sample browser regressions, and 8 mocked live-UI tests passed. Database tests initially could not connect inside the sandbox; the permitted unsandboxed run passed. Browser coverage includes axe, keyboard navigation, request actions, reset, draft preservation, and 320px reflow.
- Two additional desktop/mobile layout tests passed (46 sample browser tests in total), checking the workspace label, required assignment placeholder and 320px actor menu. Desktop dropdown and narrow toast screenshots inspected. Manual VoiceOver remains outstanding; automated accessibility checks do not replace it. No role, approval, API, database, extraction or authentication changes.

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

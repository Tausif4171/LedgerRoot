# Sample-only deployment

Status: not published. The existing Vercel CLI returned an invalid-token error on September 8, 2026. No cloud resources were created, no paid service was purchased, and no public URL is fabricated.

1. Sign in locally using `vercel login`; never paste a token into chat or commit it.
2. From the repository root, link a **new LedgerRoot project**, not DecisionCapture/ReplayHQ. Configure Next.js with root directory `apps/web` and include workspace files outside that directory.
3. Install from the repository root with `npm ci`. Build shared packages before web: `cd ../.. && npm run build:packages && npm run build -w @ledgerroot/web`. Use the normal Next `.next` output for the web root. Select Node 24.
4. Set `NEXT_PUBLIC_MODE=sample`; do not set `NEXT_PUBLIC_MODE=live`. Do not upload `.env`, database/storage/model/session secrets, local recordings unless intentionally shared, or API deployment configuration.
5. Deploy a preview first. Check `/documents`, a review page, `/quality`, refresh persistence/reset, mobile reflow and no `/api/v1` calls. Inspect the build for accidental local URLs/secrets. Then publish the verified sample.

Vercel's [monorepo documentation](https://vercel.com/docs/monorepos) requires selecting the appropriate project root and running CLI linking from the monorepo root. The steps above are configuration instructions, not evidence that deployment succeeded. The `.vercelignore` keeps local data and recordings out of CLI uploads.

The real API/worker/Postgres/Redis/storage/Ollama stay local. Public sample mode uses saved model output and per-tab state; failure/retry simulation is labelled. No inference runtime or authentication secret belongs in that deployment.

# Engineering and local operations

## Setup

Use Node 24, npm 11 and the root lockfile. `npm ci` installs all workspaces. Run `npm run db:generate` before building backend contracts with Prisma types. Webpack is selected for Next dev/build after Turbopack hit this host's filesystem watcher limit; `WATCHPACK_POLLING=true npm run dev` is an optional local workaround, not required in every environment.

`npm run setup:local` creates random local secrets only if `.env` does not exist. It never overwrites existing configuration. `npm run infra:up` starts only Compose project `ledgerroot`. Wait for PostgreSQL health before migrations. `db:deploy` applies committed migrations; `seed` creates the local owner, workspace and private bucket. Seeding is idempotent and does not change an existing password. No public registration or user administration UI is exposed.

| Service      | Local endpoint           |
| ------------ | ------------------------ |
| Web          | localhost:3100           |
| API          | 127.0.0.1:4100           |
| PostgreSQL   | 127.0.0.1:55432          |
| Redis        | 127.0.0.1:56379          |
| S3 / console | 127.0.0.1:59000 / :59001 |
| Ollama       | 127.0.0.1:11434          |

Use the exact APP_ORIGIN in your browser for real mode. Cookies use secure transport settings when the origin is HTTPS. Never expose this local configuration, Ollama or root storage credentials to the internet. Secrets are never NEXT_PUBLIC values. A public deployment contains only the web sample adapter.

## Commands

```sh
npm run dev                 # sample UI, no database/model
npm run dev:live            # API + worker + dispatcher + real UI
npm run db:deploy          # existing committed migrations
npm run db:generate
npm run seed
npm run db:test:setup       # separate ledgerroot_test DB and migrations
npm test
npm run test:integration
npm exec -- playwright install chromium
npm run test:e2e
npm run test:a11y
npm run lint
npm run typecheck
npm run build
npm run format:check
npm run eval                # real OCR/model for all fixtures; can take minutes
npm run samples:prepare
npm run eval:import         # make the saved report visible in local Quality
```

For a new reviewed migration: `npm exec -w @ledgerroot/api -- dotenv -e ../../.env -- prisma migrate dev --name descriptive_change --create-only`, review its SQL, then `db:deploy`. Do not use reset or destructive schema push as deployment strategy.

Integration tests use a separate database name and unique workspaces; cleanup is scoped to their generated fixtures. Their deterministic extractor and in-memory storage test database behavior, not real inference or S3 availability. `scripts/record-live.ts` exercises real services separately, using only supplied synthetic files and local credentials without printing them.

## Storage/queue recovery

Keep API running if Redis stops: accepted documents remain Pending dispatch. Restore Redis and let the dispatcher rebuild transport. If Ollama fails, retries are bounded and a failed run can be manually retried. Never relabel failed output as ready. Repeated job delivery is expected; database generation and unique result are the correctness boundary.

`npm run storage:cleanup` is a destructive **maintenance** command: it removes objects in the configured bucket that are unreferenced and older than 24 hours. It is not automatically scheduled. Use only a dedicated LedgerRoot bucket and inspect the target configuration first. Referenced originals/artifacts are retained. No user data is deleted by setup commands.

## Standards

Use strict TypeScript, unknown + Zod at boundaries, exact cents/date-only financial values, feature-focused code and small infrastructure interfaces. Keep server modules out of browser contracts. Prefer typed errors with actionable messages; logs contain operational IDs, not sensitive inputs. Review changes with tests for the relevant invariants. ESLint/Prettier, boundary checks and CI are committed.

Dependencies are resolved by the lockfile. The Prisma 6 CLI's vulnerable transitive Effect/deepmerge versions are overridden to audited-compatible updates; migration generation/deploy and tests were run with those overrides. Sharp was upgraded for its native security advisory. Re-run `npm audit` as advisories change; a zero result on one date is not a permanent security claim.

The pinned local MinIO image is a development S3 endpoint, not a current hardened production recommendation. Production needs licensing review, TLS, restricted service accounts, backups/restores, retention, rate limiting at ingress, workload isolation, larger-data tests and monitoring.

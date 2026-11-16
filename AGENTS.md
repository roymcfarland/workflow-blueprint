<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Services overview

This is a single Next.js 16 app (not a monorepo). The only required backing service is PostgreSQL.

| Service | Required | Notes |
|---|---|---|
| PostgreSQL 14+ | Yes | Local instance; `DATABASE_URL` in `.env.local` |
| Next.js dev server | Yes | `npm run dev` (binds to `127.0.0.1:3000`) |
| Resend email API | No | Omit in dev; password-reset links are shown inline |

### Running the app

Use the Node release selected by [`.nvmrc`](./.nvmrc) and its bundled npm. Install locked dependencies with `npm ci`. Standard commands are in the [README Scripts section](./README.md#scripts). Key ones:

- `npm run dev` — starts Next.js dev server with webpack on `127.0.0.1:3000`
- `npm run lint` — ESLint
- `npm run build` — production build (does **not** run migrations)
- `npm run typecheck` — TypeScript type checking
- `npm run test` — full Vitest suite
- `npm run test:coverage` — Vitest with enforced 100% thresholds for statements, branches, functions, and lines
- `npm run db:deploy` — apply Prisma migrations
- `npm run db:seed` — seed demo account (requires `DEMO_USER_PASSWORD` env var)

### Environment variables

Set a local database connection in `.env.local` or export it in the shell. See the [README environment table](./README.md#environment) for supported names and production-mode requirements. Resend is optional in development.

### Database migrations

Development uses a **local Postgres**; set `DATABASE_URL`/`DIRECT_URL` in `.env.local` to a local instance. `npm run db:migrate` (`prisma migrate dev`) and `npm run db:push` are **local-only**. The Prisma config rejects non-local hosts for both commands and for `prisma migrate reset`. Production migrations apply automatically via `prisma migrate deploy` inside `vercel-build` on deploy; never point dev tooling at the production database.

### Gotchas

- **Invite-only sign-up**: New user registration requires a valid invitation token. For testing, sign in with the seeded demo account (`alex@workflowblueprint.app`) using the password set in `DEMO_USER_PASSWORD`.
- **CSRF origin check**: Mutating API routes validate the request's `Origin` (falling back to `Referer`) against an allowlist of two origins: `NEXT_PUBLIC_SITE_URL` (or a hardcoded production URL if unset) and the request's own `Host`/`X-Forwarded-Host` — so same-origin requests work on any deployment, including Vercel previews, without config. The check fails closed unconditionally; there is no dev-mode leniency. For local dev at `http://127.0.0.1:3000`, the request's-own-origin fallback already covers you, so setting `NEXT_PUBLIC_SITE_URL` is optional.
- **PostgreSQL must be running** before `npm run dev`, `npm run db:deploy`, or `npm run db:seed`. Start it with your local Postgres runner (e.g., `pg_ctlcluster 14 main start` or Docker).
- **Test database environment.** Export `TEST_DATABASE_URL` pointing at an admin database on a disposable local PostgreSQL instance dedicated to testing. The role must be able to run `CREATE DATABASE`. The test harness creates, migrates, and drops a fresh database for each run. An exported variable takes precedence over values in local env files. Explicitly set `TEST_DATABASE_URL` for test runs so the harness uses the intended database.
- **Build before typecheck**: If running both commands locally, finish `npm run build` before `npm run typecheck`. The build rewrites `.next/types`. Typecheck can also run independently in a fresh checkout, as it does in CI.
- **`postinstall` generates Prisma Client**: `npm ci` and `npm install` automatically run `prisma generate`, so the Prisma Client is always up to date after dependency installation.


## Pull request workflow

- Open a PR for every change. Push work to the PR branch and keep direct pushes off `main`.
- Include affected documentation and the [Shipped ledger row](./PROJECT.md#shipped) in the same PR. Append the row with `#TBD` until GitHub assigns the PR number, then backfill it before merge.
- GitHub deletes the remote feature branch on merge. Remove the local branch when it is no longer needed. Use `git worktree remove` to clean up scratch checkouts once their changes are committed and pushed.

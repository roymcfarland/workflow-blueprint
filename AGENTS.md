<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
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

Standard commands are in `README.md` → **Scripts** section. Key ones:

- `npm run dev` — starts Next.js dev server with webpack on `127.0.0.1:3000`
- `npm run lint` — ESLint
- `npm run build` — production build (does **not** run migrations)
- `npm run typecheck` — TypeScript type checking
- `npm run test` — full Vitest suite
- `npm run test:coverage` — Vitest with enforced 100% thresholds for statements, branches, functions, and lines
- `npm run db:deploy` — apply Prisma migrations
- `npm run db:seed` — seed demo account (requires `DEMO_USER_PASSWORD` env var)

### Environment variables

A `.env.local` file must exist with at least `DATABASE_URL` and `AUTH_SECRET`. See `.env.example` for the full list. Resend keys are optional in development.

### Database migrations

Development uses a **local Postgres**; set `DATABASE_URL`/`DIRECT_URL` in `.env.local` to a local instance. `npm run db:migrate` (`prisma migrate dev`) is **local-only** and is **guarded**: it refuses to run against a non-local host. Production migrations apply automatically via `prisma migrate deploy` inside `vercel-build` on deploy; never point dev tooling at the production database.

### Gotchas

- **Invite-only sign-up**: New user registration requires a valid invitation token. For testing, sign in with the seeded demo account (`alex@workflowblueprint.app`) using the password set in `DEMO_USER_PASSWORD`.
- **CSRF origin check**: Mutating API routes validate that the `Origin` header matches `NEXT_PUBLIC_SITE_URL`. Set this to `http://127.0.0.1:3000` in `.env.local` for local dev, or omit it (the check is lenient when the variable is unset in development).
- **PostgreSQL must be running** before `npm run dev`, `npm run db:deploy`, or `npm run db:seed`. Start it with your local Postgres runner (e.g., `pg_ctlcluster 14 main start` or Docker).
- **Test database environment**: A stray root `.env` shadows `.env.local` and can make `npm run test` fail with a misleading error unrelated to the diff. Export `TEST_DATABASE_URL` pointing at a local PostgreSQL database before running tests.
- **Build before typecheck**: Run `npm run build` before `npm run typecheck`; running them in parallel can fail spuriously because the build rewrites `.next/types`.
- **`postinstall` generates Prisma Client**: `npm install` automatically runs `prisma generate`, so the Prisma Client is always up to date after dependency installation.

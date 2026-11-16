# Workflow Blueprint

[![codecov](https://codecov.io/gh/roymcfarland/workflow-blueprint/branch/main/graph/badge.svg)](https://codecov.io/gh/roymcfarland/workflow-blueprint)

Workflow Blueprint is an invite-gated Next.js App Router task-planning workspace — board-based tasks, subtasks, recurring work, notes, profile settings, Resend-backed transactional email, and a per-visitor demo sandbox — with a first-class **agent-access layer**: per-user scoped API tokens, a full read/write external REST API (`/api/external/v1/*`), and an in-repo **MCP server** (`/api/external/v1/mcp`) so a user's AI agents can run their own boards, tasks, and subtasks headlessly.

The live deployment is at [https://www.workflowblueprint.io](https://www.workflowblueprint.io).

## What this repo demonstrates

This repository is published as a **showcase of a multi-agent development workflow with PR-level guardrails**, not just as a working product. The artifacts of that workflow are checked in alongside the code:

- **Strategic source of truth.** [`PROJECT.md`](./PROJECT.md) defines the product's purpose, non-goals, and the resolved open questions (Q1–Q9) that act as durable Verifier rules. Any PR that violates these rules is an automatic reject.
- **Tactical agent runbook.** [`AGENTS.md`](./AGENTS.md) is the operational quickstart that Builder agents (OpenAI Codex) read before writing code, plus dev-environment gotchas.
- **Walked-through case study.** [`CASE_STUDY.md`](./CASE_STUDY.md) traces a single PR (`#13`) end-to-end: the Builder prompt, the diff Codex returned, the Verifier rule it triggered (the Q6 scope-discipline rule), and how the rule itself was born from that PR.
- **Machine-readable API contract with CI drift detection.** [`docs/openapi.yaml`](./docs/openapi.yaml) is generated from Zod schemas in [`src/lib/external-contract.ts`](./src/lib/external-contract.ts); a CI test (`tests/api/external/openapi.test.ts`) fails any PR where the committed spec diverges from the schemas.
- **Real CI gates, not vibes.** [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs six parallel jobs (`lint`, `audit`, `typecheck`, `build`, `test`, `smoke`) on every PR, with a Postgres service container backing the integration and smoke suites.
- **A sustained, self-correcting test-coverage push.** Two campaigns, both run through the same Builder/Verifier loop one narrowly-scoped slice at a time. PRs `#159`–`#193` (35+ merges) took line coverage from 72% to 93%+; PRs `#204`–`#233` (25 slices) then targeted the metric Codecov actually reports — which counts a partially-covered line as uncovered, and so read 84.91% where the test runner reported 93% — and closed all 684 outstanding records to reach **100%**, with `src/app/**`, `src/components/**`, and `src/lib/**` all at zero. It's a useful trace of the workflow under sustained load. Prompts built on wrong assumptions were caught and corrected rather than forced — nearly every builder hard-stop traced to an advisor claim about whether a branch was reachable, which measurement then disproved in one direction or the other. Techniques were validated against disposable spikes before being prescribed. And because a coverage pragma is a permanent hole in the signal, each batch was held to an inverse check — strip the markers, re-run coverage, confirm exactly the claimed records reappear and nothing else — rather than to an argument.

The most informative entry points are [`PROJECT.md`](./PROJECT.md), the merged PR history (especially `#7`, `#10`, `#13`, and `#14`; the `#106`–`#114` agent-access epic — per-user scoped auth → read/write endpoints → MCP capstone; and the `#159`–`#193` and `#204`–`#233` coverage campaigns for the workflow under sustained, repetitive load), and [`CASE_STUDY.md`](./CASE_STUDY.md).

## What I would do differently

A short, honest retrospective. Three things I would change if I were starting this repo over today:

1. **Write `PROJECT.md` on day one, not at PR 5.** The Builder/Verifier handoff was installed in `#5` after several feature PRs had already merged. Several of those earlier PRs would have been smaller and more focused if the scope-discipline rule (Q6) had existed when they were prompted. Lesson: the strategic document should be the *first* commit, even when its contents are still rough.
2. **Adopt path-versioned external APIs from the first endpoint.** The original API lived at `/api/external/daily-summary` and `/api/read-only/*`. Migrating to `/api/external/v1/*` required PR 3 (consumer migration in another repo) and PR 4 (legacy alias removal) before the contract could be cleanly versioned. Starting with `/v1/` from day one would have eliminated both PRs.
3. **Treat the Builder prompt as a reviewable artifact.** Q6 ("out-of-scope changes must be declared in the PR body") only became enforceable after `#13` shipped a correct-but-unauthorized SQL rewrite. If the Builder prompt itself were checked into the PR description from the start, scope drift would be auditable from day one rather than caught reactively.

## Stack

- Next.js 16 App Router and React 19
- Prisma 7 with PostgreSQL persistence (currently hosted on Supabase)
- Tailwind CSS 4 with custom blueprint design tokens
- TypeScript 6 and Zod validation for API inputs and external REST responses
- Signed HTTP-only session cookies with `jose`
- Resend transactional email for welcomes, invitations, and password resets
- Vitest 5 with Vite 8 for tests

## Getting Started

Use the Node.js version declared in [`package.json`](./package.json) and selected by [`.nvmrc`](./.nvmrc). Use npm from that Node installation, as CI does, and install from the committed npm lockfile. Avoid substituting a global npm from another Node installation or using pnpm. Use a local PostgreSQL 14+ instance for development. CI tests against PostgreSQL 16.

```bash
npm ci
npm run db:deploy
npm run dev
```

Configure the local environment before running migrations or starting the app. The webpack dev server binds to `127.0.0.1:3000`. Run `npm run db:seed` only when you want the persistent demo account and starter boards. The seed requires a unique password of at least 12 characters in `DEMO_USER_PASSWORD`. It refuses to run in production without the explicit `ALLOW_PRODUCTION_SEED` opt-in. Reseeding skips tasks with existing IDs and preserves their dates. New seed dates are relative to the seed's UTC day (`prisma/seed.ts`).

## Environment

Set local variables in `.env.local` or export them in the shell. Set deployment variables in the corresponding Vercel environment.

| Name | Purpose | Required | Where |
| --- | --- | --- | --- |
| `DATABASE_URL` | Runtime PostgreSQL connection. Use a durable database for production. | A runtime connection is required. The following row lists fallback names in lookup order. | Local, Vercel |
| `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING` | Integration-provided alternatives to `DATABASE_URL`. | If used in place of `DATABASE_URL` | Local, Vercel |
| `DIRECT_URL` | Prisma CLI connection for migrations. The CLI prefers this name, then `POSTGRES_URL_NON_POOLING`, then the remaining runtime names. | Optional | Local, Vercel |
| `AUTH_SECRET` | Signs session JWTs. Use a random secret of at least 32 characters in production-mode runtime. | Production-mode runtime | Local, Vercel |
| `NEXT_PUBLIC_SITE_URL` | Canonical URLs, email links, and a trusted origin for session mutations. | Optional | Local, Vercel |
| `SITE_URL` | Canonical metadata fallback. | Optional | Local, Vercel |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sends welcome, invitation, and reset emails. Local flows can return preview links for invitations and resets when email is unconfigured. | Production-mode runtime | Local, Vercel |
| `EXTERNAL_API_KEY` | Configures the REST API and authenticates the legacy read-only integration. MCP accepts per-user tokens independently. | To use external REST | Local, Vercel |
| `EXTERNAL_USER_ID` | Selects the legacy REST account. Defaults to the seeded demo user. | Optional | Local, Vercel |
| `CRON_SECRET` | Authenticates the recurring-task cron request. Vercel supplies it as a bearer token. | For scheduled rollover and demo cleanup | Local if testing the route, Vercel Production |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Enable task attachments in a private Supabase Storage bucket. See [Q4 in PROJECT.md](./PROJECT.md#q4-is-supabase-postgres-mandatory-for-production-or-is-any-postgresql-compatible-database-acceptable). | For attachments | Local, Vercel |
| `DEMO_USER_PASSWORD` | Password used by the persistent demo seed. | For seeding | Seed command environment |
| `ALLOW_PRODUCTION_SEED` | Explicitly permits the seed to run in production. | For intentional production seeding | Seed command environment |
| `ADMIN_EMAILS` | Comma-separated admin promotion allowlist used when no email argument is supplied. | For promotion without an email argument | Admin command environment |
| `ADMIN_PROMOTE_ACTOR`, `ADMIN_PROMOTE_NONINTERACTIVE` | Set the actor on the `user.promote_admin` audit entry and opt out of the confirmation prompt, respectively. The actor falls back to `USER`, then `LOGNAME`, then the script name. | Optional | Admin command environment |
| `TEST_DATABASE_URL` | Admin connection to a disposable local Postgres instance used by Vitest. | Set for local test runs. The harness also accepts a local `DATABASE_URL` fallback. | Local, GitHub Actions |

Vercel supplies `VERCEL_ENV` for deployment environment detection and `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL` as metadata fallbacks after `NEXT_PUBLIC_SITE_URL` and `SITE_URL`. Next.js supplies `NODE_ENV` and `NEXT_RUNTIME`. npm supplies `npm_lifecycle_event` to the Prisma generation hook. Test setup controls `TZ` for deterministic dates. CI uses `CODECOV_TOKEN` for its coverage upload.

## Database Setup

Apply the checked-in Prisma migrations to the database before enabling signup:

```bash
npm run db:deploy
```

For a brand-new database, optionally seed the demo account:

```bash
npm run db:seed
```

If the runtime connection uses a pooler that cannot apply migrations, set `DIRECT_URL` to a direct connection for the Prisma CLI and keep `DATABASE_URL` pointed at the runtime pooler.

## Recurring Tasks

Vercel Cron runs `/api/cron/recurring-tasks` daily at 09:00 UTC. The job rolls over recurring tasks whose full interval has elapsed. It resets each due recurring task in place to `dueDate` today and `IN_PROGRESS`, clears `completedAt`/`archivedAt`, and marks all subtasks incomplete, regardless of whether the task was previously open, done, or archived. Tasks deleted during rollover are reported as skipped. After rollover commits, the job attempts to purge expired demo accounts and reports purge errors separately.

Due dates are date-only UTC values stored at UTC midnight. Dashboard buckets use UTC days; the board view compares against the viewer's local calendar day on a UTC-midnight basis, so these views can disagree near midnight outside UTC by design (`src/lib/data.ts`, `src/components/board-workspace.tsx`).

## External API v1

The external API exposes the configured user's planning data for project-owned consumers. Canonical endpoints live under `/api/external/v1/*`.

The authoritative machine-readable API reference is [`docs/openapi.yaml`](./docs/openapi.yaml). The examples below are a human-readable summary of that contract.

Responses from the v1 REST handlers include an `X-Request-Id` header (UUID v4) for log correlation. The same ID is written to a structured JSON log line alongside the request route, method, status, duration, outcome, resolved user ID when available, and an eight-character prefix of the submitted bearer token when available. Consumers may capture this header to trace client-side errors back to server logs.

Once rate limiting completes, REST responses also include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (Unix epoch seconds) so consumers can self-throttle. When the limit is exceeded, the API returns 429 with the standard `Retry-After` header.

The v1 REST handlers return JSON, are dynamic (`force-dynamic`, `revalidate = 0`), and sent with `Cache-Control: no-store` and `X-Robots-Tag: noindex`; MCP uses its protocol-specific transport described below.

### Authentication

Read endpoints support the legacy configured external key:

```http
Authorization: Bearer <EXTERNAL_API_KEY>
```

Keys are compared with SHA-256 + `timingSafeEqual`. The legacy key resolves to `EXTERNAL_USER_ID`, remains read-only, and has no expiry.

Admins issue per-user API tokens from the app's API Tokens page and resolve to the token owner. They carry granular scopes (`BOARDS_READ`, `BOARDS_WRITE`, `TASKS_READ`, `TASKS_WRITE`, `SUBTASKS_READ`, `SUBTASKS_WRITE`) and can be created with an optional 1-365 day expiry; tokens created without an expiry never expire. Admins can see each token's `Active`, `Expired`, or `Revoked` status plus its Expires value in the token ledger, and can revoke tokens at any time. REST reads require the matching read scope and writes require the matching write scope. The MCP endpoint below requires a per-user scoped API token and does not accept the legacy `EXTERNAL_API_KEY`.

- Missing or malformed `Authorization` header → `401` JSON.
- Wrong, revoked, or expired token → `403` JSON; callers cannot distinguish these cases.
- Insufficient token scope → `403` JSON.
- `EXTERNAL_API_KEY` is unset → `503` JSON from REST, including for requests using per-user tokens.

Most external API errors use this shape:

```ts
type ExternalApiError = {
  ok: false;
  error: string;
};
```

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/external/v1/dashboard` | Aggregate dashboard payload |
| `GET` | `/api/external/v1/boards` | All boards owned by the authenticated external user |
| `GET` | `/api/external/v1/boards/[slug]` | One board by slug, including tasks, subtasks, and note content |
| `GET` | `/api/external/v1/daily-summary` | Daily briefing payload used by external automation |

### Write endpoints (`BOARDS_WRITE`)

These endpoints require a per-user API token with the `BOARDS_WRITE` scope. Each mutation is scoped to the token owner's boards.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/external/v1/boards` | Create a board for the token owner; slug is generated from `name` |
| `PATCH` | `/api/external/v1/boards/{slug}` | Partially update one of the token owner's boards |
| `DELETE` | `/api/external/v1/boards/{slug}` | Delete one of the token owner's boards |
| `PATCH` | `/api/external/v1/boards/{slug}/note` | Update note content for one of the token owner's boards |

### Write endpoints (`TASKS_WRITE`)

These endpoints require a per-user API token with the `TASKS_WRITE` scope. Each mutation is scoped to the token owner's boards and tasks.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/external/v1/tasks` | Create a task on one of the token owner's boards |
| `PATCH` | `/api/external/v1/tasks/{id}` | Partially update scalar fields on one of the token owner's tasks |
| `DELETE` | `/api/external/v1/tasks/{id}` | Delete one of the token owner's tasks |

### Write endpoints (`SUBTASKS_WRITE`)

These endpoints require a per-user API token with the `SUBTASKS_WRITE` scope. Each mutation is scoped to the token owner's tasks and returns the parent task.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/external/v1/tasks/{id}/subtasks` | Create a subtask on one of the token owner's tasks |
| `PATCH` | `/api/external/v1/subtasks/{id}` | Partially update one of the token owner's subtasks |
| `DELETE` | `/api/external/v1/subtasks/{id}` | Delete one of the token owner's subtasks |

### MCP endpoint

`POST /api/external/v1/mcp` serves an in-repo MCP-over-HTTP endpoint for server-to-server agents. It is authenticated with the same per-user scoped Bearer API tokens as the REST write surface, resolves every tool call to the token owner, sends `Cache-Control: no-store`, and exposes no CORS handler. The endpoint is MCP protocol, not REST JSON, so it is not included in `docs/openapi.yaml`.

The endpoint supports the 2026-07-28 protocol with per-request `_meta` envelopes and 2025-era Streamable HTTP clients through a stateless fallback. GET and DELETE session operations return 405; legacy `/sse` remains 404. Subscription streams are disabled.

Available tools:

| Tool | Required scope | Description |
| --- | --- | --- |
| `get_dashboard` | `TASKS_READ` | Get the token owner's dashboard snapshot |
| `list_boards` | `BOARDS_READ` | List the token owner's boards |
| `get_board` | `BOARDS_READ` | Get one owner-scoped board by slug |
| `get_daily_summary` | `TASKS_READ` | Get the token owner's daily task summary |
| `create_task` | `TASKS_WRITE` | Create a task on one of the token owner's boards |
| `update_task` | `TASKS_WRITE` | Update scalar fields on one of the token owner's tasks |
| `delete_task` | `TASKS_WRITE` | Delete one of the token owner's tasks |
| `create_board` | `BOARDS_WRITE` | Create a board for the token owner |
| `update_board` | `BOARDS_WRITE` | Update one of the token owner's boards |
| `delete_board` | `BOARDS_WRITE` | Delete one of the token owner's boards |
| `update_board_note` | `BOARDS_WRITE` | Update the note on one of the token owner's boards |
| `create_subtask` | `SUBTASKS_WRITE` | Create a subtask on one of the token owner's tasks |
| `update_subtask` | `SUBTASKS_WRITE` | Update one of the token owner's subtasks |
| `delete_subtask` | `SUBTASKS_WRITE` | Delete one of the token owner's subtasks |

### `GET /api/external/v1/dashboard`

Request:

```bash
curl -i \
  -H "Authorization: Bearer $EXTERNAL_API_KEY" \
  https://www.workflowblueprint.io/api/external/v1/dashboard
```

Response:

```ts
type ExternalDashboardResponse = {
  ok: true;
  data: {
    boardBreakdown: Array<{
      slug: string;
      name: string;
      iconKey: string;
      totalTasks: number;
      percentage: number;
    }>;
    sprintCompletionRate: number;
    doneCount: number;
    activeTaskCount: number;
    inProgressCount: number;
    closedLastSevenDays: number;
    totalTaskCount: number;
  };
};
```

### `GET /api/external/v1/boards`

Request:

```bash
curl -i \
  -H "Authorization: Bearer $EXTERNAL_API_KEY" \
  https://www.workflowblueprint.io/api/external/v1/boards
```

Response:

```ts
type ExternalBoardsResponse = {
  ok: true;
  data: {
    boards: Array<{
      slug: string;
      name: string;
      description: string | null;
      iconKey: string;
      totalTasks: number;
    }>;
  };
};
```

### `GET /api/external/v1/boards/[slug]`

Request:

```bash
curl -i \
  -H "Authorization: Bearer $EXTERNAL_API_KEY" \
  https://www.workflowblueprint.io/api/external/v1/boards/personal
```

Response:

```ts
type ExternalBoardResponse = {
  ok: true;
  data: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    iconKey: string;
    noteContent: string;
    tasks: Array<{
      id: string;
      title: string;
      description: string | null;
      status: "ICE_BOX" | "ON_DECK" | "IN_PROGRESS" | "DONE" | "ARCHIVED";
      sortOrder: number;
      priority: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      dueDate: string | null;
      completedAt: string | null;
      archivedAt: string | null;
      recurrence: "NONE" | "DAILY" | "WEEKLY" | "BI_WEEKLY" | "MONTHLY" | "SEMI_ANNUALLY" | "ANNUALLY";
      subtasks: Array<{
        id: string;
        title: string;
        isComplete: boolean;
        sortOrder: number;
        priority: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      }>;
    }>;
  };
};
```

### `GET /api/external/v1/daily-summary`

Request:

```bash
curl -i \
  -H "Authorization: Bearer $EXTERNAL_API_KEY" \
  https://www.workflowblueprint.io/api/external/v1/daily-summary
```

Response:

```ts
type ExternalDailySummaryResponse = {
  generatedAt: string;
  summary: {
    totalActive: number;
    completionRate: `${number}%`;
    byStatus: {
      iceBox: number;
      onDeck: number;
      inProgress: number;
      done: number;
      archived: number;
    };
    byCategory: Record<string, number>;
  };
  inProgress: ExternalDailySummaryTask[];
  onDeck: ExternalDailySummaryTask[];
  iceBox: ExternalDailySummaryTask[];
  recentlyCompleted: ExternalDailySummaryTask[];
};

type ExternalDailySummaryTask = {
  id: number;
  title: string;
  description: string | null;
  status: "ice-box" | "on-deck" | "in-progress" | "done" | "archived";
  category: string;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  parentId: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
```

Daily-summary task ids are stable 48-bit hashes of the underlying UUIDs. `summary.byCategory` uses camelCase board slugs as keys.

## Scripts

Before running the Vitest scripts, export `TEST_DATABASE_URL` pointing at an admin database on a disposable local PostgreSQL instance dedicated to testing. Use a role that can run `CREATE DATABASE` so the test harness can create, migrate, and drop a fresh database for each run. Keep `DIRECT_URL` and `POSTGRES_URL_NON_POOLING` unset in the test environment so the migration targets that database.

```bash
npm run dev            # start the local Next.js server
npm run build          # local production build and type check (no migrations)
npm run vercel-build   # Vercel uses this: applies Prisma migrations, then builds
npm run start          # serve a local production build (run after npm run build)
npm run lint           # ESLint / Next core web vitals checks
npm run typecheck      # tsc --noEmit
npm run test           # Vitest: data-layer, API-route, and component tests (ephemeral Postgres)
npm run test:watch     # Vitest in watch mode
npm run test:smoke     # Vitest: boots a real Next.js server and hits real routes
npm run test:coverage  # Vitest with v8 coverage, excluding tests/smoke/**; enforces 100% thresholds on statements, branches, functions, and lines and fails below any of them (uploaded to Codecov in CI)
npm run generate:openapi # regenerate docs/openapi.yaml from src/lib/external-contract.ts
npm run postinstall    # runs automatically after npm install: prisma generate
npm run db:deploy      # apply checked-in Prisma migrations
npm run db:migrate     # create and apply a development migration
npm run db:push        # push schema directly for non-migration development
npm run db:seed        # seed the demo account and boards
npm run db:setup       # db:deploy then db:seed, in one step
npm run admin:bootstrap # promote a user to ADMIN by email (see scripts/admin-promote.ts)
npm run admin:promote  # alias for admin:bootstrap
```

## CI and Deployments

[GitHub Actions CI](./.github/workflows/ci.yml) runs six independent jobs on pull requests and pushes to `main`. The `test` job enforces the Vitest coverage thresholds and uploads coverage to Codecov. The `smoke` job boots Next.js and exercises HTTP routes. Both jobs use PostgreSQL service containers. Main branch protection requires an up-to-date branch and passing `Vercel`, `lint`, `audit`, `test`, and `smoke` checks. The `typecheck` and `build` jobs also run in Actions.

Vercel supplies the PR preview check and deploys the production app from `main`. The deployment script `vercel-build` applies pending Prisma migrations to the database configured for that deployment, then builds. The local `npm run build` compiles without migrations. Configure the production-mode environment before serving it with `npm run start`. [`vercel.json`](./vercel.json) declares the daily recurring-task cron.

## License

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.

This is a source-available license that permits personal use, research, and non-commercial projects. **Commercial use is strictly prohibited without express written permission from Roy McFarland.**

See the [LICENSE](./LICENSE) file for the full text.

## Security and Automation

- Report vulnerabilities privately using [SECURITY.md](./SECURITY.md).
- GitHub secret scanning and push protection are enabled. The tracked [CI workflow](./.github/workflows/ci.yml) checks production dependency advisories with `npm audit --omit=dev --audit-level=high`.
- [Dependabot](./.github/dependabot.yml) checks npm and GitHub Actions monthly, with up to three open version-update PRs per ecosystem. It groups npm minor and patch updates and groups GitHub Actions updates together. npm exclusions protect the Node runtime and Node types pins, the exact React Compiler plugin pin, and ESLint and TypeScript peer compatibility. [`package.json`](./package.json) lists transitive overrides.

## Security Notes

- API routes use shared JSON parsing and Zod schema validation helpers.
- External API responses are validated before being returned.
- Authenticated API routes return JSON `401` responses instead of page redirects.
- Sign-up, sign-in, password reset, invitation, and external API endpoints share a Postgres-backed distributed rate limiter (`RateLimitBucket` table) so limits hold across serverless instances.
- Mutating session routes verify the request `Origin`/`Referer` matches the configured site origin (`NEXT_PUBLIC_SITE_URL`) or the deployment's own host (so Vercel preview URLs work without config), and the session cookie is `SameSite=lax`, together providing a CSRF defense.
- HTML responses get a per-request nonce-based Content Security Policy (`'strict-dynamic'`); API and static responses get a stricter baseline CSP.
- Session JWTs include the user's `passwordChangedAt` timestamp so password changes/resets revoke every existing session.
- Password reset and invitation tokens are stored hashed and claimed atomically inside transactions before any state changes.
- Development reset links are returned only outside production; production sends reset and invitation links through Resend.
- Admin actions (invitation create/revoke, API token create/revoke, role promotion) write an `AdminAuditLog` row recording actor, action, target, and timestamp.

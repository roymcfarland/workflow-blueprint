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
- Zod validation on all API payloads
- Signed HTTP-only session cookies with `jose`
- Resend transactional email for welcome and password reset messages

## Getting Started

```bash
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

The dev server starts Next.js on `127.0.0.1`. Run `npm run db:deploy` before the first deploy, and run `npm run db:seed` only when you want the demo account and starter boards in the configured database.

The seed command reads the demo account password from the required `DEMO_USER_PASSWORD` environment variable and refuses to run when `NODE_ENV=production` or `VERCEL_ENV=production` unless `ALLOW_PRODUCTION_SEED=true` is also set. Choose a unique value per environment and rotate it.

```text
DEMO_USER_PASSWORD="choose-a-strong-password-of-12-or-more-chars"
npm run db:seed
```

## Environment

Create `.env.local` for local work:

```bash
DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require"
AUTH_SECRET="replace-with-a-long-random-secret"
NEXT_PUBLIC_SITE_URL="https://www.workflowblueprint.io"
RESEND_API_KEY="re_..."
EMAIL_FROM="Workflow Blueprint <hello@workflowblueprint.io>"
ADMIN_EMAILS="you@example.com"
EXTERNAL_API_KEY="replace-with-the-shared-external-api-key"
EXTERNAL_USER_ID="user_demo_alex_blue"
```

Optional, for task attachments (Supabase Storage only — see [Q4 of PROJECT.md](./PROJECT.md) for the scoped storage exception; the database itself stays plain PostgreSQL):

```bash
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="replace-with-the-service-role-key-from-supabase-settings"
SUPABASE_STORAGE_BUCKET="task-attachments"
```

When the project is linked in Vercel, you can pull local secrets without printing them:

```bash
npx vercel@latest env pull .env.local --environment=development
```

`DATABASE_URL` must be a PostgreSQL 14+ connection string. Supabase Postgres is the recommended example and current production host, but any compatible durable PostgreSQL database works. If the Vercel/Supabase integration provides `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, or `POSTGRES_URL_NON_POOLING` instead, the app will use those automatically.
Prisma CLI commands prefer `DIRECT_URL`, then `POSTGRES_URL_NON_POOLING`, when available.
Use a durable PostgreSQL 14+ database for production account creation.
`AUTH_SECRET` must be a long random secret in production.
`NEXT_PUBLIC_SITE_URL` is used to generate absolute canonical and social sharing metadata; when it is unset the app falls back in order to `SITE_URL`, then Vercel's `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL`, and finally a hard-coded default (`src/lib/site-config.ts`).
`RESEND_API_KEY` and `EMAIL_FROM` enable welcome emails and production password reset emails. Local development can omit them; reset requests will expose a preview link instead.
`ADMIN_EMAILS` is a comma-separated allowlist consulted by `npm run admin:bootstrap`/`admin:promote` (`scripts/admin-promote.ts`) when no email is passed explicitly; optional otherwise.
`ADMIN_PROMOTE_ACTOR` and `ADMIN_PROMOTE_NONINTERACTIVE` are optional knobs for that same script: the first is recorded as the `actor` on the resulting `user.promote_admin` admin audit log entry (falling back to `$USER`, then `$LOGNAME`, then the literal `scripts/admin-promote`), and setting the second to exactly `true` skips the interactive confirmation prompt for scripted or CI runs.
`EXTERNAL_API_KEY` enables the external `/api/external/v1/*` API. `EXTERNAL_USER_ID` selects which account the external API surfaces; when unset it falls back to the seeded demo user.
`CRON_SECRET` secures `/api/cron/recurring-tasks`. It is required in Vercel production for the scheduled rollover job, but local development can omit it unless you are manually testing the route. When `CRON_SECRET` is set on the Vercel project, Vercel cron invocations automatically send it as an `Authorization: Bearer <CRON_SECRET>` header; the endpoint returns `401` without the matching bearer token.
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET` enable task attachments (`src/lib/storage.ts`). Local development can omit them unless you are testing that feature; the storage helper throws a clear error rather than failing silently when they're missing.

Optional server-side Sentry settings:

| Variable | Required | Description |
| --- | --- | --- |
| `SENTRY_DSN` | No | Enables Sentry server-side error capture when set. Leave unset for local dev. |
| `SENTRY_ENVIRONMENT` | No | Override for the Sentry environment tag. Defaults to `VERCEL_ENV` or `"development"`. |
| `SENTRY_RELEASE` | No | Override for the Sentry release tag. Defaults to `VERCEL_GIT_COMMIT_SHA`. |

## Database Setup

Apply the checked-in Prisma migrations to the database before enabling signup:

```bash
npm run db:deploy
```

For a brand-new database, optionally seed the demo account:

```bash
npm run db:seed
```

If the database runtime URL uses a pooler and migration deployment fails, temporarily run `npm run db:deploy` with the direct connection string in `DATABASE_URL`, then keep the Vercel runtime `DATABASE_URL` pointed at the connection string you use for serverless traffic.

## Recurring Tasks

A nightly Vercel Cron job rolls over recurring tasks whose full interval has elapsed. It resets each due recurring task in place to `dueDate` today and `IN_PROGRESS`, clears `completedAt`/`archivedAt`, and marks all subtasks incomplete, regardless of whether the task was previously open, done, or archived.

## External API v1

The external API exposes the configured user's planning data for project-owned consumers. Canonical endpoints live under `/api/external/v1/*`.

The authoritative machine-readable API reference is [`docs/openapi.yaml`](./docs/openapi.yaml). The examples below are a human-readable summary of that contract.

Every response from `/api/external/v1/*` includes an `X-Request-Id` header (UUID v4) for log correlation. The same ID is written to a structured JSON log line on the server alongside the request route, status, duration, outcome, and a non-sensitive 8-character prefix of the API key used. Consumers may capture this header to trace client-side errors back to server logs.

Server-side errors are also captured to Sentry when the `SENTRY_DSN` environment variable is set. Captured events include `requestId`, `route`, and `outcome` tags so they can be correlated with the structured log lines emitted by the external API wrapper. Authorization headers are stripped before any event leaves the server.

Every response also includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (Unix epoch seconds) so consumers can self-throttle. When the limit is exceeded, the API returns 429 with the standard `Retry-After` header.

Every v1 response is JSON, dynamic (`force-dynamic`, `revalidate = 0`), and sent with `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

### Authentication

Read endpoints support the legacy configured external key:

```http
Authorization: Bearer <EXTERNAL_API_KEY>
```

Keys are compared with SHA-256 + `timingSafeEqual`. The legacy key resolves to `EXTERNAL_USER_ID`, remains read-only, and has no expiry.

Per-user API tokens are issued inside the app and resolve to the token owner. They carry granular scopes (`BOARDS_READ`, `BOARDS_WRITE`, `TASKS_READ`, `TASKS_WRITE`, `SUBTASKS_READ`, `SUBTASKS_WRITE`) and can be created with an optional 1-365 day expiry; tokens created without an expiry never expire. Admins can see each token's `Active`, `Expired`, or `Revoked` status plus its Expires value in the token ledger, and can revoke tokens at any time. Write endpoints require the matching write scope. The MCP endpoint below requires a per-user scoped API token and does not accept the legacy `EXTERNAL_API_KEY`.

- Missing or malformed `Authorization` header → `401` JSON.
- Wrong, revoked, or expired token → `403` JSON; callers cannot distinguish these cases.
- Required key is unset → `503` JSON.

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
| `GET` | `/api/external/v1/boards` | All boards owned by the configured external user |
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

Vercel automatically runs `vercel-build` instead of `build` when it is present, so each production deployment applies any pending Prisma migrations before the new code starts handling requests. Local `npm run build` deliberately does not migrate so it cannot accidentally touch a remote database.

## License

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.

This is a source-available license that permits personal use, research, and non-commercial projects. **Commercial use is strictly prohibited without express written permission from Roy McFarland.**

See the [LICENSE](./LICENSE) file for the full text.

## Security Notes

- API routes use shared JSON parsing and Zod schema validation helpers.
- External API responses are validated before being returned.
- Authenticated API routes return JSON `401` responses instead of page redirects.
- Sign-up, sign-in, password reset, invitation, and external API endpoints share a Postgres-backed distributed rate limiter (`RateLimitBucket` table) so limits hold across serverless instances.
- Mutating routes verify the request `Origin`/`Referer` matches `NEXT_PUBLIC_SITE_URL` and the session cookie is `SameSite=strict`, providing a CSRF defense.
- HTML responses get a per-request nonce-based Content Security Policy (`'strict-dynamic'`); API and static responses get a stricter baseline CSP.
- Session JWTs include the user's `passwordChangedAt` timestamp so password changes/resets revoke every existing session.
- Password reset and invitation tokens are stored hashed and claimed atomically inside transactions before any state changes.
- Development reset links are returned only outside production; production sends reset and invitation links through Resend.
- Admin actions (invitation create/revoke, role promotion) write an `AdminAuditLog` row recording actor, action, target, and timestamp.

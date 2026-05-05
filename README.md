# Workflow Blueprint

Workflow Blueprint is an invite-gated Next.js App Router task planning workspace with admin-issued invitations, board-based task management, notes, profile settings, and Resend-backed transactional email.

## Stack

- Next.js 16 App Router and React 19
- Prisma 6 with PostgreSQL persistence (currently hosted on Supabase)
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
AUTH_SECRET="replace-with-a-long-random-secret"
NEXT_PUBLIC_SITE_URL="https://www.workflowblueprint.io"
RESEND_API_KEY="re_..."
EMAIL_FROM="Workflow Blueprint <hello@workflowblueprint.io>"
EXTERNAL_API_KEY="replace-with-the-shared-external-api-key"
EXTERNAL_USER_ID="user_demo_alex_blue"
```

When the project is linked in Vercel, you can pull local secrets without printing them:

```bash
npx vercel@latest env pull .env.local --environment=development
```

`DATABASE_URL` must be a PostgreSQL 14+ connection string. Supabase Postgres is the recommended example and current production host, but any compatible durable PostgreSQL database works. If the Vercel/Supabase integration provides `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, or `POSTGRES_URL_NON_POOLING` instead, the app will use those automatically.
Prisma CLI commands prefer `POSTGRES_URL_NON_POOLING` when it is available.
Use a durable PostgreSQL 14+ database for production account creation.
`AUTH_SECRET` must be a long random secret in production.
`NEXT_PUBLIC_SITE_URL` is used to generate absolute canonical and social sharing metadata.
`RESEND_API_KEY` and `EMAIL_FROM` enable welcome emails and production password reset emails. Local development can omit them; reset requests will expose a preview link instead.
`EXTERNAL_API_KEY` enables the external `/api/external/v1/*` API. `EXTERNAL_USER_ID` selects which account the external API surfaces; when unset it falls back to the seeded demo user.

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

## External API v1

The external API exposes the configured user's planning data for project-owned consumers. Canonical endpoints live under `/api/external/v1/*`.

The authoritative machine-readable API reference is [`docs/openapi.yaml`](./docs/openapi.yaml). The examples below are a human-readable summary of that contract.

Every response from `/api/external/v1/*` includes an `X-Request-Id` header (UUID v4) for log correlation. The same ID is written to a structured JSON log line on the server alongside the request route, status, duration, outcome, and a non-sensitive 8-character prefix of the API key used. Consumers may capture this header to trace client-side errors back to server logs.

Every response also includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (Unix epoch seconds) so consumers can self-throttle. When the limit is exceeded, the API returns 429 with the standard `Retry-After` header.

Every v1 response is JSON, dynamic (`force-dynamic`, `revalidate = 0`), and sent with `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

### Authentication

Every canonical v1 request must include the configured external key:

```http
Authorization: Bearer <EXTERNAL_API_KEY>
```

Keys are compared with SHA-256 + `timingSafeEqual`. All external routes require `EXTERNAL_API_KEY` to be set.

- Missing or malformed `Authorization` header → `401` JSON.
- Wrong key → `403` JSON.
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
npm run dev          # start the local Next.js server
npm run build        # local production build and type check (no migrations)
npm run vercel-build # Vercel uses this: applies Prisma migrations, then builds
npm run lint         # ESLint / Next core web vitals checks
npm run db:deploy    # apply checked-in Prisma migrations
npm run db:migrate   # create and apply a development migration
npm run db:push      # push schema directly for non-migration development
npm run db:seed      # seed the demo account and boards
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

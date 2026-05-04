# Workflow Blueprint

Workflow Blueprint is a Next.js App Router task planning workspace with self-service accounts, board-based task management, notes, profile settings, and Resend-backed transactional email.

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
READ_ONLY_API_KEY="replace-with-a-long-random-read-only-api-key"
READ_ONLY_USER_ID="user_demo_alex_blue"
EXTERNAL_API_KEY="replace-with-the-shared-external-api-key"
EXTERNAL_USER_ID="user_demo_alex_blue"
```

When the project is linked in Vercel, you can pull local secrets without printing them:

```bash
npx vercel@latest env pull .env.local --environment=development
```

`DATABASE_URL` must be a Supabase Postgres connection string. If the Vercel/Supabase integration provides `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, or `POSTGRES_URL_NON_POOLING` instead, the app will use those automatically.
Prisma CLI commands prefer `POSTGRES_URL_NON_POOLING` when it is available.
Use a durable Supabase project database for production account creation.
`AUTH_SECRET` must be a long random secret in production.
`NEXT_PUBLIC_SITE_URL` is used to generate absolute canonical and social sharing metadata.
`RESEND_API_KEY` and `EMAIL_FROM` enable welcome emails and production password reset emails. Local development can omit them; reset requests will expose a preview link instead.
`READ_ONLY_API_KEY` enables the private read-only API. `READ_ONLY_USER_ID` selects which account is exposed through that API and defaults to the seeded demo user when omitted.
`EXTERNAL_API_KEY` enables the external `/api/external/daily-summary` route consumed by `www.roymcfarland.news`. If it is unset, that route also accepts the same secret as `READ_ONLY_API_KEY` so one key can unlock both private APIs. When `EXTERNAL_API_KEY` is set, only it is checked for the daily summary (the read-only API still uses `READ_ONLY_API_KEY`). `EXTERNAL_USER_ID` selects which account that route surfaces; when unset it falls back to `READ_ONLY_USER_ID`, and finally to the seeded demo user.

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

## Private Read-Only API

The read-only API exposes a single user's planning data as JSON for use by tools, dashboards, or private agents. It never mutates data and is intentionally not CORS-enabled for browser calls from other origins.

### Authentication

Every request must include the `READ_ONLY_API_KEY` configured in the environment, in either form:

```http
Authorization: Bearer <READ_ONLY_API_KEY>
```

```http
X-API-Key: <READ_ONLY_API_KEY>
```

Keys are compared with a SHA-256 + `timingSafeEqual` to avoid leaking the secret through timing differences. The endpoints are entirely separate from the cookie-based session used by the web app — there is no overlap between the two auth systems.

If `READ_ONLY_API_KEY` is unset the routes respond with `503 Read-only API is not configured`. The user surfaced through the API is selected by `READ_ONLY_USER_ID`; when omitted it falls back to the seeded demo user (`user_demo_alex_blue`).

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/read-only/dashboard` | Aggregate view: user profile, board list, recent tasks |
| `GET` | `/api/read-only/boards` | All boards owned by the configured user |
| `GET` | `/api/read-only/boards/[slug]` | A single board by slug, including tasks and note |

Every response is validated against a Zod schema before it is sent. If a response would fail validation the request is rejected with `500 Read-only API response failed validation` so a malformed payload never reaches a downstream consumer.

### Rate limits and headers

- Rate limit: **240 requests per minute per IP**, enforced via a Postgres-backed bucket. Exceeded requests return `429 Too Many Attempts` with a `Retry-After` header.
- Every response includes `Cache-Control: no-store` and `X-Robots-Tag: noindex`.
- Authentication failures include `WWW-Authenticate: Bearer realm="read-only-api"`.

### Examples

```bash
curl -i \
  -H "Authorization: Bearer $READ_ONLY_API_KEY" \
  http://127.0.0.1:3000/api/read-only/dashboard

curl -i \
  -H "Authorization: Bearer $READ_ONLY_API_KEY" \
  http://127.0.0.1:3000/api/read-only/boards

curl -i \
  -H "Authorization: Bearer $READ_ONLY_API_KEY" \
  http://127.0.0.1:3000/api/read-only/boards/personal
```

Production uses the same paths under `https://www.workflowblueprint.io`.

## External Daily Summary API

`GET /api/external/daily-summary` is a separate, single-purpose endpoint consumed once per day by the morning briefing job at `www.roymcfarland.news`. It is dynamic (`force-dynamic`, `revalidate = 0`, `Cache-Control: no-store`) so the consumer never sees stale data, and it always returns JSON — including for auth failures — so an HTML 404 can never reach the consumer.

Authentication uses a Bearer token compared with SHA-256 + `timingSafeEqual`. The expected secret is `EXTERNAL_API_KEY` when that variable is set; otherwise it falls back to `READ_ONLY_API_KEY` so a single shared key can match what an older consumer already sends.

- Missing or malformed `Authorization` header → `401` JSON.
- Wrong key → `403` JSON.
- Neither `EXTERNAL_API_KEY` nor `READ_ONLY_API_KEY` is set → `503` JSON.

The response shape is generated from this OpenAPI contract: top-level `generatedAt`, a `summary` block with `totalActive`, `completionRate` (string `"NN%"`), `byStatus` (camelCase keys), and `byCategory` (camelCase keys), plus `inProgress`, `onDeck`, `iceBox`, and `recentlyCompleted` task arrays. `Task.status` and `Task.category` use hyphenated enum values (`in-progress`, `elevated-organics`, …) and ids are stable 48-bit hashes of the underlying UUIDs.

```bash
# Uses EXTERNAL_API_KEY when set; otherwise the same value as READ_ONLY_API_KEY.
curl -i \
  -H "Authorization: Bearer $EXTERNAL_API_KEY" \
  https://www.workflowblueprint.io/api/external/daily-summary
```

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
- Private read-only API responses are validated before being returned.
- Authenticated API routes return JSON `401` responses instead of page redirects.
- Sign-up, sign-in, password reset, invitation, and read-only API endpoints share a Postgres-backed distributed rate limiter (`RateLimitBucket` table) so limits hold across serverless instances.
- Mutating routes verify the request `Origin`/`Referer` matches `NEXT_PUBLIC_SITE_URL` and the session cookie is `SameSite=strict`, providing a CSRF defense.
- HTML responses get a per-request nonce-based Content Security Policy (`'strict-dynamic'`); API and static responses get a stricter baseline CSP.
- Session JWTs include the user's `passwordChangedAt` timestamp so password changes/resets revoke every existing session.
- Password reset and invitation tokens are stored hashed and claimed atomically inside transactions before any state changes.
- Development reset links are returned only outside production; production sends reset and invitation links through Resend.
- Admin actions (invitation create/revoke, role promotion) write an `AdminAuditLog` row recording actor, action, target, and timestamp.

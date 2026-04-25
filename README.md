# Workflow Blueprint

Workflow Blueprint is a Next.js App Router task planning workspace with self-service accounts, board-based task management, notes, profile settings, and Resend-backed transactional email.

## Stack

- Next.js 16 App Router and React 19
- Prisma 6 with Supabase Postgres persistence
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

Demo credentials:

```text
alex@workflowblueprint.app
Blueprint123!
```

## Environment

Create `.env` for local work:

```bash
DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require"
AUTH_SECRET="replace-with-a-long-random-secret"
NEXT_PUBLIC_SITE_URL="https://www.workflowblueprint.io"
RESEND_API_KEY="re_..."
EMAIL_FROM="Workflow Blueprint <hello@workflowblueprint.io>"
READ_ONLY_API_KEY="replace-with-a-long-random-read-only-api-key"
READ_ONLY_USER_ID="user_demo_alex_blue"
```

`DATABASE_URL` must be a Supabase Postgres connection string. Use a durable Supabase project database for production account creation.
`AUTH_SECRET` must be a long random secret in production.
`NEXT_PUBLIC_SITE_URL` is used to generate absolute canonical and social sharing metadata.
`RESEND_API_KEY` and `EMAIL_FROM` enable welcome emails and production password reset emails. Local development can omit them; reset requests will expose a preview link instead.
`READ_ONLY_API_KEY` enables the private read-only API. `READ_ONLY_USER_ID` selects which account is exposed through that API and defaults to the seeded demo user when omitted.

## Supabase Database Setup

Apply the checked-in Prisma migrations to the Supabase database before enabling signup:

```bash
npm run db:deploy
```

For a brand-new database, optionally seed the demo account:

```bash
npm run db:seed
```

If the Supabase runtime URL uses a pooler and migration deployment fails, temporarily run `npm run db:deploy` with the direct Supabase Postgres connection string in `DATABASE_URL`, then keep the Vercel runtime `DATABASE_URL` pointed at the connection string you use for serverless traffic.

## Private Read-Only API

Private read-only endpoints require either an `Authorization: Bearer <READ_ONLY_API_KEY>` header or an `X-API-Key: <READ_ONLY_API_KEY>` header. They return JSON only, do not mutate data, and are intentionally not CORS-enabled for browser calls from other origins.

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

## Scripts

```bash
npm run dev       # start the local Next.js server
npm run build     # production build and type check
npm run lint      # ESLint / Next core web vitals checks
npm run db:deploy # apply checked-in Prisma migrations
npm run db:migrate # create and apply a development migration
npm run db:push   # push schema directly for non-migration development
npm run db:seed   # seed the demo account and boards
```

## Security Notes

- API routes use shared JSON parsing and schema validation helpers.
- Private read-only API responses are validated before being returned.
- Authenticated API routes return JSON `401` responses instead of page redirects.
- Sign-up, sign-in, and password reset endpoints include a lightweight in-memory rate limit.
- Password reset tokens are stored hashed and claimed atomically before the password changes.
- Development reset links are returned only outside production; production sends reset links through Resend.

# Workflow Blueprint

Workflow Blueprint is a Next.js App Router task planning workspace with a seeded local demo account, board-based task management, notes, profile settings, and password reset preview support for development.

## Stack

- Next.js 16 App Router and React 19
- Prisma 6 with SQLite for local/demo persistence
- Tailwind CSS 4 with custom blueprint design tokens
- Zod validation on all API payloads
- Signed HTTP-only session cookies with `jose`

## Getting Started

```bash
npm install
npm run dev
```

The dev script pushes the Prisma schema and seeds the local SQLite database before starting Next.js on `127.0.0.1`.

Demo credentials:

```text
alex@workflowblueprint.app
Blueprint123!
```

## Environment

Create `.env` for local work:

```bash
DATABASE_URL="file:./dev.db"
AUTH_SECRET="replace-with-a-long-random-secret"
NEXT_PUBLIC_SITE_URL="https://www.workflowblueprint.io"
READ_ONLY_API_KEY="replace-with-a-long-random-read-only-api-key"
READ_ONLY_USER_ID="user_demo_alex_blue"
```

`DATABASE_URL` falls back to the bundled demo SQLite database for local/demo use. Production should provide a durable database URL and a strong `AUTH_SECRET`.
`NEXT_PUBLIC_SITE_URL` is used to generate absolute canonical and social sharing metadata.
`READ_ONLY_API_KEY` enables the private read-only API. `READ_ONLY_USER_ID` selects which account is exposed through that API and defaults to the seeded demo user when omitted.

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
npm run dev       # prepare DB, seed demo data, start dev server
npm run build     # production build and type check
npm run lint      # ESLint / Next core web vitals checks
npm run db:push   # apply Prisma schema to the configured DB
npm run db:seed   # seed the demo account and boards
```

## Security Notes

- API routes use shared JSON parsing and schema validation helpers.
- Private read-only API responses are validated before being returned.
- Authenticated API routes return JSON `401` responses instead of page redirects.
- Sign-in and password reset endpoints include a lightweight in-memory rate limit.
- Password reset tokens are stored hashed and claimed atomically before the password changes.
- Development reset links are returned only outside production; production should send email through a transactional provider.

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
```

`DATABASE_URL` falls back to the bundled demo SQLite database for local/demo use. Production should provide a durable database URL and a strong `AUTH_SECRET`.

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
- Authenticated API routes return JSON `401` responses instead of page redirects.
- Sign-in and password reset endpoints include a lightweight in-memory rate limit.
- Password reset tokens are stored hashed and claimed atomically before the password changes.
- Development reset links are returned only outside production; production should send email through a transactional provider.

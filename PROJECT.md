## Purpose

Workflow Blueprint is an invite-gated task planning workspace where authenticated users organize boards, tasks, subtasks, due dates, priorities, and board notes; it also provides dashboard rollups, profile/theme settings, admin-managed invitations, and private JSON endpoints for selected planning data.

## Stack

- Language: TypeScript/TSX with strict TypeScript settings (`tsconfig.json`).
- Framework: Next.js 16.2.4 App Router and React 19.2.4 (`package.json`, `src/app/layout.tsx`).
- Package manager: npm with `package-lock.json`.
- Database/ORM: Prisma 6 with a PostgreSQL datasource; the README identifies Supabase Postgres as the deployment database (`package.json`, `prisma/schema.prisma`, `README.md`).
- Styling/UI: Tailwind CSS 4 through PostCSS, custom global design tokens, lucide-react icons, @dnd-kit drag-and-drop, and Recharts (`package.json`, `postcss.config.mjs`, `src/app/globals.css`, `src/components/board-workspace.tsx`).
- Validation/auth/email: Zod schemas, jose-signed JWT session cookies, bcryptjs password hashing, and Resend transactional email (`package.json`, `src/lib/validators.ts`, `src/lib/auth.ts`, `src/lib/email.ts`).
- Runtime versions: exact Node.js runtime is not declared; `@types/node` is `^20` and TypeScript targets `ES2017` (`package.json`, `tsconfig.json`).

## Architecture

The app is organized as a Next.js App Router application under `src/app`: root metadata and providers are in `src/app/layout.tsx`, the public sign-in page is `src/app/page.tsx`, and authenticated pages are wrapped by `src/app/(app)/layout.tsx`. Protected server pages call auth helpers, load user-scoped snapshots from `src/lib/data.ts`, and render feature components such as `src/components/dashboard-overview.tsx` and `src/components/board-workspace.tsx` (`src/app/(app)/dashboard/page.tsx`, `src/app/(app)/boards/[slug]/page.tsx`, `src/lib/auth.ts`). API routes live under `src/app/api` and share same-origin checks, Zod request parsing, auth/admin gates, and rate limiting through `src/lib/api.ts`, then delegate mutations and queries to `src/lib/data.ts` (`src/app/api/auth/sign-up/route.ts`, `src/app/api/boards/[slug]/tasks/route.ts`, `src/app/api/admin/invitations/route.ts`). Prisma models and enums define users, boards, tasks, subtasks, notes, invitations, rate-limit buckets, and admin audit logs in `prisma/schema.prisma`, while domain constants and serialization live in `src/lib/domain.ts` and `src/lib/data.ts`. Security headers are configured globally in `next.config.ts`, while HTML page responses get nonce-based CSP handling through `src/proxy.ts`.

## Conventions

- Imports use the `@/` alias for `src/*`; the alias is configured in `tsconfig.json` and used in `src/app/layout.tsx`, `src/app/api/auth/sign-up/route.ts`, and `src/components/board-workspace.tsx`.
- API route handlers return `NextResponse.json(...)` payloads and use shared helpers before business logic: `parseJsonPayload`, `requireApiUser`/`requireApiAdmin`, `assertSameOriginRequest`, and `checkRateLimit` (`src/lib/api.ts`, `src/app/api/auth/sign-up/route.ts`, `src/app/api/boards/[slug]/tasks/route.ts`, `src/app/api/admin/invitations/route.ts`).
- Request and response shapes are modeled with Zod; input types are inferred from schemas in `src/lib/validators.ts`, and read-only API responses are validated with schemas from `src/lib/read-only-contract.ts` through `readOnlyApiJson` in `src/lib/read-only-api.ts` (`src/app/api/read-only/dashboard/route.ts`).
- Authenticated pages perform server-side user checks before rendering or fetching protected data (`src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/boards/[slug]/page.tsx`, `src/lib/auth.ts`).
- Prisma access is centralized in `src/lib/data.ts`, which returns serialized UI/API shapes for board, dashboard, task, and invitation data instead of exposing raw Prisma records directly (`src/lib/data.ts`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/boards/[slug]/page.tsx`).
- Mutating task operations use Prisma transactions, and create/update/reorder task flows use Serializable isolation (`src/lib/data.ts`, `src/app/api/boards/[slug]/tasks/route.ts`).
- Domain enums, labels, theme mappings, board definitions, and cookie names live in `src/lib/domain.ts` and are reused by validators and UI code (`src/lib/validators.ts`, `src/components/board-workspace.tsx`).
- Invitation tokens are generated as random bytes, stored as SHA-256 hashes, and accepted atomically in the same transaction that creates the user (`src/lib/data.ts`, `src/app/api/auth/sign-up/route.ts`, `src/app/api/admin/invitations/route.ts`).

## Non-goals

- Open public self-service registration: sign-up requires an invitation token, invalid invitations are rejected, and invitation creation is admin-gated (`src/lib/validators.ts`, `src/app/api/auth/sign-up/route.ts`, `src/app/api/admin/invitations/route.ts`).
- Browser-oriented cross-origin use of the private read-only API: the README states the read-only API is intentionally not CORS-enabled, and the implementation uses key-based access with `no-store`/`noindex` response headers (`README.md`, `src/lib/read-only-api.ts`).
- Broader product and roadmap non-goals: TBD — human to fill in.

## Open questions for the human

- No test files matching `*test*` or `*spec*` and no `test` script were found; is automated testing intentionally absent, or is the harness still pending?
- No `.github` CI config was present; is Vercel the only build/deploy gate, or is CI configured somewhere outside the repository?
- Which Node.js version should contributors and deployments use? `package.json` has no `engines` field.
- Is Supabase Postgres mandatory for production, or is any PostgreSQL-compatible database acceptable? `README.md` names Supabase, while `prisma/schema.prisma` declares a generic PostgreSQL datasource.
- Is `src/app/api/external/daily-summary/route.ts` intended to be a stable private integration contract, or a one-off endpoint for the current external consumer?
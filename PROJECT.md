# PROJECT.md

## Purpose

Workflow Blueprint is a Next.js task-planning web app: self-service accounts, board-based tasks and notes, profile settings, and transactional email (Resend). It also exposes authenticated JSON APIs—a read-only API for a single configured user’s data and an external daily-summary endpoint for a separate consumer—backed by Postgres via Prisma. (Source: `README.md`.)

## Stack

- **Languages:** TypeScript (strict mode in `tsconfig.json`), SQL via Prisma migrations.
- **Framework:** Next.js **16.2.4** (App Router), React **19.2.4** (`package.json`).
- **Package manager:** npm (`package-lock.json` present; `package.json` scripts).
- **Data:** Prisma **6.x** (`@prisma/client`, `prisma`), PostgreSQL / Supabase-style URLs (`README.md`, `prisma/schema.prisma`).
- **UI:** Tailwind CSS **4** (`tailwindcss`, `@tailwindcss/postcss` in `package.json`), Radix slot, **dnd-kit**, **react-hook-form**, **zod**, **jose**, **bcryptjs**, **resend** (`package.json`).
- **Runtime versions:** `package.json` does not declare an `engines` field; Node version is not pinned in-repo.
- **Build / deploy:** `next build --webpack`, `vercel-build` runs `prisma migrate deploy` then build (`package.json`).

## Architecture

The UI and HTTP surface live under the App Router in `src/app/`: authenticated app pages use a route group (`src/app/(app)/`, e.g. `src/app/(app)/dashboard/page.tsx`), while JSON handlers are colocated as `route.ts` files under `src/app/api/` (e.g. `src/app/api/read-only/dashboard/route.ts`). Cross-cutting application logic—auth, env validation, Prisma access, Zod contracts, rate limiting, and data access—is centralized in `src/lib/` (`src/lib/auth.ts`, `src/lib/data.ts`, `src/lib/api.ts`, `src/lib/read-only-contract.ts`, `src/lib/read-only-api.ts`). Presentational and feature UI lives in `src/components/` with subfolders such as `src/components/auth/` and `src/components/blueprint/`. Persistence is modeled in `prisma/schema.prisma` with migrations in `prisma/migrations/`; `prisma.config.ts` wires datasource URL resolution and seed entry. Global Next behavior and HTTP security baselines are configured in `next.config.ts` (headers, `reactCompiler`). On server startup (Node runtime), `src/instrumentation.ts` loads environment validation via `assertEnv` from `src/lib/env.ts`. A `src/proxy.ts` module defines request continuation and a `config.matcher` similar to middleware-style routing, but there is no `middleware.ts` file in the repo that imports or re-exports it, so how (or whether) it is executed is not clear from layout alone.

## Conventions

- **Path alias:** Imports use `@/` mapped to `src/` (`tsconfig.json`).
- **API helper typing:** Shared handlers use a discriminated `ApiResult<T>` union with `NextResponse` for failure paths (`src/lib/api.ts`; same pattern in `src/lib/read-only-api.ts`).
- **JSON + Zod:** Request bodies are parsed and validated with `parseJsonPayload` against a `ZodType` (`src/lib/api.ts`).
- **Read-only API responses:** Routes validate outbound JSON with Zod schemas from `src/lib/read-only-contract.ts` through `readOnlyApiJson` (`src/app/api/read-only/dashboard/route.ts`, `src/lib/read-only-api.ts`).
- **Route segment config:** API routes declare Next segment config such as `export const dynamic = "force-dynamic"` and `export const runtime = "nodejs"` where needed (`src/app/api/read-only/dashboard/route.ts`).
- **Origin checks:** Mutating requests enforce same-origin via `assertSameOriginRequest` comparing `Origin`/`Referer` to `siteConfig.url` (`src/lib/api.ts`, `src/lib/site-config.ts`).
- **Instrumentation:** `register()` in `src/instrumentation.ts` no-ops outside `nodejs` runtime before calling `assertEnv()`.
- **Client vs server:** Interactive components opt in with the `"use client"` directive (`src/components/pull-to-refresh.tsx`).
- **Linting:** ESLint uses `eslint-config-next` presets for Core Web Vitals and TypeScript (`eslint.config.mjs`).
- **Prisma config:** `prisma.config.ts` uses `defineConfig` from `prisma/config`, loads env through `src/lib/load-env.ts`, and resolves DB URL via `src/lib/database-url.ts`.

## Non-goals

Documented for the private read-only API: it **does not mutate data** and is **not intended for browser CORS use from other origins** (`README.md`, “Private Read-Only API” section). Other product boundaries (e.g. full multi-tenant admin, arbitrary third-party integrations) are **TBD — human to fill in**; they are not enumerated as explicit non-goals in the scanned code beyond the README notes above.

## Open questions for the human

- **Automated tests:** No `*.test.*`, `*.spec.*`, or obvious Jest/Vitest/Playwright config was found under the repository root. Is the absence of checked-in tests intentional, or are tests hosted elsewhere?
- **`src/proxy.ts` vs middleware:** The file exports `proxy` and a `config` object with a `matcher`, consistent with Next middleware patterns, but no `middleware.ts` (or re-export) appears in the repo. Is `src/proxy.ts` dead code, renamed middleware pending wiring, or activated by a convention not visible in this tree?
- **CI:** There is no `.github/workflows/` (or similar) in the workspace snapshot; is CI exclusively Vercel build checks, or should another pipeline be documented?
- **Node pinning:** Should a supported Node version be recorded (e.g. `engines` in `package.json` or `.nvmrc`) for local and Vercel parity?

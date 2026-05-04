# PROJECT.md

> This document is the authoritative source of truth for the Builder, Closeout, and Verifier agents operating on this repository. When this document conflicts with other files (README.md, package.json, inline comments, etc.), this document wins and the conflicting file should be corrected in the same PR that surfaces the conflict.

### How to use this document

- **Builder agents:** Read this document before writing code to understand the product's scope, non-goals, and architectural rules. Do not propose PRs that violate these rules.
- **Verifier agents:** Use this document as the ground truth for auditing PRs. Enforce the rules listed under "Open questions (resolved)" and reject PRs that introduce out-of-scope features listed under "Non-goals."

### Document map

- `PROJECT.md` (this file) — Strategic: what the product is, what is out of scope, and durable rules for PRs.
- `AGENTS.md` — Tactical: operational quickstart for AI agents (how to run the dev server, required services, environment variables).
- `CLAUDE.md` — Pointer file directing Claude Code to read `AGENTS.md`.
- `README.md` — Human-facing documentation, setup instructions, and API contracts.

### Active agent tooling

- **Builder:** OpenAI Codex (cloud agent that opens PRs autonomously).
- **Verifier:** Cursor (used by the human reviewer in-IDE to spot-check Codex PRs before merge). The repo owner is the final approver on every PR.

---

## PR sequencing (active roadmap)

The resolved Open Questions below commit this codebase to four sequenced pull requests. Builder agents must respect this sequencing. Do not start work on a later PR before the prior PR has merged.

| PR | Title | Scope | Blocked by |
|---|---|---|---|
| **PR 1** | Test harness + CI | Vitest, three smoke tests, three representative unit/integration tests, ephemeral Postgres for tests, `.github/workflows/ci.yml` (lint/test/smoke jobs), `.nvmrc` and `engines.node` pinned to 22.11.x, `package.json` `"license": "PolyForm-Noncommercial-1.0.0"`. **Must not modify any `src/app/api/external/*` route shapes or any feature code.** | None |
| **PR 2** | External API v1 expansion | New `src/lib/external-api.ts` shared module; new routes `/api/external/v1/dashboard`, `/api/external/v1/boards`, `/api/external/v1/boards/[slug]`; alias `/api/external/daily-summary` → `/api/external/v1/daily-summary`; updated README OpenAPI section. **Every new endpoint must ship with its tests in the same PR** (Q1 hard-fail rule). | PR 1 |
| **PR 3** | Consumer migration | Update `www.roymcfarland.news` briefing job (in its own repo) to use `EXTERNAL_API_KEY` and the v1 endpoint paths. Verify in production before opening PR 4. | PR 2 |
| **PR 4** | Read-only deprecation cleanup | Remove the `READ_ONLY_API_KEY` fallback in `/api/external/v1/daily-summary`; mark `/api/read-only/*` deprecated in PROJECT.md; bump warnings on any code that still imports from `/api/read-only/*`. | PR 3 |

### Builder guardrails for the PR 1 → PR 2 transition

The Verifier rule under Q1 hard-fails any PR that modifies `src/app/api/**`, `src/lib/data.ts`, `src/lib/validators.ts`, or `src/lib/auth.ts` without test changes. This rule starts being enforceable the moment PR 1 merges. Therefore:

- **PR 1 must not** add or modify any of the protected paths above (it only adds tests, CI, and pinning). PR 1 is exempt from the rule because it is the rule's enabling change.
- **PR 2 and beyond** must ship endpoint-and-test pairs together. Adding a new external route without an accompanying test for it is an automatic Verifier reject. Adding a new validator schema without a test is an automatic Verifier reject.
- **No "tests come in a follow-up PR" PRs are accepted.** If a PR's test coverage is insufficient, the missing tests must be added to that same PR before merge.

---

## Purpose

Workflow Blueprint is an invite-gated task planning workspace where authenticated users organize boards, tasks, subtasks, due dates, priorities, and board notes. It provides dashboard rollups, profile/theme settings, and admin-managed invitations through a server-rendered web app, and exposes its planning data to external consumers (such as the morning briefing job at `www.roymcfarland.news`) through a versioned, key-authenticated external API. Workflow Blueprint is a source-available product licensed under the PolyForm Noncommercial 1.0.0 license, permitting personal and non-commercial use while reserving commercial rights.

---

## Stack

- Language: TypeScript/TSX with strict TypeScript settings (`tsconfig.json`).
- Framework: Next.js 16.2.4 App Router and React 19.2.4 (`package.json`, `src/app/layout.tsx`).
- Package manager: npm with `package-lock.json`.
- Database/ORM: Prisma 6 with a PostgreSQL datasource; the README identifies PostgreSQL (currently hosted on Supabase) as the deployment database (`package.json`, `prisma/schema.prisma`, `README.md`).
- Styling/UI: Tailwind CSS 4 through PostCSS, custom global design tokens, lucide-react icons, @dnd-kit drag-and-drop, and Recharts (`package.json`, `postcss.config.mjs`, `src/app/globals.css`, `src/components/board-workspace.tsx`).
- Validation/auth/email: Zod schemas, jose-signed JWT session cookies, bcryptjs password hashing, and Resend transactional email (`package.json`, `src/lib/validators.ts`, `src/lib/auth.ts`, `src/lib/email.ts`).
- Runtime versions: Node.js 22.11.x is declared via `engines.node` and pinned in `.nvmrc`; `@types/node` is `^20` (acceptable; types do not need to match runtime exactly) and TypeScript targets `ES2017` (`package.json`, `tsconfig.json`).

---

## Architecture

The app is organized as a Next.js App Router application under `src/app`: root metadata and providers are in `src/app/layout.tsx`, the public sign-in page is `src/app/page.tsx`, and authenticated pages are wrapped by `src/app/(app)/layout.tsx`. Protected server pages call auth helpers, load user-scoped snapshots from `src/lib/data.ts`, and render feature components such as `src/components/dashboard-overview.tsx` and `src/components/board-workspace.tsx` (`src/app/(app)/dashboard/page.tsx`, `src/app/(app)/boards/[slug]/page.tsx`, `src/lib/auth.ts`). API routes live under `src/app/api` and share same-origin checks, Zod request parsing, auth/admin gates, and rate limiting through `src/lib/api.ts`, then delegate mutations and queries to `src/lib/data.ts` (`src/app/api/auth/sign-up/route.ts`, `src/app/api/boards/[slug]/tasks/route.ts`, `src/app/api/admin/invitations/route.ts`). Prisma models and enums define users, boards, tasks, subtasks, notes, invitations, rate-limit buckets, and admin audit logs in `prisma/schema.prisma`, while domain constants and serialization live in `src/lib/domain.ts` and `src/lib/data.ts`. Security headers are configured globally in `next.config.ts`, while HTML page responses get nonce-based CSP handling through `src/proxy.ts`.

---

## Conventions

- Imports use the `@/` alias for `src/*`; the alias is configured in `tsconfig.json` and used in `src/app/layout.tsx`, `src/app/api/auth/sign-up/route.ts`, and `src/components/board-workspace.tsx`.
- API route handlers return `NextResponse.json(...)` payloads and use shared helpers before business logic: `parseJsonPayload`, `requireApiUser`/`requireApiAdmin`, `assertSameOriginRequest`, and `checkRateLimit` (`src/lib/api.ts`, `src/app/api/auth/sign-up/route.ts`, `src/app/api/boards/[slug]/tasks/route.ts`, `src/app/api/admin/invitations/route.ts`).
- Request and response shapes are modeled with Zod; input types are inferred from schemas in `src/lib/validators.ts`, and read-only API responses are validated with schemas from `src/lib/read-only-contract.ts` through `readOnlyApiJson` in `src/lib/read-only-api.ts` (`src/app/api/read-only/dashboard/route.ts`).
- Authenticated pages perform server-side user checks before rendering or fetching protected data (`src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/boards/[slug]/page.tsx`, `src/lib/auth.ts`).
- Prisma access is centralized in `src/lib/data.ts`, which returns serialized UI/API shapes for board, dashboard, task, and invitation data instead of exposing raw Prisma records directly (`src/lib/data.ts`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/boards/[slug]/page.tsx`).
- Mutating task operations use Prisma transactions, and create/update/reorder task flows use Serializable isolation (`src/lib/data.ts`, `src/app/api/boards/[slug]/tasks/route.ts`).
- Domain enums, labels, theme mappings, board definitions, and cookie names live in `src/lib/domain.ts` and are reused by validators and UI code (`src/lib/validators.ts`, `src/components/board-workspace.tsx`).
- Invitation tokens are generated as random bytes, stored as SHA-256 hashes, and accepted atomically in the same transaction that creates the user (`src/lib/data.ts`, `src/app/api/auth/sign-up/route.ts`, `src/app/api/admin/invitations/route.ts`).

---

## Non-goals

The following are explicitly **out of scope** for this product. Agents should reject or flag work that moves the codebase in any of these directions unless this document is updated first.

- **Not open public self-service registration** — sign-up requires an admin-issued invitation token; admin-gated invitation creation.
- **Not a browser-oriented cross-origin API surface** — the external API is intentionally not CORS-enabled and uses key-based auth with `no-store`/`noindex` headers.
- **Not a team, multi-tenant, or enterprise tool** — invitations and data are per-user; no orgs, workspaces, shared boards, or B2B admin surfaces.
- **Not a realtime collaboration tool** — no websockets, presence, shared editing, or simultaneous board editing.
- **Not a public or open API** — the `/api/external/v1/*` surface is auth-gated and intended only for consumers under the project owner's control.
- **Not a native mobile app within this codebase** — the planned native mobile experience will be a separate-repo consumer of `/api/external/v1/*`. This repo will house only the web app and the API; native mobile code (React Native, Swift, Kotlin) is forbidden here. The external API will evolve to support per-user authentication and read/write operations as the mobile app's needs are defined; that evolution is planned but not in scope for the install PR.
- **Not a mind-mapping or visual-canvas tool today** — boards are list-based with hierarchical tasks and subtasks; freeform 2D mind maps, node-and-edge canvases, and graph visualizations are explicitly deferred. This requires a PROJECT.md update before any PR introduces canvas/graph rendering libraries (e.g., react-flow, cytoscape, d3-force) or a mind-map data model.

---

## Open questions (resolved)

The following questions were raised by static analysis of the repository and have been answered here. Agents should treat these answers as durable unless this document is updated.

### Q1. No test files matching `*test*` or `*spec*` and no `test` script were found; is automated testing intentionally absent, or is the harness still pending?

**Answer: Tests are required and layered.**

Three layers of automated checks are required, each with distinct Verifier behavior. The test harness must land before any further feature work.

**Sequencing / required corrections:**
- Add Vitest and configure it.
- Add `test`, `test:watch`, and `test:smoke` scripts to `package.json`.
- Add one representative test per critical layer (one API route, one `data.ts` transaction, one Zod validator).
- Add three smoke tests (homepage, read-only API, external daily-summary API).
- Use an ephemeral test database (Supabase branch or local Postgres in Docker), not Prisma mocks.

**Verifier behavior:**
- **Hard-fail** any PR where `npm run lint` fails.
- **Hard-fail** any PR where `npm run test:smoke` fails.
- **Hard-fail** any PR that changes `src/app/api/**`, `src/lib/data.ts`, `src/lib/validators.ts`, or `src/lib/auth.ts` without test changes.
- **Warn** on unrelated test breakage (could be flaky).

### Q2. No `.github` CI config was present; is Vercel the only build/deploy gate, or is CI configured somewhere outside the repository?

**Answer: CI is GitHub Actions + Vercel preview, both required.**

Every PR must pass both a GitHub Actions workflow (lint, smoke, unit/integration tests) and the Vercel preview build before merge.

**Sequencing / required corrections:**
- Add `.github/workflows/ci.yml` with three parallel jobs (`lint`, `test`, `smoke`).
- Add a Postgres service container in the `test` job for the ephemeral DB.
- Use `node-version-file: '.nvmrc'` in the workflow.

**Verifier behavior:**
- **Hard-fail** any PR that deletes/disables `.github/workflows/ci.yml` or removes a job.
- **Hard-fail** any PR that uses admin merge-without-checks without a PROJECT.md emergency note.
- **Warn** on new env-var code paths without matching CI `env:` entries.

### Q3. Which Node.js version should contributors and deployments use? `package.json` has no `engines` field.

**Answer: Node 22.11.x, enforced across four files.**

All contributors and all deploys run Node 22.11.x. Patches flow automatically; minor bumps require a deliberate PR.

**Sequencing / required corrections:**
- Add `"engines": { "node": "22.11.x" }` to `package.json`.
- Add `.nvmrc` file at repo root containing `22.11`.
- Ensure `.github/workflows/ci.yml` uses `node-version-file: '.nvmrc'`.

**Verifier behavior:**
- **Hard-fail** any PR where `package.json engines.node`, `.nvmrc`, and the CI workflow's Node version are not consistent.
- **Hard-fail** any PR that removes any of those three pin sites.
- **Warn** to confirm Vercel still matches before merging Node version bumps.

### Q4. Is Supabase Postgres mandatory for production, or is any PostgreSQL-compatible database acceptable?

**Answer: Generic PostgreSQL, currently hosted on Supabase.**

The schema and code stay portable across any Postgres 14+ host. Supabase is the recommended and current production host but is not a hard requirement.

**Sequencing / required corrections:**
- README: change "Prisma 6 with **Supabase Postgres** persistence" to "Prisma 6 with **PostgreSQL** persistence (currently hosted on Supabase)".
- README "Supabase Database Setup" section: rename to "Database Setup" and reframe Supabase as a recommended example, not the only path.

**Verifier behavior:**
- **Hard-fail** any PR that introduces Supabase RLS policies, `supabase-js` imports, or calls to Supabase Realtime / Storage / Edge Functions / Auth.
- **Hard-fail** any PR that adds Postgres extensions Supabase doesn't support, or that bumps the schema beyond Postgres 15 features.
- **Warn** if a PR adds connection-string handling beyond the existing `DATABASE_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` set.

### Q5. Is `src/app/api/external/daily-summary/route.ts` intended to be a stable private integration contract, or a one-off endpoint for the current external consumer?

**Answer: Stable versioned external API; v1 expanded across four endpoints.**

`/api/external/*` is a versioned stable contract (v1 today, path-based versioning). v1 expands beyond the existing daily-summary to mirror the read-only API surface, serving both the current briefing job consumer and the future second consumer.

**Sequencing / required corrections:**
- Create a shared module (`src/lib/external-api.ts`) for external v1 routes.
- Add `/api/external/v1/dashboard`, `/api/external/v1/boards`, `/api/external/v1/boards/[slug]`.
- Add alias `/api/external/daily-summary` to `/api/external/v1/daily-summary`.
- Update README OpenAPI section to cover all four v1 endpoints.
- Migrate `www.roymcfarland.news` to use `EXTERNAL_API_KEY` and the v1 endpoints.
- Remove `READ_ONLY_API_KEY` fallback in the external route after migration.
- Mark `/api/read-only/*` deprecated in PROJECT.md.

**Verifier behavior:**
- **Hard-fail** any PR that changes the response shape of any `/api/external/v1/*` endpoint without an accompanying README OpenAPI update and a PR description note confirming consumer coordination.
- **Hard-fail** any PR that removes the `force-dynamic`, `revalidate = 0`, or `Cache-Control: no-store` directives on external routes.
- **Hard-fail** any PR that introduces a new external endpoint outside the `/api/external/v{N}/` namespace.
- **Warn** on additive changes (new fields).
- **Warn** on new code that depends on `/api/read-only/*` (deprecated path).
- **Warn** on PRs touching the `READ_ONLY_API_KEY` fallback in the external route.

---

## Authority and precedence

When agents encounter conflicts between this document and other files in the repository, the order of authority is:

1. **This PROJECT.md** (authoritative for intent, scope, non-goals, and the resolved open questions above).
2. **`AGENTS.md`** (authoritative for tactical execution: how to run the app locally, required services, and dev environment gotchas).
3. **`README.md`** (authoritative for human-facing contributor conventions and API contracts not covered here).
4. **`package.json`, schema files, CI config** (authoritative for the technical facts they encode, subject to corrections required by this document).
5. **Inline code comments** (lowest authority; must be corrected when they contradict the above).

Any PR that surfaces a conflict between these sources must resolve the conflict in the same PR, not defer it.

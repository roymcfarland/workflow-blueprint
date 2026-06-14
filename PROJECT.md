# PROJECT.md

> This document is the authoritative source of truth for the Builder, Closeout, and Verifier agents operating on this repository. When this document conflicts with other files (README.md, package.json, inline comments, etc.), this document wins and the conflicting file should be corrected in the same PR that surfaces the conflict.

### How to use this document

- **Builder agents:** Read this document before writing code to understand the product's scope, non-goals, and architectural rules. Do not propose PRs that violate these rules.
- **Verifier agents:** Use this document as the ground truth for auditing PRs. Enforce the rules listed under "Open questions (resolved)" and reject PRs that introduce out-of-scope features listed under "Non-goals."

### Document map

- `PROJECT.md` (this file) — Strategic: what the product is, what is out of scope, and durable rules for PRs.
- `AGENTS.md` — Tactical: operational quickstart for AI agents (how to run the dev server, required services, environment variables).
- `README.md` — Human-facing documentation, setup instructions, and API contracts.
- `CASE_STUDY.md` — Walkthrough of one PR (#13) end-to-end: prompt, diff, Verifier rule it triggered, and resolution. Read this if you are evaluating the multi-agent workflow itself.

### Active agent tooling

- **Builder:** OpenAI Codex (cloud agent that opens PRs autonomously).
- **Verifier:** Cursor (used by the human reviewer in-IDE to spot-check Codex PRs before merge). The repo owner is the final approver on every PR.

---

## PR sequencing (active roadmap)

Builder agents must respect the sequencing of any PRs listed under "Active phase" below. Do not start work on a later active PR before the prior active PR has merged. Completed PRs are kept in the "Shipped" table for historical context and to preserve the rationale that originated current Verifier rules.

### Shipped

| PR | Title | Merged in | Outcome |
|---|---|---|---|
| **PR 1** | Test harness + CI | `#7` | Vitest, smoke tests, ephemeral Postgres for tests, `.github/workflows/ci.yml`, `.nvmrc` and `engines.node` pinned to 22.11.x, `package.json` `"license": "PolyForm-Noncommercial-1.0.0"`. Enabling change for the Q1 test-coverage hard-fail rule. |
| **PR 2** | External API v1 expansion | `#8` | Added shared module `src/lib/external-api.ts` and routes `/api/external/v1/dashboard`, `/api/external/v1/boards`, `/api/external/v1/boards/[slug]`; updated README OpenAPI section; ships with tests per Q1. |
| **PR 3** | Consumer migration | (external repo) | `www.roymcfarland.news` briefing job migrated to `EXTERNAL_API_KEY` and the v1 endpoint paths in the `agentic-daily-briefing` repo. |
| **PR 4** | Read-only deprecation cleanup | `#9` | Deleted the legacy `/api/external/daily-summary` alias and the entire `/api/read-only/*` surface; removed `READ_ONLY_API_KEY` and `READ_ONLY_USER_ID` from the codebase and from Vercel. The v1 contract under `/api/external/v1/*` is now the only supported external surface. |
| **PR 5** | OpenAPI contract guard | `#10` | Added `docs/openapi.yaml` as the authoritative OpenAPI 3.1 reference for `/api/external/v1/*`, generated from `src/lib/external-contract.ts`; added a CI drift test that fails when the committed spec and Zod schemas diverge. |
| **PR 6** | External API observability | `#12` | Added `src/lib/observability.ts`, the `withExternalApiObservability` wrapper, structured per-request log lines via `console.log`, and `X-Request-Id` UUID v4 response headers on every `/api/external/v1/*` route. Foundation for the PR 8 Sentry correlation. |
| **PR 7** | Rate-limit headers + resolved external user threading | `#13` | Exposed `X-RateLimit-*` headers on all `/api/external/v1/*` wrapper responses and threaded the resolved external user through the observability wrapper, closing the PR 7 follow-up from the external API observability sequence. |
| **PR 8** | Server-side Sentry + Q6 scope discipline | `#14` | Added server-side Sentry capture for uncaught API errors, correlated events with `X-Request-Id`, and introduced the Q6 rule requiring out-of-scope diff enumeration in PR bodies. |
| **PR 9** | Hover-with-intent sidebar + per-board hide-archive default | `#16` | Replaced the click-toggle desktop sidebar with a hover-with-intent + pin model (`localStorage["wb.sidebar.pinned"]`), changed the per-board archive default to "Hide" with per-slug persistence (`wb.board.{slug}.archiveMode`), and established the canonical hydration-safe persistence pattern (static `useState` + `queueMicrotask` in `useEffect`) plus the jsdom + `@dnd-kit/*` mock pattern for `BoardWorkspace`. |
| **PR 10** | Per-board view-mode + notes-open persistence; extract `src/lib/board-preferences.ts` | `#17` | Added per-board view-mode and notes-open persistence and extracted the shared persistence helpers into `src/lib/board-preferences.ts`, with tests per Q1 (`tests/lib/board-preferences.test.ts`, `tests/components/board-workspace-preferences.test.tsx`). |
| **PR 11** | Harden public schema RLS | `#18` | Hardened row-level security on the public schema; covered by `tests/database-rls.test.ts`. |
| **PR 12** | CI typecheck gate | `#19` | Added a `typecheck` npm script (`tsc --noEmit`) and a dedicated CI `typecheck` job, and fixed a pre-existing TS2352 error in `tests/api/external/v1-routes.test.ts` that had slipped through because CI previously ran no type check. |
| **PR 13** | Roadmap reconciliation | `#20` | Brought the Shipped ledger current and corrected the Active phase. Documentation-only. |
| **PR 14** | Post-merge branch-deletion guardrail | `#21` | Added the standing guardrail that merged feature branches are deleted both remote and local, backed by GitHub's "Automatically delete head branches" setting and the pre-flight local prune. Documentation/repo-settings. |
| **PR 15** | Granular subtask API | `#22` | Added per-subtask REST endpoints (`POST /api/tasks/[taskId]/subtasks`, `POST /api/tasks/[taskId]/subtasks/reorder`, `PATCH`/`DELETE /api/subtasks/[subtaskId]`) with `subtaskCreate`/`subtaskUpdate`/`subtaskReorder` validators and the matching `createSubtaskForUser`/`updateSubtaskForUser`/`deleteSubtaskForUser`/`reorderSubtasksForUser` data-layer functions. Additive; ships with tests per Q1. |
| **PR 16** | Subtask panel on the granular API | `#23` | Rewired the board subtask panel to the granular endpoints, removing the whole-task re-save on every subtask edit and adding server reconciliation via `onTaskUpdated`/`applyServerTask`. |
| **PR 17** | Subtask panel interaction redesign | `#24` | Persistent inline add input, always-editable titles, per-row pending/dirty tracking, and single-flight saves. |
| **PR 18** | Subtask panel visual pass | `#25` | Per-subtask flag priority, inline-expand panel, and a completion progress bar. |
| **PR 19** | CI build job | `#26` | Added a dedicated `build` job to `.github/workflows/ci.yml` so build-only failures are caught in CI rather than only by the Vercel deploy. |
| **PR 20** | Inline subtask priority strip | `#27` | Replaced the per-subtask priority popover with an inline reveal flag strip (a `radiogroup`); no floating menu, portal, or open/close state. |
| **PR 21** | Subtask panel folded into the card | `#28` | The subtask panel renders inside the task card surface (the card grows) instead of a detached, shadowed box; removed the dead `placement="dropdown"` overlay branch. |
| **PR 22** | Inline quick-add task creation | `#29` | Replaced the drawer-based create flow with an inline quick-add composer (title + Enter) in each column/section; the header, empty-state, and `?new=1` deep link open it. The drawer was left for editing only. |
| **PR 23** | Inline task-field editing on the card | `#30` | Status, priority, due date, description, and delete are edited inline on the expanded card via the existing whole-task PATCH; threaded an `onDelete` handler down to the panel. |
| **PR 24** | Removed the TaskDrawer | `#31` | Deleted the slide-out `TaskDrawer`, `SortableSubtaskRow`, the per-card details button, the `onOpen`/`onOpenTask` prop chain, the drawer state, the `closeDrawer` save option, and now-unused imports. Task creation and editing are now fully inline on the card. |
| **`#32`** | Roadmap reconciliation (#20–#31) | `#32` | Documentation-only: brought the Shipped ledger current through `#31`. |
| **`#33`** | Sidebar hover-jump fix | `#33` | Stopped the desktop sidebar shifting on hover-expand. |
| **`#34`** | Sidebar collapse toggle | `#34` | Replaced the hover-with-intent sidebar with a Trello-style click collapse toggle. |
| **`#35`** | Kanban drag feel | `#35` | Trello-style drag feel: card lift + drop placeholder. |
| **`#36`** | Fixed-viewport board frame | `#36` | Trello-style fixed-viewport board frame; columns scroll internally. |
| **`#37`** | Subtask text-only UI | `#37` | Subtasks dropped the priority control; titles became click-to-edit (UI only). |
| **`#38`** | Drop Subtask.priority column | `#38` | Removed the `Subtask.priority` column; the external API serves a constant. |
| **`#39`** | Remove card status selector | `#39` | Removed the redundant status selector from the card. |
| **`#40`** | Card-detail modal | `#40` | Added a card-detail modal (priority / due date / description / delete). |
| **`#41`** | Card status glow | `#41` | Faint status-color glow behind each card. |
| **`#42`** | Persist login (SameSite) | `#42` | `SameSite=Lax` session cookie so login persists across navigations. |
| **`#43`** | Account/avatar menu | `#43` | Folded admin nav + account actions into an avatar menu. |
| **`#44`** | Card subtask progress | `#44` | Surfaced subtask progress on closed cards; dropped the empty pill. |
| **`#45`** | Board title actions | `#45` | Moved board edit/delete onto the page title with a confirm modal. |
| **`#46`** | Active board white text | `#46` | Forced white text on the active board sidebar link. |
| **`#47`** | API tokens — data layer | `#47` | API tokens slice 1: schema + data layer + validation. |
| **`#48`** | API tokens — auth + routes | `#48` | API tokens slice 2: external-API auth integration + admin routes. |
| **`#49`** | API tokens — admin UI | `#49` | API tokens slice 3: admin UI page + account-menu entry. |
| **`#50`** | Security deps (next 16.2.6) | `#50` | Bumped Next to 16.2.6 and cleared moderate transitive advisories. |
| **`#51`** | Guard non-local dev migrations | `#51` | Guarded dev migration commands against non-local databases. |
| **`#52`** | Task/Subtask FK indexes | `#52` | Added covering indexes for Task and Subtask foreign keys. |
| **`#53`** | Input caps (boards/tasks) | `#53` | Capped boards-per-user and tasks-per-board. |
| **`#54`** | Admin route hardening | `#54` | Hardened admin mutation routes (rate limits + error handling). |
| **`#55`** | User-write rate limits | `#55` | Rate-limited profile, theme, and board-note write routes. |
| **`#56`** | Vitest 3 → 4 | `#56` | Upgraded Vitest 3 → 4, clearing a critical advisory. |
| **`#57`** | npm audit CI gate | `#57` | Added an `npm audit` CI gate + a `postcss` override to clear an advisory. |
| **`#58`** | Auth hardening (JWT/timing) | `#58` | Pinned the JWT algorithm and hardened sign-in timing. |
| **`#59`** | CSRF fail-closed | `#59` | CSRF fail-closed + require `application/json` on mutation routes. |
| **`#60`** | Atomic task reorder | `#60` | Made `reorderTasksForUser` atomic (read inside its transaction). |
| **`#61`** | Card halo + quick-add reset | `#61` | Muted the card halo and collapsed quick-add after save. |
| **`#62`** | CSP style-src fix | `#62` | Fixed CSP `style-src` handling for inline styles. |
| **`#63`** | In-progress view backend | `#63` | Backend for the cross-board in-progress dashboard view. |
| **`#64`** | In-progress list UI | `#64` | Reorderable In-progress list; removed the Boards section. |
| **`#65`** | Side-by-side drag | `#65` | Side-by-side dashboard cards + drag-to-reorder In progress. |
| **`#66`** | Subtask panel polish | `#66` | Tightened the subtask panel and introduced warm-orange In progress. |
| **`#67`** | Expand board icon picker | `#67` | Expanded the board icon picker. |
| **`#68`** | Subtasks in snapshot | `#68` | Included subtasks in the in-progress snapshot payload. |
| **`#69`** | Caret-expand subtasks | `#69` | Caret-expand + toggle subtasks on in-progress dashboard rows. |
| **`#70`** | Round subtask toggle button | `#70` | Replaced the native subtask checkbox with an accessible `aria-pressed` toggle button, tightened the panel, removed the panel top border, and bumped the `--status-in-progress` accent (`#df7d22 → #f97316` / `#eaa766 → #fb923c`); accent bump declared out-of-scope per Q6. |
| **`#71`** | Roadmap reconciliation (#32–#70) | `#71` | Documentation-only: appended Shipped rows for #32–#70, reset the Active phase, retired the internal "PR N" counter past PR 24, and added the self-updating-ledger guardrail. |
| **`#72`** | Subtask complete-toggle moved to the right + CircleCheck icon | `#72` | Moved the subtask completion toggle from the left of the row to between the title and the delete button, and swapped the bordered-circle `Check` for the `CircleCheck` glyph (color-coded: success when complete, muted otherwise). Visual-only; no API/contract change. |
| **`#73`** | Visual polish: richer orange, notes padding + glow, tighter subtask gap, striped progress bar | `#73` | Deepened the `--status-in-progress` accent; added padding + a soft glow/surface to the notes textarea; pulled the subtask panel up to tighten the gap below the parent task; made the subtask progress track visible (`bg-line-soft`) and styled the completed portion with the `.blueprint-fill` hatched-blue hero style. Visual-only; no API/contract/test changes. |
| **`#74`** | Dashboard subtask parity | `#74` | Brought the dashboard "In progress" subtask list to board parity: a `[grip] [title] [CircleCheck toggle] [trash]` row with drag-to-reorder, reusing the existing `PATCH`/`DELETE /api/subtasks/[id]` and `POST /api/tasks/[id]/subtasks/reorder` endpoints. Title remains read-only on the dashboard (inline edit deferred). Tests updated to the button toggle + a delete case. |
| **`#75`** | Dashboard section reorder | `#75` | Added client-only drag-to-reorder for the dashboard Snapshot and In progress sections, persisted as `localStorage["wb.dashboard.section-order"]` with guarded preference helpers and tests. No API/schema changes. |
| **`#76`** | Recurring tasks — field plumbing | `#76` | Added the `RecurrencePattern` enum + `Task.recurrence` column (migration `add_task_recurrence`, default `NONE`), threaded it through `taskInputSchema`, `SerializedTask`/`serializeTask`, create/update, and the external v1 `externalTaskSchema` + `docs/openapi.yaml` + README. Additive contract change (Q5). No repeat/regeneration behavior yet — that lands in a follow-up slice. Ships with validator + data tests per Q1. |
| **`#77`** | Recurring tasks — spawn next on complete | `#77` | When a recurring task transitions to DONE (via `markTaskDoneForUser` or `updateTaskForUser`), spawn its next occurrence in the same transaction: same board/title/description/priority/recurrence, the source's pre-completion status, subtasks copied + reset to incomplete, and `dueDate` advanced by the interval from the previous due date (falling back to the completion date). Fires once, only on a non-DONE→DONE transition. Ships with data-layer tests per Q1. |
| **`#78`** | Recurring tasks — selector UI + card indicator | `#78` | Added a "Repeat" `<select>` (Does not repeat / Daily / Weekly / Monthly / Every 6 months / Annually) to the task detail modal, wired through the existing whole-task PATCH, and a `Repeat`-icon badge in `TaskMeta` when a task recurs. Completes the recurring-tasks feature (field #76, behavior #77, UI #78). UI only; ships with a detail-modal test. |
| **`#79`** | Enrich Up Next / Done status accents | `#79` | Deepened `--status-on-deck` (blue, "Up Next") and `--status-done` (green, "Done") in both themes; mirrors the earlier in-progress orange enrichment. Visual-only; no API/contract/test changes. |
| **`#80`** | Hatched active sidebar item | `#80` | The active sidebar nav item now uses the diagonal-hatch look: Dashboard hatched in blue (`.blueprint-fill`), and a board hatched in its own accent color via a new `.blueprint-hatch` overlay over the existing inline accent background. Visual-only; no API/contract/test changes. |
| **`#81`** | Editable board accent color — storage + sidebar surfacing | `#81` | Added a nullable `Board.accentColor` (migration `add_board_accent_color`) + a `boardAccentPalette` preset, threaded through `createBoardSchema`/`updateBoardSchema`, `createBoardForUser`/`updateBoardForUser`, and `getShellSnapshot`; the sidebar now uses `board.accentColor ?? getBoardAccentColor(slug)`. No picker UI yet (next slice). Internal-only (not in the external v1 contract). Ships with validator + data tests per Q1. |
| **`#82`** | Board accent-color palette picker (create + edit) | `#82` | Added a preset `boardAccentPalette` swatch picker to the New Board form (sidebar) and the Edit board modal; threaded `accentColor` through `BoardSnapshot`/`getBoardSnapshot` → `BoardTitleActions` to prefill the current color. Completes editable board colors (storage #81, picker #82). The sidebar reflects the chosen color (board-page/dashboard accents still use the derived palette — possible follow-up). |
| **`#83`** | Dashboard Snapshot uses stored board color | `#83` | The dashboard Snapshot card (donut segments + board-list dots) now uses each board's stored `accentColor` (falling back to the derived map) by threading `accentColor` into `DashboardSnapshot.boardBreakdown`. Additive/optional field; external v1 dashboard response strips it (unchanged contract). Data test per Q1. |
| **`#84`** | Task labels — backend + serialization | `#84` | Added a `TaskLabel` model (migration `add_task_label`) + `labelColorPalette`, a granular `POST /api/tasks/[id]/labels` + `DELETE /api/labels/[id]` (mirroring subtasks), `createLabelForTask`/`deleteLabelForUser`, and optional `SerializedTask.labels`. Internal-only (not in the external v1 contract). No UI yet (next slice). Ships with validator + data tests per Q1. |
| **`#85`** | Task labels — card chips + modal manager | `#85` | Render label chips on the board card (`TaskMeta`) and add a label manager (add with text + preset color, remove) to the detail modal, reconciling via the granular label API + `onTaskUpdated`. Completes per-task labels (backend #84, UI #85). |
| **`#86`** | Task checklist — backend + serialization | `#86` | Added a `ChecklistItem` model (migration `add_checklist_item`, RLS enabled), granular `POST /api/tasks/[id]/checklist` + `PATCH`/`DELETE /api/checklist/[id]` (mirroring subtasks), `create/update/deleteChecklistItemForUser`, and optional `SerializedTask.checklist`. Internal-only; modal-only surfacing comes in the next slice. Ships with validator + data tests per Q1. |
| **`#87`** | Task checklist — modal UI | `#87` | Added a Checklist section to the detail modal (add item, toggle complete via CircleCheck, delete), reconciling via the granular checklist API + `onTaskUpdated`. Modal-only — not rendered on the board card. Completes the checklist epic (backend #86, UI #87) and the task-detail feature set (labels #84/#85). |
| **`#88`** | Q4 amendment — permit Supabase Storage for attachments | `#88` | Documentation-only: carved a scoped exception into Q4 allowing `@supabase/supabase-js` Supabase **Storage** server-side (via `SUPABASE_SERVICE_ROLE_KEY`, private bucket, signed URLs) for the task-attachments feature; database stays Postgres-portable and Prisma remains the sole DB client; Realtime/Auth/Edge/RLS-policies and client-side supabase-js stay hard-fail. Unblocks the attachments epic. |
| **`#89`** | Task attachments — backend (Supabase Storage, signed upload) | `#89` | Added `@supabase/supabase-js` + a server-only `src/lib/storage.ts` (signed upload/download, remove) using `SUPABASE_SERVICE_ROLE_KEY` on a private bucket; `Attachment` model (migration `add_attachment`, RLS); `attachmentMeta`/`attachmentRecord` validators (≤10 MB, allowed MIME, ≤10/task); `createAttachmentRecord`/`deleteAttachmentForUser`/`getAttachmentForDownload`; routes for upload-url, record, signed download, delete; optional `SerializedTask.attachments` (no `storagePath` exposed). Per Q4 storage exception; internal-only. No UI yet. Tests mock storage (offline). Ships with validator + data tests per Q1. |
| **`#90`** | Task attachments — modal UI | `#90` | Added an Attachments section to the detail modal: upload (request signed URL → browser PUT to Supabase Storage → record), list, download (signed URL via the attachment endpoint), delete — reconciling via `onTaskUpdated`. The browser never uses supabase-js (plain fetch PUT to the server-minted URL). Completes the attachments epic (backend #89, UI #90) and the task-detail feature set (labels, checklist, attachments). |
| **`#91`** | Due-date timezone fix + no red on completed | `#91` | Treated stored UTC-midnight due dates as date-only (UTC) in `formatShortDate` and in the `isOverdue`/`isDueSoon` comparisons (fixes the −1 day display + overdue-threshold drift), and stopped completed tasks rendering the overdue-red badge via a `completedAt` guard. UI-only; storage (`parseDueDate`) and all contracts unchanged. Ships with a `formatShortDate` unit test + a board-workspace due-date component test per Q1. |
| **`#92`** | Pin esbuild to patched 0.28.1 (audit) | `#92` | Added an `overrides` pin forcing `esbuild@^0.28.1` (advisories GHSA-gv7w-rqvm-qjhr / GHSA-g7r4-m6w7-qqqr affect `0.17.0–0.28.0`; `0.28.1` is patched) so the transitive copies pulled by `vite`/`tsx` resolve to a non-vulnerable version, clearing all four high-severity dev-tooling findings and restoring a green `npm audit --audit-level=high` gate. Dev-only deps; no production-bundle impact. Mirrors the `#57` postcss override; no source/test changes. |
| **`#93`** | Editable task title in the detail modal | `#93` | Replaced the read-only title `<h2>` in `TaskDetailModal` with an inline-editable input that saves through the existing whole-task `saveField` → `PATCH /api/tasks/[id]` path (mirroring the modal's priority/due/description editors); empty/whitespace titles revert instead of saving. UI-only; no schema/validator/API/contract change (`title` already accepted, 1–180 chars). Ships with detail-modal title tests. |

### Active phase

_No PRs are currently in flight. The next slice will be added here before work begins, per the sequencing rule above._

### Standing Builder guardrails (post-PR-1)

The Q1 test-coverage rule has been enforceable since PR 1 (`#7`) merged. It applies to every PR going forward:

- Any PR that modifies `src/app/api/**`, `src/lib/data.ts`, `src/lib/validators.ts`, or `src/lib/auth.ts` must include test changes in the same PR. Adding a new external route, validator schema, or data-layer transaction without an accompanying test is an automatic Verifier reject.
- **No "tests come in a follow-up PR" PRs are accepted.** If a PR's test coverage is insufficient, the missing tests must be added to that same PR before merge.
- Documentation-only PRs (no changes outside `*.md` files) are exempt from the test-coverage rule but must still pass `npm run lint` if linting covers Markdown.
- **PR size is judged by review surface, not raw line count.** Test-harness, lockfile, and dependency-bootstrap PRs (e.g., `#7`, `#14`) are intentionally larger because they are gated by reviewer attention rather than by feature scope; small-PR discipline applies to feature and contract changes, not to one-time scaffolding.
- **Merged feature branches are deleted, remote and local.** Once a PR merges, its feature branch must not linger. The repository has GitHub's "Automatically delete head branches" setting enabled, so the remote branch is removed automatically on merge; the local branch is pruned by the standard pre-flight block at the start of the next slice (`git branch --merged main … | git branch -d`). No long-lived merged branches should accumulate in either location.
- **Every PR updates the Shipped ledger in its own diff.** A feature/fix PR must add its own row to the Shipped table (and clear itself from the Active phase) in the same PR that ships the change, so the ledger is never more than zero PRs behind. A drifted ledger is corrected by a dedicated documentation-only reconciliation slice (cf. `#20`, `#32`, and this PR), not allowed to compound.
- **Ledger entries are keyed by GitHub PR number from `#32` onward.** The internal "PR N" sequence was retired at PR 24 (`#31`); newer rows use the GitHub PR number as their identifier.

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
- Request and response shapes are modeled with Zod; input types are inferred from schemas in `src/lib/validators.ts`, and external API responses are validated with schemas from `src/lib/external-contract.ts` through `externalApiJson` in `src/lib/external-api.ts` (`src/app/api/external/v1/dashboard/route.ts`).
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
- **Not a native mobile app within this codebase** — the planned native mobile experience will be a separate-repo consumer of `/api/external/v1/*`. This repo will house only the web app and the API; native mobile code (React Native, Swift, Kotlin) is forbidden here. The external API will evolve to support per-user authentication and read/write operations as the mobile app's needs are defined. Any such evolution must be proposed as its own PR with an updated entry in the "Active phase" section above and an explicit Q5 update covering the new auth model; it must not be smuggled into an unrelated PR.
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
- Add smoke tests for the homepage and external daily-summary API.
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

**Answer: Node 22.11.x, enforced across three pin sites.**

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

**Storage exception (task attachments).** File attachments are stored in **Supabase Storage** — a deliberate, scoped exception to the database-portability stance above: *file storage* is coupled to Supabase, the *database* is not. Rules for this exception:
- `@supabase/supabase-js` may be imported **only** in server-side storage helpers (e.g. `src/lib/storage.ts`) and the attachment API routes — never in a client component, and never for database access (Prisma remains the sole DB client).
- All access uses the server-only `SUPABASE_SERVICE_ROLE_KEY` (plus `SUPABASE_URL` and a bucket-name env var). The service-role key must never reach the client; client upload/download flows go through the app's own API routes or short-lived, server-minted signed URLs against a **private** bucket.
- This is the only sanctioned use of `supabase-js`. Supabase Realtime, Auth, Edge Functions, and Supabase-managed RLS policies remain out of scope.

**Sequencing / required corrections:**
- README: change "Prisma 6 with **Supabase Postgres** persistence" to "Prisma 6 with **PostgreSQL** persistence (currently hosted on Supabase)".
- README "Supabase Database Setup" section: rename to "Database Setup" and reframe Supabase as a recommended example, not the only path.

**Verifier behavior:**
- **Hard-fail** any PR that introduces Supabase RLS policies, or calls to Supabase Realtime / Edge Functions / Auth, or uses `supabase-js` for database access (Prisma is the sole DB client).
- **Allow** `@supabase/supabase-js` **only** in server-side storage helpers / attachment API routes for the task-attachments feature (per the "Storage exception" above), via `SUPABASE_SERVICE_ROLE_KEY`. **Hard-fail** if a Supabase storage client or the service-role key is imported into a client component, if `supabase-js` is used for anything other than Storage, or if the attachments bucket is public.
- **Hard-fail** any PR that adds Postgres extensions Supabase doesn't support, or that bumps the schema beyond Postgres 15 features.
- **Warn** if a PR adds connection-string handling beyond the existing `DATABASE_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` set.

### Q5. Is the external API intended to be a stable private integration contract, or a one-off endpoint for the current external consumer?

**Answer: Stable versioned external API; v1 expanded across four endpoints.**

`/api/external/*` is a versioned stable contract (v1 today, path-based versioning). The v1 contract under `/api/external/v1/*` is the only supported external surface, serving both the current briefing job consumer and the future second consumer.

**Sequencing / required corrections (all completed):**
- Shared module `src/lib/external-api.ts` exists and is the canonical helper for external v1 routes (shipped in `#8`).
- Routes `/api/external/v1/dashboard`, `/api/external/v1/boards`, and `/api/external/v1/boards/[slug]` are live (shipped in `#8`); `/api/external/v1/daily-summary` predates the v1 expansion.
- README OpenAPI section covers all four v1 endpoints (shipped in `#8`).
- `docs/openapi.yaml` is the authoritative machine-readable contract for all four v1 endpoints, generated from `src/lib/external-contract.ts`; README provides the human-readable summary (shipped in `#10`).
- `www.roymcfarland.news` briefing job migrated to `EXTERNAL_API_KEY` and the v1 endpoints (PR 3, in the `agentic-daily-briefing` repo).
- Legacy `/api/external/daily-summary` alias and the entire `/api/read-only/*` surface deleted from the codebase and from Vercel; `READ_ONLY_API_KEY` and `READ_ONLY_USER_ID` env vars removed (shipped in `#9`).

The Verifier rules below remain in force.

**Verifier behavior:**
- **Hard-fail** any PR that changes the response shape of any `/api/external/v1/*` endpoint without the matching `docs/openapi.yaml` update and a PR description note confirming consumer coordination.
- **Hard-fail** any PR that removes the `force-dynamic`, `revalidate = 0`, or `Cache-Control: no-store` directives on external routes.
- **Hard-fail** any PR that introduces a new external endpoint outside the `/api/external/v{N}/` namespace.
- **Hard-fail** any PR that re-introduces `READ_ONLY_API_KEY` or the `/api/external/daily-summary` route. The v1 contract under `/api/external/v1/*` is the only supported external surface.
- **Warn** on additive changes (new fields).

---

### Q6. How should Builder agents handle changes outside their prompt's stated scope?
**Answer: Out-of-scope changes must be either declared in the PR body or split into a separate PR.**
Builder agents (Codex and similar) sometimes ship correct-but-unauthorized changes adjacent to the prompt's stated scope. PR #13 included a `bumpBucket` SQL rewrite that was not in the Builder prompt; on inspection the rewrite was a latent-bug fix, but the precedent is dangerous because the next out-of-scope change might be a regression rather than a fix. To preserve auditability and Verifier discipline, every PR's diff must be either fully covered by its Builder prompt or explicitly declared.
**Verifier behavior:**
- **Hard-fail** any PR whose diff includes file changes outside the Builder prompt's stated scope AND that are not enumerated in an "Out-of-scope changes (justified)" section in the PR body.
- **Warn** if the "Out-of-scope changes (justified)" section is present but the justification is missing, perfunctory ("cleanup," "refactor"), or contradicted by the diff.
- The Builder prompt MAY explicitly authorize broader latitude (e.g., "you may refactor adjacent helpers if needed for the new API"); changes that fall under such an authorization are in-scope by definition.
- This rule applies to all PRs from the date of merge forward; existing merged PRs are not retroactively in violation.

---

## Authority and precedence

When agents encounter conflicts between this document and other files in the repository, the order of authority is:

1. **This PROJECT.md** (authoritative for intent, scope, non-goals, and the resolved open questions above).
2. **`AGENTS.md`** (authoritative for tactical execution: how to run the app locally, required services, and dev environment gotchas).
3. **`README.md`** (authoritative for human-facing contributor conventions and API contracts not covered here).
4. **`package.json`, schema files, CI config** (authoritative for the technical facts they encode, subject to corrections required by this document).
5. **Inline code comments** (lowest authority; must be corrected when they contradict the above).

Any PR that surfaces a conflict between these sources must resolve the conflict in the same PR, not defer it.

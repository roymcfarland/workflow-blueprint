# Night Mode Design Audit Handoff

> **Status: RESOLVED — archived 2026-07-07.** The token-system refactor this audit prescribes shipped in the theming passes that followed it: `src/app/globals.css` now defines the full semantic token set (`--text-*`, `--line-*`, `--surface-*`, per-status accents) for both themes, component-level `dark:` patches were eliminated, and a live-pixel verification against production (2026-07-07) scored all six acceptance criteria below as passing. Residual polish (class-based `dark:` variant wiring, demo-banner night surface, hatched completion bar) shipped in `#125`. Kept for historical context; do not treat as open work.

## Summary

Night mode is technically functional, but visually it feels like the day theme was tinted darker instead of redesigned. The main issue is not one component: the global tokens, blueprint paper effects, and repeated `dark:bg-paper-strong` overrides all push the UI toward a heavy blue-on-blue surface with low hierarchy and muddy contrast.

The next pass should treat this as a small theme-system refactor, not a set of isolated color tweaks.

## Primary Findings

1. The dark palette is too monochromatic.
   - File: `src/app/globals.css`
   - Current night tokens use dark navy surfaces plus pale blue ink (`--ink: #9ab7ff`) nearly everywhere.
   - This makes headings, borders, icons, buttons, and active UI all compete in the same hue family.
   - Recommendation: separate text, border, brand/action, and decorative blueprint-grid roles. `--ink` should not carry every semantic job in dark mode.

2. Dark surfaces are visually heavy and layered too often.
   - Files: `src/app/globals.css`, `src/components/blueprint/card.tsx`, `src/components/board-workspace.tsx`, `src/components/dashboard-overview.tsx`
   - `.blueprint-surface-strong` adds a strong blue gradient over already dark `--paper`/`--paper-strong`.
   - Many components add `dark:bg-paper-strong`, creating stacked dark cards with little depth difference.
   - Recommendation: define explicit surface levels, for example `--surface-base`, `--surface-raised`, `--surface-control`, and use them through shared primitives.

3. The blueprint grid is too prominent in night mode.
   - File: `src/app/globals.css`
   - `--grid` and `--grid-strong` are pale blue on a navy field, which can look noisy behind cards and sidebars.
   - Recommendation: reduce grid opacity in dark mode and make the grid cooler/neutral. The grid should support the blueprint metaphor without becoming the dominant texture.

4. Accent and success states need semantic dark variants.
   - Files: `src/app/globals.css`, `src/components/board-workspace.tsx`
   - `--accent` and status colors are reused from light-mode mental models. Some, like yellow `IN_PROGRESS`, become loud against dark navy.
   - Recommendation: introduce dark-mode status tokens or CSS variables for status accents. Avoid hard-coded status hex values inside the component if the theme needs to evolve.

5. Text hierarchy is flattened.
   - Files: `src/app/globals.css`, `src/components/blueprint/page-title.tsx`, `src/components/app-shell.tsx`
   - `text-ink` is used for headings, body emphasis, icons, active states, and borders. In night mode this reads as neon-blue text everywhere.
   - Recommendation: add separate variables for `--text-primary`, `--text-muted`, `--line-strong`, `--line-soft`, and `--brand`. Map Tailwind theme colors to those roles.

6. White utility classes leak into dark interaction states.
   - Files: many TSX files, especially `src/components/app-shell.tsx`, `src/components/board-workspace.tsx`, `src/components/dashboard-overview.tsx`
   - Common patterns like `hover:bg-white/70`, `bg-white/80`, and `bg-white/90` are manually patched with some `dark:*` overrides, but not consistently.
   - Recommendation: move repeated card/control/hover styling into component primitives or CSS utility classes, then consume those primitives from feature components.

## Recommended Implementation Plan

1. Redefine global dark tokens in `src/app/globals.css`.
   - Add semantic tokens for text, borders, surfaces, controls, brand, accent, danger, success, and grid.
   - Preserve current light-mode behavior as much as possible.

2. Update blueprint primitives first.
   - `src/components/blueprint/button.tsx`
   - `src/components/blueprint/input.tsx`
   - `src/components/blueprint/textarea.tsx`
   - `src/components/blueprint/card.tsx`
   - `src/components/blueprint/pill-toggle.tsx`
   - `src/components/blueprint/checkbox.tsx`
   - Goal: most feature components should stop needing local `dark:bg-*` patches.

3. Move status colors out of `board-workspace.tsx`.
   - Replace `statusAccentColors` hard-coded hex values with a domain helper or CSS variable map.
   - Add dark-mode equivalents for statuses that are too saturated on dark surfaces.

4. Audit the highest-traffic screens visually.
   - Login/sign-up landing
   - Dashboard
   - Board view
   - List view
   - Task drawer
   - Admin invitations
   - Profile

5. Verify contrast and usability.
   - Body text should be comfortable at small sizes.
   - Controls should have visible focus rings.
   - Active navigation and active segmented controls should not rely only on hue.
   - Kanban task cards should feel raised but not glowing.

## Suggested Acceptance Criteria

- Night mode feels intentionally designed, not like dimmed day mode.
- The app avoids a one-note navy/blue palette.
- Board status colors remain recognizable but are calmer on dark surfaces.
- Cards, controls, notes, and drawers have clear depth levels.
- Text hierarchy is obvious at a glance on dashboard and board pages.
- Light mode remains visually unchanged except where shared primitive cleanup improves consistency.

## Files To Start With

- `src/app/globals.css`
- `src/components/blueprint/button.tsx`
- `src/components/blueprint/card.tsx`
- `src/components/blueprint/input.tsx`
- `src/components/blueprint/textarea.tsx`
- `src/components/blueprint/pill-toggle.tsx`
- `src/components/blueprint/checkbox.tsx`
- `src/components/app-shell.tsx`
- `src/components/board-workspace.tsx`
- `src/components/dashboard-overview.tsx`

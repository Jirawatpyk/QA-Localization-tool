# Story 4.1d: Responsive Layout

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a QA Reviewer,
I want the review interface to adapt gracefully to different screen sizes,
So that I can review on various displays without losing critical functionality.

## Acceptance Criteria

### AC1: Full 3-Column at >= 1440px (Desktop / Dual Monitor)

**Given** the review view at >= 1440px viewport width
**When** the page renders
**Then** the full 3-column fixed layout displays: file navigation (left, w-60) | finding list (center, flex-1) | detail panel (right, 400px fixed)
**And** all three zones are visible simultaneously — detail panel renders as a **static `<aside>`** (not Radix Sheet overlay)
**And** the layout uses CSS Flexbox (`flex h-full`) consistent with current implementation

### AC2: 2-Column at >= 1024px (Laptop / Single Monitor)

**Given** the review view at 1024px-1439px viewport width
**When** the page renders
**Then** the file navigation zone collapses — replaced by a file dropdown selector at the top of the finding list area
**And** the finding list takes full remaining width
**And** the detail panel width = 360px and displays as a Radix Sheet overlay with a backdrop scrim (semi-transparent overlay behind the panel)
**And** clicking the scrim closes the detail panel

### AC3: Single Column at < 768px (Mobile / Small Tablet)

**Given** the review view below 768px viewport width
**When** the page renders
**Then** only the finding list is visible (single column)
**And** the detail panel is a Radix Sheet drawer accessible via a toggle button (width = 300px when open)
**And** the MobileBanner (already rendered in parent `(app)/layout.tsx`) shows: "For the best review experience, use a desktop browser"
**And** FindingCard expansion uses 150ms ease-out slide animation

### AC4: Detail Panel Dual Rendering Strategy

**Given** the detail panel responsive behavior
**When** viewed at >= 1440px: detail panel renders as a **static `<aside>` flex child** (width = 400px, always visible, NOT a portal/overlay)
**When** viewed at 1024-1439px: detail panel renders as **Radix Sheet** (width = 360px, overlay with scrim, opens on finding select)
**When** viewed at < 1024px: detail panel renders as **Radix Sheet** (width = 300px, hidden drawer, toggle button to open/close)
**And** closing behavior for Sheet modes: Esc key, scrim click (1024-1439px), or close button
**And** the static aside mode (>= 1440px) syncs content to the selected finding — shows empty state when no finding selected

### AC5: Animation & Motion Compliance (Guardrail #37)

**Given** FindingCard expansion animation and detail panel transitions
**When** `prefers-reduced-motion: reduce` is active
**Then** all animations are instant (no transition)
**When** reduced-motion is not active
**Then** FindingCard expansion: 150ms ease-out slide
**And** detail panel Sheet open/close: 200ms ease-in-out
**And** scrim fade: 150ms ease-in

### AC6: Accessibility Compliance Across Breakpoints

**Given** ARIA landmarks on the review page (Guardrail #38)
**When** the layout adapts at any breakpoint
**Then** `<nav>` (file navigation) retains `aria-label="File navigation"` — at 1024-1439px the dropdown still has the same landmark
**And** `<main>` content (finding list) retains `role="grid"` structure
**And** `role="complementary"` (detail panel) is maintained regardless of display mode (static aside / overlay / drawer)
**And** keyboard navigation (J/K, Enter/Esc, Tab order) works identically at all breakpoints >= 768px
**And** touch targets are >= 44x44px on tablet (768-1023px) — including `FindingCardCompact` quick-action buttons
**And** focus trap in detail panel overlay/drawer mode works correctly (Tab cycles within panel when open)
**And** at >= 1440px (static aside), Tab can move between finding list and detail panel naturally (no focus trap)
**And** scrim backdrop contrast meets WCAG: `bg-black/50` (same as existing Sheet overlay) (Guardrail #26)
**And** color is never the sole information carrier across all responsive states (Guardrail #25)

## Tasks / Subtasks

- [x] Task 0: Prerequisites (AC: all)
  - [x] 0.1 Verify Stories 4.0, 4.1a, 4.1b, 4.1c are `done` in sprint-status
  - [x] 0.2 Run `npm run type-check && npm run test:unit` — baseline green
  - [x] 0.3 Read existing components: `ReviewPageClient.tsx` (line 278: 3-zone flex div), `FindingDetailSheet.tsx`, `FindingList.tsx`, `MobileBanner`, `DetailPanel`, `ReviewLayout`, `sheet.tsx` (line 59: `sm:max-w-sm` constraint)
  - [x] 0.4 Review tokens.css layout tokens: `--detail-panel-width: 400px`, `--sidebar-width: 240px`
  - [x] 0.5 Verify `max-w-[var(--content-max-width)]` constraint from `(app)/layout.tsx:31` — review page is nested inside this 1400px cap

- [x] Task 1: Create `useMediaQuery` hook (AC: 1, 2, 3, 4)
  - [x] 1.1 Create `src/hooks/useMediaQuery.ts` — reusable hook wrapping `window.matchMedia` (use existing `useReducedMotion.ts` as implementation template — same matchMedia pattern)
  - [x] 1.2 Returns boolean `matches` state, SSR-safe (defaults to `false` on server)
  - [x] 1.3 Cleanup listener on unmount
  - [x] 1.4 Create convenience hooks: `useIsDesktop()` (>= 1440px), `useIsLaptop()` (>= 1024px), `useIsMobile()` (< 768px)
  - [x] 1.5 Unit test: `src/hooks/useMediaQuery.test.ts` — mock `window.matchMedia`, verify listener attach/detach, SSR fallback

- [x] Task 2: Add responsive layout tokens + fix max-width constraint (AC: 1, 2, 3, 4)
  - [x] 2.1 Add to `src/styles/tokens.css` under `@theme`:
    ```
    --detail-panel-width-laptop: 360px;
    --detail-panel-width-tablet: 300px;
    ```
    (Keep existing `--detail-panel-width: 400px` for the >= 1440px default)
  - [x] 2.2 DO NOT add custom breakpoints — use standard Tailwind breakpoints (`lg:`, `md:`) and JS `useMediaQuery` for 1440px threshold
  - [x] 2.3 Fix `max-w` constraint: modify `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` — the `<div className="p-6">` wrapper constrains the review page within the parent's `max-w-[1400px]`. Either (a) add `max-w-none` class on the review page wrapper, or (b) move the review page outside the max-width container. The 3-zone layout at 1440px needs: 240px (nav) + flex-1 + 400px (panel) = minimum ~800px, which fits in 1400px, BUT at wider viewports (1920px+) the layout should expand. Verify and fix if needed.

- [x] Task 3: Responsive ReviewPageClient layout (AC: 1, 2, 3)
  - [x] 3.1 Import `useIsDesktop`, `useIsLaptop` hooks
  - [x] 3.2 **>= 1440px (desktop)**: Keep Zone 1 (file nav sidebar) + Zone 2 (finding list). REPLACE Zone 3 (Radix Sheet) with **static `<aside>`** containing the same detail panel content. See Task 5 for dual rendering.
  - [x] 3.3 **1024px-1439px (laptop)**: hide Zone 1, render `FileNavigationDropdown` above finding list. Detail panel = Radix Sheet overlay (existing behavior).
  - [x] 3.4 **< 1024px (tablet/mobile)**: hide file nav entirely, show only finding list. Detail panel = Radix Sheet drawer with toggle button.
  - [x] 3.5 **< 768px**: MobileBanner already visible from parent layout. Finding list still renders.
  - [x] 3.6 Maintain `data-testid="review-3-zone"` on root div for E2E anchoring
  - [x] 3.7 Unit test: `ReviewPageClient.responsive.test.tsx` — mock `useMediaQuery` to verify zone rendering at each breakpoint

- [x] Task 4: Responsive File Navigation — dropdown mode (AC: 2)
  - [x] 4.1 Create `FileNavigationDropdown` component at `src/features/review/components/FileNavigationDropdown.tsx`
  - [x] 4.2 Props: `currentFileName: string` (display only — actual file switching is future story)
  - [x] 4.3 Renders a button showing current file name with chevron icon
  - [x] 4.4 NOTE: File navigation is currently a placeholder (Zone 1 shows "File navigation coming soon"). The dropdown will also be a placeholder showing current file name only. Real file switching deferred to a future story
  - [x] 4.5 `aria-label="File navigation"` retained on the wrapper `<nav>` element (same landmark as sidebar nav)
  - [x] 4.6 Unit test: renders, shows file name, has correct ARIA landmark

- [x] Task 5: Responsive Detail Panel — dual rendering (AC: 4, 5, 6) **[KEY TASK]**
  - [x] 5.1a **Static aside mode (>= 1440px)**: Inline in ReviewPageClient — renders `<aside role="complementary">` with FindingDetailContent as a flex child. Width = `var(--detail-panel-width)` (400px). Always visible. Shows empty state when no finding selected. No focus trap.
  - [x] 5.1b **Overlay mode (1024-1439px)**: FindingDetailSheet with `className="max-w-[var(--detail-panel-width-laptop)]"` (360px). SheetOverlay provides scrim. Auto-opens on finding select.
  - [x] 5.1c **Drawer mode (< 1024px)**: Same Radix Sheet with `max-w-[var(--detail-panel-width-tablet)]` (300px). Toggle button (PanelRight icon) visible when finding selected but panel closed.
  - [x] 5.2 Extract shared detail panel content into a `FindingDetailContent` component that both aside and Sheet render — DRY, no content duplication
  - [x] 5.3 Scrim click: SheetOverlay handles `onOpenChange(false)` — verified
  - [x] 5.4 Esc key: Radix Sheet handles Esc in overlay/drawer modes. Static aside does NOT intercept Esc
  - [x] 5.5 Animation: Respect `prefers-reduced-motion` via `useReducedMotion()` — if reduced, override Sheet transition with `duration-0 animate-none`
  - [x] 5.6 Maintain `role="complementary"` and `aria-label` in both static aside and Sheet modes
  - [x] 5.7 Unit tests: FindingDetailContent.test.tsx (5 tests) + ReviewPageClient.responsive.test.tsx (6 tests)

- [x] Task 6: FindingCard expansion animation (AC: 5)
  - [x] 6.1 Added CSS transition on expand/collapse: `transition-all duration-150 ease-out`
  - [x] 6.2 Use `useReducedMotion()` — if true, `duration-0` (instant)
  - [x] 6.3 Verified existing FindingCard had no animation
  - [x] 6.4 Unit test: FindingCard.animation.test.tsx (4 tests) — animation class applied + reduced-motion disables

- [x] Task 7: Touch target sizing for tablet (AC: 6)
  - [x] 7.1 Audited FindingCardCompact quick-action buttons
  - [x] 7.3 Added responsive touch targets: `lg:p-0.5 p-2.5 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0`
  - [x] 7.5 Verified color + icon + text label triple for severity (SeverityIndicator.tsx)
  - [x] 7.6 No unit test needed — visual/CSS only

- [ ] Task 8: E2E Tests — Responsive layout (AC: 1, 2, 3, 4)
  - [x] 8.1 Create `e2e/review-responsive.spec.ts` — 30 ATDD stubs created
  - [ ] 8.2-8.8 E2E stubs remain `test.skip` — requires running app + Playwright infrastructure (TD entry if not activated before story close)

- [x] Task 9: Integration Verification (AC: all)
  - [x] 9.1 `npm run type-check` — 0 errors
  - [x] 9.2 `npm run lint` — 0 errors
  - [x] 9.3 `npm run test:unit` — 3180+ pass, 27 new ATDD tests green. 3 pre-existing flaky failures (TaxonomyManager, ProjectTour) unrelated to this story
  - [x] 9.4 `npm run build` — succeeds
  - [ ] 9.5 Manual: open review page at 1440px, 1200px, 768px, 375px — deferred (requires running dev server)
  - [ ] 9.6 Manual: verify `prefers-reduced-motion` disables all transitions — deferred (requires running dev server)

## Dev Notes

### Architecture Decision: Dual Rendering for Detail Panel (C2 Fix)

The current `FindingDetailSheet` is a Radix Sheet (portal-based overlay) that only opens when a finding is selected. AC1 requires "all three zones visible simultaneously without overlay" at >= 1440px. A Sheet is fundamentally an overlay — it cannot be a static layout child.

**Decision: Dual rendering strategy.**
- **>= 1440px**: Render detail panel content as a static `<aside>` flex child (like global `DetailPanel` at `src/components/layout/detail-panel.tsx:19-34` does at `2xl:`). No Radix Sheet, no portal, no overlay.
- **< 1440px**: Render as Radix Sheet (overlay at 1024-1439px, drawer below 1024px).

Implementation: Extract detail panel content into `FindingDetailContent` component. Both `FindingDetailAside` (static) and `FindingDetailSheet` (overlay) render this same content component. Conditional rendering in `ReviewPageClient` based on `useIsDesktop()`.

### Architecture Decision: Breakpoint Strategy

The Epic AC specifies 1440px as the full-desktop threshold, but 1440px is NOT a standard Tailwind CSS v4 breakpoint. Standard breakpoints: `md:768`, `lg:1024`, `xl:1280`, `2xl:1536`.

**Decision: Use JS `useMediaQuery` for the 1440px threshold + standard Tailwind classes for CSS-only responsive.**

Rationale:
- CLAUDE.md anti-pattern: "arbitrary Tailwind breakpoints" — `min-[1440px]:` is forbidden
- Adding `--breakpoint-3xl: 1440px` to `@theme` is technically valid but introduces a non-standard breakpoint
- `useMediaQuery(1440px)` in JS gives precise control for the layout switch between 3-column and 2-column
- Standard Tailwind classes (`lg:`, `md:`) handle the remaining CSS responsive patterns cleanly

**Breakpoint mapping:**
| Viewport | JS Hook | Layout | Detail Panel Mode |
|----------|---------|--------|-------------------|
| >= 1440px | `useIsDesktop()` | 3-column fixed | Static `<aside>` 400px |
| 1024-1439px | `useIsLaptop()` | 2-column + dropdown | Sheet overlay 360px |
| 768-1023px | — | single column | Sheet drawer 300px |
| < 768px | `useIsMobile()` | single column + banner | Sheet drawer 300px |

### Architecture Decision: UX Spec Deviation (C3 Fix)

The UX responsive spec (`responsive-design-accessibility.md`) defines a 4-tier system (1440/1280/1024/768) while the Epic 4 AC for Story 4.1d defines a 3-tier system (1440/1024/768), merging the 1280-1439 and 1024-1279 ranges into one tier.

Additional deviations from UX spec:
- UX spec says "sidebar collapses to icon-only (48px)" at 1024px; Epic AC says "file list collapsed to dropdown" — **Epic AC is the authority**
- UX spec says detail panel at 768px is "bottom sheet"; Epic AC says "overlays above list" — **Epic AC refines to drawer (see next decision)**

**Decision: Follow Epic AC (3-tier), not UX spec (4-tier).** Epic AC was written after UX spec and represents a deliberate simplification for MVP scope.

### Architecture Decision: Drawer vs "Overlays Above" at < 768px (C5 Fix)

The Epic 4 AC says `<768px: single column, detail panel overlays above list`. This story implements it as a "hidden drawer accessible via toggle button" which is a practical refinement:
- "Overlays above" is ambiguous (top overlay? full-screen?)
- A right-side drawer with toggle is consistent with the overlay behavior at 1024-1439px
- The toggle button gives explicit user control rather than auto-display

**Decision: Drawer with toggle button at < 768px.** This is an intentional AC refinement for consistency and usability.

### Architecture Decision: max-width Constraint (C4 Fix)

The `(app)/layout.tsx:31` applies `max-w-[var(--content-max-width)]` (1400px) to the main content area. The review page is nested inside this constraint. At 1440px viewport, the review content area (after sidebar) is limited to 1400px, which is sufficient for the 3-zone layout (240 + flex + 400 = 640px for side panels, 760px for findings). At wider viewports (1920px+), the 1400px cap prevents expansion.

**Decision: Accept the 1400px constraint for MVP.** The minimum usable width (1440px) fits within 1400px content area. If wider viewport support is needed, the `page.tsx` wrapper can add `max-w-none` class — but this is not required for AC compliance. Task 2.3 includes verification of this.

### SheetContent `sm:max-w-sm` Override (C1 Fix)

The shadcn Sheet component (`src/components/ui/sheet.tsx:59`) applies `sm:max-w-sm` (= 384px = 24rem) to right-side `SheetContent`. This caps the sheet at 384px, which is less than the required 400px (desktop) and 360px (laptop).

**Fix:** Pass `className` to override: `className="max-w-[var(--detail-panel-width-laptop)]"` at 1024-1439px, or `className="max-w-[var(--detail-panel-width-tablet)]"` below 1024px. Note: at desktop (>= 1440px) the Sheet is not used (static aside), so this override only applies to overlay/drawer modes.

The `w-3/4` base width + `sm:max-w-sm` cap means: below 640px the sheet is 75% width, above 640px it's capped at 384px. Our overrides set explicit max-width values that supersede `sm:max-w-sm`.

### Current Code Reality (DO NOT rebuild)

1. **ReviewPageClient.tsx** (408 lines) — 3-zone flex layout. Line 278: `<div className="flex h-full" data-testid="review-3-zone">`. Zone 1 (line 280): `<nav className="w-60 border-r shrink-0">`. Zone 2 (line 286): `<div className="flex-1">`. Zone 3 (line 393): `<FindingDetailSheet>` (Radix Sheet portal). **Modify** for conditional zone rendering.

2. **FindingDetailSheet.tsx** — shadcn Sheet (`side="right"`), controlled by `selectedId !== null` from store. Contains: metadata, segment context, action buttons. **Extract content to shared component, keep Sheet for < 1440px only.**

3. **sheet.tsx** (shadcn) — Line 59: right-side applies `w-3/4 sm:max-w-sm` (384px cap). Line 33: overlay uses `bg-black/50`. **DO NOT modify the base component** — override via className prop.

4. **MobileBanner** — at `src/components/layout/mobile-banner.tsx`. ALREADY rendered in `(app)/layout.tsx:18` with `md:hidden`. **DO NOT duplicate.**

5. **DetailPanel** (global) — at `src/components/layout/detail-panel.tsx`. Uses pattern: `hidden 2xl:block` for static aside, overlay below `2xl:`. Driven by `useUIStore.detailPanelOpen`. Review page does NOT use this. Both coexist in DOM but states are independent — no conflict. **DO NOT modify.**

6. **ReviewLayout** — at `(app)/projects/[projectId]/review/layout.tsx`. `<div className="h-full w-full">`. Does NOT actually escape the parent `max-w` constraint. **No changes needed** (see C4 decision).

7. **useReducedMotion()** — at `src/hooks/useReducedMotion.ts`. Uses `window.matchMedia('(prefers-reduced-motion: reduce)')`. **Reuse** for animation gating. Also serves as **implementation template** for `useMediaQuery`.

8. **tokens.css layout tokens:**
   ```
   --detail-panel-width: 400px;   /* >= 1440px, static aside */
   --sidebar-width: 240px;        /* file nav sidebar */
   --sidebar-width-collapsed: 48px;
   --content-max-width: 1400px;
   ```
   **Add** `--detail-panel-width-laptop: 360px` and `--detail-panel-width-tablet: 300px`.

9. **Route note:** CLAUDE.md project structure shows `review/[sessionId]/` but actual route is `review/[fileId]/`. The Epic 4 Gap Analysis documents this under "Route Decision" — use `[fileId]`.

### File Navigation — Placeholder Awareness

Zone 1 (File Navigation) is currently a PLACEHOLDER:
```tsx
<nav aria-label="File navigation" className="w-60 border-r shrink-0 overflow-y-auto p-4">
  <h2 className="text-sm font-semibold text-muted-foreground mb-2">Files</h2>
  <p className="text-xs text-muted-foreground">File navigation coming soon.</p>
</nav>
```

For this story:
- At >= 1440px: show the placeholder sidebar as-is (stub content is fine)
- At 1024-1439px: replace with `FileNavigationDropdown` component (also placeholder — shows current file name only)
- At < 1024px: hide entirely

Real file switching functionality is **NOT in scope** for this story.

### DO NOT DO (Consolidated)

1. **DO NOT duplicate MobileBanner** — already rendered in parent `(app)/layout.tsx`
2. **DO NOT modify the global `DetailPanel`** (`src/components/layout/detail-panel.tsx`) — review uses its own panel
3. **DO NOT modify `sheet.tsx`** base component — override via className prop
4. **DO NOT add custom Tailwind breakpoints** (`min-[1440px]:` or `--breakpoint-3xl`) — use JS `useMediaQuery`
5. **DO NOT create a new Sheet component** — reuse existing shadcn Sheet, extend with className
6. **DO NOT use `announce()` for layout changes** — layout transitions are visual only, not screen-reader announcements (remove from reuse table if not needed in any task)

### Coding Guardrails (Critical for this story)

- **Guardrail #25**: Color never sole information carrier — verify severity display works at all responsive states
- **Guardrail #26**: Contrast ratio verification — scrim backdrop, tinted state backgrounds must pass at all breakpoints
- **Guardrail #27**: Focus indicator 2px indigo, 4px offset — MUST work in static aside, overlay, and drawer modes
- **Guardrail #30**: Modal focus trap + restore — detail panel in Sheet overlay/drawer mode MUST trap focus. Static aside at desktop: NO focus trap (Tab naturally moves between zones)
- **Guardrail #31**: Escape key hierarchy — Sheet overlay closes on Esc (one layer). Static aside: Esc does NOT close
- **Guardrail #37**: ALL animations MUST respect `prefers-reduced-motion`. Use `useReducedMotion()` for JS, `@media (prefers-reduced-motion: reduce)` for CSS
- **Guardrail #38**: ARIA landmarks MUST be maintained at all breakpoints. `<nav>` for file nav, finding list `role="grid"`, `role="complementary"` for detail panel (both modes)
- **Guardrail #40**: No focus stealing on mount — layout change on resize MUST NOT steal focus

### Existing Infrastructure (Reuse)

| Component | Path | Reuse |
|-----------|------|-------|
| `useReducedMotion` | `src/hooks/useReducedMotion.ts` | Animation gating + template for useMediaQuery |
| `MobileBanner` | `src/components/layout/mobile-banner.tsx` | Already in parent layout |
| `FindingDetailSheet` | `src/features/review/components/FindingDetailSheet.tsx` | Extract content, keep Sheet for < 1440px |
| `ReviewPageClient` | `src/features/review/components/ReviewPageClient.tsx` | Modify for responsive zones |
| `DetailPanel` (global) | `src/components/layout/detail-panel.tsx` | Pattern reference for static-aside-at-desktop |
| `Sheet` (shadcn) | `src/components/ui/sheet.tsx` | Detail panel base for < 1440px |
| `Button` (shadcn) | `src/components/ui/button.tsx` | Toggle button |
| `cn()` utility | `src/lib/utils.ts` | Conditional classes |

### Project Structure Notes

New files (5-6):
- `src/hooks/useMediaQuery.ts` — reusable media query hook
- `src/hooks/useMediaQuery.test.ts` — unit test
- `src/features/review/components/FileNavigationDropdown.tsx` — placeholder dropdown
- `src/features/review/components/FindingDetailContent.tsx` — shared detail panel content (extracted from FindingDetailSheet)
- `src/features/review/components/ReviewPageClient.responsive.test.tsx` — responsive unit tests
- `e2e/review-responsive.spec.ts` — E2E viewport tests

Modified files (4):
- `src/features/review/components/ReviewPageClient.tsx` — conditional zone rendering + static aside at desktop
- `src/features/review/components/FindingDetailSheet.tsx` — extract content to shared component, override max-w for responsive width
- `src/styles/tokens.css` — add `--detail-panel-width-laptop`, `--detail-panel-width-tablet`
- `src/features/review/components/FindingCard.tsx` or `FindingList.tsx` — expansion animation

### References

- [Source: Epic 4 — Story 4.1d AC] `_bmad-output/planning-artifacts/epics/epic-4-review-decision-workflow.md#line-113`
- [Source: UX Responsive Spec] `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md`
- [Source: Accessibility Baseline] `_bmad-output/accessibility-baseline-2026-03-08.md`
- [Source: Keyboard/Focus Spike] `_bmad-output/planning-artifacts/research/keyboard-focus-spike-2026-03-08.md`
- [Source: WCAG Guardrails] `_bmad-output/planning-artifacts/research/epic-4-proactive-guardrails-2026-03-08.md`
- [Source: Story 4.1c Detail Panel] `_bmad-output/implementation-artifacts/4-1c-detail-panel-segment-context.md`

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- TS `exactOptionalPropertyTypes` error on FindingDetailContent props → changed `contextRange?: number` to `contextRange: number | undefined`
- Story 4.0 test regression (3 fails) → added `vi.mock('@/hooks/useMediaQuery')` defaulting to laptop mode
- Story 3.5 test regression → added `vi.mock('server-only')` + mocks for FindingDetailContent/FileNavigationDropdown
- Responsive test empty state assertion → changed to check `mock-finding-detail-content` testid (component is mocked)
- Pre-existing flaky: TaxonomyManager.test.tsx (1 fail), ProjectTour.test.tsx (2 fails) — confirmed via `git stash` not caused by this story

### Pre-CR Scan Results
- **anti-pattern-detector:** 0 violations
- **tenant-isolation-checker:** 0 violations
- **code-quality-analyzer:** 0C, 3H, 5M, 5L (merged into CR findings)

### Completion Notes List
- 27 ATDD unit tests activated and GREEN (8 useMediaQuery + 4 FileNavigationDropdown + 5 FindingDetailContent + 6 ReviewPageClient.responsive + 4 FindingCard.animation)
- All existing tests pass with added mocks for new dependencies
- E2E stubs (30 `test.skip`) in `e2e/review-responsive.spec.ts` — requires running app + Playwright
- Manual verification (9.5, 9.6) deferred — requires running dev server
- Dual rendering strategy working: static aside at desktop, Radix Sheet at laptop/mobile
- FindingDetailContent shared component enables DRY content between aside and Sheet

### Change Log
- 2026-03-13: Story created by SM agent (Bob)
- 2026-03-13: Validation applied — 5C+7E+4O fixes (dual rendering, Sheet max-w override, UX spec deviation docs, max-width constraint, token naming, touch target audit, consolidated DO NOT list)
- 2026-03-13: Implementation by Dev agent — Tasks 0-7, 9 completed. Task 8 (E2E) stubs created, activation deferred
- 2026-03-13: New files: useMediaQuery.ts/test.ts, FileNavigationDropdown.tsx/test.tsx, FindingDetailContent.tsx/test.tsx, ReviewPageClient.responsive.test.tsx, FindingCard.animation.test.tsx, e2e/review-responsive.spec.ts
- 2026-03-13: Modified files: ReviewPageClient.tsx (responsive layout), FindingDetailSheet.tsx (extract content + responsive width), FindingCard.tsx (animation + touch targets), tokens.css (responsive tokens), useReducedMotion.ts (refactored to delegate to useMediaQuery), ReviewPageClient.story40.test.tsx + story35.test.tsx (regression fixes)
- 2026-03-13: CR R1 fixes — removed unused `findingId` prop from FindingDetailSheet, fixed `fileId ?? ''` empty string fallback (Guardrail #8), removed unused type props from FileNavigationDropdown, fixed StatusBadge underscore handling, replaced hardcoded mockFinding with `buildFindingForUI()` factory, added TODO(story-4.2) for sourceLang/targetLang wiring (Guardrail #39), created TD-E2E-017 for 30 E2E test.skip stubs

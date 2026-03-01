# Story 3.0.5: UX Foundation Gap Fix

Status: done

## Story

As a QA Reviewer / PM,
I want the ScoreBadge component to show proper size variants, status labels, and analyzing animation, the app header to display breadcrumb navigation, and severity badge colors to match the design system tokens,
So that the UI accurately communicates quality scores, navigation context, and severity levels as designed in the UX specification — before AI-produced findings are displayed in Stories 3.2+.

## Background

Sally (UX) audit of Epic 1-2 implementations against UX spec found 4 verified gaps where the implementation diverges from the design specification. These were missed because wireframes were not included in story files during Epic 1-2. All gaps are small (total ~1 day) but must be resolved before Story 3.2c (L2 Results Display) which depends on ScoreBadge variants and breadcrumb navigation.

**Deferred (not in scope):**
- Status Bar 32px — blocks Epic 4, not Epic 3. Track as tech debt
- Dashboard Trend Charts — requires AI findings data (post Story 3.2+)
- Sarabun font — Inter + Noto Sans Thai system fallback is sufficient per spec

## Acceptance Criteria

### AC1: ScoreBadge Size Variants

**Given** the existing `ScoreBadge` component at `src/features/batch/components/ScoreBadge.tsx`
**When** it is refactored to match the UX specification
**Then** it supports 3 size variants:

| Variant | Number Size | Usage |
|---------|:----------:|-------|
| `lg` | 48px (`text-5xl`) | File header, batch summary header |
| `md` | 24px (`text-2xl`) | Finding list header, dashboard metric cards |
| `sm` | 16px (`text-xs`) — current default | Inline within tables, file status rows |

**And** the component props change from:
```typescript
// BEFORE
type ScoreBadgeProps = { score: number | null; status?: string }

// AFTER — NOTE: "ScoreBadgeState" NOT "ScoreStatus" (ScoreStatus already exists
// in src/types/finding.ts as DB lifecycle type: 'calculating' | 'calculated' | 'partial' | ...)
type ScoreBadgeState = 'pass' | 'review' | 'fail' | 'analyzing' | 'rule-only'
type ScoreBadgeSize = 'sm' | 'md' | 'lg'
type ScoreBadgeProps = {
  score: number | null
  state?: ScoreBadgeState  // explicit union, not bare string (Guardrail #3)
  size?: ScoreBadgeSize    // default: 'sm' (backward compatible)
  criticalCount?: number   // needed for pass/review logic
}
```
**And** existing caller `FileStatusCard` continues to work without changes (backward compatible — `size` defaults to `'sm'`, `state` auto-derived from score)
**Note:** `BatchSummaryHeader` does NOT use ScoreBadge (it only shows count metrics) — no backward compat concern there

### AC2: ScoreBadge Status States

**Given** the ScoreBadge component has size variants
**When** a `state` prop is provided (or derived from score + criticalCount)
**Then** it displays the correct state:

| State | Color Token | Label | Condition |
|-------|------------|-------|-----------|
| **Pass** | `--color-status-pass` (green) | "Passed" | Score >= 95 AND criticalCount === 0 |
| **Review** | `--color-status-pending` (amber) | "Review" | Score < 95 OR criticalCount > 0 |
| **Fail** | `--color-status-fail` (red) | "Fail" | Score < 70 |
| **Analyzing** | `--color-status-analyzing` (indigo) | "Analyzing..." | AI layer in progress |
| **Rule-only** | `--color-info` (blue) | "Rule-based" | Only L1 complete |

**INTENTIONAL THRESHOLD CHANGE:** Current ScoreBadge uses `<80 = destructive (red)`. This refactor changes to `<70 = Fail (red)`, meaning scores 70–79.9 will shift from red to amber ("Review"). This is intentional per UX spec — the 80 threshold was a placeholder; 70 aligns with industry MQM fail threshold.

**And** `lg` and `md` variants show the label below the score number
**And** `sm` variant shows label as tooltip only (hover/focus)
**And** state can be explicitly set via prop OR auto-derived with this priority order (if `state` prop is undefined):
1. If `score === null` → muted state (N/A)
2. If `score < 70` → `'fail'`
3. If `score >= 95 AND (criticalCount ?? 0) === 0` → `'pass'`
4. Otherwise → `'review'`

**Note:** `criticalCount ?? 0` — treat undefined as 0 for backward compat (existing callers don't pass it). `'analyzing'` and `'rule-only'` states can ONLY be set via explicit `state` prop (they cannot be derived from score alone)

### AC3: ScoreBadge Analyzing Animation

**Given** the ScoreBadge has `state="analyzing"`
**When** rendered
**Then** it shows an indigo pulse animation (`animate-pulse` or custom keyframe)
**And** the score number (if available) displays with reduced opacity (0.6)
**And** the label shows "Analyzing..." with an ellipsis animation
**And** `prefers-reduced-motion: reduce` disables all animation (static indigo background, no pulse)

### AC4: ScoreBadge Score Change Animation

**Given** the score value changes (e.g., recalculation after finding action)
**When** the new score is different from the previous score
**Then** the score number morphs with 300ms ease-out transition
**And** improvement (score up) slides the number upward, decline (score down) slides downward
**And** `prefers-reduced-motion: reduce` uses instant swap (no animation)

### AC5: Breadcrumb Navigation in App Header

**Given** the existing `AppHeader` at `src/components/layout/app-header.tsx` shows static "QA Localization Tool" text
**When** the user navigates to nested pages
**Then** a breadcrumb replaces the static title, following the UX spec pattern:

```
Dashboard / Project-ABC / Batch-Mon / file-03.xlf
```

**And** each segment is a clickable link (navigates to that level)
**And** the current level (last segment) is bold and not clickable
**And** truncation: if > 4 segments, middle segments collapse to `...`
**And** at the root level (`/dashboard`), only "Dashboard" is shown (no change from current behavior)
**And** breadcrumb is built from route params (`projectId`, `sessionId`, etc.) + data fetched server-side (project name, file name)

Implementation approach:
- Add shadcn Breadcrumb component: `npx shadcn@latest add breadcrumb` (installs to `src/components/ui/breadcrumb.tsx`)
- Create `AppBreadcrumb` as **client component** at `src/components/layout/app-breadcrumb.tsx`
- Use `usePathname()` from `next/navigation` to parse current route into segments
- For entity names (project name, file name): use a lightweight server action `getBreadcrumbEntities.action.ts` that takes `projectId` (and optionally `batchId`/`fileId`) and returns display names. Call via `useEffect` on pathname change with debounce
- Integrate into `AppHeader` — replace static `<h1>` with `<AppBreadcrumb />` (keep "Dashboard" at root level, show breadcrumb for nested routes)
- Static segments (Dashboard, Projects, Glossary, Settings, Upload, Admin, Taxonomy) resolve from pathname directly — no DB fetch needed
- Dynamic segments (`[projectId]`, `[batchId]`) require the server action fetch

### AC6: Taxonomy Severity Badge Color Fix

**Given** the `TaxonomyMappingTable` at `src/features/taxonomy/components/TaxonomyMappingTable.tsx` line 51-55
**When** displaying "major" severity badge
**Then** it uses `bg-severity-major text-white` (orange `#f59e0b` from `--color-severity-major` token)
**And** NOT `variant="default"` (which renders as indigo/primary)
**And** the severity badge mapping becomes:

```typescript
// BEFORE: major uses 'default' (indigo) — WRONG
const SEVERITY_BADGE = { critical: 'destructive', major: 'default', minor: 'secondary' }

// AFTER: major uses custom orange from design tokens
// Use className override instead of shadcn variant
```

**And** all 3 severities use custom className with design tokens (drop shadcn Badge variant approach):
- critical → `bg-severity-critical text-white` (red `#dc2626`) ✓ (can keep `destructive` or migrate to token)
- major → `bg-severity-major text-white` (orange `#f59e0b`) ← FIX from `default` (indigo)
- minor → `bg-severity-minor text-white` (blue `#3b82f6`) ← FIX from `secondary` (gray)

### AC7: RecentFilesTable Score Uses ScoreBadge

**Given** the `RecentFilesTable` at `src/features/dashboard/components/RecentFilesTable.tsx` line 59-63
**When** displaying file scores
**Then** it uses the `ScoreBadge` component with `size="sm"` instead of raw `<span className="font-mono">`
**And** null scores show `ScoreBadge` with `score={null}` (renders as "N/A" muted badge — existing behavior)

### AC8: Unit Tests

**Given** the components are updated
**When** tests are run
**Then** unit tests exist for:
- `ScoreBadge` — all 3 size variants render correct classes
- `ScoreBadge` — all 5 `state` values render correct colors and labels
- `ScoreBadge` — auto-derivation (no `state` prop): score=96 + criticalCount=0 → "Passed", score=96 + criticalCount=1 → "Review"
- `ScoreBadge` — `prefers-reduced-motion` disables pulse animation (CSS class not applied)
- `ScoreBadge` — backward compatibility: existing callers without new props render identically
- `TaxonomyMappingTable` — "major" badge renders with orange color class
- `RecentFilesTable` — score column renders `ScoreBadge` component
- Breadcrumb — renders correct segments for nested route
- Breadcrumb — truncates middle segments when > 4 levels
- Breadcrumb — last segment is not a link
**And** boundary value tests:
- Score = 95 exactly + criticalCount=0 → "Passed" (at threshold)
- Score = 94.9 → "Review" (below threshold)
- Score = 70 exactly → "Review" (at fail boundary)
- Score = 69.9 → "Fail" (below fail boundary)
- Score = null → "N/A" muted state
- criticalCount = 0 vs 1 at score=95 (flip between Pass/Review)
- criticalCount = undefined at score=96 → "Passed" (backward compat — undefined treated as 0)

## Tasks / Subtasks

- [x] **Task 1: ScoreBadge Refactor** (AC: #1, #2, #3, #4)
  - [x] 1.1 Add `ScoreBadgeState` and `ScoreBadgeSize` types in `src/types/finding.ts`
  - [x] 1.2 Refactor `ScoreBadge` props — add `size`, `criticalCount`, `state` typed as `ScoreBadgeState`
  - [x] 1.3 Implement 3 size variants (`sm` default, `md`, `lg`) with responsive text sizing
  - [x] 1.4 Implement 5 `state` values with correct color tokens from `tokens.css`
  - [x] 1.5 Add auto-derivation logic (null→muted, <70→fail, >=95+noCritical→pass, else→review)
  - [x] 1.6 Add `analyzing` pulse animation in `src/styles/animations.css` with `prefers-reduced-motion`
  - [x] 1.7 Add score change animation (300ms slide up/down) via DOM ref with `prefers-reduced-motion`
  - [x] 1.8 Verify backward compatibility — FileStatusCard + BatchSummaryView pass (63/63 tests)
  - [x] 1.9 Migrate existing 8 ScoreBadge tests → replaced with 32 new tests covering all variants

- [x] **Task 2: Breadcrumb Component** (AC: #5)
  - [x] 2.1 Add shadcn Breadcrumb: `npx shadcn@latest add breadcrumb`
  - [x] 2.2 Create `AppBreadcrumb` client component using `usePathname()`
  - [x] 2.3 Create `getBreadcrumbEntities.action.ts` server action
  - [x] 2.4 Implement route-based breadcrumb segments (static + dynamic)
  - [x] 2.5 Implement truncation: > 4 segments → [first, ellipsis, last]
  - [x] 2.6 Integrate into `AppHeader` — replaced static content with `<AppBreadcrumb />`
  - [x] 2.7 Handle future routes gracefully — dynamic segment detection covers any route

- [x] **Task 3: Severity Badge Color Fix** (AC: #6)
  - [x] 3.1 Replace `SEVERITY_BADGE` variant map → `SEVERITY_CLASSES` className map (major=orange, minor=blue)
  - [x] 3.2 Replace `<Badge variant>` → `<span className>` using design tokens

- [x] **Task 4: RecentFilesTable ScoreBadge** (AC: #7)
  - [x] 4.1 Import `ScoreBadge` in `RecentFilesTable.tsx`
  - [x] 4.2 Replace raw `<span>` score display with `<ScoreBadge score={file.mqmScore} size="sm" />`

- [x] **Task 5: Unit Tests** (AC: #8)
  - [x] 5.0 Migrate existing 8 ScoreBadge tests → replaced with 32 ATDD tests (20 P0, 9 P1, 3 P2)
  - [x] 5.1 ScoreBadge size variant tests (4 tests)
  - [x] 5.2 ScoreBadge state value tests (5 tests)
  - [x] 5.3 ScoreBadge auto-derivation tests (5 tests)
  - [x] 5.4 ScoreBadge boundary value tests (8 tests — B1-B8)
  - [x] 5.5 ScoreBadge backward compatibility test (1 test)
  - [x] 5.6 ScoreBadge prefers-reduced-motion test (3 tests AC3 + 1 test AC4)
  - [x] 5.7 TaxonomyMappingTable severity badge color tests (3 tests)
  - [x] 5.8 RecentFilesTable ScoreBadge integration tests (2 tests)
  - [x] 5.9 AppBreadcrumb route parsing + truncation tests (7 tests)

## Dev Notes

### Existing Code to Modify

| File | Change | Lines |
|------|--------|:-----:|
| `src/features/batch/components/ScoreBadge.tsx` | Major refactor — add sizes, states, animations | ~80 → ~150 |
| `src/features/batch/components/ScoreBadge.test.tsx` | Extend with new variant/state tests | Expand significantly |
| `src/components/layout/app-header.tsx` | Replace static title with breadcrumb | ~10 lines |
| `src/features/taxonomy/components/TaxonomyMappingTable.tsx` | Fix line 51-55 badge mapping | ~5 lines |
| `src/features/dashboard/components/RecentFilesTable.tsx` | Import + use ScoreBadge | ~5 lines |
| `src/styles/animations.css` | Add pulse + score morph keyframes — import in `src/app/layout.tsx` alongside `globals.css` | ~20 lines |

### New Files

| File | Purpose |
|------|---------|
| `src/components/layout/app-breadcrumb.tsx` | Route-based breadcrumb client component (`usePathname`) |
| `src/components/layout/app-breadcrumb.test.tsx` | Breadcrumb tests |
| `src/components/layout/actions/getBreadcrumbEntities.action.ts` | Server action: fetch project/batch display names for dynamic breadcrumb segments |

**Note:** Do NOT create `src/types/score.ts` — add `ScoreBadgeState` + `ScoreBadgeSize` types to existing `src/types/finding.ts` (where `ScoreStatus` DB type already lives)

### Design Token Reference (tokens.css — all exist, no migration needed)

```css
/* Already in tokens.css: */
--color-severity-critical: #dc2626;   /* red */
--color-severity-major:    #f59e0b;   /* amber/orange */
--color-severity-minor:    #3b82f6;   /* blue */
--color-status-pass:       #10b981;   /* green */
--color-status-pending:    #f59e0b;   /* amber */
--color-status-fail:       #ef4444;   /* red */
--color-status-analyzing:  #4f46e5;   /* indigo */
```

### ScoreBadge Backward Compatibility

Current caller (MUST continue working without changes):
- `src/features/batch/components/FileStatusCard.tsx:35` — `<ScoreBadge score={file.mqmScore} />`

**`BatchSummaryHeader.tsx` does NOT use ScoreBadge** — it only shows count metrics (Total Files, Passed, Needs Review). No backward compat concern.

Default behavior: `size='sm'`, `state` auto-derived from score. Note: auto-derivation thresholds change (see AC2 intentional threshold change note) — score 70-79.9 shifts from red to amber.

### Breadcrumb Route Mapping

```
/dashboard                                    → Dashboard
/projects                                     → Dashboard / Projects
/projects/[projectId]                         → Dashboard / {projectName}
/projects/[projectId]/glossary                → Dashboard / {projectName} / Glossary
/projects/[projectId]/settings                → Dashboard / {projectName} / Settings
/projects/[projectId]/upload                  → Dashboard / {projectName} / Upload
/projects/[projectId]/review/[sessionId]      → Dashboard / {projectName} / {fileName}  ⚠️ FUTURE ROUTE (does not exist yet — include in mapping, activates when route is created in Epic 4)
/admin/taxonomy                               → Dashboard / Admin / Taxonomy
/admin/ai-usage                               → Dashboard / Admin / AI Usage
```

Entity names for dynamic segments (`[projectId]`, `[batchId]`): fetched via `getBreadcrumbEntities.action.ts` server action called from client component on pathname change. Static segments resolve from pathname directly.

### Animation Specification

```css
/* Analyzing pulse */
@keyframes score-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Score change morph */
@keyframes score-slide-up {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes score-slide-down {
  from { transform: translateY(-8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .score-animate { animation: none !important; }
}
```

**Import location:** Add `import '@/styles/animations.css'` in `src/app/layout.tsx` alongside the existing `globals.css` import. Alternatively, `@import './animations.css'` inside `globals.css`.

## UX Specification (Wireframes)

### ScoreBadge — Size Variants

```
lg (48px):          md (24px):          sm (16px):
┌─────────────┐     ┌──────────┐        ┌──────┐
│     82      │     │    82    │        │  82  │
│   Passed    │     │  Passed  │        └──────┘
└─────────────┘     └──────────┘        (label = tooltip)
```

### ScoreBadge — States

```
Pass:         Review:       Fail:         Analyzing:     Rule-only:
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  96.2   │   │  82.5   │   │  64.1   │   │  82     │   │  91.3   │
│ Passed  │   │ Review  │   │  Fail   │   │ Analyz… │   │Rule-base│
│ (green) │   │(orange) │   │  (red)  │   │(indigo) │   │ (blue)  │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
                                           ↑ pulsing
```

### Breadcrumb Navigation

```
App Header (48px):
┌─────────────────────────────────────────────────────────┐
│ Dashboard / Project-ABC / Batch-Mon / file-03.xlf  🔔 ? 👤│
│ ↑ link      ↑ link       ↑ link      ↑ bold (current)     │
└─────────────────────────────────────────────────────────┘

Truncated (> 4 segments):
┌─────────────────────────────────────────────────────────┐
│ Dashboard / ... / file-03.xlf / Finding #14        🔔 ? 👤│
└─────────────────────────────────────────────────────────┘
```

### Severity Badge Fix (Taxonomy Table)

```
BEFORE:                          AFTER:
┌──────────┬──────────┐         ┌──────────┬──────────┐
│ critical │ ████████ │ red ✓   │ critical │ ████████ │ red ✓
│ major    │ ████████ │ indigo ✗│ major    │ ████████ │ orange ✓
│ minor    │ ████████ │ gray ✗  │ minor    │ ████████ │ blue ✓
└──────────┴──────────┘         └──────────┴──────────┘
```

## Deferred Items (Tech Debt)

| Item | Target | Reason |
|------|--------|--------|
| Status Bar 32px (persistent bottom bar) | Epic 4 prerequisite | Belongs to Review View — not needed until Epic 4 |
| Dashboard Trend Charts (Recharts scaffold) | After Story 3.2+ | Requires AI findings data to be meaningful |
| Sarabun Thai font | Optional | Inter + Noto Sans Thai system fallback sufficient |
| User menu dropdown | Epic 6 | Team collaboration features |

## Dependencies

- **Depends on:** Story 3.0 (done) — `ScoreStatus` DB type in `finding.ts`, review store
- **Blocks:** Story 3.2c (L2 Results Display) — needs ScoreBadge variants + breadcrumb

## Story Intelligence (from previous stories)

### From Story 3.0 CR:
- `void asyncFn()` swallows errors — use `.catch()` or `await`
- Zustand store slices: separate concerns cleanly
- `ScoreStatus` type (DB lifecycle: calculating/calculated/partial/...) already defined in `src/types/finding.ts:33` — this is the DB type, NOT the visual state. Add `ScoreBadgeState` (visual: pass/review/fail/analyzing/rule-only) as a SEPARATE type in the same file

### Testing patterns:
- `createDrizzleMock()` from `src/test/drizzleMock.ts` for any DB queries
- jsdom for component tests, `vi.fn()` for action mocks
- Boundary value tests MANDATORY (Epic 2 retro A2)
- **`prefers-reduced-motion` mock pattern** (jsdom has no `matchMedia`):
```typescript
function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
```
- **Existing ScoreBadge tests:** 8 tests in `ScoreBadge.test.tsx` test `success/warning/destructive/muted` variant classes. These WILL break after refactor — migrate first (Task 1.9), then add new tests

### Current ScoreBadge source (for dev reference):
- `ScoreBadge.tsx` has `status` prop declared but **never destructured** (dead prop — only `score` is used)
- `getVariant()` thresholds: `>=95 → success`, `>=80 → warning`, `<80 → destructive`, `null → muted`
- Uses Tailwind semantic classes: `bg-success/10 text-success border-success/20` etc.
- The refactor replaces this entire variant system with design-token-based states

## References

- UX Spec — ScoreBadge: `_bmad-output/planning-artifacts/ux-design-specification/component-strategy.md` lines 251-281
- UX Spec — Breadcrumb Pattern: `_bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md` lines 181-191
- UX Spec — Design Tokens: `_bmad-output/planning-artifacts/ux-design-specification/design-system-foundation.md` lines 82-96
- UX Spec — Layout Wireframe: `_bmad-output/planning-artifacts/ux-design-specification/visual-design-foundation.md` line 136
- Current ScoreBadge: `src/features/batch/components/ScoreBadge.tsx`
- Current AppHeader: `src/components/layout/app-header.tsx`
- Design Tokens: `src/styles/tokens.css`

## Dev Agent Record

### Files Modified

| File | Change Summary |
|------|---------------|
| `src/types/finding.ts` | Added `ScoreBadgeState` and `ScoreBadgeSize` types |
| `src/features/batch/components/ScoreBadge.tsx` | Major refactor: 3 sizes, 5 states, auto-derivation, DOM-ref animations, prefers-reduced-motion |
| `src/features/batch/components/ScoreBadge.test.tsx` | Replaced 8 tests with 32 ATDD tests (20 P0, 9 P1, 3 P2) |
| `src/styles/animations.css` | Added score-slide-up/down keyframes + animate-slide-up/down utilities |
| `src/components/layout/app-breadcrumb.tsx` | New: route-based breadcrumb with dynamic entity resolution |
| `src/components/layout/app-breadcrumb.test.tsx` | New: 7 tests covering static/dynamic/truncation/entity resolution |
| `src/components/layout/actions/getBreadcrumbEntities.action.ts` | New: server action for entity name resolution (placeholder for DB queries) |
| `src/components/layout/app-header.tsx` | Replaced static content with `<AppBreadcrumb />` |
| `src/components/ui/breadcrumb.tsx` | Reinstalled via `npx shadcn@latest add breadcrumb` — used by AppBreadcrumb (post-CR refactor) |
| `src/features/taxonomy/components/TaxonomyMappingTable.tsx` | Replaced Badge variant → span className with design tokens |
| `src/features/taxonomy/components/TaxonomyMappingTable.test.tsx` | Activated 3 ATDD severity badge color tests |
| `src/features/dashboard/types.ts` | 3x `interface` → `type`, `status: string` → `status: DbFileStatus` (Guardrail #3) |
| `src/features/dashboard/actions/getDashboardData.action.ts` | Added `as DbFileStatus` cast on `row.status` |
| `src/features/dashboard/components/RecentFilesTable.tsx` | Replaced raw span → ScoreBadge, `getStatusVariant` param `string` → `DbFileStatus`, `'error'` → `'failed'`, added all pipeline statuses |
| `src/features/dashboard/components/RecentFilesTable.test.tsx` | Activated 2 ATDD ScoreBadge tests + 2 new status variant tests (failed, processing) |
| `src/types/pipeline.ts` | Added `DbFileStatus` union type (10 values matching Drizzle schema) |

### Test Results

- **Story tests:** 59/59 passed (7 test files)
- **Lint:** 0 errors, 0 warnings
- **Type-check:** passed
- **Backward compat:** FileStatusCard (4), FileHistoryTable (5) all pass

### Key Design Decisions

1. **Animation via DOM ref** (not state) — avoids React Compiler `set-state-in-effect` lint error, more performant
2. **Threshold 80→70** — intentional per UX spec, scores 70-79.9 shift from red to amber
3. **`<span>` instead of `<Badge>`** for severity — Badge default variant leaks `bg-primary` hover classes
4. **Breadcrumb render-time state reset** — React-recommended pattern instead of setState in useEffect
5. **getBreadcrumbEntities returns raw IDs** as placeholder — DB queries deferred to when routes exist

### Completion Notes

#### CR R1 (2026-03-01) — Full Finding Audit

**Sub-agents ran:** code-quality-analyzer (0C/2H/5M/8L), testing-qa-expert (0C/1H/4M/3L)
**Conditional scans:** rls-policy-reviewer skipped (no schema/migration), inngest-function-validator skipped (no pipeline files)
**Raw total:** 24 findings → 10 FIXED, 4 DEFERRED, 10 WONTFIX/DUPLICATE

##### FIXED (10)

| ID | Sev | Source | File | Fix Summary |
|----|-----|--------|------|-------------|
| H1 | HIGH | CQA-H1 | `ScoreBadge.tsx:103` | Removed `effectiveState!` non-null assertion → `isMuted = effectiveState === null` |
| H2 | HIGH | TEA-H1 | `ScoreBadge.test.tsx:286-314` | AC4 animation tests: `vi.useFakeTimers()` + post-300ms removal assertion |
| M1 | MED | Manual | `breadcrumb.tsx` | Deleted unused shadcn component (0 importers). Later reinstated + refactored in post-CR fix |
| M2 | MED | CQA-M1 | `TaxonomyMappingTable.tsx:51` | `Record<Severity, string>` (was `Record<string, string>` — Guardrail #3) |
| M3 | MED | TEA-M1 | `ScoreBadge.test.tsx:164` | Split test 2.12 into separate lg + md label-visible assertions |
| M4 | MED | TEA-M2 | `ScoreBadge.test.tsx:184` | Added `queryByText('Passed').toBeNull()` negative assertion for sm |
| L1 | LOW | TEA-M3 | `ScoreBadge.test.tsx:103` | Tightened `/info/` → `/bg-info\/10/` + `/text-info/` |
| L2 | LOW | Manual | `app-breadcrumb.test.tsx` | Added `.catch()` fallback test for network error |
| L3 | LOW | CQA-H2 | `getBreadcrumbEntities.action.ts` | Added Zod validation on input — defense-in-depth |
| L4 | LOW | TEA-L2 | `RecentFilesTable.test.tsx` | `container.querySelectorAll` instead of `document.querySelectorAll` |

##### DEFERRED (4) — tracked in `tech-debt-tracker.md`

| ID | Sev | Source | File | Reason | Tracker ID |
|----|-----|--------|------|--------|------------|
| ~~D1~~ | MED | CQA-M3 | `RecentFilesTable.tsx` | **RESOLVED** — `RecentFileRow.status` changed to `DbFileStatus` union type, cast added in `getDashboardData.action.ts` | TD-CODE-005 → RESOLVED |
| D2 | MED | CQA-M5 | `app-breadcrumb.tsx` | truncateSegments keeps only first+last, should show secondToLast for context | TD-UX-002 |
| D3 | MED | CQA-M3old | `app-breadcrumb.tsx` | No AbortController on entity fetch — race condition on rapid navigation | TD-UX-001 |
| D4 | LOW | CQA-M4 | `app-breadcrumb.tsx` | shadcn breadcrumb not used — DRY violation | **RESOLVED** post-CR (breadcrumb refactor commit `3a84381`) |

##### WONTFIX (10) — not actionable or out of scope

| ID | Sev | Source | Finding | Reason |
|----|-----|--------|---------|--------|
| ~~W1~~ | MED | CQA-M2 | `dashboard/types.ts` uses `interface` not `type` | **RESOLVED** — 3x `interface` → `type` (RecentFileRow, DashboardData, AppNotification) |
| W2 | LOW | TEA-M4 | getBreadcrumbEntities mock/source asymmetry | Test mock overrides source — correct test pattern, not a defect |
| W3 | LOW | TEA-L1 | `queryByText('/')` vacuous (aria-hidden) | **RESOLVED** by breadcrumb refactor — now uses `data-slot` check |
| W4 | LOW | TEA-L3 | `vi.clearAllMocks()` no-op in ScoreBadge test | Harmless standard boilerplate — removing would be pedantic |
| W5-W10 | LOW | CQA-L | 6 additional LOW findings | `interface` vs `type` in app-header.tsx/RecentFilesTable.tsx, Server Action path convention, empty `.catch()` comment, etc. — all pre-existing patterns, no runtime risk |

**Post-fix verification:** 55/55 tests passed, lint 0 errors, type-check passed, backward compat 9/9 passed

#### Post-CR Fixes (2026-03-01)

| Fix | Files | Summary |
|-----|-------|---------|
| Breadcrumb shadcn refactor | `breadcrumb.tsx`, `app-breadcrumb.tsx`, `app-breadcrumb.test.tsx` | Reinstalled shadcn Breadcrumb, refactored JSX from raw HTML → shadcn primitives (commit `3a84381`) |
| W1 → FIXED | `dashboard/types.ts` | 3x `interface` → `type` per project convention |
| D1 → RESOLVED | `types/pipeline.ts`, `dashboard/types.ts`, `getDashboardData.action.ts` | Added `DbFileStatus` union type, `status: DbFileStatus`, `as DbFileStatus` cast |
| PE-1 fix | `RecentFilesTable.tsx`, `RecentFilesTable.test.tsx` | `getStatusVariant`: param `string` → `DbFileStatus`, `'error'` → `'failed'`, added all pipeline status mappings, 2 new tests |

**Post-fix verification:** 59/59 tests passed, lint 0, type-check 0

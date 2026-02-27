# Story 3.0.5: UX Foundation Gap Fix

Status: ready-for-dev

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

// AFTER
type ScoreStatus = 'pass' | 'review' | 'fail' | 'analyzing' | 'rule-only'
type ScoreBadgeSize = 'sm' | 'md' | 'lg'
type ScoreBadgeProps = {
  score: number | null
  status?: ScoreStatus  // explicit union, not bare string (Guardrail #3)
  size?: ScoreBadgeSize // default: 'sm' (backward compatible)
  criticalCount?: number // needed for pass/review logic
}
```
**And** existing callers (`FileStatusCard`, `BatchSummaryHeader`) continue to work without changes (backward compatible — `size` defaults to `'sm'`)

### AC2: ScoreBadge Status States

**Given** the ScoreBadge component has size variants
**When** a `status` prop is provided (or derived from score + criticalCount)
**Then** it displays the correct state:

| State | Color Token | Label | Condition |
|-------|------------|-------|-----------|
| **Pass** | `--color-status-pass` (green) | "Passed" | Score >= 95 AND criticalCount === 0 |
| **Review** | `--color-status-pending` (amber) | "Review" | Score < 95 OR criticalCount > 0 |
| **Fail** | `--color-status-fail` (red) | "Fail" | Score < 70 |
| **Analyzing** | `--color-status-analyzing` (indigo) | "Analyzing..." | AI layer in progress |
| **Rule-only** | `--color-info` (blue) | "Rule-based" | Only L1 complete |

**And** `lg` and `md` variants show the label below the score number
**And** `sm` variant shows label as tooltip only (hover/focus)
**And** status can be explicitly set via prop OR auto-derived: if `status` prop is undefined, derive from `score` + `criticalCount`

### AC3: ScoreBadge Analyzing Animation

**Given** the ScoreBadge is in `analyzing` state
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
- Add shadcn Breadcrumb component: `npx shadcn@latest add breadcrumb`
- Create `AppBreadcrumb` component that reads pathname + fetches entity names
- Integrate into `AppHeader` replacing static `<h1>` with conditional breadcrumb

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

**And** all 3 severities match design tokens:
- critical → `--color-severity-critical` (red) ✓ (already correct via `destructive`)
- major → `--color-severity-major` (orange) ← FIX
- minor → `--color-severity-minor` (blue) ← also check — currently `secondary` (gray)

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
- `ScoreBadge` — all 5 status states render correct colors and labels
- `ScoreBadge` — auto-derivation: score=96 + criticalCount=0 → "Passed", score=96 + criticalCount=1 → "Review"
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

## Tasks / Subtasks

- [ ] **Task 1: ScoreBadge Refactor** (AC: #1, #2, #3, #4)
  - [ ] 1.1 Define `ScoreStatus` and `ScoreBadgeSize` types in `src/types/score.ts` (or extend existing types)
  - [ ] 1.2 Refactor `ScoreBadge` props — add `size`, `criticalCount`, type `status` as union (Guardrail #3)
  - [ ] 1.3 Implement 3 size variants (`sm` default, `md`, `lg`) with responsive text sizing
  - [ ] 1.4 Implement 5 status states with correct color tokens from `tokens.css`
  - [ ] 1.5 Add auto-derivation logic: if `status` not provided, derive from `score` + `criticalCount`
  - [ ] 1.6 Add `analyzing` pulse animation in `src/styles/animations.css` with `prefers-reduced-motion` support
  - [ ] 1.7 Add score change animation (300ms ease-out slide up/down) with `prefers-reduced-motion` support
  - [ ] 1.8 Verify backward compatibility — `FileStatusCard`, `BatchSummaryHeader` render identically

- [ ] **Task 2: Breadcrumb Component** (AC: #5)
  - [ ] 2.1 Add shadcn Breadcrumb: `npx shadcn@latest add breadcrumb`
  - [ ] 2.2 Create `AppBreadcrumb` component at `src/components/layout/app-breadcrumb.tsx`
  - [ ] 2.3 Implement route-based breadcrumb segments: parse pathname → map to entity names
  - [ ] 2.4 Implement truncation: if > 4 segments, collapse middle to `...`
  - [ ] 2.5 Integrate into `AppHeader` — replace static `<h1>` with breadcrumb (keep "Dashboard" at root)
  - [ ] 2.6 Pass entity names from server components where available (project name, file name)

- [ ] **Task 3: Severity Badge Color Fix** (AC: #6)
  - [ ] 3.1 Fix `SEVERITY_BADGE` mapping in `TaxonomyMappingTable.tsx` — major → orange, minor → blue
  - [ ] 3.2 Use custom className with design tokens instead of shadcn variant for severity badges

- [ ] **Task 4: RecentFilesTable ScoreBadge** (AC: #7)
  - [ ] 4.1 Import `ScoreBadge` in `RecentFilesTable.tsx`
  - [ ] 4.2 Replace raw `<span>` score display with `<ScoreBadge score={file.mqmScore} size="sm" />`

- [ ] **Task 5: Unit Tests** (AC: #8)
  - [ ] 5.1 ScoreBadge size variant tests
  - [ ] 5.2 ScoreBadge status state tests (5 states)
  - [ ] 5.3 ScoreBadge auto-derivation tests
  - [ ] 5.4 ScoreBadge boundary value tests (95/94.9/70/69.9/null/criticalCount flip)
  - [ ] 5.5 ScoreBadge backward compatibility test
  - [ ] 5.6 ScoreBadge prefers-reduced-motion test
  - [ ] 5.7 TaxonomyMappingTable severity badge color test
  - [ ] 5.8 RecentFilesTable ScoreBadge integration test
  - [ ] 5.9 AppBreadcrumb route parsing + truncation tests

## Dev Notes

### Existing Code to Modify

| File | Change | Lines |
|------|--------|:-----:|
| `src/features/batch/components/ScoreBadge.tsx` | Major refactor — add sizes, states, animations | ~80 → ~150 |
| `src/features/batch/components/ScoreBadge.test.tsx` | Extend with new variant/state tests | Expand significantly |
| `src/components/layout/app-header.tsx` | Replace static title with breadcrumb | ~10 lines |
| `src/features/taxonomy/components/TaxonomyMappingTable.tsx` | Fix line 51-55 badge mapping | ~5 lines |
| `src/features/dashboard/components/RecentFilesTable.tsx` | Import + use ScoreBadge | ~5 lines |
| `src/styles/animations.css` | Add pulse + score morph keyframes | ~20 lines |

### New Files

| File | Purpose |
|------|---------|
| `src/components/layout/app-breadcrumb.tsx` | Route-based breadcrumb component |
| `src/components/layout/app-breadcrumb.test.tsx` | Breadcrumb tests |
| `src/types/score.ts` | `ScoreStatus`, `ScoreBadgeSize` types (if not already in existing types) |

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

Current callers (MUST continue working without changes):
- `src/features/batch/components/FileStatusCard.tsx:7` — `<ScoreBadge score={file.mqmScore} />`
- `src/features/batch/components/BatchSummaryHeader.tsx` — if it uses ScoreBadge

Default behavior: `size='sm'`, `status` auto-derived from score (same as current `getVariant` logic).

### Breadcrumb Route Mapping

```
/dashboard                                    → Dashboard
/projects                                     → Dashboard / Projects
/projects/[projectId]                         → Dashboard / {projectName}
/projects/[projectId]/glossary                → Dashboard / {projectName} / Glossary
/projects/[projectId]/settings                → Dashboard / {projectName} / Settings
/projects/[projectId]/upload                  → Dashboard / {projectName} / Upload
/projects/[projectId]/review/[sessionId]      → Dashboard / {projectName} / {fileName}
/admin/taxonomy                               → Dashboard / Admin / Taxonomy
```

Entity names must be fetched server-side — pass as props through layout, NOT client-side fetch.

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

- **Depends on:** Story 3.0 (done) — ScoreStatus type, review store
- **Blocks:** Story 3.2c (L2 Results Display) — needs ScoreBadge variants + breadcrumb

## Story Intelligence (from previous stories)

### From Story 3.0 CR:
- `void asyncFn()` swallows errors — use `.catch()` or `await`
- Zustand store slices: separate concerns cleanly
- ScoreStatus type already defined in `src/types/finding.ts` — reuse if compatible

### Testing patterns:
- `createDrizzleMock()` from `src/test/drizzleMock.ts` for any DB queries
- jsdom for component tests, `vi.fn()` for action mocks
- Boundary value tests MANDATORY (Epic 2 retro A2)

## References

- UX Spec — ScoreBadge: `_bmad-output/planning-artifacts/ux-design-specification/component-strategy.md` lines 251-281
- UX Spec — Breadcrumb Pattern: `_bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md` lines 181-191
- UX Spec — Design Tokens: `_bmad-output/planning-artifacts/ux-design-specification/design-system-foundation.md` lines 82-96
- UX Spec — Layout Wireframe: `_bmad-output/planning-artifacts/ux-design-specification/visual-design-foundation.md` line 136
- Current ScoreBadge: `src/features/batch/components/ScoreBadge.tsx`
- Current AppHeader: `src/components/layout/app-header.tsx`
- Design Tokens: `src/styles/tokens.css`

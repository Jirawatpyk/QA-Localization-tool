# Story 3.0: Score & Review Infrastructure

Status: review

## Story

As a Developer,
I want the shared score recalculation infrastructure, review state store, and real-time event system established,
So that Stories 3.1-3.5 can use consistent score lifecycle, finding state events, and real-time UI updates without forward dependency on Epic 4.

## Acceptance Criteria

### AC1: Zustand Review Store (`useReviewStore`)

**Given** the project foundation is in place (Epic 1 + Epic 2 complete)
**When** this infrastructure story is implemented
**Then** a Zustand `useReviewStore` is created at `src/features/review/stores/review.store.ts` managing:
- **Finding list state:** `findingsMap` (Map<string, Finding>), `selectedId` (string | null), `filterState` (severity, status, layer filters)
- **Score display state:** `currentScore` (number | null), `scoreStatus` (ScoreStatus), `isRecalculating` (boolean)
- **Bulk selection state:** `selectedIds` (Set<string>), `selectionMode` ('single' | 'bulk')
**And** the store follows the Architecture slice pattern: each concern (findings, score, selection) as a separate slice composed into the store
**And** the store is scoped per file: `resetForFile(fileId: string)` clears all state on file navigation

### AC2: `finding.changed` Event & Debounced Emission

**Given** the review store exists
**When** a finding state changes (Accept, Reject, Flag, etc.)
**Then** a `finding.changed` event schema is defined in Inngest client (`src/lib/inngest/client.ts`):
```typescript
{
  findingId: string
  fileId: string
  projectId: string
  tenantId: string     // REQUIRED — every Inngest event must include tenantId per Architecture mandate
  previousState: FindingStatus
  newState: FindingStatus
  triggeredBy: string  // userId — passed as `userId` param to scoreFile()
  timestamp: string    // ISO 8601
}
```
**And** the event is emitted after a **500ms debounce** (Architecture Decision 3.4) to batch rapid changes
**And** the event triggers an Inngest score recalculation function with deterministic ID: `step.run("recalculate-score-{fileId}", ...)`
**And** the Inngest function runs in serial queue per project: `concurrency: [{ key: "score-{projectId}", limit: 1 }]` (array syntax — matches existing codebase)

### AC3: Score Recalculation Inngest Function

**Given** a `finding.changed` event is emitted
**When** the Inngest function `recalculate-score` is triggered
**Then** it calls `scoreFile()` from `src/features/scoring/helpers/scoreFile.ts` — BUT `scoreFile()` currently hardcodes `eq(findings.detectedByLayer, 'L1')` and writes `layerCompleted: 'L1'`. This story MUST refactor `scoreFile()` to:
  - Accept an optional `layerFilter` parameter (default: undefined = all layers)
  - Read the current `layerCompleted` value from the existing score row and preserve it (do NOT hardcode `'L1'`)
  - When called from recalculate-score (review context): query ALL findings regardless of layer
  - When called from processFile L1 step (pipeline context): pass `layerFilter: 'L1'` to maintain backward compatibility
**And** the function follows the Inngest pattern: `Object.assign` exposing `handler` + `onFailure` for tests
**And** the function has `retries: 3` and a registered `onFailure` handler that logs via pino + writes audit log
**And** it is registered in `src/app/api/inngest/route.ts` functions array
**And** concurrency control: `concurrency: [{ key: "event.data.projectId", limit: 1 }]` (array syntax — matches existing codebase)

### AC4: Supabase Realtime Score Subscription (`useScoreSubscription`)

**Given** score recalculation infrastructure exists
**When** a Supabase Realtime channel is set up
**Then** a `useScoreSubscription` hook at `src/features/review/hooks/use-score-subscription.ts` subscribes to `scores` table changes filtered by `file_id`
**And** on score update event: store updates `currentScore` + `scoreStatus`, ScoreBadge re-renders with 200ms fade-in animation (respects `prefers-reduced-motion`)
**And** on subscription error: fallback to polling every 5 seconds with exponential backoff (5s -> 10s -> 20s, max 60s)
**And** cleanup on unmount: `supabase.removeChannel(channel)`

### AC5: Unit Tests

**Given** the infrastructure is tested
**When** I verify the setup
**Then** unit tests exist for:
- `useReviewStore` — all state transitions (findings CRUD, score updates, bulk selection, filter changes, file reset)
- `finding.changed` event debounce behavior — emits once after 500ms of silence, batches rapid changes
- `useScoreSubscription` — reconnection logic, error fallback to polling, exponential backoff, cleanup
- Inngest `recalculate-score` function — happy path, failure handler, concurrency key validation
- `scoreFile()` refactor — backward compatibility with `layerFilter: 'L1'`, all-layer scoring without filter
**And** boundary value tests (Epic 2 retro mandate A2) include:
- Debounce: exactly at 500ms, before 499ms (should NOT emit), rapid 10 changes within 500ms (should emit once)
- Exponential backoff: 5s → 10s → 20s → 40s → capped at 60s (NOT 80s)
- Store: `resetForFile` with empty findingsMap, with 0 findings, with null score
- Score: recalculation with 0 contributing findings (score = 100), with all findings rejected (score = 100)

## Tasks / Subtasks

- [x] **Task 1: Types & Event Schema** (AC: #2)
  - [x] 1.1 Consolidate `FindingStatus` type — expanded to DB-aligned 8-value set, removed `'edited'`, `scoring/types.ts` now imports from `@/types/finding`
  - [x] 1.2 Fix `FindingSeverity` — removed `'enhancement'`, now `'critical' | 'major' | 'minor'` only
  - [x] 1.3 Define `ScoreStatus` type in `src/types/finding.ts`
  - [x] 1.4 Define `FindingChangedEventData` type in `src/types/pipeline.ts`
  - [x] 1.5 Add `finding.changed` event to Inngest client Events type in `src/lib/inngest/client.ts`
  - [x] 1.6 Add `buildFindingChangedEvent()` factory in `src/test/factories.ts`

- [x] **Task 2: Zustand Review Store** (AC: #1)
  - [x] 2.1 Create `review.store.ts` with `'use client'` directive
  - [x] 2.2 Create findings slice: `findingsMap`, `selectedId`, `filterState`, CRUD actions
  - [x] 2.3 Create score slice: `currentScore`, `scoreStatus`, `isRecalculating`, update actions
  - [x] 2.4 Create selection slice: `selectedIds`, `selectionMode`, toggle/clear actions
  - [x] 2.5 Compose slices into `useReviewStore`
  - [x] 2.6 Implement `resetForFile(fileId)` — clears ALL state on file navigation
  - [x] 2.7 Write comprehensive unit tests (`review.store.test.ts`) — 15/15 GREEN

- [x] **Task 3: Inngest Score Recalculation Function** (AC: #3)
  - [x] 3.1 Create `recalculateScore.ts` at `src/features/pipeline/inngest/recalculateScore.ts`
  - [x] 3.2 Handler: receives `finding.changed` event, calls `scoreFile()` with no layer filter
  - [x] 3.3 onFailure handler: logs via pino + writes non-fatal audit log
  - [x] 3.4 Use `Object.assign` to expose `handler` + `onFailure` for tests
  - [x] 3.5 Register in `src/app/api/inngest/route.ts` functions array
  - [x] 3.6 Refactor `scoreFile()` — add optional `layerFilter` param, read existing `layerCompleted`, update `processFile.ts` to pass `layerFilter: 'L1'`
  - [x] 3.7 Write unit tests (`recalculateScore.test.ts`) — 9/9 GREEN
  - [x] 3.8 Update `scoreFile.test.ts` — 27/27 GREEN (19 existing + 8 new incl. boundary)

- [x] **Task 4: Supabase Realtime Hook** (AC: #4)
  - [x] 4.1 Create `use-score-subscription.ts`
  - [x] 4.2 Subscribe to `scores` table filtered by `file_id`
  - [x] 4.3 On update: parse payload, update store
  - [x] 4.4 Error handling: fallback to polling with exponential backoff (5s→10s→20s→40s, max 60s)
  - [x] 4.5 Animation: deferred to Epic 4 UI story (this is infrastructure only — no UI components)
  - [x] 4.6 Cleanup on unmount: `supabase.removeChannel(channel)`
  - [x] 4.7 Write unit tests (`use-score-subscription.test.ts`) — 10/10 GREEN

- [x] **Task 5: Debounced Event Emitter** (AC: #2)
  - [x] 5.1 Create `createFindingChangedEmitter()` plain utility function
  - [x] 5.2 Implement 500ms debounce
  - [x] 5.3 Batch rapid changes: last event wins within 500ms window
  - [x] 5.4 Create thin React wrapper hook `useFindingChangedEmitter()`
  - [x] 5.5 Write unit tests — 8/8 GREEN

- [x] **Task 6: Integration & Validation** (AC: #5)
  - [x] 6.1 Verify all Inngest functions registered in route.ts (4 functions)
  - [x] 6.2 Run `npm run type-check` — zero errors
  - [x] 6.3 Run `npm run lint` — zero errors, 5 pre-existing warnings (none from Story 3.0 files)
  - [x] 6.4 Run full test suite — 73/73 Story 3.0 tests pass; 2 pre-existing timeouts in L2/L3 template tests (not touched by Story 3.0)

## Dev Notes

### Architecture Patterns & Constraints

#### Zustand Slice Pattern (Architecture-mandated)
The review store MUST use the slice composition pattern, NOT a single monolithic store. Each concern (findings, score, selection) is a separate slice that gets composed:

```typescript
// Example slice pattern (from Architecture doc)
const createFindingsSlice = (set, get) => ({
  findingsMap: new Map(),
  selectedId: null,
  filterState: { severity: null, status: null, layer: null },
  setFinding: (id, finding) => set((s) => { ... }),
  removeFinding: (id) => set((s) => { ... }),
  setFilter: (filter) => set({ filterState: filter }),
})

const createScoreSlice = (set, get) => ({
  currentScore: null,
  scoreStatus: 'na' as ScoreStatus,
  isRecalculating: false,
  updateScore: (score, status) => set({ currentScore: score, scoreStatus: status, isRecalculating: false }),
  setRecalculating: () => set({ isRecalculating: true, scoreStatus: 'calculating' }),
})

// Compose
export const useReviewStore = create<ReviewState>()((...a) => ({
  ...createFindingsSlice(...a),
  ...createScoreSlice(...a),
  ...createSelectionSlice(...a),
  resetForFile: (fileId) => set({ ... }),  // clear all state
}))
```

#### Inngest Score Recalculation Pattern
Uses the established `Object.assign` pattern from Story 2.6:

```typescript
const handler = inngest.createFunction(
  {
    id: 'recalculate-score',
    retries: 3,
    concurrency: [{ key: 'event.data.projectId', limit: 1 }],  // array syntax — matches processFile.ts, batchComplete.ts
    onFailure: onFailureFn,
  },
  { event: 'finding.changed' },
  handlerFn,
)

export const recalculateScore = Object.assign(handler, {
  handler: handlerFn,
  onFailure: onFailureFn,
})
```

#### Supabase Realtime Pattern (from Architecture doc)
```typescript
useEffect(() => {
  const channel = supabase
    .channel(`scores:${fileId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'scores',
      filter: `file_id=eq.${fileId}`
    }, handleScoreUpdate)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') startPollingFallback()
    })

  return () => { supabase.removeChannel(channel) }
}, [fileId])
```

#### Debounce Pattern (500ms, Architecture Decision 3.4)
**IMPORTANT:** The emitter must be a plain utility function (NOT a React hook) because finding state changes originate from Server Actions (Epic 4) which do NOT run in React component context. Use native `setTimeout` + clear pattern (no lodash dependency):

```typescript
// Plain utility — works outside React lifecycle
export function createFindingChangedEmitter(triggerFn: (data: FindingChangedEventData) => Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    emit(data: FindingChangedEventData) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        await triggerFn(data)
        timer = null
      }, 500)
    },
    cancel() {
      if (timer) { clearTimeout(timer); timer = null }
    },
  }
}

// Optional thin React wrapper for cleanup on unmount
export function useFindingChangedEmitter(triggerFn: ...) {
  const emitter = useRef(createFindingChangedEmitter(triggerFn))
  useEffect(() => () => emitter.current.cancel(), [])
  return emitter.current
}
```

### Existing Code Integration Points

| Component | Path | What to Use |
|-----------|------|-------------|
| MQM Calculator | `src/features/scoring/mqmCalculator.ts` | `calculateMqmScore()` — pure function, no DB deps |
| Score Helper | `src/features/scoring/helpers/scoreFile.ts` | `scoreFile({ fileId, projectId, tenantId, userId })` — NEEDS REFACTOR: currently hardcodes L1 filter + `layerCompleted: 'L1'`. Add optional `layerFilter` param, read existing `layerCompleted` from score row. |
| Inngest Client | `src/lib/inngest/client.ts` | Add `finding.changed` to Events type |
| Inngest Route | `src/app/api/inngest/route.ts` | Register `recalculateScore` in functions array |
| Pipeline Store | `src/features/pipeline/stores/pipeline.store.ts` | Reference for Map-based state pattern |
| UI Store | `src/stores/ui.store.ts` | Reference for simple Zustand pattern |
| Audit Logger | `src/features/audit/actions/writeAuditLog.ts` | Use in onFailure handler (non-fatal) |
| Drizzle Mock | `src/test/drizzleMock.ts` | Use for Inngest function tests |
| AI Mock | `src/test/mocks/ai-providers.ts` | Reference but NOT needed for Story 3.0 (no AI calls) |

### DB Schema — Already Exists (No Migration Needed)

**`findings` table** — all columns exist from Story 2.4:
- `id`, `segmentId`, `fileId`, `projectId`, `tenantId`
- `status` (varchar 30): `'pending' | 'accepted' | 're_accepted' | 'rejected' | 'flagged' | 'noted' | 'source_issue' | 'manual'`
- `severity` (varchar 20): `'critical' | 'major' | 'minor'`
- `detectedByLayer` (varchar 10): `'L1' | 'L2' | 'L3'`
- `aiModel`, `aiConfidence`, `suggestedFix`, `segmentCount`

**`scores` table** — all columns exist from Story 2.5:
- `id`, `fileId`, `projectId`, `tenantId`
- `mqmScore`, `totalWords`, `criticalCount`, `majorCount`, `minorCount`, `npt`
- `layerCompleted` (varchar 10): `'L1' | 'L1L2' | 'L1L2L3'`
- `status` (varchar 20): `'calculating' | 'calculated' | 'partial' | 'overridden' | 'auto_passed' | 'na'`
- `autoPassRationale` (TEXT — note: Epic 3.5 AC says "stored in jsonb" but actual schema is `text`. Story 3.5 may need a migration to change to jsonb if structured data is needed)
- `calculatedAt`

**`reviewSessions` table** — exists from Story 1.2
**`reviewActions` table** — exists from Story 1.2

### Types Consolidation (CRITICAL — 3 issues to fix)

**Issue 1: Duplicate `FindingStatus` with conflicting values**
There are TWO `FindingStatus` types that MUST be consolidated:
```typescript
// src/types/finding.ts (WRONG — 'edited' not in DB, missing 4 statuses)
export type FindingStatus = 'pending' | 'accepted' | 'rejected' | 'edited'

// src/features/scoring/types.ts (CORRECT — matches DB schema)
export type FindingStatus = 'pending' | 'accepted' | 're_accepted' | 'rejected'
  | 'flagged' | 'noted' | 'source_issue' | 'manual'
```
**Fix:** Expand `src/types/finding.ts` to the DB-aligned 8-value set, REMOVE `'edited'`. Then update `src/features/scoring/types.ts` to import from `src/types/finding.ts` (single source of truth). Verify `src/types/index.ts` re-export.

**Issue 2: `FindingSeverity` has phantom `'enhancement'`**
```typescript
// src/types/finding.ts (WRONG)
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'enhancement'

// DB schema (CORRECT — varchar(20) but only 3 values used)
// Fix: remove 'enhancement' — AI findings (L2/L3) use the same 3 severities
export type FindingSeverity = 'critical' | 'major' | 'minor'
```

**Issue 3: Epic file uses wrong store file name**
The Epic 3 definition says `review-store.ts` (kebab-case), but project naming convention is `review.store.ts` (dot-notation). The CORRECT name is `review.store.ts` — ignore the epic file's kebab-case name if you cross-reference it.

**Note on naming:** The Epic 3 AC uses `FindingState` but the codebase already has `FindingStatus`. This story uses `FindingStatus` (the existing name) expanded to 8 values. Do NOT create a separate `FindingState` type — it's the same concept.

### Testing Strategy

1. **Zustand Store Tests** — use `act()` wrapper, test state transitions independently, verify `resetForFile` clears everything
2. **Inngest Function Tests** — use `createDrizzleMock()` + mock `scoreFile()`, verify concurrency key, test onFailure handler
3. **Realtime Hook Tests** — mock Supabase client, test subscription setup/teardown, verify polling fallback with `vi.advanceTimersByTimeAsync`
4. **Debounce Tests** — use `vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync(500)`, verify batching behavior

### Performance Considerations

- **Score recalculation debounce (500ms)** — prevents rapid-fire Inngest events during bulk review actions
- **Inngest serial queue per project** — prevents race conditions on score calculation
- **Map-based findingsMap** — O(1) lookup/update for individual findings
- **Supabase Realtime + polling fallback** — ensures score updates reach UI even if WebSocket fails

### What This Story Does NOT Include

- No AI-related code (Stories 3.1-3.3)
- No UI components (Epic 4 handles ReviewPanel, FindingCard, etc.)
- No finding CRUD Server Actions (Epic 4 Story 4.2)
- No actual review workflow (Epic 4)
- No cost tracking or budget enforcement (Story 3.1)
- **This is pure infrastructure** — store, event schema, Inngest function, Realtime hook

### Project Structure Notes

All new files align with the unified project structure:

```
src/features/review/
├── stores/
│   ├── review.store.ts          ← NEW (Task 2)
│   └── review.store.test.ts     ← NEW (Task 2.7)
├── hooks/
│   ├── use-score-subscription.ts       ← NEW (Task 4)
│   ├── use-score-subscription.test.ts  ← NEW (Task 4.7)
│   └── use-finding-changed-emitter.ts  ← NEW (Task 5.4 — thin React wrapper, optional)

src/features/pipeline/inngest/
│   ├── recalculateScore.ts      ← NEW (Task 3)
│   └── recalculateScore.test.ts ← NEW (Task 3.7)

src/types/
│   ├── finding.ts               ← MODIFY (Task 1.1 — consolidate FindingStatus, fix FindingSeverity)
│   └── pipeline.ts              ← MODIFY (Task 1.4 — add FindingChangedEventData, per existing event type pattern)

src/features/scoring/
│   └── types.ts                 ← MODIFY (Task 1.1 — import FindingStatus from @/types/finding instead of defining own)

src/features/review/
├── utils/
│   ├── finding-changed-emitter.ts       ← NEW (Task 5 — plain utility, NOT React hook)
│   └── finding-changed-emitter.test.ts  ← NEW (Task 5.5)

src/lib/inngest/
│   └── client.ts                ← MODIFY (Task 1.4 — add finding.changed event)

src/app/api/inngest/
│   └── route.ts                 ← MODIFY (Task 3.5 — register recalculateScore)
```

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-3-ai-powered-quality-analysis.md#Story 3.0]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Decision 3.4 Score Recalculation]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Zustand Store Template]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Supabase Realtime Subscription]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Inngest Event Structure]
- [Source: _bmad-output/project-context.md#Inngest Rules]
- [Source: _bmad-output/project-context.md#Score Calculation Atomicity]
- [Source: CLAUDE.md#Coding Guardrails 1-15]
- [Source: src/features/scoring/helpers/scoreFile.ts — existing scoreFile() helper]
- [Source: src/features/pipeline/inngest/processFile.ts — Object.assign pattern reference]
- [Source: src/features/pipeline/stores/pipeline.store.ts — Map-based Zustand pattern]
- [Source: src/lib/inngest/client.ts — existing Events type to extend]
- [Source: src/db/schema/findings.ts — finding status enum set]
- [Source: src/db/schema/scores.ts — score status enum set]
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-02-26.md — Epic 2 learnings]
- [Source: _bmad-output/planning-artifacts/research/ai-sdk-spike-guide-2026-02-26.md — AI module patterns (for future reference)]
- [Source: _bmad-output/planning-artifacts/research/inngest-l2-l3-template-guide-2026-02-26.md — Inngest L2/L3 patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- recalculateScore.test.ts: `createDrizzleMock()` must be called via globalThis (not import) in `vi.hoisted()` — same pattern as all other test files
- Step mock generic type: `<T>(id, fn) => Promise<T>` requires cast from `vi.fn()` — extracted `createMockStep()` helper
- use-finding-changed-emitter.ts: `useRef` → `useMemo` to avoid React Compiler lint error "Cannot access refs during render"

### Completion Notes List

- Task 1: Consolidated `FindingStatus` (8 DB-aligned values), removed phantom `'enhancement'` from `FindingSeverity`, added `ScoreStatus` type, `FindingChangedEventData` in pipeline.ts, `finding.changed` event in Inngest client, `buildFindingChangedEvent` factory
- Task 2: Review store with 3 slices (findings, score, selection) + `resetForFile` — 15 tests GREEN
- Task 3: `recalculateScore` Inngest function with Object.assign pattern, onFailure handler, concurrency per project — 9 tests GREEN. `scoreFile()` refactored: `layerFilter` param, preserve existing `layerCompleted` — 27 tests GREEN (8 new incl. boundary, 19 existing backward-compat)
- Task 4: `useScoreSubscription` hook with Realtime + polling fallback with exponential backoff (5s→10s→20s→40s, max 60s) — 10 tests GREEN. Animation deferred to Epic 4 UI story
- Task 5: `createFindingChangedEmitter()` plain utility + `useFindingChangedEmitter()` React wrapper — 8 tests GREEN
- Task 6: type-check zero errors, lint zero errors (5 pre-existing warnings), 73/73 Story 3.0 tests pass

### Pre-CR Scan Results

**CR R1 — 18 findings (0C, 5H, 9M, 4L) — ALL FIXED**

| ID | Severity | File | Finding | Fix |
|----|----------|------|---------|-----|
| H1 | High | recalculateScore.test.ts | 3 tautological tests (concurrency, retries, trigger) — asserted only `toBeDefined()` | Extracted `fnConfig` + `triggerEvent` via Object.assign; tests now assert actual config values |
| H2 | High | use-score-subscription.test.ts | 3 backoff boundary tests assert "no crash" only | Added `mockFrom` call count assertions at each interval step |
| H3 | High | recalculateScore.test.ts | Malformed event test doesn't verify NonRetriableError type | Changed `.rejects.toThrow('message')` → `.rejects.toThrow(NonRetriableError)` |
| H4 | High | review.store.test.ts | Test name "initialize currentFileId as null" contradicts assertion `toBe('test-file-id')` | Replaced with "track currentFileId across multiple resetForFile calls" with multi-step assertion |
| H5 | High | use-score-subscription.ts | `void poll()` swallows errors (Guardrail #13) | Changed to `poll().catch(() => { /* best-effort */ })` |
| M1 | Medium | recalculateScore.ts | Bare `z.string()` for previousState/newState (Guardrail #3) | Changed to `z.enum(FINDING_STATUSES)` + `z.string().datetime()` for timestamp |
| M2 | Medium | use-score-subscription.ts | `SCORE_STATUS_VALUES` duplicated from finding.ts | Derived from `SCORE_STATUSES` const array: `new Set<string>(SCORE_STATUSES)` |
| M3 | Medium | use-score-subscription.ts | Realtime payload typed as concrete shape (not validated) | Changed to `Record<string, unknown>` with runtime type guards |
| M4 | Medium | use-score-subscription.test.ts | Recovery test has no assertions ("no crash") | Added `callsBeforeRecovery` tracking and post-recovery no-more-polls assertion |
| M5 | Medium | scoreFile.test.ts | Missing boundary tests for fileCount 49, 51 | Added 2 boundary tests for fileCount=49, fileCount=51 (neither should fire notification) |
| M6 | Medium | finding-changed-emitter.test.ts | Rapid changes test doesn't verify last-event-wins | Added `expect(mockTriggerFn).toHaveBeenCalledWith(lastEvent)` |
| M7 | Medium | Story file | Test count claims 66 but actual is 73 (after fixes) | Updated all counts in story file |
| M8 | Medium | Story file | Pre-CR Scan Results not populated | Populated (this section) |
| M9 | Medium | scoreFile.test.ts | layerFilter=undefined test doesn't confirm query executed | Added `expect(dbState.callIndex).toBeGreaterThanOrEqual(2)` |
| L1 | Low | review.store.test.ts | selectionMode not asserted in resetForFile test | Added `setSelectionMode('bulk')` before reset + `expect(selectionMode).toBe('single')` |
| L2 | Low | recalculateScore.test.ts | Missing `vi.mock('server-only')` guard | Added `vi.mock('server-only', () => ({}))` |
| L3 | Low | use-score-subscription.test.ts | mockSelect column string not asserted | Added `expect(mockSelect).toHaveBeenCalledWith('mqm_score, status')` |
| L4 | Low | review.store.test.ts | currentFileId initial null state never tested | Covered by H4 fix (multi-step tracking test) |

**Post-fix verification:** `npm run type-check` ✅ | `npm run lint` ✅ | 73/73 tests PASS ✅

### File List

**New Files:**
- `src/features/review/stores/review.store.ts` — Zustand review store (3 slices)
- `src/features/review/stores/review.store.test.ts` — 15 tests
- `src/features/review/hooks/use-score-subscription.ts` — Supabase Realtime hook
- `src/features/review/hooks/use-score-subscription.test.ts` — 10 tests
- `src/features/review/hooks/use-finding-changed-emitter.ts` — React wrapper hook
- `src/features/review/utils/finding-changed-emitter.ts` — Debounced emitter utility
- `src/features/review/utils/finding-changed-emitter.test.ts` — 8 tests
- `src/features/pipeline/inngest/recalculateScore.ts` — Inngest recalculate-score function
- `src/features/pipeline/inngest/recalculateScore.test.ts` — 9 tests

**Modified Files:**
- `src/types/finding.ts` — Consolidated FindingStatus (8 values), removed phantom 'enhancement', added ScoreStatus
- `src/types/pipeline.ts` — Added FindingChangedEventData type
- `src/types/index.ts` — Re-export ScoreStatus, FindingChangedEventData
- `src/features/scoring/types.ts` — Import FindingStatus from @/types/finding (single source of truth)
- `src/features/scoring/helpers/scoreFile.ts` — Added layerFilter param, preserve existing layerCompleted
- `src/features/scoring/helpers/scoreFile.test.ts` — 8 new ATDD tests for layerFilter refactor (incl. 2 boundary)
- `src/features/pipeline/inngest/processFile.ts` — Pass layerFilter: 'L1' to scoreFile
- `src/lib/inngest/client.ts` — Added finding.changed event to Events type
- `src/app/api/inngest/route.ts` — Registered recalculateScore function
- `src/test/factories.ts` — Added buildFindingChangedEvent factory

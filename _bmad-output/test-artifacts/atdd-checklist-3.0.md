---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-26'
---

# ATDD Checklist - Epic 3, Story 0: Score & Review Infrastructure

**Date:** 2026-02-26
**Author:** Mona
**Primary Test Level:** Unit (Vitest)

---

## Story Summary

Infrastructure story establishing the shared score recalculation pipeline, review state store, and real-time event system. No UI components, no AI calls — pure infrastructure for Stories 3.1-3.5.

**As a** Developer
**I want** shared score recalculation infrastructure, review state store, and real-time event system
**So that** Stories 3.1-3.5 can use consistent score lifecycle, finding state events, and real-time UI updates

---

## Acceptance Criteria

1. **AC1:** Zustand `useReviewStore` with 3 slices (findings, score, selection), file-scoped reset
2. **AC2:** `finding.changed` Inngest event schema + 500ms debounced emission utility
3. **AC3:** `recalculate-score` Inngest function with serial queue + `scoreFile()` refactor (all-layer support)
4. **AC4:** `useScoreSubscription` Supabase Realtime hook with polling fallback + exponential backoff
5. **AC5:** Comprehensive unit tests with boundary value coverage

---

## Test Strategy

### Test Level Selection

| AC | Test Level | Rationale |
|----|-----------|-----------|
| AC1 (Store) | Unit (jsdom) | Zustand store = pure state logic, no server deps |
| AC2 (Debounce) | Unit (node) | Plain utility function with timers |
| AC3 (Inngest) | Unit (node) | Inngest function + scoreFile refactor — mock DB |
| AC4 (Realtime) | Unit (jsdom) | React hook with Supabase client mock |
| AC5 (Boundary) | Unit (mixed) | Boundary tests embedded in each test file |

### No E2E / No API Tests

This story creates no UI components and no HTTP route handlers. All tests are Vitest unit tests.

---

## Failing Tests Created (RED Phase)

### Unit Tests — Review Store (15 tests)

**File:** `src/features/review/stores/review.store.test.ts`

- P0 `should initialize with empty findingsMap` — RED: store not created
- P0 `should add finding to findingsMap via setFinding` — RED: store not created
- P0 `should remove finding from findingsMap via removeFinding` — RED: store not created
- P0 `should update filterState via setFilter` — RED: store not created
- P0 `should update score and status via updateScore` — RED: store not created
- P0 `should set isRecalculating=true and scoreStatus='calculating' via setRecalculating` — RED: store not created
- P0 `should add id to selectedIds via toggleSelection` — RED: store not created
- P0 `should remove id from selectedIds when already selected` — RED: store not created
- P0 `should clear ALL state on resetForFile` — RED: store not created
- P1 `should update selectedId via setSelectedFinding` — RED: store not created
- P1 `should toggle selectionMode between single and bulk` — RED: store not created
- P1 `should clear selectedIds when switching from bulk to single mode` — RED: store not created
- P1-BV `should handle resetForFile with empty findingsMap` — RED: boundary
- P1-BV `should handle resetForFile with null score` — RED: boundary
- P1-BV `should handle updateScore with score=100 (0 contributing findings)` — RED: boundary

### Unit Tests — Debounce Emitter (8 tests)

**File:** `src/features/review/utils/finding-changed-emitter.test.ts`

- P0 `should call triggerFn after 500ms of silence` — RED: utility not created
- P0 `should NOT call triggerFn before 500ms` — RED: utility not created
- P0 `should emit only once for rapid changes within 500ms` — RED: utility not created
- P0 `should cancel pending emission via cancel()` — RED: utility not created
- P1 `should reset timer on each new emit() call` — RED: utility not created
- P1-BV `should NOT emit at exactly 499ms` — RED: boundary
- P1-BV `should emit at exactly 500ms` — RED: boundary
- P1-BV `should emit once for 10 rapid changes within 500ms` — RED: boundary

### Unit Tests — Inngest recalculateScore (8 tests)

**File:** `src/features/pipeline/inngest/recalculateScore.test.ts`

- P0 `should call scoreFile with correct params from event data` — RED: function not created
- P0 `should use triggeredBy as userId parameter` — RED: function not created
- P0 `should return new score result` — RED: function not created
- P0 `should have concurrency key set to event.data.projectId` — RED: function not created
- P0 `should expose handler and onFailure via Object.assign` — RED: function not created
- P1 `should log and write audit log in onFailure handler` — RED: function not created
- P1 `should have retries set to 3` — RED: function not created
- P1 `should be triggered by finding.changed event` — RED: function not created

### Unit Tests — Realtime Hook (10 tests)

**File:** `src/features/review/hooks/use-score-subscription.test.ts`

- P0 `should subscribe to scores table filtered by fileId` — RED: hook not created
- P0 `should update store currentScore on score change event` — RED: hook not created
- P0 `should update store scoreStatus on score change event` — RED: hook not created
- P0 `should cleanup channel on unmount` — RED: hook not created
- P1 `should fallback to polling on CHANNEL_ERROR` — RED: hook not created
- P1 `should resubscribe after channel recovery` — RED: hook not created
- P1 `should unsubscribe from old channel when fileId changes` — RED: hook not created
- P1-BV `should poll at 5s initial interval` — RED: boundary
- P1-BV `should increase polling interval: 5s → 10s → 20s → 40s` — RED: boundary
- P1-BV `should cap polling interval at 60s (NOT 80s)` — RED: boundary

### Unit Tests — scoreFile Refactor (6 tests)

**File:** `src/features/scoring/helpers/scoreFile.test.ts` (EXTEND existing)

- P0 `should query ALL findings when layerFilter is undefined` — RED: refactor not done
- P0 `should query only L1 findings when layerFilter is 'L1'` — RED: refactor not done
- P0 `should read existing layerCompleted from score row` — RED: refactor not done
- P0 `should preserve layerCompleted value (not hardcode L1)` — RED: refactor not done
- P1 `should maintain backward compatibility with existing callers` — RED: refactor not done
- P1-BV `should handle recalculation with 0 contributing findings (score=100)` — RED: boundary

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY)

### Debounce Timer (AC2)

| Boundary | At | Below | Above | Zero/Empty |
|----------|----|-------|-------|------------|
| 500ms debounce | `t === 500` (emit) | `t === 499` (no emit) | `t === 501` (emit) | `t === 0` (no emit) |
| Rapid batch count | 10 changes in 500ms → 1 emit | 1 change → 1 emit | N/A | 0 changes → 0 emits |

### Exponential Backoff (AC4)

| Boundary | At | Below | Above | Zero/Empty |
|----------|----|-------|-------|------------|
| Max interval 60s | 5th retry = 60s (cap) | 4th retry = 40s | 6th retry = 60s (still capped) | 1st retry = 5s |
| Backoff sequence | 5s → 10s → 20s → 40s → 60s | N/A | NOT 80s | Initial = 5s |

### Score Values (AC3/AC5)

| Boundary | At | Below | Above | Zero/Empty |
|----------|----|-------|-------|------------|
| 0 contributing findings | score = 100 | N/A | N/A | findingsMap empty |
| All rejected | score = 100 | N/A | N/A | N/A |
| Score range | score = 0 (worst) | N/A | score = 100 (best) | null (no score yet) |

---

## Data Factories Required

### Existing Factories (reuse from `src/test/factories.ts`)

- `buildFinding()` — Finding with faker UUIDs
- `buildDbFinding()` — DB finding insert type
- `buildScoringFinding()` — ContributingFinding (severity, status, segmentCount)
- `buildScoreRecord()` — Score DB record
- `buildPipelineEvent()` — pipeline event data

### New Factories to Add

- `buildFindingChangedEvent()` — `finding.changed` event data with tenantId, findingId, fileId, projectId, previousState, newState, triggeredBy, timestamp
- `buildReviewStoreState()` — Pre-populated review store state for testing

---

## Mock Requirements

### Supabase Realtime Mock (AC4)

**Channel mock pattern:**
```typescript
const mockChannel = {
  on: vi.fn().mockReturnValue(mockChannel),  // chaining
  subscribe: vi.fn(),
}
const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
}
```

### Inngest Step Mock (AC3)

**Step mock pattern:**
```typescript
const mockStep = {
  run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
  sendEvent: vi.fn((..._args: unknown[]) => Promise.resolve()),
}
```

### scoreFile Mock (AC3)

```typescript
const mockScoreFile = vi.fn((..._args: unknown[]) => Promise.resolve({
  scoreId: 'score-uuid', fileId: 'file-uuid', mqmScore: 85, npt: 15,
  totalWords: 1000, criticalCount: 0, majorCount: 3, minorCount: 0,
  status: 'calculated' as const, autoPassRationale: null,
}))
```

---

## Required data-testid Attributes

No UI components in this story — data-testid N/A.

---

## Implementation Checklist

### Phase 1: Types & Event Schema (AC2)

- [ ] Consolidate `FindingStatus` in `src/types/finding.ts` (remove 'edited', add 8 DB values)
- [ ] Fix `FindingSeverity` (remove 'enhancement')
- [ ] Define `ScoreStatus` type
- [ ] Define `FindingChangedEventData` in `src/types/pipeline.ts`
- [ ] Add `finding.changed` event to Inngest client
- [ ] Add `buildFindingChangedEvent()` factory
- [ ] Run: `npx vitest run src/features/review/utils/finding-changed-emitter.test.ts` — verify RED

### Phase 2: Zustand Review Store (AC1)

- [ ] Create `review.store.ts` with `'use client'` + 3 slices
- [ ] Implement `resetForFile(fileId)`
- [ ] Run: `npx vitest run src/features/review/stores/review.store.test.ts` — verify GREEN

### Phase 3: scoreFile Refactor (AC3 prerequisite)

- [ ] Add `layerFilter` param to `scoreFile()`
- [ ] Read existing `layerCompleted` from score row
- [ ] Update `processFile.ts` to pass `layerFilter: 'L1'`
- [ ] Run: `npx vitest run src/features/scoring/helpers/scoreFile.test.ts` — verify GREEN

### Phase 4: Inngest recalculateScore (AC3)

- [ ] Create `recalculateScore.ts` with Object.assign pattern
- [ ] Register in `route.ts`
- [ ] Run: `npx vitest run src/features/pipeline/inngest/recalculateScore.test.ts` — verify GREEN

### Phase 5: Debounce Emitter (AC2)

- [ ] Create `createFindingChangedEmitter()` utility
- [ ] Optionally create `useFindingChangedEmitter()` hook wrapper
- [ ] Run: `npx vitest run src/features/review/utils/finding-changed-emitter.test.ts` — verify GREEN

### Phase 6: Supabase Realtime Hook (AC4)

- [ ] Create `useScoreSubscription` hook
- [ ] Implement polling fallback with exponential backoff
- [ ] Run: `npx vitest run src/features/review/hooks/use-score-subscription.test.ts` — verify GREEN

### Phase 7: Integration & Validation (AC5)

- [ ] Run `npm run type-check` — zero errors
- [ ] Run `npm run lint` — zero warnings
- [ ] Run `npm run test:unit` — all pass
- [ ] Verify all Inngest functions registered in route.ts

---

## Running Tests

```bash
# Run all Story 3.0 tests
npx vitest run src/features/review/ src/features/pipeline/inngest/recalculateScore.test.ts src/features/scoring/helpers/scoreFile.test.ts

# Run specific test file
npx vitest run src/features/review/stores/review.store.test.ts

# Watch mode for a specific file
npx vitest src/features/review/stores/review.store.test.ts

# Full unit test suite
npm run test:unit

# Type check
npm run type-check
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

- 47 `it.skip()` test stubs created across 5 test files
- All tests assert expected behavior (not placeholders)
- Tests fail because implementation doesn't exist yet
- Boundary value tests explicitly listed per Epic 2 retro A2

### GREEN Phase (DEV Team)

1. Pick one test file at a time (suggested order: Types → Store → scoreFile → Inngest → Debounce → Realtime)
2. Read the test to understand expected behavior
3. Implement minimal code to make that specific test pass
4. Remove `it.skip()` → run test → verify GREEN
5. Move to next test

### REFACTOR Phase

After all 47 tests pass:
1. Run full suite: `npm run test:unit`
2. Run 3 pre-CR agents (anti-pattern-detector, tenant-isolation-checker, code-quality-analyzer)
3. Clean up any duplication across test files

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run src/features/review/ src/features/pipeline/inngest/recalculateScore.test.ts`

**Expected Results:**
- Total tests: 47
- Passing: 0 (all skipped)
- Skipped: 47
- Status: RED phase verified

---

## Notes

- Story 3.0 is **pure infrastructure** — no AI calls, no UI components
- Vitest workspace: store + hook tests run in `jsdom` project, Inngest + scoreFile tests run in `unit` (node) project
- Factory pattern: extend `src/test/factories.ts` (do NOT create new factory file)
- Mock pattern: use `createDrizzleMock()` from `src/test/drizzleMock.ts` for all DB tests
- Supabase Realtime mock: `mockChannel.on.mockReturnValue(mockChannel)` (chaining pattern from MEMORY.md)
- Timer tests: always use `vi.advanceTimersByTimeAsync` (NOT `vi.advanceTimersByTime`)

---

**Generated by BMad TEA Agent** - 2026-02-26

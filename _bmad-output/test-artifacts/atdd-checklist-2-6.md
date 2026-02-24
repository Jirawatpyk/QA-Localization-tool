---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-24'
---

# ATDD Checklist - Epic 2, Story 6: Inngest Pipeline Foundation & Processing Modes

**Date:** 2026-02-24
**Author:** Mona
**Primary Test Level:** Unit (Vitest) + Component (jsdom/RTL)
**TDD Phase:** RED (all tests skipped — awaiting implementation)

---

## Story Summary

Story 2.6 introduces the Inngest pipeline foundation for orchestrating the 3-layer QA processing. It extracts shared helpers from existing Server Actions, creates Inngest orchestrator functions (per-file and batch), adds a ProcessingModeDialog UI component, and establishes the pipeline Zustand store.

**As a** QA Reviewer
**I want** to choose between Economy and Thorough processing modes and see rule-based results instantly
**So that** I can balance speed/cost with analysis depth and start reviewing while AI processes

---

## Acceptance Criteria

1. ProcessingModeDialog appears with Economy (default, FR14) and Thorough cards, cost bar, Cancel + Start buttons
2. Inngest orchestrator reads project config, runs L1 per file via `step.run("l1-rules-{fileId}")`, scores via `step.run("score-{fileId}")`
3. L1 results persisted to DB, score calculated with `layer_completed = 'L1'`, file status transitions correctly
4. Economy mode: only L1 executed (L2/L3 in Epic 3)
5. Thorough mode: only L1 in this story, mode preference persisted to `projects.processing_mode`
6. Error handling: 3 retries with exponential backoff, `onFailure` handler sets file to "failed"
7. Batch of 10 files: fan-out to individual events, score serialized per project via concurrency key

---

## TDD Red Phase — Test Generation Results

### Summary

| Metric | Value |
|--------|-------|
| Total Tests | **100** (all `it.skip()`) |
| Backend Unit Tests | 84 |
| Frontend Component Tests | 16 |
| Test Files | 9 |
| Stub Files | 9 |
| Vitest Result | `100 skipped (100)` — 0 failures |
| Existing Suite | `1197 passed` — no regressions |

### Test Files Created

#### Stream A: Backend Unit Tests (84 tests)

| # | File | Tests | Module Under Test | Priority |
|---|------|-------|-------------------|----------|
| 1 | `src/features/pipeline/helpers/runL1ForFile.test.ts` | 18 | `runL1ForFile()` — extracted L1 helper | P0 |
| 2 | `src/features/scoring/helpers/scoreFile.test.ts` | 15 | `scoreFile()` — extracted scoring helper | P0 |
| 3 | `src/features/pipeline/inngest/processFile.test.ts` | 15 | `processFilePipeline` — Inngest per-file function | P0 |
| 4 | `src/features/pipeline/inngest/processBatch.test.ts` | 10 | `processBatch` — Inngest batch fan-out | P0 |
| 5 | `src/features/pipeline/actions/startProcessing.action.test.ts` | 12 | `startProcessing()` — Server Action | P0 |
| 6 | `src/features/pipeline/validation/pipelineSchema.test.ts` | 6 | `startProcessingSchema` — Zod validation | P1 |
| 7 | `src/features/pipeline/stores/pipeline.store.test.ts` | 8 | `usePipelineStore` — Zustand store | P1 |

#### Stream B: Frontend Component Tests (16 tests)

| # | File | Tests | Component | Priority |
|---|------|-------|-----------|----------|
| 8 | `src/features/pipeline/components/ProcessingModeDialog.test.tsx` | 10 | ProcessingModeDialog | P1 |
| 9 | `src/features/pipeline/components/ModeCard.test.tsx` | 6 | ModeCard | P1-P2 |

### Stub Files Created (TDD RED phase — throw-on-use)

| # | Stub File | Purpose |
|---|-----------|---------|
| 1 | `src/features/pipeline/helpers/runL1ForFile.ts` | L1 helper extraction target |
| 2 | `src/features/scoring/helpers/scoreFile.ts` | Scoring helper extraction target |
| 3 | `src/features/pipeline/inngest/processFile.ts` | Per-file Inngest function |
| 4 | `src/features/pipeline/inngest/processBatch.ts` | Batch fan-out Inngest function |
| 5 | `src/features/pipeline/actions/startProcessing.action.ts` | Server Action entry point |
| 6 | `src/features/pipeline/validation/pipelineSchema.ts` | Zod schema (actual impl) |
| 7 | `src/features/pipeline/stores/pipeline.store.ts` | Zustand pipeline store |
| 8 | `src/features/pipeline/components/ProcessingModeDialog.tsx` | Dialog component |
| 9 | `src/features/pipeline/components/ModeCard.tsx` | Mode card component |

---

## Acceptance Criteria Coverage Matrix

| AC | Description | Test Files | Tests |
|----|-------------|------------|-------|
| AC1 | ProcessingModeDialog UI | ProcessingModeDialog.test.tsx, ModeCard.test.tsx | 16 |
| AC2 | Inngest orchestrator L1+score steps | processFile.test.ts | 15 |
| AC3 | L1 results DB persist + score + status | runL1ForFile.test.ts, scoreFile.test.ts | 33 |
| AC4 | Economy mode L1 only | processFile.test.ts (mode tests) | 2 |
| AC5 | Thorough mode + persist preference | processFile.test.ts, startProcessing.action.test.ts | 3 |
| AC6 | Error handling + onFailure | processFile.test.ts (onFailure tests), runL1ForFile.test.ts (rollback) | 6 |
| AC7 | Batch fan-out + concurrency | processBatch.test.ts, processFile.test.ts (concurrency) | 11 |
| — | Zod validation | pipelineSchema.test.ts | 6 |
| — | Zustand store | pipeline.store.test.ts | 8 |

**Coverage:** All 7 ACs mapped to tests. 100% AC coverage.

---

## Test Patterns Used

- **Proxy-based chainable DB mock** with `vi.hoisted()` + sequential `dbState.returnValues` array
- **`vi.mock('server-only', () => ({}))`** on Server Action tests
- **`createMockStep()`** for Inngest step simulation: `{ run, sendEvent }`
- **Test factories** from `src/test/factories.ts` (`buildSegment`, `buildDbFinding`, etc.)
- **Dynamic imports** (`await import('./module')`) inside `it.skip` blocks
- **Valid RFC4122 v4 UUIDs** for Zod v4 strict enforcement
- **Inngest v3 onFailure** nested event structure: `event.data.event.data`

---

## Next Steps (TDD Green Phase)

After implementing Story 2.6:

1. Remove `it.skip()` → change to `it()` in all 9 test files
2. Run: `npx vitest run --project unit` for targeted files
3. Verify all 100 tests PASS (green phase)
4. If any fail → fix implementation (feature bug) or fix test (test bug)
5. Commit passing tests

### Implementation Order (recommended)

1. Task 1: Extract `runL1ForFile.ts` + `scoreFile.ts` shared helpers → 33 tests go green
2. Task 2-3: Inngest functions `processFile.ts` + `processBatch.ts` → 25 tests go green
3. Task 4-5: `startProcessing.action.ts` + `pipelineSchema.ts` → 18 tests go green
4. Task 6: `pipeline.store.ts` → 8 tests go green
5. Task 7: `ProcessingModeDialog.tsx` + `ModeCard.tsx` → 16 tests go green

---

## Validation (Step 5)

| Validation Check | Result |
|-----------------|--------|
| Prerequisites (vitest.config.ts, factories.ts) | PASS |
| 9 test files created + compiled | PASS |
| 100 tests all use `it.skip()` | PASS |
| All 7 ACs covered | PASS |
| No placeholder assertions | PASS |
| No orphaned browsers/CLI | PASS |
| Artifacts in `_bmad-output/test-artifacts/` | PASS |
| Existing suite not regressed (1197 passed) | PASS |

### Risks & Assumptions

1. **Inngest v3 API**: Tests assume `createFunction` config shape and v3 nested `onFailure` event structure. Verify against Inngest v3.52.0 docs during implementation.
2. **Server-Only Boundary**: `runL1ForFile.ts` and `scoreFile.ts` must NOT have `'use server'` or `import 'server-only'` to remain importable from Inngest. Tests verify this indirectly.
3. **Zustand Map vs Object**: `pipeline.store.test.ts` handles both `Map<string, FileProcessingState>` and plain object — implementation can choose either.
4. **Pre-existing failure**: `src/app/api/upload/route.test.ts` has 1 flaky test unrelated to Story 2.6.

### Completion Status

**ATDD Workflow: COMPLETE**

- Checklist: `_bmad-output/test-artifacts/atdd-checklist-2-6.md`
- Next recommended workflow: **Implementation** (Dev starts Story 2.6, guided by failing tests)

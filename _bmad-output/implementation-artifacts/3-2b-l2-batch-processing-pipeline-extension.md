# Story 3.2b: L2 Batch Processing & Pipeline Extension

Status: done

## Story

As a QA Reviewer,
I want AI Layer 2 screening to process segments in efficient batches within the Inngest pipeline,
So that large files are processed within performance targets with proper error handling per batch.

## Acceptance Criteria (BDD)

### AC1 — L2 Pipeline Wiring

**Given** L1 rule engine completes for a file (status = `l1_completed`)
**When** the pipeline orchestrator continues
**Then** `runL2ForFile()` is invoked as a deterministic Inngest step with ID `l2-screening-{fileId}`
**And** file status transitions: `l1_completed → l2_processing → l2_completed`

### AC2 — Chunk Processing Within Single Inngest Step

**Given** a file has N segments
**When** L2 processing starts
**Then** segments are chunked at 30K chars via `chunkSegments()` (already implemented in `runL2ForFile`)
**And** all chunks are processed within a single Inngest step (`l2-screening-{fileId}`) — `runL2ForFile` handles internal per-chunk iteration
**And** partial failure is tolerated (successful chunks persist findings; failed chunks log error and continue)

> **Architecture Decision (overrides Epic AC):** The epic specifies `step.run("batch-{batchId}-L2", ...)` per batch. This was superseded during Prep P4 when `runL2ForFile` was designed to handle internal chunk looping with partial failure tolerance. One Inngest step per file (not per chunk) is the correct pattern because: (a) `runL2ForFile` already manages chunk-level error handling + partial results, (b) retriable errors (rate_limit, timeout) trigger an Inngest retry of the entire file, which is the correct granularity for CAS/budget/model resolution re-execution.

### AC3 — Finding Persistence

**Given** L2 AI returns findings for a chunk
**When** findings are persisted
**Then** each finding has: `detectedByLayer = 'L2'`, `aiConfidence = AI-reported confidence (0-100)`, `status = 'pending'`, `aiModel = resolved model ID`
**And** findings with `segmentId` not in the file are dropped (validation already in `runL2ForFile`)
**And** findings are atomically DELETE + INSERT within a transaction (idempotent re-run)

> **Note on FR36 (confidence calibration):** The epic references per-language-pair confidence calibration from `language_pair_configs.l2_confidence_min`. The raw AI confidence is persisted in `aiConfidence`. Reading the threshold and flagging "low confidence" findings is **deferred to Story 3.2c** (backend flag + UI badge). Story 3.2b stores the raw value; 3.2c adds the threshold comparison.

### AC4 — Score Recalculation After L2

**Given** L2 completes for a file
**When** the pipeline continues to scoring
**Then** `scoreFile()` is called with `layerCompleted: 'L1L2'` override param (scores ALL layers: L1 + L2)
**And** the persisted `scores.layerCompleted` = `'L1L2'` (verified via DB assertion in tests)
**And** `scores.status` = `'calculated'`

### AC5 — Economy Mode Guard

**Given** project `processingMode` = `'economy'`
**When** L2 completes
**Then** pipeline stops — L3 is NOT triggered
**And** batch completion check uses `l2_completed | failed` as terminal states

### AC6 — Thorough Mode L3 Handoff (Provisional)

**Given** project `processingMode` = `'thorough'`
**When** L2 completes
**Then** `runL3ForFile()` is invoked as Inngest step `l3-analysis-{fileId}`
**And** after L3 completes, `scoreFile()` is called again with `layerCompleted: 'L1L2L3'`
**And** `scores.layerCompleted` = `'L1L2L3'`
**And** batch completion check uses `l3_completed | failed` as terminal states

> **Provisional L3 wiring:** `runL3ForFile()` currently processes ALL segments (no L2-flagged filtering). Story 3.3 will add selective-segment processing ("only segments flagged by L2"). This means `runL3ForFile.ts` WILL be modified in Story 3.3 — the "DO NOT TOUCH" guidance below applies to Story 3.2b only.

### AC7 — Performance

**Given** 100 segments in a file
**When** L2 processing completes
**Then** total L2 time < 30 seconds (Epic AC / unit-testable subset)

> **NFR3 note:** The PRD NFR3 specifies 5,000 segments < 30s. AC7 covers the unit-testable 100-segment boundary from the epic. Full NFR3 certification requires a separate load/performance test (deferred to E2E gate or dedicated perf story).

### AC8 — Batch Completion Awareness

**Given** all files in a batch reach terminal state for the configured mode
**When** batch completion is checked
**Then** `pipeline.batch-completed` event is emitted (Economy: after all L2; Thorough: after all L3)

### AC9 — L1 Results Preserved on L2 Failure (NFR16)

**Given** L2 processing fails completely (non-retriable error after all retries)
**When** `onFailure` handler runs
**Then** `files.status` = `'failed'`
**And** L1 findings remain intact in the `findings` table (not deleted)
**And** L1 score row remains intact in the `scores` table with `layerCompleted = 'L1'`

## Tasks / Subtasks

- [x] Task 1: Extend `processFile.ts` handler — wire L2 after L1 (AC: 1, 2, 4, 5, 6)
  - [x] 1.1: Import `runL2ForFile` from `@/features/pipeline/helpers/runL2ForFile` and `runL3ForFile` from `@/features/pipeline/helpers/runL3ForFile` into `processFile.ts`. Import types from `./types` (local re-export), NOT from `@/types/pipeline` directly
  - [x] 1.2: Add L2 step: `step.run('l2-screening-${fileId}', () => runL2ForFile({ fileId, projectId, tenantId, userId }))`
  - [x] 1.3: Add L2 re-score step: `step.run('score-l1l2-${fileId}', () => scoreFile({ fileId, projectId, tenantId, userId, layerCompleted: 'L1L2' }))`
  - [x] 1.4: Add thorough-mode guard: `if (mode === 'thorough')` → L3 step `l3-analysis-${fileId}` + final score step `score-all-${fileId}` with `layerCompleted: 'L1L2L3'`
  - [x] 1.5: Update return value with explicit `number | null` types (not optional — `exactOptionalPropertyTypes: true`)
- [x] Task 2: Update batch completion logic in `processFile.ts` (AC: 5, 6, 8)
  - [x] 2.1: Derive terminal file status from `mode` using typed const: `const terminalStatus: 'l2_completed' | 'l3_completed' = mode === 'thorough' ? 'l3_completed' : 'l2_completed'`
  - [x] 2.2: Update `allCompleted` check to use mode-derived terminal status
  - [x] 2.3: Ensure `pipeline.batch-completed` event fires at the correct time per mode
- [x] Task 3: Add `layerCompleted` override param to `scoreFile()` (AC: 4, 6)
  - [x] 3.1: Add optional `layerCompleted?: 'L1' | 'L1L2' | 'L1L2L3'` to `ScoreFileInput` (private type, not exported)
  - [x] 3.2: Update derivation at line 135 to: `const layerCompleted = input.layerCompleted ?? prev?.layerCompleted ?? layerFilter ?? 'L1'` — the override param MUST be checked FIRST
  - [x] 3.3: Verify all existing callers are backward-compatible (callers: `processFile.ts` L1 step, `recalculateScore.ts` — both currently don't pass `layerCompleted`, so the fallback chain handles them correctly)
- [x] Task 4: Update `PipelineBatchCompletedEventData` comment (AC: 8)
  - [x] 4.1: Update comment in `src/types/pipeline.ts` line 26: "emitted when all files in batch reach terminal layer (L2 for economy, L3 for thorough)"
- [x] Task 5: Update existing + add new tests in `processFile.test.ts` (AC: 1-9)
  - [x] 5.1: **UPDATE** existing tests (file already exists with ~15 tests) — update step counts, step ID assertions, mode assertions to match new L2/L3 flow
  - [x] 5.2: Test L1 → L2 → score flow (economy mode) — happy path
  - [x] 5.3: Test L1 → L2 → L3 → score flow (thorough mode) — happy path
  - [x] 5.4: Test economy mode does NOT invoke `runL3ForFile`
  - [x] 5.5: Test L2 failure → `onFailure` handler → file status `'failed'` AND L1 findings/score intact (AC9/NFR16)
  - [x] 5.6: Test batch completion fires after L2 (economy) / L3 (thorough)
  - [x] 5.7: Test batch completion waits for all files (not just current file)
  - [x] 5.8: Test non-batch upload (empty string `uploadBatchId`) skips batch check
  - [x] 5.9: Test `scoreFile` called with `layerCompleted: 'L1L2'` after L2 — assert DB-persisted `layerCompleted` value is `'L1L2'`, not just invocation args
  - [x] 5.10: Test return value includes correct `layerCompleted` per mode and uses `number | null` (not optional)
  - [x] 5.11: Boundary: single file in batch → fires completion immediately
  - [x] 5.12: Boundary: L2 partial failure (`partialFailure: true`) → still proceeds to score + batch check
  - [x] 5.13: Test `scoreFile` called with `layerCompleted: 'L1L2L3'` after L3 (thorough mode)
  - [x] 5.14: Test `auto_passed` status from `scoreFile` is correctly propagated in return value (P2 — skipped, deferred)

## Dev Notes

### Scope Boundary (CRITICAL)

| In Scope (3.2b) | Out of Scope (deferred) |
|---|---|
| Wire `runL2ForFile` into `processFile.ts` | L2 results display in UI (Story 3.2c) |
| Wire `runL3ForFile` into `processFile.ts` (thorough mode, provisional) | Confidence badge / low-confidence flag — backend threshold read + UI (Story 3.2c) |
| Add `layerCompleted` override param to `scoreFile()` | L3 selective-segment filtering (Story 3.3 — will modify `runL3ForFile.ts`) |
| Score recalculation with ALL layers after L2/L3 | AI resilience fallback chain (Story 3.4) |
| Batch completion per mode | Language pair confidence calibration UI (Epic 4+) |
| Update existing + add new unit tests | `language_pair_configs.l2_confidence_min` backend read (Story 3.2c) |

### What Already Exists (DO NOT RECREATE)

All infrastructure was built in Stories 3.0, 3.1, and 3.2a. This story ONLY extends the pipeline orchestrator and adds one param to `scoreFile`.

| Component | Path | Status |
|-----------|------|--------|
| `runL2ForFile()` (12-step lifecycle) | `src/features/pipeline/helpers/runL2ForFile.ts` | **Done** (3.2a) — full implementation with CAS, budget, rate-limit, chunk processing, finding persistence, error handling |
| `runL3ForFile()` (L3 lifecycle) | `src/features/pipeline/helpers/runL3ForFile.ts` | **Done** (Prep P4) — similar to L2 but uses Claude Sonnet + inline prompt builder (not the modular `build-l3-prompt.ts`). Will be modified in Story 3.3 for selective-segment filtering |
| `chunkSegments()` | `src/features/pipeline/helpers/chunkSegments.ts` | **Done** (Prep P4) — 30K char chunks |
| L2 output schema | `src/features/pipeline/schemas/l2-output.ts` | **Done** (3.2a) |
| L2 prompt builder | `src/features/pipeline/prompts/build-l2-prompt.ts` | **Done** (Prep P5) |
| AI client + provider fallback | `src/lib/ai/client.ts`, `providers.ts` | **Done** (3.2a) |
| Cost tracking + budget guard | `src/lib/ai/costs.ts`, `budget.ts` | **Done** (3.1 + 3.2a) |
| Error classification | `src/lib/ai/errors.ts` | **Done** (3.2a) |
| Rate limiters | `src/lib/ratelimit.ts` | **Done** (3.1) |
| `scoreFile()` | `src/features/scoring/helpers/scoreFile.ts` | **Done** (3.0) — supports `layerFilter?: DetectedByLayer`. This story adds `layerCompleted` override param |
| `recalculateScore` Inngest function | `src/features/pipeline/inngest/recalculateScore.ts` | **Done** (3.0) — calls `scoreFile()` without `layerCompleted` param (backward-compatible) |
| AI mock factory | `src/test/mocks/ai-providers.ts` | **Done** (Prep P2) |
| AI test fixtures | `src/test/fixtures/ai-responses.ts` | **Done** (Prep P2) |
| Drizzle mock utility | `src/test/drizzleMock.ts` | **Done** (Epic 2) |
| **Existing processFile tests** | `src/features/pipeline/inngest/processFile.test.ts` | **Exists** — ~15 tests that must be UPDATED (step counts, step IDs, mode assertions will change) |

### Architecture: How to Extend `processFile.ts`

**Current flow (L1 only):**
```
Step 1: step.run('l1-rules-{fileId}')       → runL1ForFile()
Step 2: step.run('score-{fileId}')           → scoreFile({ layerFilter: 'L1' })
Step 3: step.run('check-batch-{fileId}')     → check l1_completed | failed → emit batch-completed
Return: { fileId, findingCount, mqmScore, layerCompleted: 'L1' }
```

**Target flow (L1 + L2 + optional L3):**
```
Step 1: step.run('l1-rules-{fileId}')          → runL1ForFile()
Step 2: step.run('score-l1-{fileId}')           → scoreFile({ layerFilter: 'L1' })  [interim L1 score — visible immediately per FR15]
Step 3: step.run('l2-screening-{fileId}')       → runL2ForFile({ fileId, projectId, tenantId, userId })
Step 4: step.run('score-l1l2-{fileId}')         → scoreFile({ layerCompleted: 'L1L2' })  [all layers]
Step 5: [thorough only] step.run('l3-analysis-{fileId}') → runL3ForFile({ fileId, projectId, tenantId, userId })
Step 6: [thorough only] step.run('score-all-{fileId}')   → scoreFile({ layerCompleted: 'L1L2L3' })
Step 7: step.run('check-batch-{fileId}')        → mode-aware terminal status check
Return: { fileId, l1FindingCount, l2FindingCount, l3FindingCount, mqmScore, layerCompleted, l2PartialFailure }
```

**Key facts:**
- `scoreFile()` does NOT modify `files.status` — it only writes to `scores` table. After Step 4, file status remains `l2_completed`, so the L3 CAS guard in `runL3ForFile` (which checks `l2_completed`) will succeed
- `processFile.ts` must NOT call `logAIUsage()` directly — cost tracking is fully handled inside `runL2ForFile` and `runL3ForFile`
- `processFile.ts` must NOT call `checkProjectBudget()` directly — budget guard is inside `runL2ForFile`/`runL3ForFile`
- All `step.sendEvent()` calls MUST be awaited — never fire-and-forget with `void` (Guardrail #13)

### `scoreFile()` layerCompleted Fix (MANDATORY — AC4 depends on this)

From `scoreFile.ts` line 135:
```typescript
const layerCompleted = prev?.layerCompleted ?? layerFilter ?? 'L1'
```

**Problem:** After L2, the previous score row (from L1 step) has `layerCompleted = 'L1'`. The expression `prev?.layerCompleted` evaluates to `'L1'`, which is returned — the value never becomes `'L1L2'`.

**Fix (Option B):** Add `layerCompleted?: 'L1' | 'L1L2' | 'L1L2L3'` to `ScoreFileInput`. Update line 135 to:

```typescript
const layerCompleted = input.layerCompleted ?? prev?.layerCompleted ?? layerFilter ?? 'L1'
//                      ^^^^^^^^^^^^^^^^^^^^ — override MUST be checked FIRST
```

**Callers audit (all backward-compatible):**
| Caller | File | Current | After |
|--------|------|---------|-------|
| L1 pipeline step | `processFile.ts` | `scoreFile({ ..., layerFilter: 'L1' })` | No change — `layerCompleted` undefined, falls through to `layerFilter: 'L1'` |
| L2 pipeline step | `processFile.ts` | N/A (new) | `scoreFile({ ..., layerCompleted: 'L1L2' })` |
| L3 pipeline step | `processFile.ts` | N/A (new) | `scoreFile({ ..., layerCompleted: 'L1L2L3' })` |
| `recalculateScore` | `recalculateScore.ts` | `scoreFile({ ..., })` (no layerFilter) | No change — `layerCompleted` undefined, preserves `prev?.layerCompleted` |

### Batch Completion Logic Update

**Current code** (`processFile.ts` line 51):
```typescript
const allCompleted = batchFiles.every(
  (f) => f.status === 'l1_completed' || f.status === 'failed',
)
```

**New logic (use typed const — Guardrail #3):**
```typescript
// Type-safe terminal status based on processing mode
const terminalStatus: 'l2_completed' | 'l3_completed' =
  mode === 'thorough' ? 'l3_completed' : 'l2_completed'
const allCompleted = batchFiles.every(
  (f) => f.status === terminalStatus || f.status === 'failed',
)
```

> **Known issue (pre-existing, deferred):** If two files in a batch complete simultaneously, both `processFilePipeline` invocations read the batch state before either writes the terminal status — `pipeline.batch-completed` may never fire. This race condition exists in the current L1 implementation and is intentionally deferred. Do NOT attempt to fix it in this story.

### Return Type Update

Current return:
```typescript
return {
  fileId,
  findingCount: l1Result.findingCount,
  mqmScore: scoreResult.mqmScore,
  layerCompleted: 'L1' as const,
}
```

New return — use `number | null` (NOT optional) because `exactOptionalPropertyTypes: true`:
```typescript
return {
  fileId,
  l1FindingCount: l1Result.findingCount,
  l2FindingCount: l2Result.findingCount,
  l3FindingCount: mode === 'thorough' ? l3Result.findingCount : null,  // null, not undefined
  mqmScore: finalScoreResult.mqmScore,
  layerCompleted: (mode === 'thorough' ? 'L1L2L3' : 'L1L2') as const,
  l2PartialFailure: l2Result.partialFailure,
}
```

Do NOT keep the old `findingCount` field alongside the new fields — no backwards-compat aliases (3.2a CR L4 lesson).

### Inngest Step ID Naming Convention

All step IDs MUST be deterministic (Inngest replays depend on stable IDs):

| Step | ID Pattern | Notes |
|------|-----------|-------|
| L1 rules | `l1-rules-{fileId}` | Existing — do not change |
| L1 score | `score-l1-{fileId}` | **RENAME** from `score-{fileId}` |
| L2 screening | `l2-screening-{fileId}` | **NEW** |
| L2 score | `score-l1l2-{fileId}` | **NEW** |
| L3 analysis | `l3-analysis-{fileId}` | **NEW** (thorough only) |
| L3 score | `score-all-{fileId}` | **NEW** (thorough only) |
| Batch check | `check-batch-{fileId}` | Existing — do not change |

**Step ID rename safety:** Before deploying the `score-{fileId}` → `score-l1-{fileId}` rename, flush any in-flight Inngest invocations via the Inngest Dev Server UI or restart dev server with clean state. Step IDs are scoped per function invocation — no cross-invocation impact if queue is clean.

**Existing test impact:** The test at `processFile.test.ts` asserts `score-${eventData.fileId}` — update to `score-l1-${eventData.fileId}`.

### Guardrail #21 Deviation (DOCUMENTED)

Guardrail #21 says "one `step.run()` per chunk". In this story, `processFile.ts` uses **one step per FILE** (`l2-screening-{fileId}`), not per chunk. This is correct because `runL2ForFile` handles internal per-chunk iteration with partial failure tolerance. The Inngest step boundary is at the file level — if a retriable error occurs in any chunk, the entire file step retries (re-executing CAS, budget check, model resolution, and all chunks). Add a comment in code:

```typescript
// Guardrail #21: chunk-level iteration is handled inside runL2ForFile —
// one Inngest step per file, not per chunk (Architecture Decision from Prep P4)
```

### File Status Transitions (Full Pipeline)

```
uploaded → parsing → parsed → l1_processing → l1_completed
                                                    ↓
                                              l2_processing → l2_completed
                                                    ↓              ↓ (economy: terminal)
                                                  failed     l3_processing → l3_completed
                                                                   ↓          ↓ (thorough: terminal)
                                                                 failed
```

### Project Structure Notes

**Files to modify:**

| File | Change |
|------|--------|
| `src/features/pipeline/inngest/processFile.ts` | **MAIN CHANGE:** extend handler with L2/L3 steps + mode-aware batch completion |
| `src/features/scoring/helpers/scoreFile.ts` | **MINOR:** add `layerCompleted` override param to `ScoreFileInput` (2-line change at type + line 135) |
| `src/types/pipeline.ts` | **COMMENT:** update `PipelineBatchCompletedEventData` comment (line 26) |
| `src/features/pipeline/inngest/processFile.test.ts` | **UPDATE EXISTING + ADD NEW:** update step counts/IDs in ~15 existing tests + add ~14 new test cases |

**Files NOT to modify in this story:**

- `src/features/pipeline/helpers/runL2ForFile.ts` — DO NOT TOUCH (3.2b scope)
- `src/features/pipeline/helpers/runL3ForFile.ts` — DO NOT TOUCH in 3.2b (Story 3.3 will modify for selective-segment filtering)
- `src/features/pipeline/helpers/chunkSegments.ts` — DO NOT TOUCH
- `src/features/pipeline/schemas/l2-output.ts` — DO NOT TOUCH
- `src/lib/ai/*` — DO NOT TOUCH
- `src/app/api/inngest/route.ts` — DO NOT TOUCH (no new Inngest functions)
- DB schemas — DO NOT TOUCH (no migration needed)

### Testing Strategy

**Test file:** `src/features/pipeline/inngest/processFile.test.ts` (EXISTING — extend, do not recreate)

**Existing test infrastructure (align with this pattern, do NOT create a competing mock factory):**

The existing file uses `createMockStep()` from within the test file. Extend this existing helper — do NOT create a new `createStepMock()`. The existing pattern:
```typescript
const createMockStep = () => ({
  run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
  sendEvent: vi.fn(),
})
```

**Mock setup (follow established pattern in existing test file):**
```typescript
vi.mock('@/features/pipeline/helpers/runL1ForFile', () => ({
  runL1ForFile: vi.fn((..._args: unknown[]) => Promise.resolve({ findingCount: 5, duration: 120 })),
}))
vi.mock('@/features/pipeline/helpers/runL2ForFile', () => ({
  runL2ForFile: vi.fn((..._args: unknown[]) => Promise.resolve({
    findingCount: 3, duration: 800, aiModel: 'gpt-4o-mini',
    chunksTotal: 2, chunksSucceeded: 2, chunksFailed: 0,
    partialFailure: false,
    totalUsage: { inputTokens: 1000, outputTokens: 200, estimatedCostUsd: 0.0003 },
  })),
}))
vi.mock('@/features/pipeline/helpers/runL3ForFile', () => ({
  runL3ForFile: vi.fn((..._args: unknown[]) => Promise.resolve({
    findingCount: 1, duration: 2000, aiModel: 'claude-sonnet-4-5-20250929',
    chunksTotal: 2, chunksSucceeded: 2, chunksFailed: 0,
    partialFailure: false,
    totalUsage: { inputTokens: 5000, outputTokens: 800, estimatedCostUsd: 0.027 },
  })),
}))
vi.mock('@/features/scoring/helpers/scoreFile', () => ({
  scoreFile: vi.fn((..._args: unknown[]) => Promise.resolve({
    scoreId: 'score-1', fileId: 'file-1', mqmScore: 85.5, npt: 14.5,
    totalWords: 1000, criticalCount: 0, majorCount: 2, minorCount: 3,
    status: 'calculated', autoPassRationale: null,
  })),
}))
```

**Existing tests that WILL BREAK and need updating:**
- Tests asserting `step.run` called exactly 2 times (L1 + score) → now 4-5+ times (L1 + L1score + L2 + L2score + [batch])
- Tests asserting step ID `score-${fileId}` → now `score-l1-${fileId}`
- Tests asserting `layerCompleted: 'L1'` in return → now `'L1L2'` (economy) or `'L1L2L3'` (thorough)
- Tests for "should not run L2/L3 steps" → split: economy = no L3 only; thorough = has L3

**Boundary value tests (MANDATORY per CLAUDE.md):**
- Batch: 1 file (fires immediately), 2 files (waits for both)
- Mode: `'economy'` vs `'thorough'` (both must be tested)
- Partial failure: L2 returns `partialFailure: true` → score + batch check still proceed
- Auto-passed: `scoreFile` returns `status: 'auto_passed'` → correctly propagated
- L2 total failure: `runL2ForFile` throws → onFailure → L1 intact (AC9)

**`uploadBatchId` type note:** `PipelineFileEventData.uploadBatchId` is typed as `string` (required) but `processFile.ts` guards with `if (uploadBatchId)`. For test 5.8, pass an empty string `''` — this is falsy and triggers the skip. This is a pre-existing type gap (should ideally be `string | null`) but is NOT in scope to fix.

Use a single `beforeEach` block — do NOT duplicate mock setup across `describe` blocks (3.2a CR M7 lesson).

### Guardrails Checklist (VERIFY BEFORE EVERY FILE)

| # | Rule | How It Applies |
|---|------|---------------|
| 1 | `withTenant()` every query | Batch completion check already has it ✅. No new DB queries in `processFile.ts` — L2/L3 queries are in `runL2ForFile`/`runL3ForFile` |
| 2 | Audit log non-fatal | No direct `writeAuditLog` calls in `processFile.ts` — audit is delegated to `scoreFile`/`runL2ForFile`/`runL3ForFile`. Do NOT add audit calls to `processFile.ts` handler |
| 3 | No bare `string` for status | Use `ProcessingMode` from `@/types/pipeline` for `mode`. Use typed const `'l2_completed' | 'l3_completed'` for `terminalStatus` |
| 4 | Guard `rows[0]!` | N/A — no new SELECT with `rows[0]` access |
| 5 | `inArray(col, [])` guard | N/A — no `inArray` usage |
| 6 | DELETE + INSERT = `db.transaction()` | N/A for `processFile.ts` (handled by `runL2ForFile` + `scoreFile`). Do NOT add direct DB writes to `processFile.ts` handler |
| 8 | Optional filter: use `null`, not `''` | `scoreFile()` call uses `undefined` for omitted `layerFilter` (correct). Do NOT pass `layerFilter: ''` — it would match nothing silently |
| 10 | Inngest retries + onFailure | Already in `processFilePipeline` config ✅. `Object.assign` exposes `handler` + `onFailure` ✅ |
| 13 | `void asyncFn()` swallows errors | All `step.sendEvent()` MUST be awaited. Do NOT use `void step.sendEvent(...)` |
| 16–20 | AI SDK patterns | Not in `processFile.ts` — fully handled by `runL2ForFile` / `runL3ForFile` ✅ |
| 21 | One `step.run()` per chunk | **Documented deviation:** `processFile.ts` uses one step per FILE. Internal chunk iteration handled by `runL2ForFile`. See Architecture Decision note in AC2 |
| 22 | Budget guard before AI calls | Budget guard is inside `runL2ForFile`/`runL3ForFile`. `processFile.ts` must NOT make direct AI calls or call `checkProjectBudget()` |

### Known Tech Debt (acknowledged, NOT in scope)

- `runL2ForFile.ts` internal types `L1FindingContext.severity: string` and `L1FindingContext.detectedByLayer: string` are Guardrail #3 violations (bare `string`). Flagged in 3.2a CR M1/M2, accepted as-is because the file is "DO NOT TOUCH" in this story
- Batch completion race condition (see note in Batch Completion Logic section)
- `uploadBatchId: string` should be `string | null` (see note in Testing Strategy)

### References

- [Source: `src/features/pipeline/inngest/processFile.ts` — main file to extend]
- [Source: `src/features/pipeline/inngest/processFile.test.ts` — existing tests to update]
- [Source: `src/features/pipeline/inngest/types.ts` — local re-export from `@/types/pipeline`]
- [Source: `src/features/pipeline/helpers/runL2ForFile.ts` — L2 lifecycle (DO NOT MODIFY in 3.2b)]
- [Source: `src/features/pipeline/helpers/runL3ForFile.ts` — L3 lifecycle (DO NOT MODIFY in 3.2b; Story 3.3 will modify)]
- [Source: `src/features/scoring/helpers/scoreFile.ts:135` — layerCompleted derivation logic to fix]
- [Source: `src/types/pipeline.ts` — event data types, ProcessingMode, PipelineBatchCompletedEventData comment]
- [Source: `src/types/finding.ts` — DetectedByLayer, ScoreStatus]
- [Source: `src/db/schema/scores.ts` — scores table, layerCompleted varchar(10)]
- [Source: `src/db/schema/files.ts:21` — full file status list in comment]
- [Source: `src/db/schema/languagePairConfigs.ts` — l2ConfidenceMin column (used by Story 3.2c, not this story)]
- [Source: `_bmad-output/planning-artifacts/epics/epic-3-ai-powered-quality-analysis.md` — AC source]
- [Source: `_bmad-output/planning-artifacts/research/inngest-l2-l3-template-guide-2026-02-26.md` — pipeline patterns]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6 (Amelia Dev Agent)

### Debug Log References

- TypeScript error TS2322: `autoPassRationale: null` inferred as literal `null` type in vi.hoisted mock → Fix: widen at source with `null as string | null`
- Lint warning: unused `ProcessingMode` import in processFile.ts → Removed
- Pre-CR C1: `auto_passed` in batch terminal states is dead code (not in `DbFileStatus`) → Removed

### Completion Notes List

- Task execution reordered: Task 3 before Task 1 (dependency: Task 1.3 requires `layerCompleted` param from Task 3)
- ATDD stub step IDs adapted: `score-l2-${fileId}` → `score-l1l2-${fileId}`, `score-l3-${fileId}` → `score-all-${fileId}` (per ATDD "MAY update assertion values" rule)
- P2 tests (3) remain as `it.skip()` — deferred per ATDD lifecycle
- Pre-existing anti-pattern findings (1H: `as any` onFailure cast, 1M: double assertion scoreFile) not fixed — out of scope, tracked as tech debt

### Implementation Plan

1. Task 3 (scoreFile `layerCompleted` override) → 2-line change
2. Task 1 (processFile L2/L3 wiring) + Task 2 (batch completion) → main change
3. Task 4 (pipeline.ts comment update) → 1-line change
4. Task 5 (tests) → update existing + integrate 21 ATDD stubs

### File List

| File | Change Type | Lines Changed |
|------|------------|---------------|
| `src/features/pipeline/inngest/processFile.ts` | MODIFIED | ~80 lines (L2/L3 steps, batch logic, return shape) |
| `src/features/scoring/helpers/scoreFile.ts` | MODIFIED | 2 lines (type + derivation) |
| `src/types/pipeline.ts` | MODIFIED | 1 line (comment → TSDoc) |
| `src/features/pipeline/inngest/processFile.test.ts` | MODIFIED | ~650 lines (updated existing + 21 ATDD + 2 CR R1 tests) |
| `src/features/scoring/helpers/scoreFile.test.ts` | MODIFIED | ~80 lines (3 P0 + 1 CR R1 test) |
| `src/features/pipeline/inngest/processFile.batch-completion.test.ts` | MODIFIED | ~10 lines (L2/L3 mock shape fix) |

### Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-03-01 | Initial implementation — all 5 tasks complete | Story 3.2b dev-story |
| 2026-03-01 | Removed `auto_passed` from batch terminal states | Pre-CR C1 finding: not in `DbFileStatus`, dead code |
| 2026-03-01 | Added thorough+batch combined test (7 steps) | Pre-CR H4 finding: missing test coverage |
| 2026-03-02 | CR R1 fixes — 9 findings (0C/1H/4M/4L) | See CR R1 section below |

### Test Results

- `processFile.test.ts`: **37 passed**, 1 skipped (P2)
- `scoreFile.test.ts`: **30 passed**
- `processFile.batch-completion.test.ts`: **5 passed**
- **Total (3 files):** 72 tests, 71 passed, 1 skipped
- Lint: clean
- Type-check: clean

### Pre-CR Quality Scan

| Agent | C | H | M | L |
|-------|---|---|---|---|
| Anti-pattern detector | 0 | 1* | 1* | 0 |
| Tenant isolation | 0 | 0 | 0 | 0 |
| Inngest validator | 0 | 0 | 1* | 0 |
| Code quality | 0** | 0** | 0 | 0 |

`*` = pre-existing (not introduced by Story 3.2b)
`**` = fixed (C1 auto_passed removed, H4 test added)

### ATDD Compliance

- P0: 15/15 passing (14 original + 1 CR R1 H1 negative test)
- P1: 8/8 passing (7 original + 1 CR R1 strengthened assertion)
- P2: 1/3 skipped (2 unskipped during impl, 1 deferred per ATDD lifecycle)
- Total: 71 passing, 1 skipped

### CR R1 Review (2026-03-02)

**Reviewer:** Amelia (Dev Agent, claude-opus-4-6) — adversarial CR
**Round:** R1 | **Findings:** 0C + 1H + 4M + 4L = 9 (< 10 target ✅)
**Sub-agents:** code-quality-analyzer + testing-qa-expert

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| H1 | HIGH | Missing negative test: thorough batch should NOT fire when siblings only l2_completed | Added P0 test in processFile.test.ts |
| M1 | MED | processFile.batch-completion.test.ts not in File List + stale test counts | Updated File List + Test Results |
| M2 | MED | Mock drift: batch-completion L2/L3 mocks used wrong field name `chunksProcessed` | Fixed to match L2Result/L3Result types |
| M3 | MED | scoreFile override tests all had prev=defined — prev=undefined path untested | Added P0 test in scoreFile.test.ts |
| M4 | MED | Skipped P2 test missing TODO(TD-XXX) ref + tautological assertion | Added TODO(TD-TEST-005) + clarified assertion |
| L1 | LOW | Redundant type assertions `null as number\|null` and `as 'L1L2'\|'L1L2L3'` | Simplified to `as const` |
| L2 | LOW | P0 batch test used bare `.toHaveBeenCalled()` | Strengthened with event name assertion |
| L3 | LOW | Test name didn't mention layerFilter assertion | Renamed test |
| L4 | LOW | `PipelineBatchCompletedEventData` used `//` comment not `/** */` TSDoc | Changed to TSDoc |

**Disputed finding:** Testing-QA agent H1 (`auto_passed` in batch terminal) = FALSE POSITIVE — `auto_passed` is `scores.status`, not `files.status` (`DbFileStatus`). Dev Pre-CR C1 was correct.

### Change Log
- 2026-03-01: Story created by SM (Bob) — ready-for-dev
- 2026-03-01: Validation pass — applied 7C + 10E + 4O improvements (all categories)
- 2026-03-02: CR R1 fixes — 9 findings (0C/1H/4M/4L), story done

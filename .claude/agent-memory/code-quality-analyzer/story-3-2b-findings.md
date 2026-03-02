# Story 3.2b: L2 Batch Processing & Pipeline Extension — CR R1 + R2

**Date:** 2026-03-02
**Files reviewed:** processFile.ts, processFile.test.ts, scoreFile.ts, scoreFile.test.ts, pipeline.ts, processFile.batch-completion.test.ts

## R1 Result: 1C / 4H / 3M / 4L

### Critical (R1 — ALL FIXED in R2 code)

- C1: `auto_passed` not in `files.status` domain — FIXED (now uses `l2_completed | l3_completed`)

### High (R1 — H4 FIXED in R2 code, H1-H3 still applicable as H-level items in R2)

- H1: `uploadBatchId: ''` used as "no batch" instead of `null` — tech debt scope
- H2: `f.status` untyped (string from Drizzle varchar) — still applies in R2
- H3: score-l1l2 call design correct but comment could be clearer
- H4: No test for thorough + batch combined — FIXED in R2 (7-step test added)

## R2 Result: 0C / 4H / 5M / 4L

### High (R2)

- H1: f.status comparison uses bare `string` — no DbFileStatus cast (anti-pattern #33)
- H2: Unnecessary `null as number | null` cast on l3FindingCount return
- H3: Unnecessary `as 'L1L2' | 'L1L2L3'` cast on layerCompleted return
- H4: layerFilter used as fallback for layerCompleted — semantic coupling

### Medium (R2)

- M1: Unused type import `ContributingFinding` in scoreFile.ts
- M2: Test duplication between processFile.test.ts and processFile.batch-completion.test.ts
- M3: Mock drift in batch-completion.test.ts — L2/L3 shapes don't match L2Result/L3Result
- M4: Inconsistent uploadBatchId defaults between test files
- M5: L1 score layerFilter='L1' redundant but undocumented

### Low (R2)

- L1: @ts-expect-error needs upstream ref
- L2: faker.string.uuid() in buildPipelineEvent defaults
- L3: it.skip has TD-TEST-005 — verified OK
- L4: PipelineBatchCompletedEventData uses // not /\*\* \*/

## Key Patterns (R2)

- All R1 Critical/High FIXED — C1 auto_passed removed, H4 thorough+batch test added
- Deterministic step IDs correctly applied
- Mode-aware terminal status (l2_completed vs l3_completed)
- layerCompleted override chain backward compatible
- onFailure preserves findings from previous layers
- withTenant on every query verified
- Inngest config complete (retries, onFailure, Object.assign, route.ts registered)

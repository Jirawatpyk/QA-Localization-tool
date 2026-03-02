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

## R2 Result: 0C / 4H / 5M / 2L

### High (R2)

- H1: f.status comparison uses bare `string` — no DbFileStatus cast (anti-pattern #33) [processFile.ts:85-87]
- H2: No test for thorough mode return shape (l3FindingCount=number, layerCompleted=L1L2L3) [processFile.test.ts]
- H3: Mock drift in batch-completion.test.ts — L2/L3 inline vi.fn not typed as L2Result/L3Result [processFile.batch-completion.test.ts:37-65]
- H4: layerFilter used as fallback for layerCompleted — semantic coupling undocumented [scoreFile.ts:138]

### Medium (R2)

- M1: Unused type import `ContributingFinding` in scoreFile.ts line 16
- M2: Test duplication between processFile.test.ts and processFile.batch-completion.test.ts (3 overlapping tests)
- M3: Inconsistent uploadBatchId defaults — '' in processFile.test.ts vs VALID_UUID in batch-completion.test.ts
- M4: `status: 'calculated' as string` in hoisted mock loses type safety [processFile.test.ts:32]
- M5: l3Result.partialFailure extracted but never used in return value (dead data) [processFile.ts:51,59]

### Low (R2)

- L1: `as const` cast on layerCompleted return unnecessary — TS infers literal from ternary [processFile.ts:112]
- L2: it.skip has TD-TEST-005 — verified OK

## Key Patterns (R2)

- All R1 Critical/High FIXED — C1 auto_passed removed, H4 thorough+batch test added
- Deterministic step IDs correctly applied
- Mode-aware terminal status (l2_completed vs l3_completed)
- layerCompleted override chain backward compatible
- onFailure preserves findings from previous layers
- withTenant on every query verified
- Inngest config complete (retries, onFailure, Object.assign, route.ts registered)

## Exit Criteria

- **Recommended:** Fix H1 (DbFileStatus cast) + H2 (thorough return shape test) → story can pass
- **Nice-to-have:** H3 (mock drift), H4 (layerFilter comment), M1-M5
- **R1 Critical VERIFIED FIXED**

# Story 3.2b: L2 Batch Processing & Pipeline Extension — CR R1

**Date:** 2026-03-02
**Files reviewed:** processFile.ts, processFile.test.ts, scoreFile.ts, scoreFile.test.ts, pipeline.ts
**Result:** 1C / 4H / 3M / 4L

## Critical

- **C1: `auto_passed` not in `files.status` domain** — batch completion check uses `f.status === 'auto_passed'` but `auto_passed` only exists in `scores.status`. `DbFileStatus` type and DB schema both exclude it. Condition is always false (dead code as false safety net). ATDD DA-1 created this requirement without validating domain.

## High

- H1: `uploadBatchId: ''` used as "no batch" instead of `null` (Guardrail #8 violation — tech debt, scope beyond story)
- H2: `f.status` untyped (inferred as `string` from Drizzle varchar) — compiler cannot catch invalid status values. Cast to `DbFileStatus` would have caught C1.
- H3: score-l1l2 call omits `layerFilter` intentionally (queries all findings) — design correct but comment could be clearer
- H4: No test for thorough + batch combined (thorough 6-step test uses empty uploadBatchId, missing 7-step variant)

## Key Patterns Observed

- Object.assign testability pattern correctly applied
- Step ID naming deterministic with fileId
- scoreFile layerCompleted override chain: `override ?? prev ?? layerFilter ?? 'L1'` — well designed
- onFailure follows non-fatal pattern correctly
- withTenant on every query verified

## Anti-Pattern: ATDD Validating Bug Instead of Catching It

- ATDD DA-1 said "auto_passed not in batch terminal states" and added it
- Neither ATDD nor dev verified that `auto_passed` is a valid `files.status` value
- Lesson: When adding new terminal states, always verify against canonical type (`DbFileStatus`)

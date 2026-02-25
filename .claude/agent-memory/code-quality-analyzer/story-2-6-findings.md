# Story 2.6 — Inngest Pipeline Foundation CR Findings

## Files Reviewed

- `src/features/pipeline/helpers/runL1ForFile.ts`
- `src/features/scoring/helpers/scoreFile.ts`
- `src/features/pipeline/inngest/processFile.ts`
- `src/features/pipeline/inngest/processBatch.ts`
- `src/features/pipeline/inngest/types.ts`
- `src/features/pipeline/actions/startProcessing.action.ts`
- `src/features/pipeline/validation/pipelineSchema.ts`
- `src/features/pipeline/components/ProcessingModeDialog.tsx`
- `src/features/pipeline/components/ModeCard.tsx`
- `src/features/pipeline/stores/pipeline.store.ts`
- `src/lib/inngest/client.ts`
- `src/app/api/inngest/route.ts`
- `src/features/pipeline/actions/runRuleEngine.action.ts`
- `src/features/scoring/actions/calculateScore.action.ts`
- `src/lib/cache/glossaryCache.ts`

## CR Round 1 (inline) — 3H+4M fixed

- C1: `onFailureFn` NOT registered in Inngest config — FIXED (now in config arg)
- C2: `scoreFile` crashes on empty segmentRows — FIXED (guard added)
- H1: segments query missing projectId — addressed
- H2: double cast `as unknown as` — still present (accepted risk)
- H3: uploadBatchId wrong semantic — documented with NOTE comment
- H4: concurrency limit:1 serializes ALL files — accepted (per-project)
- H5: Inngest client Events type duplicated — still present

## CR Round 2 (adversarial) — NEW Findings

### Critical (4)

- C1: TOCTOU race in startProcessing.action.ts — SELECT status check not atomic with Inngest dispatch
  - Concurrent requests can both validate same files as 'parsed', dispatching duplicate batches
  - Fix: atomic CAS UPDATE SET status='queued' WHERE status='parsed' RETURNING before dispatch
- C2: `as any` cast on inngest.createFunction — total type safety bypass (project anti-pattern)
  - processFile.ts:62, processBatch.ts:46
  - Fix: remove `as any`, use proper generics or `as unknown as SpecificType`
- C3: Inngest client Events type duplicated vs types.ts — drift risk (REPEAT from R1 H5, upgraded)
  - client.ts has inline mode: 'economy' | 'thorough' hardcoded
  - types.ts imports ProcessingMode from @/types/pipeline
  - Fix: client.ts should import types from types.ts
- C4: runL1ForFile audit log missing userId (REPEAT from R1 M1, upgraded)
  - RunL1Input type has no userId field
  - Fix: add userId to RunL1Input + pass from all callers

### Important (7)

- H1: startProcessing.action.ts:66 — unnecessary `as string` cast on f.status
- H2: scoreFile.ts:101 — double cast `as unknown as ContributingFinding[]` (REPEAT R1 H2)
- H3: processFile.ts onFailure DB update not wrapped in try-catch — failure in failure handler
- H4: processBatch.ts — no empty fileIds guard (defensive programming)
- H5: pipeline.store.ts FileStatus missing DB statuses (parsed, l1_processing, uploaded, parsing)
- H6: scoreFile.ts:203 — `as` cast on newScore.status instead of using typed local variable
- H7: ProcessingModeDialog.tsx — missing role="radiogroup" wrapper (ARIA violation)

### Low (7)

- L1: processFile.ts:14-19 — inline step type, prefer SDK import
- L2: Proxy DB mock duplicated in 3 test files (runL1ForFile, processFile, startProcessing)
- L3: scoreFile.ts:224-233 — graduation dedup missing projectId (REPEAT 2.5 M2)
- L4: pipelineSchema.ts:1 — stale "Stub" comment
- L5: ModeCard.tsx — no CSS classes / styling
- L6: startProcessing.action.ts:97 — uploadBatchId proxy value (documented)
- L7: test files — dynamic import boilerplate in every it() block

## CR Round 3 (pre-fix) — Original Findings

### High (2)

- H1: pipelineSchema.ts:6 — Duplicate fileIds bypass validation + double-processing → FIXED (R3)
- H2: runL1ForFile.ts:64 — segments query missing eq(segments.projectId, projectId) → FIXED (R3)

### Medium (5)

- M1: processFile.ts:42-58 — onFailureFn DB update not wrapped in try-catch → FIXED (R3)
- M2: scoreFile.ts:155 — inserted! non-null assertion on .returning() result → FIXED (R3)
- M3: processBatch.ts:46 — No retries/onFailure config → FIXED (R3)
- M4: pipeline.store.ts:5-11 — FileStatus type missing DB statuses (REPEAT R2-H5, still unfixed)
- M5: ProcessingModeDialog.tsx:79 — Missing role="radiogroup" (REPEAT R2-H7, still unfixed)

### Low (4)

- L1: pipelineSchema.ts:1 — stale "Stub" comment → FIXED (R3, removed)
- L2: pipelineSchema.ts:8 vs types/pipeline.ts:2 — mode enum drift risk → FIXED (R3, PROCESSING_MODES const)
- L3: scoreFile.ts:101 — double cast `as unknown as` still present (REPEAT R2-H2, accepted)
- L4: startProcessing.action.ts:66 — unnecessary `as string` cast → FIXED (R3)

## CR Round 3 Post-Fix Adversarial Review — NEW Findings

### High (3)

- H1: startProcessing.action.ts:46-88 — TOCTOU race condition STILL unfixed (REPEAT R2-C1)
  - SELECT+validate is not atomic with Inngest dispatch
  - Fix: CAS UPDATE SET status='queued' WHERE status='parsed' RETURNING
- H2: processBatch.ts:61-75 — Object.assign does NOT expose onFailureBatchFn for testing
  - processFile.ts exposes both handler+onFailure, but processBatch only exposes handler
  - processBatch.test.ts has ZERO tests for onFailureBatchFn
  - Fix: add `onFailure: onFailureBatchFn` to Object.assign + add tests
- H3: PROCESSING_MODES const not propagated to all validation sites
  - projectSchemas.ts:12,18 still hardcodes z.enum(['economy', 'thorough'])
  - db/validation/index.ts:19 still hardcodes z.union([z.literal('economy'), z.literal('thorough')])
  - Fix: import PROCESSING_MODES from @/types/pipeline everywhere

### Medium (5)

- M1: scoreFile.ts:101 — double cast `as unknown as ContributingFinding[]` (REPEAT, accepted risk)
- M2: processFile.ts:14-20 — step type narrowed manually (testability tradeoff, accepted)
- M3: ProcessingModeDialog.tsx:80 — ModeCard JSX hardcoded, doesn't loop PROCESSING_MODES
- M4: processFile.ts:77 + processBatch.ts:67 — `as any` cast for onFailure (eslint-disabled)
- M5: startProcessing.action.ts:126-129 — error path missing audit log

### Low (3)

- L1: ProcessingModeDialog.tsx:79 — Missing role="radiogroup" wrapper (REPEAT R2-H7)
- L2: pipelineSchema.test.ts — unnecessary `await import()` for pure schema tests
- L3: scoreFile.ts:227-237 — graduation dedup missing projectId (REPEAT R2-L3, 2.5-M2)

### Summary

- R3 successfully fixed 7/11 pre-fix findings (H1, H2, M1, M2, M3, L1, L2, L4)
- Post-fix adversarial review found 3H + 5M + 3L = 11 findings
  - 4 genuinely new: R3-H2 (processBatch onFailure not exposed), R3-H3 (PROCESSING_MODES propagation), R3-M3 (ModeCard hardcoded), R3-M5 (error path audit)
  - 7 repeats from earlier rounds still unfixed
- Total cumulative across all rounds: R1(7) + R2(18) + R3-pre(11) + R3-post(11) = 47 findings

# Story 2.6 — Inngest Pipeline Foundation CR Round 1 Findings

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
- `src/test/factories.ts`

## Critical (2)

- C1: `onFailureFn` NOT registered in Inngest config — only exposed via Object.assign for tests
  - Must be in config 1st arg: `{ id, retries, concurrency, onFailure: onFailureFn }`
  - Without it: files stuck in `l1_processing` after all retries exhausted
- C2: `scoreFile` crashes on empty segmentRows — `segmentRows[0]!.sourceLang` non-null assertion

## Important (5)

- H1: `runL1ForFile` segments query missing `eq(segments.projectId, projectId)` (defense-in-depth)
- H2: `scoreFile` double cast `as unknown as ContributingFinding[]` hides type mismatch
- H3: `startProcessing` uses generated `batchId` as `uploadBatchId` — wrong semantic
- H4: `processFilePipeline` concurrency limit:1 per project serializes ALL files (L1 could parallel)
- H5: Inngest client `Events` type duplicated vs `types.ts` — single source of truth violation

## Medium (4)

- M1: `runL1ForFile` audit log missing `userId` (RunL1Input has no userId field)
- M2: ModeCard lacks `role="radiogroup"` wrapper + ArrowUp/ArrowDown navigation
- M3: `PipelineStore.FileStatus` missing `l1_processing`, `l2_processing`, `l3_processing`, `parsed`
- M4: ProcessingModeDialog uses raw `<div role="dialog">` instead of shadcn Dialog component

## Low (4)

- L1: `as any` on createFunction — eslint-disable needs better explanation comment
- L2: `startProcessing` doesn't validate project existence (just files in project)
- L3: pipelineSchema.ts still has "Stub — TDD RED phase" comment but is fully functional
- L4: Graduation notification dedup query missing projectId in JSONB containment (repeat of 2.5 M2)

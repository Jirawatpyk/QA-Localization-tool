# Epic 5 Prep — Full Code Review R2 (Review/Parser/Upload)

# Files: use-undo-redo.ts, review.store.ts, addToGlossary.action.ts,

# undoBulkAction.action.ts, redoBulkAction.action.ts, ReviewPageClient.tsx,

# pattern-detection.ts, parseFile.action.ts, sdlxliffParser.ts, excelParser.ts,

# constants.ts, types.ts, excelMappingSchema.ts, route.ts (upload), route.test.ts, useFileUpload.ts

**Review Date:** 2026-03-26
**Result:** 0C / 5H / 8M

## HIGH Findings

### H1: revalidateTag called with 2 args — Next.js API only takes 1

- File: `src/features/review/actions/addToGlossary.action.ts` L223
- `revalidateTag(\`glossary-${projectId}\`, 'minutes')` — 2nd arg invalid
- Pattern exists in 9 files project-wide (all glossary + taxonomy actions)
- Must verify Next.js 16 revalidateTag signature and fix if needed

### H2: BFS in trackRejection uses queue.pop() = DFS, not BFS

- File: `src/features/review/utils/pattern-detection.ts` L184
- Comment says "BFS" but pop() is DFS — connected component result same for undirected graph
- Documentation debt + future optimization risk

### H3: `notes` field in addToGlossary collected but NOT persisted to DB

- File: `src/features/review/actions/addToGlossary.action.ts` L42, L154-163
- glossaryTerms schema has NO `notes` column
- notes only appears in audit log (newValue), not in DB insert
- Silent data loss if UI shows notes form field

### H4: reverted.push() inside transaction in undoBulkAction/redoBulkAction

- Files: `src/features/review/actions/undoBulkAction.action.ts` L129
  `src/features/review/actions/redoBulkAction.action.ts` L125
- If transaction rolls back, `reverted` array has IDs that were NOT committed
- Client gets success response with incorrect reverted IDs
- feedbackEvents would be inserted for non-reverted findings

### H5: Multiple getState() calls in executeBulk loop (ReviewPageClient)

- File: `src/features/review/components/ReviewPageClient.tsx` L225-241
- ~4 getState() calls per finding in processedFindings loop
- Realtime event between calls = inconsistent store snapshots in same iteration

## MEDIUM Findings

### M1: PATTERN_ENTRIES_CAP = 100 is magic number inside function body

- File: `src/features/review/utils/pattern-detection.ts` L146
- Should be module-level constant with other tuning params

### M2: glossaryId in race-condition re-query could theoretically come from another tenant insert

- File: `src/features/review/actions/addToGlossary.action.ts` L174-183
- withTenant() guard prevents cross-tenant, but deserves documentation comment

### M3: processFiles not memoized but called from confirmRerun

- File: `src/features/upload/hooks/useFileUpload.ts` L189, L339
- Inner function recreated every render — inconsistent with useCallback on startUpload

### M4: route.test.ts assertion `mockInsertFn.toHaveBeenCalledTimes(2)` in mixed-batch test

- File: `src/app/api/upload/route.test.ts` L493
- Test comment unclear about "storage idempotent" vs "DB re-run" distinction

### M5: UTF-16 BE swap loop in parseFile.action.ts has no comment for odd-length case

- File: `src/features/parser/actions/parseFile.action.ts` L237-241
- Odd-length buffer = last byte silently skipped — should log warning

### M6: undoBulkActionSchema .min(1) makes empty-array early return dead code

- File: `src/features/review/validation/undoAction.schema.ts` L33
  `src/features/review/actions/undoBulkAction.action.ts` L53-59
- Zod rejects empty array before reaching the early return
- Dead code or schema should be .min(0)

### M7: redoBulkAction missing feedbackEvents for redo-of-reject

- File: `src/features/review/actions/redoBulkAction.action.ts`
- undoBulkAction inserts feedback for undo_reject, but redo path has no feedback tracking
- AI feedback data gap for reviewer who reject → undo → redo path

### M8: autoDetectColumns logic complex — not a bug but hard to reason about

- File: `src/features/parser/excelParser.ts` L283-295
- Single-pass exact+substring detection works correctly but verify with 2-pass would be clearer

## Positive Highlights

- Intl.Segmenter per-locale cache in pattern-detection.ts
- Batch INSERT feedbackEvents in undoBulkAction
- createSyncingSet dual-write with short-circuits in review.store.ts
- Race condition handling for glossary creation + term insertion
- UTF-16 LE/BE BOM detection in parseFile.action.ts
- abortController + XHR abort in useFileUpload unmount
- z.enum(FINDING_STATUSES) in undoAction.schema.ts — correct SSOT pattern

# Inngest Function Validator — Memory

## Codebase State (as of Story 3.2b, 2026-03-02)

### Inngest Infrastructure

- Client: `src/lib/inngest/client.ts` — `new Inngest({ id: 'qa-localization-tool', schemas: new EventSchemas().fromRecord<Events>() })`
- Route handler: `src/app/api/inngest/route.ts` — registers `processFilePipeline` + `processBatch` + `batchComplete` + `recalculateScore`
- Event types defined inline in `client.ts` (not separate file)
- `recalculateScore` does NOT use `(inngest.createFunction as any)` cast — uses `inngest.createFunction(...)` directly (type-safe, no cast needed because it uses typed event name via `as const`)

### Registered Functions (Stories 2.6–3.0)

| Export Name           | Function ID              | Trigger Event              | Concurrency                                   |
| --------------------- | ------------------------ | -------------------------- | --------------------------------------------- |
| `processFilePipeline` | `process-file-pipeline`  | `pipeline.process-file`    | `[{ key: 'event.data.projectId', limit: 1 }]` |
| `processBatch`        | `process-batch-pipeline` | `pipeline.batch-started`   | none (fan-out only)                           |
| `batchComplete`       | `batch-complete`         | `pipeline.batch-completed` | none (retries: 3, onFailure: onFailureFn)     |
| `recalculateScore`    | `recalculate-score`      | `finding.changed`          | `[{ key: 'event.data.projectId', limit: 1 }]` |

All registered in `src/app/api/inngest/route.ts`.

### Event Names (confirmed dot-notation)

- `pipeline.process-file` — trigger for per-file processing
- `pipeline.batch-started` — trigger for batch fan-out
- `pipeline.batch-completed` — trigger for cross-file analysis (Story 2.7)
- `finding.changed` — trigger for score recalculation (Story 3.0)

### Key Patterns Confirmed in Story 2.6

**Object.assign testability pattern:**

```ts
export const processFilePipeline = Object.assign(
  (inngest.createFunction as any)({ id: '...', ... }, { event: '...' }, handlerFn),
  { handler: handlerFn, onFailure: onFailureFn },
)
```

Handler extracted as `handlerFn` const BEFORE passing to `createFunction` — enables direct unit testing without Inngest mock.

**Concurrency config format (array syntax):**

```ts
concurrency: [{ key: 'event.data.projectId', limit: 1 }]
```

Array syntax (not object) — both valid in Inngest v3.

**onFailure nested event structure (Inngest v3):**

```ts
event: {
  data: {
    event: {
      data: PipelineFileEventData
    }
  }
}
// Access via: event.data.event.data.fileId
```

**Fan-out via step.sendEvent (NOT inngest.send):**

```ts
await Promise.all(fileIds.map((fileId) => step.sendEvent({ name: 'pipeline.process-file', data: {...} })))
```

**step.sendEvent API signature — ✅ FIXED (verified 2026-02-25)**

- Inngest v3 actual API: `step.sendEvent(id: string, event: SendEventPayload)`
- processBatch.ts now uses correct batch form: `step.sendEvent('dispatch-files-${batchId}', fileIds.map(...))`

**NonRetriableError usage (correct):**

- Imported from `'inngest'` in `runL1ForFile.ts`
- Thrown when CAS guard fails (file not in `parsed` state)

**step.run IDs include fileId (deterministic):**

- `l1-rules-${fileId}`, `score-l1-${fileId}`, `l2-screening-${fileId}`, `score-l1l2-${fileId}`, `l3-analysis-${fileId}`, `score-all-${fileId}`, `check-batch-${fileId}` — all collision-free
- Each step ID carries `fileId` — safe for fan-out concurrency (1 step.run per file invocation)

**processFile.ts Step 4 score call — layerFilter vs layerCompleted asymmetry (by design):**

- Step 2 (`score-l1-${fileId}`): `layerFilter: 'L1'` — scores only L1 findings (interim, FR15)
- Step 4 (`score-l1l2-${fileId}`): `layerCompleted: 'L1L2'` — NO layerFilter (scores ALL findings after L2 done)
- Step 6 thorough (`score-all-${fileId}`): `layerCompleted: 'L1L2L3'` — NO layerFilter (scores ALL findings)
- This is intentional: `layerFilter` scopes which findings to consider; `layerCompleted` stamps the persisted record
- NOT a violation

**processFile.ts — `uploadBatchId` always string in type, but guarded with `if (uploadBatchId)`:**

- `PipelineFileEventData.uploadBatchId: string` (non-optional in type)
- `processBatch.ts` always populates it from `PipelineBatchEventData.uploadBatchId`
- The `if (uploadBatchId)` guard is defensive — handles potential empty-string edge case
- NOT a type violation; guard is safe (empty string is falsy)

**processFile.ts — `step.sendEvent` uses single-event form (not array):**

- Line 96–105: `step.sendEvent('batch-completed-${uploadBatchId}', { name: ..., data: ... })`
- This is the SINGLE event form — correct for sending one event. Array form used by processBatch for fan-out.
- Both forms are valid Inngest v3 API. No violation.

### Known Design Decisions (not violations)

**onFailureFn has raw DB write outside step.run():**

- `processFile.ts` lines 93–103: `onFailureFn` does `db.update(files)` directly
- ACCEPTABLE: `onFailure` is called after all retries exhausted — no `step.run` context available
- Inngest v3 design: `onFailure` handler does not support `step.run`

**recalculateScore.ts: scoreFile call has NO layerFilter (by design):**

- Story 3.0 intent: recalculate score across ALL layers (L1+L2+L3) whenever a finding changes
- `scoreFile({ fileId, projectId, tenantId, userId })` — no `layerFilter` = all layers
- processFile.ts by contrast passes `layerFilter: 'L1'` (Step 2 in pipeline, only L1 done at that point)
- This asymmetry is correct and intentional — NOT a violation

**recalculateScore step ID pattern:**

- `recalculate-score-${fileId}` — deterministic, includes fileId for uniqueness
- Only 1 step in the function — no collision risk

**findingChangedSchema Zod validation in recalculateScore:**

- Validates event data at handler entry using `safeParse`, throws `NonRetriableError` on failure
- `triggeredBy` typed as `z.string().uuid()` — matches `FindingChangedEventData.triggeredBy: string`
- `previousState` / `newState` typed as `z.string()` in Zod schema, but `FindingChangedEventData` uses `FindingStatus` union type
- This is a MEDIUM mismatch: Zod accepts any string for state fields, but the canonical type is `FindingStatus`
- Does NOT cause runtime bugs (event sender is responsible for valid values), but weakens validation

**recalculateScore.ts test file: `createDrizzleMock` called without import:**

- Test file uses `createDrizzleMock()` in `vi.hoisted()` without import statement
- This is CORRECT: `createDrizzleMock` is attached to `globalThis` via `src/test/setup.ts` setupFiles
- setupFiles run before `vi.hoisted()` — globalThis access is safe
- Pattern confirmed as intentional across all Inngest function tests

**recalculateScore.ts: `onFailureFn` try-catch wraps audit log only:**

- Lines 47–65: try-catch in `onFailureFn` wraps ONLY the `writeAuditLog` call
- This is correct — audit log is non-fatal in error/rollback path (CLAUDE.md Guardrail #2)
- NOT a violation of Rule 1 — this is in `onFailureFn`, not inside `step.run()`

**runL1ForFile.ts has try-catch wrapping DB operations:**

- Lines 57–176: outer try-catch exists OUTSIDE step.run (the helper IS the step body)
- This is NOT a violation of Rule 1 — the try-catch is in the helper function body, not wrapping `step.run()` itself
- Rule 1 only forbids try-catch INSIDE step.run callback

**runL2ForFile.ts and runL3ForFile.ts — try-catch inside helper is NOT a Rule 1 violation:**

- Both helpers have outer `try { ... } catch(err) { rollback + rethrow }` structure
- The helper IS the body of `step.run()` — it is called AS the step body, not wrapping `step.run()`
- Rule 1 forbids `step.run('id', async () => { try { ... } catch { swallow } })` — swallowing errors
- These helpers RETHROW — Inngest still sees the error and can retry. Correct pattern.
- The inner per-chunk try-catch (in the chunk loop) is also correct: only re-throws retriable errors, accumulates non-retriable failures (partial failure tolerance per Guardrail #21)

**runL3ForFile.ts — missing logAIUsage for error chunks:**

- Unlike runL2ForFile.ts which logs `status: 'error'` usage records for failed chunks, runL3ForFile.ts does NOT log error-status usage records (the `logAIUsage(errorRecord)` call is absent from the L3 chunk catch block)
- This is a MEDIUM gap: cost tracking completeness for L3 is weaker than L2
- Does NOT affect correctness — just observability

### Helper Files (importable from Inngest — no 'use server')

- `src/features/pipeline/helpers/runL1ForFile.ts` — L1 rule engine runner
- `src/features/pipeline/helpers/runL2ForFile.ts` — L2 AI screening runner (Story 3.2a)
- `src/features/pipeline/helpers/runL3ForFile.ts` — L3 deep AI analysis runner (Story 3.2b)
- `src/features/scoring/helpers/scoreFile.ts` — MQM score calculator + persister

### Server Actions (NOT callable from Inngest)

- `src/features/pipeline/actions/startProcessing.action.ts` — 'use server' + 'server-only', sends `pipeline.batch-started`

See `patterns.md` for detailed Inngest pipeline orchestration notes.

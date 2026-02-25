# Inngest Function Validator — Memory

## Codebase State (as of Story 2.6, 2026-02-25)

### Inngest Infrastructure

- Client: `src/lib/inngest/client.ts` — `new Inngest({ id: 'qa-localization-tool', schemas: new EventSchemas().fromRecord<Events>() })`
- Route handler: `src/app/api/inngest/route.ts` — registers `processFilePipeline` + `processBatch`
- Event types defined inline in `client.ts` (not separate file)

### Registered Functions (Stories 2.6-2.7)

| Export Name           | Function ID              | Trigger Event              | Concurrency                                   |
| --------------------- | ------------------------ | -------------------------- | --------------------------------------------- |
| `processFilePipeline` | `process-file-pipeline`  | `pipeline.process-file`    | `[{ key: 'event.data.projectId', limit: 1 }]` |
| `processBatch`        | `process-batch-pipeline` | `pipeline.batch-started`   | none (fan-out only)                           |
| `batchComplete`       | `batch-complete`         | `pipeline.batch-completed` | none (retries: 3, onFailure: onFailureFn)     |

All registered in `src/app/api/inngest/route.ts`.

### Event Names (confirmed dot-notation)

- `pipeline.process-file` — trigger for per-file processing
- `pipeline.batch-started` — trigger for batch fan-out
- `pipeline.batch-completed` — trigger for cross-file analysis (Story 2.7)

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

- `l1-rules-${fileId}` and `score-${fileId}` — collision-free

### Known Design Decisions (not violations)

**onFailureFn has raw DB write outside step.run():**

- `processFile.ts` line 54–58: `onFailureFn` does `db.update(files)` directly
- ACCEPTABLE: `onFailure` is called after all retries exhausted — no `step.run` context available
- Inngest v3 design: `onFailure` handler does not support `step.run`

**runL1ForFile.ts has try-catch wrapping DB operations:**

- Lines 57–176: outer try-catch exists OUTSIDE step.run (the helper IS the step body)
- This is NOT a violation of Rule 1 — the try-catch is in the helper function body, not wrapping `step.run()` itself
- Rule 1 only forbids try-catch INSIDE step.run callback

### Helper Files (importable from Inngest — no 'use server')

- `src/features/pipeline/helpers/runL1ForFile.ts` — L1 rule engine runner
- `src/features/scoring/helpers/scoreFile.ts` — MQM score calculator + persister

### Server Actions (NOT callable from Inngest)

- `src/features/pipeline/actions/startProcessing.action.ts` — 'use server' + 'server-only', sends `pipeline.batch-started`

See `patterns.md` for detailed Inngest pipeline orchestration notes.

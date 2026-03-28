# Inngest Function Validator — Memory

## Codebase State (as of 2026-03-26 — post-Epic 4 helper changes)

### Inngest Infrastructure

- Client: `src/lib/inngest/client.ts` — `new Inngest({ id: 'qa-localization-tool', schemas: new EventSchemas().fromRecord<Events>() })`
- Route handler: `src/app/api/inngest/route.ts` — registers `processFilePipeline` + `processBatch` + `batchComplete` + `recalculateScore` + `retryFailedLayers`
- Event types defined inline in `client.ts` (not separate file)
- `recalculateScore` does NOT use `(inngest.createFunction as any)` cast — uses `inngest.createFunction(...)` directly

### Registered Functions (Stories 2.6–3.4)

| Export Name           | Function ID               | Trigger Event                  | Concurrency                                                                        |
| --------------------- | ------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `processFilePipeline` | `process-file-pipeline`   | `pipeline.process-file`        | `[{ key: 'event.data.projectId', limit: 1 }]`                                      |
| `processBatch`        | `process-batch-pipeline`  | `pipeline.batch-started`       | none (fan-out only)                                                                |
| `batchComplete`       | `batch-complete-analysis` | `pipeline.batch-completed`     | `[{ key: 'event.data.projectId', limit: 1 }]` (retries: 3, onFailure: onFailureFn) |
| `recalculateScore`    | `recalculate-score`       | `finding.changed`              | `[{ key: 'event.data.projectId', limit: 1 }]`                                      |
| `retryFailedLayers`   | `retry-failed-layers`     | `pipeline.retry-failed-layers` | `[{ key: 'event.data.projectId', limit: 1 }]`                                      |

All registered in `src/app/api/inngest/route.ts`.

**Epic 5 addition (Story 5.1 — 2026-03-27):**

| Export Name    | Function ID      | Trigger           | Concurrency               |
| -------------- | ---------------- | ----------------- | ------------------------- |
| `cleanBTCache` | `clean-bt-cache` | `cron: 0 3 * * *` | none (cron, no projectId) |

`cleanBTCache` is a cron-triggered function — no concurrency key needed (no projectId in trigger).

### Event Names (confirmed dot-notation)

- `pipeline.process-file` — trigger for per-file processing
- `pipeline.batch-started` — trigger for batch fan-out
- `pipeline.batch-completed` — trigger for cross-file analysis (Story 2.7)
- `finding.changed` — trigger for score recalculation (Story 3.0)
- `pipeline.retry-failed-layers` — trigger for AI layer retry (Story 3.4)

### Step IDs — All Functions (Story 3.4)

**processFile.ts:**

- `l1-rules-${fileId}`, `score-l1-${fileId}`, `l2-screening-${fileId}`, `score-l1l2-${fileId}`
- `l3-analysis-${fileId}`, `score-all-${fileId}`, `set-partial-${fileId}`, `score-partial-${fileId}`
- `check-batch-${fileId}` — all collision-free across concurrent invocations

**retryFailedLayers.ts:**

- `validate-project-${fileId}`, `budget-check-${fileId}`
- `retry-l2-${fileId}`, `score-retry-l2-${fileId}`
- `retry-l3-${fileId}`, `score-retry-l3-${fileId}`
- `set-partial-retry-${fileId}`, `score-partial-retry-${fileId}` — all collision-free

### Key Patterns Confirmed in Story 2.6

**Object.assign testability pattern:**

```ts
export const processFilePipeline = Object.assign(
  inngest.createFunction({ id: '...', ... }, { event: '...' }, handlerFn),
  { handler: handlerFn, onFailure: onFailureFn },
)
```

Handler extracted as `handlerFn` const BEFORE passing to `createFunction` — enables direct unit testing without Inngest mock.

**Concurrency config format (array syntax):**

```ts
concurrency: [{ key: 'event.data.projectId', limit: 1 }]
```

Array syntax (not object) — both valid in Inngest v3. retryFailedLayers uses exported `retryFailedLayersConfig` object, then spreads into array on createFunction call.

**onFailure nested event structure (Inngest v3):**

```ts
event: {
  data: {
    event: {
      data: OriginalEventData
    }
  }
}
// Access via: event.data.event.data.fileId
```

**retryFailedLayers onFailure — typed as `{ event: OnFailureEvent; step: StepApi }` but step not used:**

- `step` is in the type signature but `onFailure` does NOT call `step.run()` (correct — onFailure has no step context in Inngest v3)
- Raw DB writes in onFailure are ACCEPTABLE per Inngest v3 design

**NonRetriableError usage (correct in retryFailedLayers):**

- `validate-project` step: throws `NonRetriableError` if project not found
- `budget-check` step: throws `NonRetriableError` if AI quota exhausted
- Both inside `step.run()` — Inngest correctly treats as non-retriable

**retryFailedLayers catch-block step.run() pattern — CONFIRMED SAFE:**

- Lines 138–170: catch block after `try { step.run(retry-l2) + step.run(retry-l3) }` contains `step.run(set-partial-retry)` and `step.run(score-partial-retry)`
- These catch-block step IDs are UNIQUE (suffix `-retry`) — no collision with processFile step IDs
- step.run IN a catch block is valid Inngest v3 — the function doesn't throw, so Inngest records the function as completed (not failed), triggering onFailure is NOT required
- `lastCompletedLayer` is a plain variable, NOT memoized — correctly tracks which layer succeeded before the catch

**retryFailedLayers: merged reset+AI in one step (by design, not violation):**

- `retry-l2-${fileId}`: does `db.update(status='l1_completed')` then `runL2ForFile()` in SAME step
- Rationale documented in code: if they were separate steps, on Inngest retry the reset step would be memoized (skipped), leaving status='failed' → CAS guard in runL2ForFile always fails
- Rule 7 (single atomic operation per step) is violated by letter but NOT by intent — this is a justified exception for CAS-guard correctness
- MEDIUM finding (design justification is sound, but violates step granularity rule)

**processFile.ts: budget check NOT present (by design):**

- `processFile.ts` has no budget check before L2/L3 calls
- Budget check is done inside `runL2ForFile` and `runL3ForFile` helpers themselves (per Guardrail #22)
- `retryFailedLayers.ts` adds an explicit `budget-check` step at handler level (belt-and-suspenders for retry path)
- Not a violation — budget guard exists at helper level

### Known Design Decisions (not violations)

**onFailureFn raw DB writes (both functions):**

- `processFile.ts` and `retryFailedLayers.ts` onFailure: `db.select` + `db.update` directly (no step.run)
- ACCEPTABLE: `onFailure` is called after all retries exhausted — no `step.run` context in Inngest v3

**processFile.ts: try-catch wraps step.run() at handler level — CORRECT pattern:**

- Lines 44–51: `try { l2Result = await step.run('l2-screening-...') } catch (l2Err) { failedLayers.push('L2') }`
- This is NOT Rule 1 violation — try-catch is OUTSIDE step.run, wrapping the await (i.e., catching errors AFTER Inngest has already given up retrying the step)
- Rule 1 forbids try-catch INSIDE the step.run callback. Wrapping the await is the correct partial-failure pattern.

**L1_COMPLETED_STATUSES usage with DbFileStatus cast — R1 FIX CONFIRMED:**

- `L1_COMPLETED_STATUSES.has(currentFile.status as DbFileStatus)` — cast is required because DB returns `string`
- `L1_COMPLETED_STATUSES` is `ReadonlySet<DbFileStatus>` — correct type
- Both processFile.ts and retryFailedLayers.ts use identical pattern — consistent

**retryFailedLayers: `lastCompletedLayer` starts at 'L1' (not 'L1L2' after reset):**

- Default is 'L1' — but reset step sets file to l1_completed INSIDE retry-l2 step
- If retry-l2 throws after reset but before L2 completes → lastCompletedLayer stays 'L1' → `score-partial` uses layerCompleted='L1' — CORRECT

**retryFailedLayers.ts onFailureFn signature includes `step: StepApi`:**

- Type signature: `async ({ event }: { event: OnFailureEvent; step: StepApi })`
- `step` is destructured-away (not used) — Inngest v3 onFailure does not provide step context
- NOT a bug — TypeScript allows unused destructured params to be omitted from binding

### Helper Files (importable from Inngest — no 'use server')

- `src/features/pipeline/helpers/runL1ForFile.ts` — L1 rule engine runner
- `src/features/pipeline/helpers/runL2ForFile.ts` — L2 AI screening runner (Story 3.2a)
- `src/features/pipeline/helpers/runL3ForFile.ts` — L3 deep AI analysis runner (Story 3.2b)
- `src/features/scoring/helpers/scoreFile.ts` — MQM score calculator + persister
- `src/lib/ai/budget.ts` — `checkProjectBudget(projectId, tenantId)` budget guard

### Server Actions (NOT callable from Inngest)

- `src/features/pipeline/actions/startProcessing.action.ts` — 'use server' + 'server-only', sends `pipeline.batch-started`

### Changes in 2026-03-26 Helper Scan

**L1 runL1ForFile.ts — status UPDATE moved into transaction:**

- DELETE + INSERT + status UPDATE now in single Drizzle `db.transaction()` call
- Fixes TD-AI-005: crash between findings INSERT and status UPDATE no longer possible
- CAS guard unchanged (at top, outside transaction)

**L2 runL2ForFile.ts — rate limiter fail-open added:**

- `aiL2ProjectLimiter.limit(projectId)` added as Step 2a before budget guard
- Fail-open pattern: Redis infra error → log.warn + continue. Queue full → rethrow (retriable).
- Detection uses string matching `includes('queue full')` on self-thrown Error — fragile but functional
- classifyAIError returns 'unknown' for this plain Error (no .status=429) → but 'unknown' is still retriable in handleAIError so Inngest retry works correctly
- Rate-limit error from this block bubbles to outer catch → rethrow → Inngest retry (correct)
- HIGH finding logged: recommend custom error class instead of string matching

**L3 runL3ForFile.ts — 2 transactions merged into 1:**

- DELETE + INSERT + status UPDATE + confirm/contradict L2 now in single transaction
- Fixes TD-PIPE-002: crash between old tx1 (findings+status) and tx2 (confirm/contradict) caused permanent inconsistency
- Early-return path (filteredSegments.length===0) still has bare db.update() outside step.run context
- MEDIUM finding: if step fails after this bare db.update, CAS retry gets NonRetriableError

**batchComplete.ts — step IDs confirmed:**

- Step IDs `'resolve-batch-files'` and `'cross-file-consistency'` are static (no batchId suffix)
- MEDIUM finding: inconsistent with project convention. Low risk due to projectId concurrency.

**Known open findings (2026-03-26):**

- 🟠 HIGH: Rate limiter error detection by string match — use custom error class
- 🟡 MEDIUM: L3 early-return bare db.update — make idempotent with l3_completed check
- 🟡 MEDIUM: batchComplete static step IDs — add batchId suffix
- 🟡 MEDIUM: retryFailedLayers merged reset+AI step (justified, Rule 7 letter)
- 🔵 INFO: ratelimit.ts uses Redis.fromEnv() (process.env) not @/lib/env

**Known open findings (2026-03-27 — cleanBTCache scan, VERIFIED against actual code):**

- 🟠 HIGH: onFailureFn signature `{ error: Error }` — Inngest v3 onFailure actual payload is `{ event: FailureEventPayload; error: Error }`. `event` param is missing; should add for type correctness and future use (runId, etc.)
- 🟠 HIGH: `Object.assign` does NOT expose `fnConfig` — other functions (recalculateScore.ts) expose `fnConfig` for unit test config verification. cleanBTCache only exposes `handler` + `onFailure`, missing `fnConfig`.
- 🟡 MEDIUM: No zero-result log path — `deletedCount === 0` and `deletedCount > 0` both use same log statement; should distinguish for operational observability.
- 🔵 INFO: btCache.ts uses `server-only` — safe in Inngest (Node.js), worth documenting in cleanBTCache.ts.
- 🔵 INFO: deleteExpiredBTCache has no withTenant() — by design (global TTL cleanup, documented in btCache.ts lines 161-168). Add inline comment inside function body for future reviewer clarity.

**cleanBTCache onFailure pattern — CONFIRMED CORRECT (memory corrected 2026-03-27):**

- PREVIOUS MEMORY WAS WRONG: actual code (line 29-31) is log-only, no throw. onFailureFn correctly does `logger.error(...)` only — no NonRetriableError thrown. Memory from pre-implementation scan was anticipatory, not verified against actual code.
- Contrast with step.run() where NonRetriableError IS correct (stops retries for that step).

**Cron function design notes:**

- Cron functions have no `event.data` → no concurrency key needed (omitting concurrency is CORRECT)
- handlerFn type annotation inlines `{ step: { run: ... } }` instead of using `InngestFunction` type — acceptable for simple cron functions
- btCache helper uses `server-only` import — safe because Inngest runs in Node.js, not Edge
- cleanBTCache registered as 6th function in route.ts functions array (after retryFailedLayers)

See `patterns.md` for detailed Inngest pipeline orchestration notes.

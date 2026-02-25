# Inngest Patterns — Detailed Notes

## Story 2.6 Porting Guide (Scoring Action → Inngest Function)

When `calculateScore.action.ts` is converted to an Inngest function in Story 2.6:

### Concurrency Config (REQUIRED)

```ts
concurrency: { key: `project-${event.data.projectId}`, limit: 1 }
```

- Must use `projectId`, NOT `tenantId` alone (too broad) or `fileId` alone (misses aggregation)

### Step Decomposition Pattern

```ts
// step 1: read segments
const segmentRows = await step.run('load-segments', () => db.select()...)

// step 2: read findings
const findingRows = await step.run('load-findings', () => db.select()...)

// step 3: read penalty weights
const penaltyWeights = await step.run('load-penalty-weights', () => loadPenaltyWeights(tenantId))

// step 4: auto-pass check (DB reads)
const autoPassResult = await step.run('check-auto-pass', () => checkAutoPass(...))

// step 5: persist score (transaction)
const { newScore } = await step.run('persist-score', () => db.transaction(...))

// step 6: audit log (non-fatal — use try-catch OUTSIDE step.run, not inside)
try { await writeAuditLog(...) } catch { logger.error(...) }

// step 7: graduation notification (non-fatal — its own step if needed)
if (condition) {
  await step.run('notify-graduation', () => createGraduationNotification(...))
}
```

### Anti-Pattern to Avoid in Story 2.6

WRONG:

```ts
const result = await step.run('calculate', async () => {
  try {
    const segments = await db.select()...
    const score = calculateMqmScore(...)
    await db.insert(scores).values(...)  // multiple operations in one step
  } catch (e) {
    return { error: e.message }  // swallows retry!
  }
})
```

CORRECT: One atomic operation per step, no try-catch inside.

## Scoring Module Architecture Notes

- `mqmCalculator.ts` is a pure function — no I/O, no side effects. Can be called directly from any step.
- `loadPenaltyWeights()` and `checkAutoPass()` are async but have no `'use server'` guard → safe to import from Inngest.
- `calculateScore.action.ts` has `import 'server-only'` → CANNOT be imported from Inngest. Its logic must be extracted/duplicated into the Inngest function handler.

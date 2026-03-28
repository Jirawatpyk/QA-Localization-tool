# Pipeline Atomicity Sprint — CR Findings (2026-03-26)

**Files reviewed:**

- `src/features/pipeline/helpers/runL1ForFile.ts` — moved status UPDATE inside transaction
- `src/features/pipeline/helpers/runL2ForFile.ts` — fail-open rate limiter + drop threshold
- `src/features/pipeline/helpers/runL3ForFile.ts` — merged confirm/contradict transaction + category validation + drop threshold

**Summary:** 2H + 3M + 4S (no Critical)

---

## HIGH Findings

### H1 — Fail-Open Detection: String Match Instead of Sentinel Class (L2 + L3)

**Files:** `runL2ForFile.ts:140-145`, `runL3ForFile.ts:136-141`

Pattern:

```typescript
const isQueueFull = rateLimitErr instanceof Error && rateLimitErr.message.includes('queue full')
```

The string `'queue full'` is from the Error we throw ourselves on line 138-139. This accidentally works because we throw a custom message and catch it. But if Redis itself ever throws an error containing "queue full" (custom proxy, error middleware), it would re-throw as retriable instead of fail-open.

**Correct fix:** Use sentinel class:

```typescript
class RateLimitExceededError extends Error {}

// In rate limit block:
if (!success) throw new RateLimitExceededError('...')

// In catch:
if (err instanceof RateLimitExceededError) throw err
// else: Redis infra error → fail-open
```

**Anti-pattern to record:** String-matching on self-thrown error message is fragile. Use `instanceof` on sentinel class for self-throw detection.

---

### H2 — Mutable Array Declared Outside Transaction, Populated Inside (L3)

**File:** `runL3ForFile.ts:574, 664`

```typescript
const l3DuplicateIds: string[] = []  // OUTSIDE transaction
await db.transaction(async (tx) => {
  // ...
  l3DuplicateIds.push(l3DbId)  // mutates outer array
  // ...
  for (const dupId of l3DuplicateIds) {  // reads mutated array
    await tx.delete(findings).where(...)
  }
})
```

If transaction rolls back and retries, `l3DuplicateIds` contains IDs from the failed attempt on the next retry → duplicate IDs → harmless extra DELETEs but incorrect behavior.

**Fix:** Move `const l3DuplicateIds: string[] = []` INSIDE the `db.transaction(async (tx) => {` callback.

**Anti-pattern to record:** Mutable state declared outside transaction callbacks but mutated inside = stale state on transaction retry.

---

## MEDIUM Findings

### M1 — Early Return Path Missing Audit Log (L3)

**File:** `runL3ForFile.ts:271-290`

When `filteredSegments.length === 0` (no L2-flagged segments), function updates file status to `l3_completed` but writes no audit log. All other status transitions in L1/L2/L3 write an audit log.

**Fix:** Add non-fatal audit log call after status update in early return path.

### M2 — L3Result Missing droppedBy\* Fields

**File:** `runL3ForFile.ts:48-62`

L2 exports `droppedByInvalidSegmentId` and `droppedByInvalidCategory` in `L2Result`. L3 counts both internally but doesn't include them in `L3Result` type or return value, and doesn't include in audit log. Caller can't tell how many L3 findings were dropped.

**Fix:** Add fields to `L3Result`, populate in return value, include in audit log `newValue`.

### M3 — projectRow Null = Fallback Object Instead of NonRetriableError (L3)

**File:** `runL3ForFile.ts:325-334, 366-378`

L2 has explicit `if (!projectRow) throw new NonRetriableError('Project not found')`. L3 uses fallback object with hardcoded `name: 'Unknown'` and `sourceLang: 'en'`. This allows L3 to run with garbage project context if project is deleted mid-run, producing misleading findings.

**Fix:** Add `if (!projectRow) throw new NonRetriableError('Project not found')` in L3 (same as L2).

---

## SUGGESTION Findings

### S1 — Duplicate Fail-Open Code Block (L2 + L3)

Extract rate limit fail-open to shared `checkRateLimit(limiter, key, context)` helper in `src/lib/ai/`.

### S2 — Loop DELETE Should Use inArray (L3)

`runL3ForFile.ts:669-677`: Loop of individual DELETE queries → should use `inArray(findings.id, l3DuplicateIds)` (guard already present).

### S3 — Step Comment Numbering Disorder (L3)

Steps go: 1, 2a, 2b, 2c, 3, 4, 3b, 3c, 3d, 3e, 4b, 4c, 4d, 4e... Confusing. Renumber sequentially.

### S4 — String Literal 'false_positive_review' Used Twice Without Constant (L3)

`runL3ForFile.ts:578, 619`. Extract to `const FALSE_POSITIVE_REVIEW_CATEGORY = 'false_positive_review' as const`.

### S5 — findIndex O(n) in surroundingContext Map (L3)

`runL3ForFile.ts:294`: `segmentRows.findIndex()` inside `.map()` = O(n\*m). Pre-build `segmentIndexMap` before the map call.

---

## What Was Done Well

1. Transaction atomicity (L1): correctly moves status UPDATE into same transaction as DELETE+INSERT — fixes TD-AI-005 permanently
2. Merged L3 transaction: confirm/contradict + DELETE+INSERT+status in single transaction — fixes TD-PIPE-002 race condition correctly
3. `contradictedSegmentIds` pre-computed outside inner loop — respects Guardrail #9
4. `l3BySegCat` Map for O(1) lookup instead of array.find() per iteration
5. `.returning()` in INSERT avoids separate query for DB IDs
6. `filteredSegments.length === 0` guard prevents `inArray([])` per Guardrail #5
7. Audit log non-fatal wrapping consistent across all happy-path calls
8. `failedChunkSegmentIds` pass-through from L2 to L3 for TD-AI-006

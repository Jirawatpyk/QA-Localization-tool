# P4: Inngest L2/L3 Step Templates Guide

**Date:** 2026-02-26
**Owner:** Charlie (Dev)
**Status:** Complete
**Dependencies:** P1 (AI SDK Spike), P3 (AI Guardrails)

---

## 1. Template Files Created

```
src/features/pipeline/helpers/
├── runL1ForFile.ts           ← existing (Story 2.6)
├── chunkSegments.ts          ← NEW — shared chunking utility
├── runL2ForFile.ts           ← NEW — L2 AI screening template
└── runL3ForFile.ts           ← NEW — L3 deep analysis template

src/lib/ai/
├── client.ts                 ← P1 (customProvider + getModelForLayer)
├── types.ts                  ← P1 (ModelId, MODEL_CONFIG, ChunkResult, LayerResult)
├── costs.ts                  ← P1 (estimateCost, logAIUsage, aggregateUsage)
├── errors.ts                 ← P1 (classifyAIError, handleAIError)
└── budget.ts                 ← NEW — budget guard stub (Story 3.1 implements)
```

---

## 2. 12-Step Lifecycle Pattern

Both `runL2ForFile` and `runL3ForFile` follow the exact same 12-step lifecycle as `runL1ForFile`, with AI-specific additions:

| Step | Description | L1 | L2/L3 |
|------|-------------|-------|-------|
| 1 | CAS guard (atomic status transition) | ✅ | ✅ |
| 2 | Budget guard (Guardrail #22) | — | ✅ NEW |
| 3 | Load segments (withTenant) | ✅ | ✅ |
| 4 | Load context (L1: glossary/rules, L2: L1 findings, L3: L1+L2 findings) | ✅ | ✅ |
| 5 | Chunk segments at 30K chars (Guardrail #21) | — | ✅ NEW |
| 6 | Process (L1: rule engine, L2/L3: AI per chunk) | ✅ | ✅ + partial failure |
| 7 | Flatten + validate findings | ✅ | ✅ + segmentId validation |
| 8 | Map to DB inserts (with excerpts) | ✅ | ✅ + aiModel, aiConfidence |
| 9 | Atomic DELETE + INSERT (idempotent) | ✅ | ✅ |
| 10 | Update file status | ✅ | ✅ |
| 11 | Audit log (non-fatal) | ✅ | ✅ + chunk stats |
| 12 | Return result summary | ✅ | ✅ + usage aggregation |

---

## 3. File Status Transitions

```
parsed → l1_processing → l1_completed → l2_processing → l2_completed → l3_processing → l3_completed
                ↓                              ↓                              ↓
              failed                         failed                         failed
```

Each CAS guard checks the PREVIOUS layer's completed status:
- L1: `eq(files.status, 'parsed')`
- L2: `eq(files.status, 'l1_completed')`
- L3: `eq(files.status, 'l2_completed')`

---

## 4. Chunking Strategy

```typescript
import { chunkSegments, AI_CHUNK_CHAR_LIMIT } from './chunkSegments'

// AI_CHUNK_CHAR_LIMIT = 30,000 (source + target chars combined)
const chunks = chunkSegments(segmentRows) // returns SegmentChunk<T>[]
```

Key design decisions:
- Budget = `sourceText.length + targetText.length` per segment
- Single oversized segment → its own chunk (never split mid-segment)
- Generic `<T>` preserves all segment fields through chunking
- Configurable `charLimit` param for testing

---

## 5. Partial Failure Handling

```typescript
// Per-chunk try/catch with error classification
for (const chunk of chunks) {
  try {
    const result = await generateText({ ... })
    chunkResults.push({ success: true, data: result.output, ... })
  } catch (error) {
    const kind = classifyAIError(error)

    // Retriable → re-throw for Inngest retry
    if (kind === 'rate_limit' || kind === 'timeout') throw error

    // Non-retriable → log and continue
    chunkResults.push({ success: false, error: error.message, ... })
  }
}
```

Return type includes chunk statistics:
```typescript
{
  findingCount: 5,
  chunksTotal: 3,
  chunksSucceeded: 2,
  chunksFailed: 1,
  partialFailure: true,  // signal to caller
  totalUsage: { inputTokens, outputTokens, estimatedCostUsd }
}
```

---

## 6. AI Response Validation

Findings from AI are validated before DB insert:
1. **segmentId check** — only keep findings where `segmentIdSet.has(f.segmentId)`
2. **Confidence clamp** — `Math.min(100, Math.max(0, f.confidence))`
3. **Excerpt enrichment** — look up segment text from loaded rows, truncate to `MAX_EXCERPT_LENGTH`

---

## 7. L2 vs L3 Differences

| Aspect | L2 (Screening) | L3 (Deep Analysis) |
|--------|----------------|-------------------|
| Model | gpt-4o-mini | claude-sonnet-4-5-20250929 |
| CAS from | l1_completed | l2_completed |
| CAS to | l2_processing → l2_completed | l3_processing → l3_completed |
| Context loaded | L1 findings | L1 + L2 findings |
| Schema extra | — | `rationale: z.string()` |
| Prompt focus | Fast triage | Deep semantic reasoning |
| Typical cost | ~$0.001-0.005/file | ~$0.02-0.10/file |

---

## 8. How to Wire into processFile.ts (Story 3.1)

```typescript
// processFile.ts — add after L1 step:

// Step 2: L2 AI screening (economy + thorough modes)
const l2Result = await step.run(`l2-screening-${fileId}`, () =>
  runL2ForFile({ fileId, projectId, tenantId, userId }),
)

// Step 3: L3 deep analysis (thorough mode only)
if (mode === 'thorough') {
  const l3Result = await step.run(`l3-analysis-${fileId}`, () =>
    runL3ForFile({ fileId, projectId, tenantId, userId }),
  )
}

// Step 4: Re-score (recalculate MQM with L2/L3 findings)
const scoreResult = await step.run(`score-${fileId}`, () =>
  scoreFile({ fileId, projectId, tenantId, userId }),
)

// Step 5: Batch completion check
// Update status check: 'l1_completed' → check final layer status instead
```

**Important:** The batch completion check needs updating to check for the final layer status (`l2_completed` for economy, `l3_completed` for thorough) instead of `l1_completed`.

---

## 9. Per-Chunk Inngest Steps (Advanced — Future)

Current design: each `runL*ForFile` is called from a single `step.run()`. For per-chunk retry capability:

```typescript
// Split into 3 orchestrator-level patterns:
const prep = await step.run(`l2-prepare-${fileId}`, () => prepareL2(input))

for (let i = 0; i < prep.chunks.length; i++) {
  const result = await step.run(`l2-chunk-${fileId}-${i}`, () =>
    processL2Chunk(prep.chunks[i], input),
  )
  chunkResults.push(result)
}

await step.run(`l2-finalize-${fileId}`, () => finalizeL2(chunkResults, input))
```

This gives per-chunk retry + checkpoint but requires splitting helper functions.

---

## 10. Test Coverage

| File | Tests | Coverage |
|------|-------|----------|
| `chunkSegments.test.ts` | 10 | Empty, single, multi-chunk, oversized, edge cases |
| `runL2ForFile.test.ts` | 18 | CAS, budget, AI call, partial failure, validation, audit |
| `runL3ForFile.test.ts` | 12 | CAS, L3-specific model/schema, partial failure, audit |

Mock pattern: same as `runL1ForFile.test.ts` — hoisted mocks, `createDrizzleMock()`, dynamic imports.

---

## 11. Open Items for Story 3.1

1. **Wire L2/L3 steps into processFile.ts** (see section 8)
2. **Update batch completion check** to handle L2/L3 final status
3. **Prompt engineering** — refine `buildL2Prompt()` and `buildL3Prompt()` templates
4. **Budget guard implementation** — replace stub in `budget.ts` with real DB query
5. **ai_usage_logs table** — schema design + migration for cost tracking
6. **Response deduplication** — if L2 finds same issue as L1, should L2 finding be merged?
7. **Scoring integration** — MQM score recalculation after L2/L3 findings

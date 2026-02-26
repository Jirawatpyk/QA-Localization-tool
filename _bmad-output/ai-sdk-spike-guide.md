# P1: Vercel AI SDK Spike Guide

**Date:** 2026-02-26
**Owner:** Charlie (Dev)
**Status:** Complete
**Packages:** `ai@6.0.86`, `@ai-sdk/openai@3.0.34`, `@ai-sdk/anthropic@3.0.47`

---

## 1. Module Structure

```
src/lib/ai/
├── client.ts   — customProvider with L2/L3 models + getModelForLayer()
├── types.ts    — ModelId, MODEL_CONFIG, AIUsageRecord, error/budget/chunk types
├── costs.ts    — estimateCost(), logAIUsage(), aggregateUsage()
└── errors.ts   — classifyAIError(), handleAIError() (retriable vs NonRetriableError)
```

---

## 2. Structured Output Pattern (AI SDK 6.0)

**CRITICAL: `generateObject()` and `streamObject()` are DEPRECATED.**

Use `generateText()` + `Output.object()`:

```typescript
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getModelForLayer } from '@/lib/ai/client'

const l2FindingSchema = z.object({
  findings: z.array(z.object({
    segmentId: z.string(),
    category: z.string(),
    severity: z.enum(['critical', 'major', 'minor']),
    description: z.string(),
    suggestedFix: z.string().nullable(),  // ← .nullable() NOT .optional()
  })),
  summary: z.string(),
})

const result = await generateText({
  model: getModelForLayer('L2'),
  output: Output.object({ schema: l2FindingSchema }),
  temperature: 0.3,
  maxOutputTokens: 4096,
  prompt: `Analyze these segments for translation issues:\n${segmentText}`,
})

// result.output is typed! (z.infer<typeof l2FindingSchema>)
const findings = result.output.findings
const usage = result.usage // { inputTokens, outputTokens, totalTokens }
```

### Streaming Variant

```typescript
import { streamText, Output } from 'ai'

const { partialOutputStream, usage } = streamText({
  model: getModelForLayer('L3'),
  output: Output.object({ schema: l3AnalysisSchema }),
  prompt: analysisPrompt,
})

for await (const partial of partialOutputStream) {
  // Progressive updates (useful for UI real-time display)
}

const tokenUsage = await usage
```

---

## 3. Zod Schema Rules for OpenAI

| Pattern | Use | Don't Use | Why |
|---------|-----|-----------|-----|
| Optional field | `.nullable()` | `.optional()`, `.nullish()` | OpenAI rejects — `NoObjectGeneratedError` |
| Required field | no modifier | — | Always present |
| Optional array | `z.array(...).nullable()` | `z.array(...).optional()` | Same OpenAI issue |
| Enum | `z.enum([...])` | magic strings | Type-safe |

**Safe for both OpenAI and Anthropic:** `.nullable()` works everywhere.

---

## 4. Multi-Provider Configuration

### customProvider (in `client.ts`)

```typescript
import { customProvider } from 'ai'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'

export const qaProvider = customProvider({
  languageModels: {
    'l2-screening': openai('gpt-4o-mini'),
    'l3-analysis': anthropic('claude-sonnet-4-5-20250929'),
  },
})
```

### Usage in Inngest Steps

```typescript
import { getModelForLayer } from '@/lib/ai/client'

// L2 screening
const l2Result = await step.run(`l2-chunk-${fileId}-${i}`, async () => {
  const result = await generateText({
    model: getModelForLayer('L2'),
    output: Output.object({ schema: l2FindingSchema }),
    prompt: buildL2Prompt(chunk),
  })
  return { findings: result.output.findings, usage: result.usage }
})
```

### Provider-Specific Options

```typescript
const result = await generateText({
  model: getModelForLayer('L2'),
  temperature: 0.3,    // common setting — top-level OK
  maxOutputTokens: 4096,     // common setting — top-level OK
  providerOptions: {
    openai: {
      parallelToolCalls: false,  // OpenAI-only
    },
  },
  output: Output.object({ schema }),
  prompt,
})
```

---

## 5. Error Handling

### Error Types

| Error | HTTP | Retriable? | Action |
|-------|------|------------|--------|
| `RateLimitError` | 429 | Yes | Let Inngest retry (exponential backoff) |
| `NoObjectGeneratedError` | — | No | `NonRetriableError` — fix schema or prompt |
| Auth failure | 401 | No | `NonRetriableError` — check API key |
| Content filter | — | No | `NonRetriableError` — rephrase prompt |
| Timeout | — | Yes | Let Inngest retry |

### Usage (in `errors.ts`)

```typescript
import { handleAIError } from '@/lib/ai/errors'

try {
  const result = await generateText({ ... })
  return result
} catch (error) {
  handleAIError(error, { fileId, model: 'gpt-4o-mini', layer: 'L2', chunkIndex: i })
  // ^ never returns — either re-throws (retriable) or throws NonRetriableError
}
```

---

## 6. Cost Tracking

### Per-Call

```typescript
import { estimateCost, logAIUsage } from '@/lib/ai/costs'

const result = await generateText({ model: getModelForLayer('L2'), ... })
const cost = estimateCost('gpt-4o-mini', result.usage)

logAIUsage({
  tenantId, projectId, fileId,
  model: 'gpt-4o-mini',
  layer: 'L2',
  inputTokens: result.usage.inputTokens ?? 0,
  outputTokens: result.usage.outputTokens ?? 0,
  estimatedCostUsd: cost,
  chunkIndex: i,
  durationMs: performance.now() - start,
})
```

### Per-File Aggregation

```typescript
import { aggregateUsage } from '@/lib/ai/costs'

const allRecords: AIUsageRecord[] = []
// ... collect from each chunk ...

const total = aggregateUsage(allRecords)
// { inputTokens: 12500, outputTokens: 3200, estimatedCostUsd: 0.003795 }
```

### Model Pricing (as of 2026-02)

| Model | Input $/1K | Output $/1K | Typical File Cost |
|-------|-----------|------------|-------------------|
| gpt-4o-mini | $0.00015 | $0.0006 | ~$0.001-0.005 |
| claude-sonnet-4-5-20250929 | $0.003 | $0.015 | ~$0.02-0.10 |

---

## 7. Inngest Integration Pattern

### L2 Screening Step (Template)

```typescript
// In processFilePipeline handler:
const l2Result = await step.run(`l2-screening-${fileId}`, async () => {
  return await runL2ForFile({ fileId, projectId, tenantId, segments, l1Findings })
})

// In runL2ForFile.ts (new helper, pattern mirrors runL1ForFile.ts):
export async function runL2ForFile({ ... }): Promise<LayerResult<L2Finding>> {
  // 1. CAS guard: file status 'l1_completed' → 'l2_processing'
  // 2. Chunk segments at 30K chars (Guardrail #21)
  // 3. For each chunk: step.run(`l2-chunk-${fileId}-${i}`) → generateText()
  // 4. Collect partial results (failed chunks don't fail layer)
  // 5. INSERT findings via transaction (DELETE old L2 + INSERT new)
  // 6. Update file status to 'l2_completed'
  // 7. Audit log (non-fatal try-catch)
  // 8. Return LayerResult with usage aggregation
}
```

### Budget Guard (Guardrail #22)

```typescript
// Before any AI call:
const budget = await checkTenantBudget(tenantId)
if (!budget.hasQuota) {
  throw new NonRetriableError(`Tenant ${tenantId} AI quota exhausted`)
}
```

---

## 8. Testing Strategy (P2 — Complete)

### Shared Mock Factory (`src/test/mocks/ai-providers.ts`)

`createAIMock()` is the AI equivalent of `createDrizzleMock()`. Registered on `globalThis` via `setup.ts`, available inside `vi.hoisted()`.

```typescript
// In test file:
const { mocks, modules, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  const { mocks, modules } = createAIMock({ layer: 'L2' }) // or 'L3'
  return { mocks, modules, dbState, dbMockModule }
})

// One-liner vi.mock() calls using pre-wired modules:
vi.mock('ai', () => modules.ai)
vi.mock('@/lib/ai/client', () => modules.aiClient)
vi.mock('@/lib/ai/costs', () => modules.aiCosts)
vi.mock('@/lib/ai/errors', () => modules.aiErrors)
vi.mock('@/lib/ai/budget', () => modules.aiBudget)
vi.mock('@/lib/ai/types', () => modules.aiTypes)
vi.mock('@/features/audit/actions/writeAuditLog', () => modules.audit)
vi.mock('@/lib/logger', () => modules.logger)
vi.mock('@/db/client', () => dbMockModule)
```

**Returned mock functions:** `mockGenerateText`, `mockClassifyAIError`, `mockCheckTenantBudget`, `mockWriteAuditLog`, `mockLogAIUsage`, `mockEstimateCost`, `mockAggregateUsage`.

**`layer` option:** Sets `getModelForLayer` return value (`'mock-l2-model'` or `'mock-l3-model'`) and includes both model configs in `MODEL_CONFIG`.

### Type-Safe Fixtures (`src/test/fixtures/ai-responses.ts`)

```typescript
import { buildL2Response, buildL3Response, buildSegmentRow,
         BUDGET_HAS_QUOTA, BUDGET_EXHAUSTED } from '@/test/fixtures/ai-responses'

// L2 response with 1 finding (type-safe via L2ChunkResponse)
mockGenerateText.mockResolvedValue(
  buildL2Response([{ segmentId: '...', severity: 'major' }])
)

// L3 response with rationale (type-safe via L3ChunkResponse)
mockGenerateText.mockResolvedValue(
  buildL3Response([{ segmentId: '...', rationale: 'Because...' }])
)

// Empty response (default — no findings)
mockGenerateText.mockResolvedValue(buildL2Response())

// Budget fixtures
mockCheckTenantBudget.mockResolvedValue(BUDGET_EXHAUSTED)

// Error fixtures (for testing classifyAIError directly)
import { createRateLimitError, createTimeoutError } from '@/test/fixtures/ai-responses'
```

### Key Files

| File | Purpose |
|------|---------|
| `src/test/mocks/ai-providers.ts` | `createAIMock()` factory — mock functions + module objects |
| `src/test/fixtures/ai-responses.ts` | `buildL2Response()`, `buildL3Response()`, error/budget fixtures |
| `src/test/setup.ts` | Registers both `createDrizzleMock` and `createAIMock` on globalThis |
| `src/test/globals.d.ts` | TypeScript declarations for global test helpers |

---

## 9. Guardrails Added (P3)

Guardrails #16-22 added to CLAUDE.md:

| # | Rule | Key Point |
|---|------|-----------|
| 16 | `generateText` + `Output.object()` | Never `generateObject` (deprecated) |
| 17 | `.nullable()` only | OpenAI rejects `.optional()` |
| 18 | Error classification | RateLimit=retry, Schema/Auth=NonRetriableError |
| 19 | Cost tracking mandatory | Log `usage` on every AI call |
| 20 | Provider via `@/lib/ai` | Never inline constructor |
| 21 | One `step.run()` per chunk | Partial results, 30K char chunks |
| 22 | Budget guard | Check quota before AI calls |

---

## 10. Open Questions for Story 3.1

1. **ai_usage_logs table** — schema design needed (tenantId, model, tokens, cost, timestamp)
2. **Budget model** — per-tenant monthly token limit? Per-project? Configurable?
3. **Fallback chain** — if OpenAI rate-limited, retry same chunk with Anthropic? Or fail gracefully?
4. **Prompt templates** — where to store? `src/features/pipeline/prompts/` or `src/lib/ai/prompts/`?
5. **Response validation** — what if AI returns findings for segments not in the input chunk?

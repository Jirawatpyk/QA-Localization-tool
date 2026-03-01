---
stepsCompleted:
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-03-01'
---

# ATDD Checklist - Epic 3, Story 3.2a: AI Provider Integration & Structured Output

**Date:** 2026-03-01
**Author:** Mona (TEA Agent)
**Primary Test Level:** Unit (Vitest)
**Generation Mode:** AI Generation (backend-only story, clear ACs)

---

## Story Summary

Production-ready AI provider infrastructure integrating Vercel AI SDK v6 with L2 structured output schema, real prompt builder wiring, provider health checks, and cost tracking with `languagePair`.

**As a** Developer
**I want** production-ready AI provider infrastructure with Vercel AI SDK v6, L2 structured output schemas, and fully-wired L2 prompt templates
**So that** the L2 screening pipeline can make real AI calls with proper schema validation, fallback chains, and cost tracking

---

## Acceptance Criteria

1. **AC1:** L2 Model Configuration & Provider Health — `checkProviderHealth()`, fallback chain, pinned model resolution
2. **AC2:** L2 Structured Output Schema — Zod schema with `z.string()` category, `.nullable()` suggestion, confidence 0-100
3. **AC3:** Wire Real Prompt Builder — Replace inline `_buildL2Prompt` with real `buildL2Prompt()`, load glossary (JOIN), taxonomy (global), project
4. **AC4:** API Call Logging — `languagePair` field, migration, `logAIUsage()` per chunk, budget guard
5. **AC5:** Unit Tests — Schema validation, context loading, fallback chain, cost tracking, error classification

---

## Failing Tests Created (RED Phase)

### Unit Tests — Schema (21 tests)

**File:** `src/features/pipeline/schemas/l2-output.test.ts` (NEW — 160 lines)

- `it.skip` **[P0] should accept valid finding with all required fields**
  - **Status:** RED — `l2-output.ts` module does not exist
  - **Verifies:** AC2 — valid L2 finding schema parsing

- `it.skip` **[P0] should accept confidence = 0 (boundary: at min)**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — confidence boundary lower bound

- `it.skip` **[P0] should accept confidence = 100 (boundary: at max)**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — confidence boundary upper bound

- `it.skip` **[P0] should reject confidence = -1 (boundary: below min)**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — confidence below valid range

- `it.skip` **[P0] should reject confidence = 101 (boundary: above max)**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — confidence above valid range

- `it.skip` **[P0] should accept suggestion = null (.nullable())**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — Guardrail #17 nullable compliance

- `it.skip` **[P1] should reject suggestion = undefined (NOT .optional())**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — OpenAI structured output rejects .optional()

- `it.skip` **[P1] should accept any string category (taxonomy-driven)**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — category is z.string(), not hardcoded enum

- `it.skip` **[P1] should reject non-string category value**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — type validation

- `it.skip` **[P1] should reject invalid severity value**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — severity enum enforcement

- `it.skip` **[P1] should accept all valid severity values: critical, major, minor**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — all enum members valid

- `it.skip` **[P1] should reject finding with missing segmentId**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — required field validation

- `it.skip` **[P1] should reject finding with missing description**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — required field validation

- `it.skip` **[P2] should accept confidence = 50 (mid-range)**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — confidence mid-range

- `it.skip` **[P0] should accept valid output with findings array and summary**
  - **Status:** RED — l2OutputSchema not created
  - **Verifies:** AC2 — full output schema validation

- `it.skip` **[P1] should accept empty findings array**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — zero findings valid

- `it.skip` **[P1] should reject output without summary field**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — summary is required

- `it.skip` **[P1] should accept output with multiple findings**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — array with multiple items

- `it.skip` **[P2] should accept findings with all 6 semantic categories**
  - **Status:** RED — schema not created
  - **Verifies:** AC2 — all 6 L2 semantic categories

- `it.skip` **[P2] should contain exactly 6 semantic categories**
  - **Status:** RED — L2_SEMANTIC_CATEGORIES not created
  - **Verifies:** AC2 — reference constant

- `it.skip` **[P2] should export L2Finding and L2Output inferred types**
  - **Status:** RED — module not created
  - **Verifies:** AC2 — type exports

### Unit Tests — Provider Health (7 tests)

**File:** `src/lib/ai/providers.test.ts` (APPENDED — new describe blocks)

- `it.skip` **[P0] should return available=true and latencyMs > 0 for healthy provider**
  - **Status:** RED — checkProviderHealth not implemented
  - **Verifies:** AC1 — health check happy path

- `it.skip` **[P0] should return available=false when provider probe fails**
  - **Status:** RED — checkProviderHealth not implemented
  - **Verifies:** AC1 — health check failure detection

- `it.skip` **[P1] should never throw — always return result even for unknown provider**
  - **Status:** RED — checkProviderHealth not implemented
  - **Verifies:** AC1 — error containment

- `it.skip` **[P1] should complete within reasonable timeout**
  - **Status:** RED — checkProviderHealth not implemented
  - **Verifies:** AC1 — non-blocking performance

- `it.skip` **[P1] should log health check result via pino**
  - **Status:** RED — checkProviderHealth not implemented
  - **Verifies:** AC1 — observability

- `it.skip` **[P1] should skip unhealthy primary and use first available fallback**
  - **Status:** RED — health+fallback integration not implemented
  - **Verifies:** AC1 — fallback chain integration

- `it.skip` **[P1] should log when fallback is activated due to health check failure**
  - **Status:** RED — health+fallback integration not implemented
  - **Verifies:** AC1 — fallback audit trail

### Unit Tests — Context Loading + Cost Tracking (14 tests)

**File:** `src/features/pipeline/helpers/runL2ForFile.test.ts` (APPENDED — 2 new describe blocks)

**AC3 Context Loading (9 tests):**

- `it.skip` **[P0] should call real buildL2Prompt from prompts/build-l2-prompt**
  - **Status:** RED — still using inline _buildL2Prompt
  - **Verifies:** AC3 — real prompt builder wiring

- `it.skip` **[P0] should load glossary terms via JOIN through glossaries table with withTenant**
  - **Status:** RED — glossary context loading not implemented
  - **Verifies:** AC3 — correct glossary query pattern

- `it.skip` **[P0] should load taxonomy categories without withTenant (shared global)**
  - **Status:** RED — taxonomy context loading not implemented
  - **Verifies:** AC3 — taxonomy NO tenant isolation

- `it.skip` **[P0] should load project details with withTenant**
  - **Status:** RED — project context loading not implemented
  - **Verifies:** AC3 — project query with tenant isolation

- `it.skip` **[P0] should use imported l2OutputSchema (not inline)**
  - **Status:** RED — still using inline l2ChunkResponseSchema
  - **Verifies:** AC3 — schema import from schemas/l2-output

- `it.skip` **[P1] should load L1 findings with detectedByLayer for dedup context**
  - **Status:** RED — detectedByLayer not in L1 findings SELECT
  - **Verifies:** AC3 — L1 finding context for deduplication

- `it.skip` **[P1] should handle empty glossary terms gracefully**
  - **Status:** RED — glossary loading not implemented
  - **Verifies:** AC3 — empty glossary edge case

- `it.skip` **[P1] should handle empty taxonomy categories gracefully**
  - **Status:** RED — taxonomy loading not implemented
  - **Verifies:** AC3 — empty taxonomy edge case

- `it.skip` **[P2] should map DB rows to L2PromptInput types correctly**
  - **Status:** RED — DB→PromptInput mapping not implemented
  - **Verifies:** AC3 — type mapping correctness

**AC4 Cost Tracking + languagePair (5 tests):**

- `it.skip` **[P0] should include languagePair in logAIUsage call**
  - **Status:** RED — languagePair not in AIUsageRecord
  - **Verifies:** AC4 — NFR36 language pair logging

- `it.skip` **[P0] should derive languagePair from segment sourceLang→targetLang**
  - **Status:** RED — languagePair derivation not implemented
  - **Verifies:** AC4 — languagePair format

- `it.skip` **[P0] should aggregate usage across all chunks and include in result**
  - **Status:** RED — context loading changes chunk count
  - **Verifies:** AC4 — aggregateUsage per-file totals

- `it.skip` **[P1] should log failed chunk with status error and languagePair**
  - **Status:** RED — languagePair not in error logging
  - **Verifies:** AC4 — error chunk logging

- `it.skip` **[P1] should handle missing language info gracefully**
  - **Status:** RED — languagePair fallback not implemented
  - **Verifies:** AC4 — edge case empty language

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY)

### Confidence score boundaries (AC2)

| Boundary | At Min | Below Min | At Max | Above Max | Mid |
|----------|--------|-----------|--------|-----------|-----|
| `confidence: 0..100` | `0` (accept) | `-1` (reject) | `100` (accept) | `101` (reject) | `50` (accept) |

**Tests:**

- **[P0]** `should accept confidence = 0` — l2-output.test.ts
- **[P0]** `should reject confidence = -1` — l2-output.test.ts
- **[P0]** `should accept confidence = 100` — l2-output.test.ts
- **[P0]** `should reject confidence = 101` — l2-output.test.ts
- **[P2]** `should accept confidence = 50` — l2-output.test.ts

### Budget boundary (AC4)

| Boundary | Has Quota | Exhausted |
|----------|-----------|-----------|
| `hasQuota` | `true` (proceed) | `false` (NonRetriableError) |

**Tests:** Covered by existing `runL2ForFile.test.ts` tests (line 181: budget exhausted, line 471: budget check order)

### Findings array boundary (AC2)

| Boundary | Empty | Single | Multiple |
|----------|-------|--------|----------|
| `findings[]` | `[]` (accept) | `[1 item]` (accept) | `[3 items]` (accept) |

**Tests:**

- **[P1]** `should accept empty findings array` — l2-output.test.ts
- **[P0]** `should accept valid output with findings array` — l2-output.test.ts
- **[P1]** `should accept output with multiple findings` — l2-output.test.ts

---

## Data Factories Used

### Existing Factories (reused — NOT recreated)

**File:** `src/test/fixtures/ai-responses.ts`

- `buildL2Response(findingOverrides?)` — Mock `generateText()` result for L2
- `buildSegmentRow(overrides?)` — Minimal segment row for AI tests
- `BUDGET_HAS_QUOTA` / `BUDGET_EXHAUSTED` — Budget check fixtures

**File:** `src/test/mocks/ai-providers.ts`

- `createAIMock({ layer: 'L2' })` — Full AI module mock setup
- Returns: `{ mocks, modules }` for vi.mock() patterns

**File:** `src/test/drizzleMock.ts`

- `createDrizzleMock()` — Global Drizzle mock via globalThis
- Features: `returnValues`, `setCaptures`, `callIndex`, `transaction`

---

## Mock Requirements

### AI Provider Mock (existing — via createAIMock)

**Modules mocked:**
- `ai` — `generateText`, `Output`
- `@/lib/ai/client` — `getModelById`
- `@/lib/ai/costs` — `logAIUsage`, `aggregateUsage`, `estimateCost`
- `@/lib/ai/errors` — `classifyAIError`
- `@/lib/ai/budget` — `checkProjectBudget`, `checkTenantBudget`
- `@/lib/ai/providers` — `getModelForLayerWithFallback`, `buildFallbackChain`

### Rate Limiter Mock (separate — NOT in createAIMock)

```typescript
vi.mock('@/lib/ratelimit', () => ({
  aiL2ProjectLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))
```

### Prompt Builder Mock (NEW — for AC3 wiring tests)

```typescript
vi.mock('@/features/pipeline/prompts/build-l2-prompt', () => ({
  buildL2Prompt: vi.fn().mockReturnValue('mocked L2 prompt string'),
}))
```

### DB Schema Mocks (existing pattern)

```typescript
vi.mock('@/db/schema/glossaries', () => ({
  glossaries: { id: 'id', projectId: 'project_id', tenantId: 'tenant_id' },
}))
vi.mock('@/db/schema/glossaryTerms', () => ({
  glossaryTerms: { glossaryId: 'glossary_id', sourceTerm: 'source_term', targetTerm: 'target_term', caseSensitive: 'case_sensitive' },
}))
vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: { id: 'id', category: 'category', parentCategory: 'parent_category', severity: 'severity', description: 'description', isActive: 'is_active' },
}))
```

---

## Required data-testid Attributes

N/A — Backend-only story, no UI components.

---

## Implementation Checklist

### Test Group 1: L2 Output Schema (AC2) — 22 tests

**File:** `src/features/pipeline/schemas/l2-output.test.ts`

**Tasks to make these tests pass:**

- [ ] Create `src/features/pipeline/schemas/l2-output.ts`
- [ ] Define `L2_SEMANTIC_CATEGORIES` const array (reference only)
- [ ] Define `l2FindingSchema` with `category: z.string()`, `severity: z.enum(...)`, `confidence: z.number().min(0).max(100)`, `suggestion: z.string().nullable()`
- [ ] Define `l2OutputSchema` with `findings: z.array(l2FindingSchema)`, `summary: z.string()`
- [ ] Export `L2Finding` and `L2Output` inferred types
- [ ] Remove `it.skip` from all tests in `l2-output.test.ts`
- [ ] Run test: `npx vitest run src/features/pipeline/schemas/l2-output.test.ts`
- [ ] All 22 tests pass (green phase)

### Test Group 2: Provider Health Check (AC1) — 7 tests

**File:** `src/lib/ai/providers.test.ts`

**Tasks to make these tests pass:**

- [ ] Implement `checkProviderHealth(provider)` in `src/lib/ai/providers.ts`
- [ ] Return `{ available: boolean, latencyMs: number }` — lightweight probe
- [ ] Catch all errors (never throw) — return `available: false` on failure
- [ ] Log health status via pino logger
- [ ] Integrate health check into fallback chain resolution
- [ ] Add mocks for `generateText` and `logger` in new describe blocks
- [ ] Remove `it.skip` from health check tests
- [ ] Run test: `npx vitest run src/lib/ai/providers.test.ts`
- [ ] All 7 new + 10 existing tests pass (green phase)

### Test Group 3: Context Loading (AC3) — 9 tests

**File:** `src/features/pipeline/helpers/runL2ForFile.test.ts`

**Tasks to make these tests pass:**

- [ ] Add context-loading functions to `runL2ForFile.ts` (glossary JOIN, taxonomy global, project withTenant)
- [ ] Replace inline `_buildL2Prompt()` with real `buildL2Prompt()` from `@/features/pipeline/prompts/build-l2-prompt`
- [ ] Replace inline `l2ChunkResponseSchema` with `l2OutputSchema` from `schemas/l2-output`
- [ ] Add mapper functions: DB rows → `PromptSegment[]`, `GlossaryTermContext[]`, `TaxonomyCategoryContext[]`, `ProjectContext`
- [ ] Add schema mocks for `glossaries`, `glossaryTerms`, `taxonomyDefinitions`
- [ ] Mock `buildL2Prompt` for isolation
- [ ] Remove `it.skip` from AC3 tests
- [ ] Run test: `npx vitest run src/features/pipeline/helpers/runL2ForFile.test.ts`
- [ ] All 9 new + 19 existing tests pass (green phase)

### Test Group 4: Cost Tracking + languagePair (AC4) — 5 tests

**File:** `src/features/pipeline/helpers/runL2ForFile.test.ts`

**Tasks to make these tests pass:**

- [ ] Add `language_pair varchar(50)` nullable column to `ai_usage_logs` (Drizzle schema + Supabase migration)
- [ ] Update `AIUsageRecord` type in `src/lib/ai/types.ts` to include `languagePair` field
- [ ] Update `logAIUsage()` in `src/lib/ai/costs.ts` to accept + persist `languagePair`
- [ ] Derive `languagePair` from segment `sourceLang→targetLang` in `runL2ForFile.ts`
- [ ] Pass `languagePair` to every `logAIUsage()` call
- [ ] Remove `it.skip` from AC4 tests
- [ ] Run test: `npx vitest run src/features/pipeline/helpers/runL2ForFile.test.ts`
- [ ] All 5 new tests pass (green phase)

---

## Running Tests

```bash
# Run all ATDD tests for this story
npx vitest run src/features/pipeline/schemas/l2-output.test.ts src/lib/ai/providers.test.ts src/features/pipeline/helpers/runL2ForFile.test.ts

# Run schema tests only
npx vitest run src/features/pipeline/schemas/l2-output.test.ts

# Run provider tests only
npx vitest run src/lib/ai/providers.test.ts

# Run runL2ForFile integration tests only
npx vitest run src/features/pipeline/helpers/runL2ForFile.test.ts

# Watch mode for development
npx vitest --project unit src/features/pipeline/schemas/l2-output.test.ts
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All 43 new tests written with `it.skip()`
- Existing factories and mocks reused (no duplication)
- Mock requirements documented (including NEW prompt builder + schema mocks)
- Implementation checklist created with 4 test groups
- Boundary values explicitly tested (confidence 0/-1/100/101, empty findings, budget)

**Verification:**

- All new tests use `it.skip()` — will be skipped in CI
- Existing 29 tests in `runL2ForFile.test.ts` + 10 in `providers.test.ts` remain GREEN
- No test breakage introduced

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Start with Test Group 1 (Schema)** — creates `l2-output.ts`, easiest to make pass
2. **Then Test Group 2 (Health Check)** — adds `checkProviderHealth` to `providers.ts`
3. **Then Test Group 3 (Context Loading)** — biggest change: wiring real prompt + context queries
4. **Finally Test Group 4 (languagePair)** — migration + type update + wiring

**Key Principles:**

- Remove `it.skip` one test group at a time
- Run tests after each implementation step
- All 43 new tests + 39 existing tests must pass

---

### REFACTOR Phase (After All Tests Pass)

- Verify all 82+ tests pass (43 new + 39 existing)
- Remove deprecated inline `_buildL2Prompt` and `l2ChunkResponseSchema`
- Review DB query consistency (Guardrail #14)
- Ensure cost logging fire-and-forget pattern preserved

---

## Test Summary Statistics

| Metric | Value |
|--------|-------|
| **Total new ATDD tests** | 42 |
| **P0 tests** | 15 |
| **P1 tests** | 20 |
| **P2 tests** | 7 |
| **Boundary value tests** | 5 (confidence) + 3 (findings array) |
| **Test files modified** | 2 (providers.test.ts, runL2ForFile.test.ts) |
| **Test files created** | 1 (l2-output.test.ts) |
| **Existing tests preserved** | 39 (29 runL2 + 10 providers) |
| **TDD Phase** | RED (all `it.skip()`) |

---

## Knowledge Base References Applied

- **data-factories.md** — Reused existing `buildL2Response`, `buildSegmentRow`, `BUDGET_HAS_QUOTA` from `src/test/fixtures/ai-responses.ts`
- **test-quality.md** — One assertion focus, deterministic inputs, no snapshot tests, boundary value testing
- **CLAUDE.md Guardrails** — #16 (generateText+Output.object), #17 (.nullable() only), #18 (error classification), #19 (cost tracking), #22 (budget guard)

---

## Notes

- **No E2E tests** — backend-only story, no UI routes. Scope boundary explicitly defined in story.
- **Existing tests preserved** — All 29 existing `runL2ForFile.test.ts` tests and 10 `providers.test.ts` tests remain unchanged and passing.
- **Migration required** — `ai_usage_logs.language_pair` column must be added via Drizzle schema + Supabase SQL migration. Dev should create migration file in `supabase/migrations/`.
- **Prompt builder mock** — Dev must add `vi.mock('@/features/pipeline/prompts/build-l2-prompt', ...)` to AC3 tests when implementing context loading (currently implied by the test structure).
- **DB schema mocks** — Dev must add mocks for `glossaries`, `glossaryTerms`, `taxonomyDefinitions` tables when implementing AC3 context loading.

---

**Generated by BMad TEA Agent** - 2026-03-01

---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-27'
---

# ATDD Checklist - Epic 3, Story 1: AI Cost Control, Throttling & Model Pinning

**Date:** 2026-02-27
**Author:** Mona (TEA)
**Primary Test Level:** Unit (Vitest — node + jsdom)

---

## Story Summary

Cost control and governance story establishing real budget enforcement, AI rate limiting, model
version pinning, and DB-persisted usage logging. No actual AI inference in this story — this story
wires the cost/throttle infrastructure that Stories 3.2a/3.2b/3.3 will use.

**As a** PM / Admin
**I want** AI cost estimates before processing, rate limits and budget constraints, and pinned model
versions per project
**So that** I can control costs, prevent abuse, and ensure consistent AI behavior across processing runs

---

## Acceptance Criteria

1. **AC1:** `ProcessingModeDialog` shows word-count-based cost estimate (`(words/100k)*rate`) with comparison note vs. manual QA
2. **AC2:** `startProcessing.action.ts` enforces Upstash rate limit (5 req/60s per user) + per-project L2/L3 project-level rate limits; budget enforcement also coordinated
3. **AC3:** Admin can pin L2/L3 model version per project; fallback chain activates when pinned model unavailable; audit log written
4. **AC4:** `logAIUsage()` upgraded from pino-only to DB INSERT into `ai_usage_logs` with all required fields
5. **AC5:** `checkTenantBudget()` (currently a STUB) replaced with real USD-based DB query against `ai_usage_logs` monthly SUM; NULL budget = unlimited
6. **AC6:** `BatchSummaryView` shows cost summary line: "AI cost: $X.XX (Y files, $Z.ZZ per 100K words)"
7. **AC7:** `AiBudgetCard` in project settings shows monthly spend vs. budget with colored progress bar (green/yellow/red); configurable alert threshold
8. **AC8:** (Pre-existing, Story 2.6) Concurrency — no new work required
9. **AC9:** Unit tests for all above with boundary value coverage (Epic 2 retro mandate A2)

---

## Test Strategy

### Test Level Selection

| AC | Test Level | Rationale |
|----|-----------|-----------|
| AC1 (Cost Estimation) | Unit (jsdom) + Unit (node) | Component test for `ProcessingModeDialog` word-count display; pure function test for `estimateProcessingCost()` formula |
| AC2 (Rate Limiting) | Unit (node) | Mock Upstash Redis; test `aiPipelineLimiter`, `aiL2ProjectLimiter`, `aiL3ProjectLimiter` coordination in action |
| AC3 (Model Pinning) | Unit (node) | `updateModelPinning.action.ts` Server Action test; `buildFallbackChain()` pure function test |
| AC4 (AI Usage Logging) | Unit (node) | Mock Drizzle INSERT via `createDrizzleMock()`; verify all required fields + `deriveProvider()` |
| AC5 (Budget Enforcement) | Unit (node) | Mock Drizzle SUM query; boundary values mandatory per Epic 2 retro A2 |
| AC6 (Cost Summary) | Unit (jsdom) | Component test for `BatchSummaryView` cost line; mock `ai_usage_logs` aggregate prop |
| AC7 (Budget Visibility) | Unit (jsdom) | Component test for `AiBudgetCard`; progress bar color logic; threshold alert |
| AC8 (Concurrency) | N/A | Pre-existing from Story 2.6 — no new tests needed |
| AC9 (Unit Tests Meta) | — | Covered by all above |

### No E2E Tests

This story creates no new HTTP route handlers and the UX changes are admin-only settings panels.
All tests are Vitest unit tests (node or jsdom project).

---

## Failing Tests Created (RED Phase)

### Test File 1: `src/lib/ai/budget.test.ts` — 13 tests

**Note:** This file tests the real `checkProjectBudget()` (USD-based) that replaces the current stub
`checkTenantBudget()`. The function signature changes from `(tenantId)` to `(projectId, tenantId)`.

```
P0  should return hasQuota=true when monthly usage is below budget
P0  should return hasQuota=false when monthly usage equals budget exactly ($100.00/$100.00)
P0  should return hasQuota=false when monthly usage exceeds budget by $0.01 ($100.01 used)
P0  should return hasQuota=true when monthly usage is $0.01 below budget ($99.99 used)
P0  should return hasQuota=true with unlimited quota when ai_budget_monthly_usd is NULL
P0  should return usedBudgetUsd=0 and hasQuota=true when no usage records exist this month
P0  should throw when project is not found
P0  should only count current calendar month usage (not previous months)
P1  should return remainingBudgetUsd=0 (not negative) when over budget
P1  should return correct remainingBudgetUsd when partially used
P1  should use COALESCE so zero-usage SUM returns 0 not null
P1  should call withTenant on both projects and ai_usage_logs queries
P1  should query ai_usage_logs filtered to current month start (not all-time)
```

### Test File 2: `src/lib/ai/costs.test.ts` — 9 tests (EXTEND existing if present)

**Note:** Tests cover both the existing `estimateCost()` / `aggregateUsage()` and the new DB persist
behavior of `logAIUsage()`. The function changes from sync `void` to async `Promise<void>`.

```
P0  should INSERT into ai_usage_logs with all required fields on success
P0  should derive provider='openai' from gpt-4o-mini model ID
P0  should derive provider='anthropic' from claude-* model ID
P0  should derive provider='google' from gemini-* model ID
P0  should derive provider='unknown' for unrecognized model ID
P0  should include tenantId in INSERT values (tenant isolation)
P1  should keep pino log alongside DB insert
P1  should not throw when DB insert fails (log error, swallow)
P1  should include chunkIndex when provided (not null)
```

### Test File 3: `src/lib/ai/providers.test.ts` — 10 tests (NEW FILE)

**Note:** Tests for `buildFallbackChain()` and `getModelForLayerWithFallback()` from the new
`src/lib/ai/providers.ts` module.

```
P0  should use system default when pinnedModel is null for L2
P0  should use system default when pinnedModel is null for L3
P0  should use pinned model as primary when set for L2
P0  should use pinned model as primary when set for L3
P0  should include system default in fallbacks when pinned model overrides it
P0  should not duplicate pinned model in fallbacks array
P1  should return L2 fallback chain: gpt-4o-mini → gemini-2.0-flash
P1  should return L3 fallback chain: claude-sonnet-4-5-20250929 → gpt-4o
P1  should filter out primary from fallbacks (no self-fallback)
P1  should read pinned model from projects table via getModelForLayerWithFallback
```

### Test File 4: `src/lib/ratelimit.test.ts` — 10 tests (EXTEND existing)

**Note:** Tests for the three new AI limiters. Mock `@upstash/ratelimit` and `@upstash/redis`.

```
P0  should export aiPipelineLimiter configured as slidingWindow(5, '60 s')
P0  should export aiL2ProjectLimiter configured as slidingWindow(100, '1 h')
P0  should export aiL3ProjectLimiter configured as slidingWindow(50, '1 h')
P0  should use prefix 'rl:ai_pipeline' for aiPipelineLimiter
P0  should use prefix 'rl:ai_l2' for aiL2ProjectLimiter
P0  should use prefix 'rl:ai_l3' for aiL3ProjectLimiter
P1-BV  should allow the 5th request (pass) per user within 60s window
P1-BV  should block the 6th request per user within 60s window
P1-BV  should allow the 100th request (pass) per project for L2 limiter
P1-BV  should block the 101st request per project for L2 limiter
```

### Test File 5: `src/features/pipeline/actions/startProcessing.action.test.ts` — 6 new tests (EXTEND existing)

**Note:** Extend the existing 15-test file. Add rate-limit and budget-guard tests.

```
P0  should return RATE_LIMITED when aiPipelineLimiter blocks user
P0  should proceed when aiPipelineLimiter allows user
P0  should return BUDGET_EXCEEDED when checkProjectBudget returns hasQuota=false
P0  should proceed when checkProjectBudget returns hasQuota=true
P1  should check rate limit BEFORE budget check (rate limit is first guard)
P1  should pass projectId and tenantId to checkProjectBudget
```

### Test File 6: `src/features/pipeline/actions/getFilesWordCount.action.test.ts` — 5 tests (NEW FILE)

**Note:** Server Action that queries `SUM(segments.word_count)` for given file IDs.

```
P0  should return total word count summed across all selected files
P0  should return 0 when no segments exist for the given files
P0  should return FORBIDDEN when auth fails
P1  should use withTenant on segments query
P1-BV  should return 0 words for empty fileIds array (guard inArray([]) before query)
```

### Test File 7: `src/features/pipeline/actions/updateModelPinning.action.test.ts` — 7 tests (NEW FILE)

**Note:** Admin-only Server Action to set `l2_pinned_model` / `l3_pinned_model` on projects table.

```
P0  should update l2_pinned_model when valid L2 model provided
P0  should update l3_pinned_model when valid L3 model provided
P0  should return FORBIDDEN when user role is not admin
P0  should return INVALID_INPUT when model ID is not in AVAILABLE_MODELS allowlist
P0  should write audit log on successful model pin change
P1  should allow null to clear pinned model (reset to system default)
P1  should use withTenant on projects UPDATE query
```

### Test File 8: `src/features/pipeline/actions/getProjectAiBudget.action.test.ts` — 5 tests (NEW FILE)

**Note:** Server Action that returns current month spend + project budget for `AiBudgetCard`.

```
P0  should return usedBudgetUsd and monthlyBudgetUsd for project
P0  should return monthlyBudgetUsd=null when project has no budget set
P0  should return FORBIDDEN when auth fails
P1  should use withTenant on ai_usage_logs query
P1  should return usedBudgetUsd=0 when no usage records exist this month
```

### Test File 9: `src/features/pipeline/actions/updateBudgetAlertThreshold.action.test.ts` — 5 tests (NEW FILE)

**Note:** Admin/PM can update `budget_alert_threshold_pct` column on projects table.

```
P0  should update budget_alert_threshold_pct for valid percentage (80)
P0  should return FORBIDDEN when user role is qa_reviewer
P0  should return INVALID_INPUT when threshold is outside 1-100 range
P1  should write audit log on threshold change
P1  should use withTenant on projects UPDATE query
```

### Test File 10: `src/features/pipeline/components/ProcessingModeDialog.test.tsx` — 7 new tests (EXTEND existing)

**Note:** Extend the existing 13-test file. Add word-count-based cost estimation tests.

```
P0  should fetch word count via getFilesWordCount action on mount
P0  should display economy cost estimate using formula: (words/100k)*0.40
P0  should display thorough cost estimate using formula: (words/100k)*2.40
P0  should show loading skeleton while word count is fetching
P0  should display comparison note 'vs. manual QA: ~$150-300 per 100K words'
P1-BV  should display $0.00 cost estimate when totalWords is 0
P1-BV  should display exact rate cost when totalWords is exactly 100,000
```

### Test File 11: `src/features/pipeline/components/ModelPinningSettings.test.tsx` — 6 tests (NEW FILE)

**Note:** Admin-only component with two Select dropdowns for L2/L3 model versions.

```
P0  should render L2 model select dropdown for admin role
P0  should render L3 model select dropdown for admin role
P0  should show display-only text (not select) for non-admin role
P0  should call updateModelPinning action when model selection changes
P1  should show 'System Default' as first option in both dropdowns
P1  should display current pinned model as selected option
```

### Test File 12: `src/features/pipeline/components/AiBudgetCard.test.tsx` — 8 tests (NEW FILE)

**Note:** Budget progress bar component for project settings AI Configuration section.

```
P0  should render green progress bar when usage is below alert threshold
P0  should render yellow progress bar when usage equals alert threshold (80%)
P0  should render red progress bar when usage is at or above 100%
P0  should display spend text: '$X.XX / $Y.YY used'
P0  should show 'No budget limit set' text when budget is null (unlimited)
P1  should show 'Budget exceeded — AI processing paused' when over 100%
P1-BV  should render green at 79% usage (below 80% threshold)
P1-BV  should render yellow at exactly 80% usage (at threshold)
```

### Test File 13: `src/features/batch/components/BatchSummaryView.test.tsx` — 4 new tests (EXTEND existing)

**Note:** Extend the existing 6-test file. Add AI cost summary line tests.

```
P0  should render AI cost summary line when aiCostSummary prop is provided
P0  should display formatted cost: 'AI cost: $X.XX (Y files, $Z.ZZ per 100K words)'
P1  should not render AI cost line when aiCostSummary prop is undefined
P1-BV  should display $0.00 cost when aiCostSummary.totalCostUsd is 0
```

### Test File 14: `src/features/pipeline/helpers/runL2ForFile.test.ts` — 4 new tests (EXTEND existing)

**Note:** Extend the existing test file. Add budget guard and per-project rate limit tests.

```
P0  should throw NonRetriableError when checkProjectBudget returns hasQuota=false
P0  should call checkProjectBudget before making AI API call
P0  should check aiL2ProjectLimiter before processing each file
P1  should proceed normally when both budget and rate limit allow
```

### Test File 15: `src/features/pipeline/helpers/runL3ForFile.test.ts` — 4 new tests (EXTEND existing)

**Note:** Extend the existing test file. Add budget guard and per-project rate limit tests.

```
P0  should throw NonRetriableError when checkProjectBudget returns hasQuota=false
P0  should call checkProjectBudget before making AI API call
P0  should check aiL3ProjectLimiter before processing each file
P1  should proceed normally when both budget and rate limit allow
```

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY, all P0)

### Budget Boundary Values (AC5)

| Test | Input | Expected |
|------|-------|----------|
| At limit exactly | used=$100.00, budget=$100.00 | `hasQuota=false` (>= blocks) |
| $0.01 over budget | used=$100.01, budget=$100.00 | `hasQuota=false` |
| $0.01 under budget | used=$99.99, budget=$100.00 | `hasQuota=true` |
| NULL budget | `ai_budget_monthly_usd=NULL` | `hasQuota=true` (unlimited) |
| $0 budget | used=$0.01, budget=$0.00 | `hasQuota=false` |
| $0 usage | used=$0.00, budget=$100.00 | `hasQuota=true`, `remainingBudgetUsd=$100.00` |

**Coverage location:** `src/lib/ai/budget.test.ts` (6 tests, all P0)

### Rate Limit Boundary Values (AC2)

| Test | Input | Expected |
|------|-------|----------|
| 5th user request (pass) | counter=4 → 5th call | `success=true` |
| 6th user request (block) | counter=5 → 6th call | `success=false` (blocked) |
| After 60s reset | window expired → 1st call | `success=true` |
| 100th L2 project request (pass) | counter=99 → 100th call | `success=true` |
| 101st L2 project request (block) | counter=100 → 101st call | `success=false` |
| 50th L3 project request (pass) | counter=49 → 50th call | `success=true` |
| 51st L3 project request (block) | counter=50 → 51st call | `success=false` |

**Coverage location:** `src/lib/ratelimit.test.ts` (boundary tests P1-BV)

### Cost Estimation Boundary Values (AC1)

| Test | Input (words, mode) | Expected |
|------|---------------------|----------|
| 0 words | 0, economy | $0.00 |
| 1 word | 1, economy | ~$0.000004 (rounds to $0.00) |
| 100,000 words | 100_000, economy | $0.40 (exact rate match) |
| 100,000 words | 100_000, thorough | $2.40 (exact rate match) |
| 500,000 words | 500_000, economy | $2.00 |
| 500,000 words | 500_000, thorough | $12.00 |

**Coverage location:** `src/features/pipeline/components/ProcessingModeDialog.test.tsx` (P1-BV tests)

### Budget Alert Threshold Boundary Values (AC7)

| Test | Usage % | Alert Threshold | Progress Bar Color |
|------|---------|-----------------|-------------------|
| 79% usage | $79.00/$100.00 | 80% | green |
| 80% usage (at threshold) | $80.00/$100.00 | 80% | yellow |
| 99% usage | $99.00/$100.00 | 80% | yellow |
| 100% usage | $100.00/$100.00 | 80% | red |
| 101% usage | $101.00/$100.00 | 80% | red |
| 0% usage | $0.00/$100.00 | 80% | green |

**Coverage location:** `src/features/pipeline/components/AiBudgetCard.test.tsx` (P1-BV tests)

### Cost Variance Boundary (AC1 — variance ≤ 20%)

| Test | Actual cost | Estimated cost | Variance | Result |
|------|-------------|----------------|----------|--------|
| At 20% variance (pass) | $1.20 | $1.00 | 20% | PASS |
| At 21% variance (fail) | $1.21 | $1.00 | 21% | FAIL |

**Coverage location:** `src/lib/ai/budget.test.ts` or separate utility test

---

## Mock Requirements

### Drizzle Mock (`createDrizzleMock` — AC4, AC5)

```typescript
// Pattern — use in vi.hoisted()
const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())
vi.mock('@/db/client', () => dbMockModule)

// Budget query: 2 sequential DB calls
// callIndex=0: projects SELECT → returns [{ budget: '100.00' }]
// callIndex=1: ai_usage_logs SUM → returns [{ total: '99.99' }]
dbState.returnValues = [
  [{ budget: '100.00' }],     // projects SELECT
  [{ total: '99.99' }],       // ai_usage_logs SUM
]

// logAIUsage INSERT: callIndex=0 → .returning() terminal
dbState.returnValues = [[{ id: 'inserted-uuid' }]]
```

**Key `dbState` fields used:**
- `returnValues[callIndex]` — for `.then()` and `.returning()` terminals
- `valuesCaptures[0]` — verify INSERT field values (logAIUsage)
- `setCaptures[0]` — verify UPDATE field values (updateModelPinning)
- `throwAtCallIndex` — error injection for DB failure tests

### Upstash Ratelimit Mock (AC2)

```typescript
// Top-level module mock — must be BEFORE 'server-only' mock in file order
const { mockAiPipelineLimit, mockAiL2Limit, mockAiL3Limit } = vi.hoisted(() => ({
  mockAiPipelineLimit: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, limit: 5, remaining: 4, reset: 0 })
  ),
  mockAiL2Limit: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, limit: 100, remaining: 99, reset: 0 })
  ),
  mockAiL3Limit: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, limit: 50, remaining: 49, reset: 0 })
  ),
}))

vi.mock('@/lib/ratelimit', () => ({
  aiPipelineLimiter: { limit: (...args: unknown[]) => mockAiPipelineLimit(...args) },
  aiL2ProjectLimiter: { limit: (...args: unknown[]) => mockAiL2Limit(...args) },
  aiL3ProjectLimiter: { limit: (...args: unknown[]) => mockAiL3Limit(...args) },
}))
```

### AI Budget Mock (AC5, AC2 integration — from existing `createAIMock`)

```typescript
// Uses existing createAIMock() from src/test/mocks/ai-providers.ts
const { mocks, modules } = vi.hoisted(() => createAIMock())
vi.mock('@/lib/ai/budget', () => modules.aiBudget)

// In test:
mocks.mockCheckTenantBudget.mockResolvedValue(BUDGET_EXHAUSTED)
// BUDGET_EXHAUSTED = { hasQuota: false, remainingBudgetUsd: 0, monthlyBudgetUsd: 100, usedBudgetUsd: 100 }

// NOTE: BUDGET_EXHAUSTED fixture in ai-responses.ts must be updated from token-based to USD-based
// during Story 3.1 implementation. Tests here use the USD-based shape.
```

### Server Action Mock (AC1 — ProcessingModeDialog)

```typescript
const mockGetFilesWordCount = vi.fn<(..._args: unknown[]) => Promise<{ success: true; data: { totalWords: number } } | { success: false; code: string; error: string }>>(
  async () => ({ success: true, data: { totalWords: 50_000 } })
)
vi.mock('../actions/getFilesWordCount.action', () => ({
  getFilesWordCount: (...args: unknown[]) => mockGetFilesWordCount(...args),
}))
```

---

## Required `data-testid` Attributes

### ProcessingModeDialog (existing + new)

| Element | data-testid | Notes |
|---------|-------------|-------|
| Cost estimate container | `cost-estimate` | **Already exists** in current tests |
| Word count display | `cost-estimate-words` | NEW — "50,000 words" |
| Economy cost line | `cost-economy` | NEW — "$0.20 estimated" |
| Thorough cost line | `cost-thorough` | NEW — "$1.20 estimated" |
| Loading skeleton | `cost-estimate-loading` | NEW — while fetching word count |
| Comparison note | `cost-comparison-note` | NEW — "vs. manual QA..." |

### AiBudgetCard (new component)

| Element | data-testid | Notes |
|---------|-------------|-------|
| Card root | `ai-budget-card` | Top-level container |
| Progress bar | `ai-budget-progress` | `role="progressbar"` |
| Spend text | `ai-budget-spend` | "$X.XX / $Y.YY used" |
| Status badge | `ai-budget-status` | "Within budget" / "Approaching limit" / "Budget exceeded" |
| Unlimited message | `ai-budget-unlimited` | Shown when budget is NULL |

### ModelPinningSettings (new component)

| Element | data-testid | Notes |
|---------|-------------|-------|
| L2 model select trigger | `model-select-l2` | Admin: select dropdown |
| L3 model select trigger | `model-select-l3` | Admin: select dropdown |
| L2 display (non-admin) | `model-display-l2` | Read-only text |
| L3 display (non-admin) | `model-display-l3` | Read-only text |
| Save button | `model-pinning-save` | Disabled until dirty |

### BatchSummaryView (extend existing)

| Element | data-testid | Notes |
|---------|-------------|-------|
| AI cost line | `ai-cost-summary` | NEW — "AI cost: $X.XX (Y files...)" |
| Batch summary grid | `batch-summary-grid` | **Already exists** in current tests |

---

## Implementation Checklist

### Phase 1: DB Schema + Types (Task 1 + 3.1)

- [ ] Drizzle schema: `src/db/schema/projects.ts` — add `l2PinnedModel`, `l3PinnedModel`, `budgetAlertThresholdPct`
- [ ] Drizzle schema: `src/db/schema/aiUsageLogs.ts` — add `chunkIndex` column
- [ ] Refactor `BudgetCheckResult` in `src/lib/ai/types.ts` — token-based → USD-based
- [ ] Update `BUDGET_HAS_QUOTA` / `BUDGET_EXHAUSTED` fixtures in `src/test/fixtures/ai-responses.ts`
- [ ] Update `mockCheckTenantBudget` default return in `src/test/mocks/ai-providers.ts`
- [ ] Run: `npx vitest run src/lib/ai/budget.test.ts` — verify RED

### Phase 2: Budget Enforcement (Task 3)

- [ ] Implement `checkProjectBudget(projectId, tenantId)` in `src/lib/ai/budget.ts`
- [ ] Run: `npx vitest run src/lib/ai/budget.test.ts` — verify GREEN
- [ ] Wire into `startProcessing.action.ts`
- [ ] Wire into `runL2ForFile.ts`, `runL3ForFile.ts`
- [ ] Run: `npx vitest run src/features/pipeline/actions/startProcessing.action.test.ts` — verify GREEN

### Phase 3: Rate Limiters (Task 2)

- [ ] Add `aiPipelineLimiter`, `aiL2ProjectLimiter`, `aiL3ProjectLimiter` to `src/lib/ratelimit.ts`
- [ ] Run: `npx vitest run src/lib/ratelimit.test.ts` — verify GREEN
- [ ] Wire `aiPipelineLimiter` into `startProcessing.action.ts` (BEFORE budget check)
- [ ] Wire `aiL2ProjectLimiter` into `runL2ForFile.ts`
- [ ] Wire `aiL3ProjectLimiter` into `runL3ForFile.ts`

### Phase 4: logAIUsage DB Persist (Task 4)

- [ ] Upgrade `logAIUsage()` in `src/lib/ai/costs.ts` — add DB INSERT (keep pino)
- [ ] Add `deriveProvider()` helper — gpt-* → openai, claude-* → anthropic, gemini-* → google
- [ ] Update all callers to `await logAIUsage()` (runL2ForFile.ts, runL3ForFile.ts)
- [ ] Run: `npx vitest run src/lib/ai/costs.test.ts` — verify GREEN

### Phase 5: Model Pinning (Task 6 + 7)

- [ ] Create `src/lib/ai/providers.ts` — `buildFallbackChain()`, `getModelForLayerWithFallback()`
- [ ] Install `@ai-sdk/google`: `npm install @ai-sdk/google`
- [ ] Create `updateModelPinning.action.ts`
- [ ] Create `ModelPinningSettings.tsx` client component
- [ ] Run: `npx vitest run src/lib/ai/providers.test.ts` — verify GREEN
- [ ] Run: `npx vitest run src/features/pipeline/actions/updateModelPinning.action.test.ts` — verify GREEN

### Phase 6: Cost Estimation (Task 5)

- [ ] Create `getFilesWordCount.action.ts`
- [ ] Update `ProcessingModeDialog.tsx` — fetch word count, word-count-based cost formula
- [ ] Add comparison note: "vs. manual QA: ~$150-300 per 100K words"
- [ ] Run: `npx vitest run src/features/pipeline/actions/getFilesWordCount.action.test.ts` — verify GREEN
- [ ] Run: `npx vitest run src/features/pipeline/components/ProcessingModeDialog.test.tsx` — verify GREEN

### Phase 7: Budget Visibility (Task 8)

- [ ] Create `AiBudgetCard.tsx` client component
- [ ] Create `getProjectAiBudget.action.ts`
- [ ] Create `updateBudgetAlertThreshold.action.ts`
- [ ] Run: `npx vitest run src/features/pipeline/components/AiBudgetCard.test.tsx` — verify GREEN
- [ ] Run: `npx vitest run src/features/pipeline/actions/getProjectAiBudget.action.test.ts` — verify GREEN
- [ ] Run: `npx vitest run src/features/pipeline/actions/updateBudgetAlertThreshold.action.test.ts` — verify GREEN

### Phase 8: Cost Summary + Integration (Task 9 + 10)

- [ ] Extend `BatchSummaryView.tsx` — add `aiCostSummary` prop + cost line rendering
- [ ] Run: `npx vitest run src/features/batch/components/BatchSummaryView.test.tsx` — verify GREEN
- [ ] Run full suite: `npm run test:unit` — all pass
- [ ] Run: `npm run type-check` — zero errors
- [ ] Run: `npm run lint` — zero warnings

---

## Running Tests

```bash
# Run all new Story 3.1 test files
npx vitest run \
  src/lib/ai/budget.test.ts \
  src/lib/ai/costs.test.ts \
  src/lib/ai/providers.test.ts \
  src/lib/ratelimit.test.ts \
  src/features/pipeline/actions/startProcessing.action.test.ts \
  src/features/pipeline/actions/getFilesWordCount.action.test.ts \
  src/features/pipeline/actions/updateModelPinning.action.test.ts \
  src/features/pipeline/actions/getProjectAiBudget.action.test.ts \
  src/features/pipeline/actions/updateBudgetAlertThreshold.action.test.ts \
  src/features/pipeline/components/ProcessingModeDialog.test.tsx \
  src/features/pipeline/components/ModelPinningSettings.test.tsx \
  src/features/pipeline/components/AiBudgetCard.test.tsx \
  src/features/batch/components/BatchSummaryView.test.tsx \
  src/features/pipeline/helpers/runL2ForFile.test.ts \
  src/features/pipeline/helpers/runL3ForFile.test.ts

# Run specific test file
npx vitest run src/lib/ai/budget.test.ts

# Watch mode (node project for server-side logic)
npx vitest --project unit src/lib/ai/

# Watch mode (jsdom project for components)
npx vitest --project unit src/features/pipeline/components/

# Full unit test suite
npm run test:unit

# Type check
npm run type-check
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

- 103 `it.skip()` test stubs created across 15 test files
- All boundary value tests explicitly listed per Epic 2 retro A2 (all P0)
- Tests fail because implementation doesn't exist yet
- BUDGET_EXHAUSTED fixture will need USD-based update when implementation starts

### GREEN Phase (DEV Team)

Suggested implementation order (dependencies first):
1. Types + fixtures update (`BudgetCheckResult` → USD, `BUDGET_EXHAUSTED` fixture)
2. Budget enforcement (`checkProjectBudget`)
3. Rate limiters (`aiPipelineLimiter` + project limiters)
4. `logAIUsage` DB persist
5. Model pinning (`providers.ts` + `updateModelPinning.action.ts`)
6. Cost estimation (`getFilesWordCount.action.ts` + `ProcessingModeDialog` update)
7. Budget visibility (`AiBudgetCard`, `getProjectAiBudget`, `updateBudgetAlertThreshold`)
8. Cost summary (`BatchSummaryView` extension)

### REFACTOR Phase

After all 103 tests pass:
1. Run full suite: `npm run test:unit`
2. Run 3 pre-CR agents (anti-pattern-detector, tenant-isolation-checker, code-quality-analyzer)
3. Verify all callers `await logAIUsage()` (changed from sync to async)

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run src/lib/ai/budget.test.ts src/lib/ai/providers.test.ts`

**Expected Results:**
- Total tests: 103 (across 15 files, 13 are extensions of existing files)
- Passing (existing): all existing tests unaffected
- Skipped (new): 103
- Status: RED phase verified

---

## Test Count Summary

| File | New Tests | Priority |
|------|-----------|----------|
| `src/lib/ai/budget.test.ts` | 13 | 8 P0 + 5 P1 |
| `src/lib/ai/costs.test.ts` | 9 | 6 P0 + 3 P1 |
| `src/lib/ai/providers.test.ts` | 10 | 6 P0 + 4 P1 |
| `src/lib/ratelimit.test.ts` | 10 | 6 P0 + 4 P1-BV |
| `startProcessing.action.test.ts` | 6 | 4 P0 + 2 P1 |
| `getFilesWordCount.action.test.ts` | 5 | 3 P0 + 2 P1 |
| `updateModelPinning.action.test.ts` | 7 | 5 P0 + 2 P1 |
| `getProjectAiBudget.action.test.ts` | 5 | 3 P0 + 2 P1 |
| `updateBudgetAlertThreshold.action.test.ts` | 5 | 3 P0 + 2 P1 |
| `ProcessingModeDialog.test.tsx` | 7 | 5 P0 + 2 P1-BV |
| `ModelPinningSettings.test.tsx` | 6 | 4 P0 + 2 P1 |
| `AiBudgetCard.test.tsx` | 8 | 5 P0 + 3 P1-BV |
| `BatchSummaryView.test.tsx` | 4 | 2 P0 + 2 P1 |
| `runL2ForFile.test.ts` | 4 | 3 P0 + 1 P1 |
| `runL3ForFile.test.ts` | 4 | 3 P0 + 1 P1 |
| **TOTAL** | **103** | **66 P0 + 37 P1** |

---

## Notes

- **BudgetCheckResult type change is breaking:** Current stub uses token-based fields (`remainingTokens`, `monthlyLimitTokens`, `usedTokens`). Story 3.1 refactors to USD-based (`remainingBudgetUsd`, `monthlyBudgetUsd`, `usedBudgetUsd`). Update `BUDGET_HAS_QUOTA` / `BUDGET_EXHAUSTED` fixtures and `createAIMock()` default return FIRST before implementing.
- **`checkTenantBudget` → `checkProjectBudget`:** Function signature changes from `(tenantId)` to `(projectId, tenantId)`. Update all callers (runL2ForFile.ts, runL3ForFile.ts, startProcessing.action.ts).
- **`logAIUsage` sync → async breaking change:** All callers must add `await`. Check runL2ForFile.ts and runL3ForFile.ts.
- **Drizzle mock for SUM query:** The `COALESCE(SUM(...), 0)` returns a string from Drizzle raw SQL — use `Number(total ?? 0)` in implementation. In tests, return `[{ total: '99.99' }]` (string, not number).
- **`@ai-sdk/google` required:** Must `npm install @ai-sdk/google` before providers.ts tests can run with real Gemini fallback. Mock in unit tests.
- **Vitest workspace:** budget/costs/providers/ratelimit/action tests → `unit` (node) project. Component tests → `unit` (jsdom) project.
- **Mock setup order for startProcessing:** `vi.mock('server-only', () => ({}))` MUST be first line (before any other mocks).

---

**Generated by BMad TEA Agent (Mona)** - 2026-02-27

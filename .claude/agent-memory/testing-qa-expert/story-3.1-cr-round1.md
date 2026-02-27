# Story 3.1 CR Round 1 — Test Quality Audit

**Date:** 2026-02-27
**Story:** 3.1 AI Cost Control, Throttling & Model Pinning
**Test Suite:** 15 files, 103 new tests (83 green + 14 skipped that are P0/P1)

---

## Overall Assessment

**Test Execution Status:**

- 42 lib/ratelimit+ai tests: ALL GREEN (no skips)
- 38 action tests green + 6 skipped (all 6 are Story 3.1 P0/P1 in startProcessing)
- 75 component+helper tests green + 8 skipped (all 8 are Story 3.1 P0/P1 in runL2/L3)

**Finding Summary:** 0C · 3H · 5M · 4L

---

## CRITICAL (0)

None.

---

## HIGH (3)

### H1: `runL2ForFile.test.ts` + `runL3ForFile.test.ts` — it.skip stubs use wrong mock variable (wrong mock targeted)

**File:** `src/features/pipeline/helpers/runL2ForFile.test.ts` lines 465–546
**File:** `src/features/pipeline/helpers/runL3ForFile.test.ts` lines 366–443

**Problem:** The skipped tests for "should throw NonRetriableError when checkProjectBudget returns hasQuota=false" set up `mockCheckTenantBudget` (the OLD stub), not `mockCheckProjectBudget` (the new USD-based function). The comment even says "NOTE: when implementing, update checkTenantBudget → checkProjectBudget call signature" — but the body of the `it.skip()` block still calls `mockCheckTenantBudget.mockResolvedValue(...)` and asserts on `mockCheckTenantBudget.mock.invocationCallOrder`.

When the dev removes `it.skip`, the test will exercise the WRONG mock variable. `mockCheckProjectBudget` is already in `beforeEach` (set to `BUDGET_HAS_QUOTA`), but the skip stubs override `mockCheckTenantBudget` — meaning the budget guard will still read the default `BUDGET_HAS_QUOTA` from `mockCheckProjectBudget`, and the test will NOT verify the exhausted-budget path correctly. The test appears correct but measures nothing relevant.

**Applies to both:** `runL2ForFile.test.ts` lines 465–512 and `runL3ForFile.test.ts` lines 366–411.

**Fix:** Replace `mockCheckTenantBudget.mockResolvedValue(...)` with `mockCheckProjectBudget.mockResolvedValue(BUDGET_EXHAUSTED)` in both skip stubs. Also fix the `invocationCallOrder` assertion on line 508/407 to use `mockCheckProjectBudget.mock.invocationCallOrder`.

---

### H2: `runL2ForFile.test.ts` + `runL3ForFile.test.ts` — "check aiL2/L3ProjectLimiter" skip stub is tautological placeholder

**File:** `src/features/pipeline/helpers/runL2ForFile.test.ts` lines 514–523
**File:** `src/features/pipeline/helpers/runL3ForFile.test.ts` lines 413–421

**Problem:** The "should check aiL2ProjectLimiter before processing each file" stub body is:

```typescript
expect(true).toBe(true) // placeholder — implement when wiring rate limit
```

This test will pass unconditionally whether or not the rate limiter is ever wired. It catches no regression. The ATDD checklist lists this as P0. Unlike the other skipped tests which have commented-out real assertions, this stub has NO assertion about rate limiter behavior whatsoever — the `expect(true).toBe(true)` is pure noise.

**Fix:** Replace with a real assertion. The rate limiter mock IS already set up at file level (`vi.mock('@/lib/ratelimit', ...)`). When the dev removes `it.skip`, the body should test that when the limiter's `.limit()` returns `{ success: false }`, `runL2ForFile` throws `NonRetriableError`. Pattern:

```typescript
it('should throw NonRetriableError when aiL2ProjectLimiter blocks project', async () => {
  const mockL2Limit = vi.mocked((await import('@/lib/ratelimit')).aiL2ProjectLimiter.limit)
  mockL2Limit.mockResolvedValueOnce({ success: false, limit: 100, remaining: 0, reset: 0 })
  dbState.returnValues = [[mockFile]]

  const { runL2ForFile } = await import('./runL2ForFile')
  await expect(
    runL2ForFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID, tenantId: VALID_TENANT_ID }),
  ).rejects.toThrow(/rate limit/)
})
```

---

### H3: `startProcessing.action.test.ts` — All 6 skip stubs have commented-out assertions that do nothing when unskipped

**File:** `src/features/pipeline/actions/startProcessing.action.test.ts` lines 475–604

**Problem:** Every skipped test body has its actual assertions commented out with `//` and has no uncommenting instructions. Example (lines 520–537):

```typescript
it.skip('should return BUDGET_EXCEEDED when checkProjectBudget returns hasQuota=false', async () => {
  // mockCheckProjectBudget.mockResolvedValue({ hasQuota: false, ... })
  // mockAiPipelineLimit.mockResolvedValue({ success: true, ... })

  const { startProcessing } = await import('./startProcessing.action')
  const result = await startProcessing({ ... })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('BUDGET_EXCEEDED')
  // ...
})
```

The critical point: the mock setup lines are commented out, which means `mockCheckProjectBudget` defaults to `hasQuota: true` from `beforeEach`. The test will NOT actually verify budget-exceeded behavior — `startProcessing` with `hasQuota: true` will succeed, not return `BUDGET_EXCEEDED`. The uncommented assertions `expect(result.code).toBe('BUDGET_EXCEEDED')` will FAIL when the dev removes `it.skip`, alerting the dev — BUT the mock setup comments must be un-commented too. The tests are structurally broken as-is.

This is less dangerous than H1 (the tests will fail loudly when unskipped) but it means the dev must understand to uncomment mock setup in addition to removing `it.skip`. No comment in the code explains this.

**Fix:** Add a prominent comment above each skip block:

```typescript
// IMPORTANT: When removing it.skip, also uncomment the mock setup lines inside.
// The mock setup lines are commented out to prevent import errors during RED phase.
```

Or better: pre-wire the mock setup outside the commented block using conditional logic.

---

## MEDIUM (5)

### M1: `budget.test.ts` — Missing boundary test for $0 budget (AC5 ATDD checklist gap)

**File:** `src/lib/ai/budget.test.ts`

**Problem:** The ATDD checklist Budget Boundary Values table (line 291) explicitly lists "$0 budget" as a required P0 case:

```
| $0 budget | used=$0.01, budget=$0.00 | `hasQuota=false` |
```

This test is NOT present in `budget.test.ts`. The 13 tests cover `$100` budget scenarios and NULL budget, but never verify that a project with `budget=$0.00` and `used=$0.01` blocks processing. The implementation at `budget.ts` line 85 uses `usedBudgetUsd < budget` — `0.01 < 0` is `false`, so `hasQuota=false` would be correct. But the test that validates this exact boundary is missing.

**Fix:** Add:

```typescript
it('should return hasQuota=false when budget is $0.00 and any usage exists', async () => {
  dbState.returnValues = [[{ aiBudgetMonthlyUsd: '0.00' }], [{ total: '0.01' }]]
  const { checkProjectBudget } = await import('./budget')
  const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

  expect(result.hasQuota).toBe(false)
  expect(result.remainingBudgetUsd).toBe(0)
})
```

---

### M2: `budget.test.ts` — "should only count current calendar month usage" asserts `gte` shape, not actual date value

**File:** `src/lib/ai/budget.test.ts` lines 164–180

**Problem:** The test asserts:

```typescript
expect(gte).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({ getDate: expect.any(Function) }), // Date object
)
```

This verifies that `gte` was called with SOME Date object, but does NOT verify it is the start of the CURRENT month. The implementation could pass `new Date('2020-01-01')` and this assertion would still pass. The test name says "not previous months" but the assertion only confirms a Date was passed, not that it is `{ day=1, hour=0, minute=0 }` of the current month.

The test on lines 244–256 (`should query ai_usage_logs filtered to current month start`) only checks `dbState.callIndex === 2`, which just confirms two DB calls were made — it says nothing about the date filter.

**Fix:** Strengthen the date assertion:

```typescript
const gteArgs = vi.mocked(gte).mock.calls.find(([_col, val]) => val instanceof Date)
expect(gteArgs).toBeDefined()
const dateArg = gteArgs![1] as Date
const now = new Date()
expect(dateArg.getFullYear()).toBe(now.getFullYear())
expect(dateArg.getMonth()).toBe(now.getMonth())
expect(dateArg.getDate()).toBe(1)
expect(dateArg.getHours()).toBe(0)
```

---

### M3: `ratelimit.test.ts` — BV tests for L3 limiter (50th/51st request) missing from test file

**File:** `src/lib/ratelimit.test.ts`

**Problem:** The ATDD checklist Rate Limit Boundary Values table (lines 299–307) lists:

```
| 50th L3 project request (pass) | counter=49 → 50th call | success=true |
| 51st L3 project request (block) | counter=50 → 51st call | success=false |
```

The test file has BV tests for aiPipelineLimiter (5th/6th) and aiL2ProjectLimiter (100th/101st) — but NO boundary tests for `aiL3ProjectLimiter` (50th/51st). The 4 BV tests in the file cover only 2 of 3 limiters.

**Fix:** Add two tests:

```typescript
it('should allow the 50th request (pass) per project for L3 limiter', async () => {
  mockAiL3Limit.mockResolvedValueOnce({
    success: true,
    limit: 50,
    remaining: 0,
    reset: Date.now() + 3600_000,
  })
  const { aiL3ProjectLimiter } = await import('./ratelimit')
  const result = await aiL3ProjectLimiter.limit('project-id-xyz')
  expect(result.success).toBe(true)
})

it('should block the 51st request per project for L3 limiter', async () => {
  mockAiL3Limit.mockResolvedValueOnce({
    success: false,
    limit: 50,
    remaining: 0,
    reset: Date.now() + 3600_000,
  })
  const { aiL3ProjectLimiter } = await import('./ratelimit')
  const result = await aiL3ProjectLimiter.limit('project-id-xyz')
  expect(result.success).toBe(false)
})
```

---

### M4: `AiBudgetCard.test.tsx` — Progress bar color assertion uses `className.toMatch(/green/)` which is fragile against Tailwind token names

**File:** `src/features/pipeline/components/AiBudgetCard.test.tsx` lines 36–37, 53–54, 68–70, 137–139, 154–156

**Problem:** Every color assertion uses regex against `className`:

```typescript
expect(progressBar.className).toMatch(/green/)
expect(progressBar.className).toMatch(/yellow|orange/)
expect(progressBar.className).toMatch(/red/)
```

This is implementation-detail testing. The component uses `tokens.css` Tailwind design tokens — the actual class names could be `text-green-500`, `bg-emerald-500`, `border-success`, or anything using the design token system. If the designer renames `green` to `success` in tokens, all these tests break without any behavioral change. Worse, the negative assertion `expect(progressBar.className).not.toMatch(/yellow|orange|red/)` will accidentally match any class that happens to contain "red" (e.g., `border-required`, `text-spread`).

**Better approach:** Use `data-testid="ai-budget-status"` with text content assertions (which are already tested separately in the P1 test), or use `aria-` attributes like `aria-valuenow`. The `aria-valuenow` assertion is already correct (e.g., `expect(progressBar.getAttribute('aria-valuenow')).toBe('50')`). Adding a `data-color` or `data-status` attribute would be more stable than class name regex.

**Fix (minimum):** Add `data-status="green"|"yellow"|"red"` to the component's progress bar, then assert:

```typescript
expect(progressBar.getAttribute('data-status')).toBe('green')
```

---

### M5: `ProcessingModeDialog.test.tsx` — "should update cost when mode changes" is a weak equivalence check

**File:** `src/features/pipeline/components/ProcessingModeDialog.test.tsx` lines 138–158

**Problem:** The test captures `economyCost` text and then asserts `updatedCost !== economyCost`. This only verifies the text changed — it does NOT verify the new value is the CORRECT Thorough cost. A bug where Economy cost is `$0.20` and switching to Thorough shows `$0.21` (wrong calculation) would pass this test. The test is a weak "it changed" assertion rather than a "it changed to the correct value" assertion.

This is distinct from the explicit formula tests which DO check `0.40` and `1.20` for 100K words — but those are separate tests. The "update cost" test should verify the actual new value.

**Fix:** Replace the inequality check with a specific assertion:

```typescript
await waitFor(() => {
  const costSection = screen.getByTestId('cost-estimate')
  // 50,000 words × $2.40/100K = $1.20
  expect(costSection.textContent).toContain('1.20')
})
```

---

## LOW (4)

### L1: `providers.test.ts` — "should use pinned model as primary when set for L3" is partially redundant with P0 test above it

**File:** `src/lib/ai/providers.test.ts` lines 59–73

**Problem:** The two tests "should use pinned model as primary when set for L2" and "should use pinned model as primary when set for L3" both test `buildFallbackChain` with a pinned value. The L3 test (line 67) pins `'claude-sonnet-4-5-20250929'` — which is the SYSTEM DEFAULT for L3. This is the same as passing the system default as the pinned model, which is already tested by "should not duplicate pinned model in fallbacks array" (line 84). The L3 test does not verify that an alternate model (e.g., `gpt-4o`) can be pinned as L3 primary — it only pins the default model.

**Fix:** Change the L3 pinned model test to use a non-default L3 model:

```typescript
const chain = buildFallbackChain('L3', 'gpt-4o') // non-default L3 pinned model
expect(chain.primary).toBe('gpt-4o')
expect(chain.fallbacks).toContain('claude-sonnet-4-5-20250929') // system default moves to fallback
```

---

### L2: `updateBudgetAlertThreshold.action.test.ts` — Single test covers both boundary values (0 and 101) with two calls, masking which call fails

**File:** `src/features/pipeline/actions/updateBudgetAlertThreshold.action.test.ts` lines 102–122

**Problem:** The test "should return INVALID_INPUT when threshold is outside 1-100 range" makes TWO calls inside one `it()`:

```typescript
const resultZero = await updateBudgetAlertThreshold({ ..., thresholdPct: 0 })
expect(resultZero.code).toBe('INVALID_INPUT')

const resultOver = await updateBudgetAlertThreshold({ ..., thresholdPct: 101 })
expect(resultOver.code).toBe('INVALID_INPUT')
```

If the first assertion fails, the test name only says "outside 1-100 range" — you cannot tell from the test name alone which boundary failed. Also, the boundary value for `thresholdPct: 100` (valid upper bound) and `thresholdPct: 1` (valid lower bound) are not tested, meaning the implementation could use `> 0` instead of `>= 1` or `< 101` instead of `<= 100` without failing any test.

**Fix:** Split into three separate tests: `0` (invalid lower), `1` (valid lower bound), `100` (valid upper bound), `101` (invalid upper). This matches the Epic 2 retro A2 BV mandate.

---

### L3: `costs.test.ts` — `estimatedCostUsd` field in INSERT not explicitly verified

**File:** `src/lib/ai/costs.test.ts` lines 63–87

**Problem:** The "should INSERT with all required fields" test verifies many fields via `toMatchObject` but does NOT include `estimatedCostUsd` (the actual cost amount in dollars) in the assertion. The DB schema column is `estimated_cost`. The `baseRecord` has `estimatedCostUsd: 0.000085` but this is not in the `toMatchObject` call. If `logAIUsage` drops the cost field or maps it to a wrong column, no test catches it.

**Fix:** Add to the `toMatchObject` assertion:

```typescript
expect(insertedValues).toMatchObject({
  // ... existing fields ...
  estimatedCost: 0.000085, // mapped from estimatedCostUsd input
})
```

---

### L4: `getProjectAiBudget.action.test.ts` — Missing test for project-not-found scenario

**File:** `src/features/pipeline/actions/getProjectAiBudget.action.test.ts`

**Problem:** `checkProjectBudget` (which `getProjectAiBudget` likely delegates to) throws `'Project not found'` when the projects SELECT returns an empty row. `getProjectAiBudget` should either propagate this as `NOT_FOUND` or `INTERNAL_ERROR`. There is no test for this scenario — if the project is deleted mid-request, the action behavior is untested.

**Fix:** Add:

```typescript
it('should return NOT_FOUND when project does not exist', async () => {
  dbState.returnValues = [[]] // empty projects SELECT
  const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
  const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toMatch(/NOT_FOUND|INTERNAL_ERROR/)
})
```

---

## ATDD Compliance Summary

| File                                      | ATDD P0 count | Skipped P0 | Status                                    |
| ----------------------------------------- | ------------- | ---------- | ----------------------------------------- |
| budget.test.ts                            | 8             | 0          | PASS (M1 gap: $0 budget missing)          |
| costs.test.ts                             | 6             | 0          | PASS                                      |
| providers.test.ts                         | 6             | 0          | PASS                                      |
| ratelimit.test.ts                         | 6             | 0          | PASS (M3 gap: L3 BV missing)              |
| startProcessing.action.test.ts            | 4 new P0      | 4          | FAIL — H3 (broken mock setup)             |
| getFilesWordCount.action.test.ts          | 3             | 0          | PASS                                      |
| updateModelPinning.action.test.ts         | 5             | 0          | PASS                                      |
| getProjectAiBudget.action.test.ts         | 3             | 0          | PASS                                      |
| updateBudgetAlertThreshold.action.test.ts | 3             | 0          | PASS                                      |
| ProcessingModeDialog.test.tsx             | 5 new P0      | 0          | PASS                                      |
| ModelPinningSettings.test.tsx             | 4             | 0          | PASS                                      |
| AiBudgetCard.test.tsx                     | 5             | 0          | PASS                                      |
| BatchSummaryView.test.tsx                 | 2 new P0      | 0          | PASS                                      |
| runL2ForFile.test.ts                      | 3 new P0      | 3          | FAIL — H1, H2 (wrong mock + tautological) |
| runL3ForFile.test.ts                      | 3 new P0      | 3          | FAIL — H1, H2 (wrong mock + tautological) |

**P0 tests with `it.skip`: 10 (all in runL2/L3/startProcessing)**
**P0 tests with structural bugs when unskipped: 10 (H1+H2 affect all 10)**

---

## Positive Notes

- All 42 lib tests pass — budget, costs, providers, ratelimit implementations are correctly tested
- All 5 action tests pass — getFilesWordCount, updateModelPinning, getProjectAiBudget, updateBudgetAlertThreshold all have correct mock patterns
- `createDrizzleMock()` used correctly in all server action tests with proper `vi.hoisted()` pattern
- `vi.fn((..._args: unknown[]) => ...)` pattern used correctly throughout
- `vi.mock('server-only', () => ({}))` first line correctly applied in all server-side test files
- Boundary value tests for budget ($0.01 under, at, $0.01 over, NULL, zero usage) are thorough
- `AiBudgetCard` P1-BV tests (79% vs 80% flip) are correct in concept
- `BatchSummaryView` cost line tests are clean and well-structured
- `ModelPinningSettings` tests handle Radix Select correctly (`.click()` trigger then `.click()` option)

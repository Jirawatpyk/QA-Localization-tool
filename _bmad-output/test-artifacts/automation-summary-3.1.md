---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-identify-targets']
lastStep: 'step-02-identify-targets'
lastSaved: '2026-03-07'
storyId: '3.1'
storyTitle: 'AI Cost Control, Throttling & Model Pinning'
---

# TA Automation Summary — Story 3.1

## Elicitation Methods Applied

1. **Failure Mode Analysis (FMA)** — 10 gaps found (1 P0, 5 P1, 4 P2)
2. **Boundary Value Partitioning (BVP)** — 10 gaps found (0 P0, 3 P1, 7 P2)

## Consolidated Gap List (20 gaps)

### P0 — Critical

| Gap | Module | Description |
|-----|--------|-------------|
| A | `errors.ts` | `classifyAIError` + `handleAIError` — ZERO tests for core error classification and handling |

### P1 — Important

| Gap | Module | Description |
|-----|--------|-------------|
| B | `client.ts` | `getModelById` + `getModelForLayer` — ZERO tests |
| C | `models.ts` | Model allowlist constants — ZERO tests |
| D | `budget.ts` | `checkTenantBudget` stub — ZERO tests |
| G | `providers.ts` | `resolveHealthyModel` fallback order assertion weak |
| I | `budget.ts` | DB error propagation in `checkProjectBudget` untested |
| K | `budget.ts` | Zero budget ($0) blocks ALL processing — untested |
| P | `ratelimit.ts` | L3 limiter 50th/51st boundary — untested |
| R | `fallbackRunner.ts` | 3-model chain (primary+2 fallbacks) — untested |

### P2 — Edge Cases

| Gap | Module | Description |
|-----|--------|-------------|
| E | `costs.ts` | Gemini model cost estimation missing |
| F | `types.ts` | Empty string / edge case model IDs |
| H | `costs.ts` | `aggregateUsage` floating-point precision boundary |
| J | `ProcessingModeDialog` | Rate limit / budget exceeded error display |
| L | `budget.ts` | Micro budget ($0.01) |
| N | `costs.ts` | Single token minimum cost |
| Q | `providers.ts` | Pin fallback model as primary |
| S | `fallbackRunner.ts` | Cascade through 3 models |
| T | `AiBudgetCard` | 0% usage display |
| W | threshold action | Negative threshold (-1) |
| X | `types.ts` | Empty string `deriveProviderFromModelId('')` |

## Coverage Plan

### New Test Files (3)

1. `src/lib/ai/errors.test.ts` — P0: classifyAIError + handleAIError (~10 tests)
2. `src/lib/ai/client.test.ts` — P1: getModelById + getModelForLayer (~4 tests)
3. `src/lib/ai/models.test.ts` — P1: constant validation (~3 tests)

### Extended Test Files (8)

- `budget.test.ts` — +4 tests (D, I, K, L)
- `ratelimit.test.ts` — +2 tests (P)
- `fallbackRunner.test.ts` — +2 tests (R, S)
- `providers.test.ts` — +2 tests (G, Q)
- `costs.test.ts` — +3 tests (E, H, N)
- `types.test.ts` — +2 tests (F, X)
- `ProcessingModeDialog.test.tsx` — +2 tests (J)
- `AiBudgetCard.test.tsx` — +1 test (T)
- `updateBudgetAlertThreshold.action.test.ts` — +1 test (W)

### Total: ~38 new tests across 12 files (3 new + 9 extended)

## Priority Distribution

| Priority | Tests | New Files |
|----------|-------|-----------|
| P0 | ~10 | 1 |
| P1 | ~14 | 2 |
| P2 | ~14 | 0 |
| Total | ~38 | 3 |

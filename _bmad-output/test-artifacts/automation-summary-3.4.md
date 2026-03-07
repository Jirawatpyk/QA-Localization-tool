---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-identify-targets', 'step-03-generate-tests', 'step-04-validate']
lastStep: 'step-04-validate'
lastSaved: '2026-03-08'
storyId: '3.4'
storyTitle: 'AI Resilience — Fallback, Retry & Partial Results'
---

# TA Automation Summary — Story 3.4

## Elicitation Methods Applied

1. **Failure Mode Analysis (FMA)** — 16 gaps found (0 P0, 9 P1, 7 P2)
2. **Boundary Value Analysis (BVA)** — 5 gaps found (0 P0, 1 P1, 4 P2)

## Bug Found

**Gap Q (P1 BUG):** `retryFailedLayers.ts:89` — `lastCompletedLayer` initialized to `'L1'` regardless of which layers are being retried. When `layersToRetry=['L3']` (L2 already done) and L3 fails, the catch block scores with `layerCompleted='L1'` instead of `'L1L2'`. **Fixed:** `let lastCompletedLayer = retryL2 ? 'L1' : 'L1L2'`

## Consolidated Gap List (21 gaps)

### P1 — Important (10)

| Gap | Component | Description |
|-----|-----------|-------------|
| Q | retryFailedLayers | BUG: lastCompletedLayer init wrong when retrying L3 only + fails → scores L1 not L1L2 |
| F5 | retryAiAnalysis | score row not found → "Score record not found" |
| F6 | retryAiAnalysis | project row not found → "Project not found" |
| F7 | retryAiAnalysis | cross-project guard (file.projectId !== projectId) |
| F8 | retryAiAnalysis | invalid layerCompleted value (not in VALID_LAYERS) |
| F11 | retryAiAnalysis | audit log failure non-fatal (still returns success) |
| F14 | retryFailedLayers | onFailure: file status NOT in L1_COMPLETED_STATUSES → no ai_partial |
| F16 | retryFailedLayers | onFailure: file not found → logger.warn + return |
| F21 | ReviewPageClient | retry failure (action returns success=false) → button stays visible |
| B4 | retryFailedLayers | layersToRetry=[] boundary → skip L2+L3, return aiPartial=false |

### P2 — Edge Cases (11)

| Gap | Component | Description |
|-----|-----------|-------------|
| F3 | callWithFallback | mixed error: primary=rate_limit, fallback=auth → NonRetriableError |
| F4 | callWithFallback | attemptsLog populated with model+error+kind |
| F9 | retryAiAnalysis | invalid processingMode value |
| F10 | retryAiAnalysis | Zod validation failure (invalid UUID) |
| F13 | retryAiAnalysis | no Inngest event when layersToRetry empty |
| F15 | retryFailedLayers | onFailure DB error caught silently |
| F19 | ScoreBadge | partial + score=null |
| B2 | callWithFallback | attemptsLog.length = chain size on exhaust |
| B5 | ScoreBadge | score=0 + partial → "Partial" + "0.0" |
| B7 | ReviewPageClient | null layerCompleted + partial → shows Partial |
| B8 | retryAiAnalysis | L1L2L3+thorough → no Inngest event (merged with F13) |

## Coverage Plan

### Extended Test Files (5)

- `retryAiAnalysis.action.test.ts` — +8 tests (F5, F6, F7, F8, F9, F10, F11, F13+B8)
- `retryFailedLayers.test.ts` — +5 tests (Q, F14, F15, F16, B4)
- `fallbackRunner.test.ts` — +3 tests (F3, F4, B2)
- `ReviewPageClient.story34.test.tsx` — +2 tests (F21, B7)
- `ScoreBadge.story34.test.tsx` — +2 tests (F19, B5)

### Total: 20 new tests across 5 existing files (0 new files)

## Priority Distribution

| Priority | Tests | New Files |
|----------|-------|-----------|
| P0 | 0 | 0 |
| P1 | 10 | 0 |
| P2 | 10 | 0 |
| Total | 20 | 0 |

## Validation Results

- **Test run:** `npx vitest run` on all 13 Story 3.4 files
- **Result:** 143/143 passed (0 failures) across 13 files
- **Before TA:** 123 tests across 11 files
- **After TA:** 143 tests across 11 files (+20 new in 5 extended files)
- **Gaps resolved:** 21/21 (FMA 16 + BVA 5)
- **Production bug fixed:** 1 (Gap Q — retryFailedLayers lastCompletedLayer)

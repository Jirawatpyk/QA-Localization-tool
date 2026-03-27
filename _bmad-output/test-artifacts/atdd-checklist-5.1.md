---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
lastStep: step-04c-aggregate
lastSaved: '2026-03-27'
storyId: '5.1'
storyName: 'Language Bridge — Back-translation & Contextual Explanation'
detectedStack: fullstack
generationMode: ai-generation
executionMode: sequential
inputDocuments:
  - _bmad-output/implementation-artifacts/5-1-language-bridge-back-translation.md
  - docs/test-data/back-translation/th-reference.json
  - src/test/action-test-mocks.ts
  - src/__tests__/ai-integration/setup.ts
  - e2e/review-detail-panel.spec.ts
  - e2e/helpers/review-page.ts
---

# ATDD Checklist: Story 5.1 — Language Bridge Back-Translation

## TDD Red Phase (Current)

All tests generated with `it.skip()` / `test.skip()` — will fail until feature is implemented.

## Test Files Generated

### Unit Tests (Vitest)

| # | File | Scenarios | P0 | P1 | P2 |
|---|------|-----------|----|----|-----|
| 1 | `src/features/bridge/helpers/buildBTPrompt.test.ts` | 11 | 2 | 4 | 2 |
| 2 | `src/features/bridge/helpers/btCache.test.ts` | 12 | 3 | 5 | 0 |
| 3 | `src/features/bridge/helpers/thaiAnalysis.test.ts` | 9 | 0 | 6 | 0 |
| 4 | `src/features/bridge/actions/getBackTranslation.action.test.ts` | 16 | 5 | 6 | 2 |
| 5 | `src/features/bridge/components/LanguageBridgePanel.test.tsx` | 15 | 0 | 7 | 5 |
| 6 | `src/features/bridge/hooks/useBackTranslation.test.ts` | 6 | 0 | 4 | 1 |

### Integration Tests (Vitest)

| # | File | Scenarios | P0 | P1 | P2 |
|---|------|-----------|----|----|-----|
| 7 | `src/__tests__/ai-integration/bt-pipeline.integration.test.ts` | 3 | 2 | 1 | 0 |

### E2E Tests (Playwright)

| # | File | Tests | P0 | P1 | P2 |
|---|------|-------|----|----|-----|
| 8 | `e2e/review-detail-panel.spec.ts` | 7 existing (E1-E7, unskip in impl) + 5 new BT tests | 2 | 6 | 4 |

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Total test scenarios** | 72+ |
| **Total test files** | 8 (7 new + 1 extended) |
| **All tests skipped** | Yes (TDD red phase) |
| **P0 scenarios** | 12 |
| **P1 scenarios** | 34 |
| **P2 scenarios** | 14 |
| **Execution mode** | Sequential |

## Acceptance Criteria Coverage

### AC1: LanguageBridge Panel Display
- [x] Panel shows BT, explanation, confidence → `LanguageBridgePanel.test.tsx` (4.1)
- [x] Panel updates on focus change → `useBackTranslation.test.ts` (1.2)
- [x] Panel hidden when no segmentId → `LanguageBridgePanel.test.tsx` (1.3)
- [x] E2E: panel visible in detail → `review-detail-panel.spec.ts` (BT1)
- [x] E2E: updates on focus change → `review-detail-panel.spec.ts` (BT3)

### AC2: AI Provider Integration & Caching
- [x] qaProvider 'back-translation' alias → `getBackTranslation.action.test.ts` (2.1)
- [x] generateText + Output.object → `getBackTranslation.action.test.ts` (2.2)
- [x] Cache hit/miss → `btCache.test.ts` (2.3, 2.4)
- [x] targetTextHash SHA-256 → `btCache.test.ts` (2.5)
- [x] TTL 24h boundary → `btCache.test.ts` (2.6)
- [x] onConflictDoUpdate → `btCache.test.ts` (2.7)
- [x] withTenant on every query → `btCache.test.ts` (2.8)
- [x] Skeleton 150ms → `LanguageBridgePanel.test.tsx` (2.9)
- [x] 300ms debounce → `useBackTranslation.test.ts` (2.10)
- [x] AbortController → `useBackTranslation.test.ts` (2.11)
- [x] Stale guard → `useBackTranslation.test.ts` (2.12)
- [x] skipCache → `getBackTranslation.action.test.ts` (2.13)
- [x] Real AI integration → `bt-pipeline.integration.test.ts` (2.14)
- [x] E2E: skeleton shown → `review-detail-panel.spec.ts` (BT2)
- [x] E2E: cached badge → `review-detail-panel.spec.ts` (BT4)

### AC3: Thai Language Quality
- [x] Thai-specific prompt → `buildBTPrompt.test.ts` (3.1)
- [x] CJK instructions → `buildBTPrompt.test.ts` (3.2)
- [x] System role principle → `buildBTPrompt.test.ts` (3.3)
- [x] Tone marker counting → `thaiAnalysis.test.ts` (3.4)
- [x] Compound word recognition → `thaiAnalysis.test.ts` (3.5)
- [x] Thai particles → `buildBTPrompt.test.ts` (3.6)
- [x] Thai accuracy >= 95% corpus → `bt-pipeline.integration.test.ts` (3.7)

### AC4: Visual States
- [x] Standard state → `LanguageBridgePanel.test.tsx` (4.1)
- [x] Hidden (native pair) → `LanguageBridgePanel.test.tsx` (4.2)
- [x] Confidence Warning → `LanguageBridgePanel.test.tsx` (4.3)
- [x] Loading skeleton → `LanguageBridgePanel.test.tsx` (4.4)
- [x] Error + retry → `LanguageBridgePanel.test.tsx` (4.5)
- [x] Cached badge → `LanguageBridgePanel.test.tsx` (4.6)
- [x] Refresh button → `LanguageBridgePanel.test.tsx` (4.7)
- [x] aria-live="polite" → `LanguageBridgePanel.test.tsx` (4.8)
- [x] mark diff annotations → `LanguageBridgePanel.test.tsx` (4.9)

### AC5: Responsive Layout
- [x] lang attribute sourceLang → `LanguageBridgePanel.test.tsx` (5.3)
- [x] lang="en" on explanation → `LanguageBridgePanel.test.tsx` (5.3)
- [ ] E2E responsive (TD-UX-003) → deferred to review-responsive.spec.ts extension

### AC6: Cost & Budget Integration
- [x] Budget check before AI call → `getBackTranslation.action.test.ts` (6.1)
- [x] logAIUsage layer 'BT' → `getBackTranslation.action.test.ts` (6.2)
- [x] Low-confidence fallback budget-gated → `getBackTranslation.action.test.ts` (6.3)
- [x] Dual logging → `getBackTranslation.action.test.ts` (6.4)

## Boundary Value Tests

| AC | Threshold | At | Below | Above |
|----|-----------|-----|-------|-------|
| AC2 TTL | 24h | btCache.test (24h00m=miss) | btCache.test (23h59m=hit) | btCache.test (24h01m=miss) |
| AC3 Accuracy | >= 95% | bt-pipeline.integration | N/A (integration) | N/A |
| AC3 Tone | >= 98% | thaiAnalysis.test (98%=pass) | thaiAnalysis.test (97%=fail) | N/A |
| AC3 Compound | >= 90% | thaiAnalysis.test (90%=pass) | thaiAnalysis.test (89%=fail) | N/A |
| AC4 Confidence | < 0.6 | action.test (0.60=no fallback) | action.test (0.59=fallback) | action.test (0.61=standard) |
| AC6 Budget | 0 tokens | action.test (0=error) | N/A | action.test (1=allow) |

## Guardrail Coverage

| # | Rule | Test File |
|---|------|-----------|
| 1 | withTenant() | btCache.test.ts |
| 16 | generateText + Output.object | getBackTranslation.action.test.ts |
| 17 | .nullable() only | btSchema validation (prompt test) |
| 19 | logAIUsage | getBackTranslation.action.test.ts |
| 25 | Color not sole carrier | LanguageBridgePanel.test.tsx |
| 33 | aria-live="polite" | LanguageBridgePanel.test.tsx |
| 37 | prefers-reduced-motion | LanguageBridgePanel.test.tsx |
| 47 | Fail loud | bt-pipeline.integration.test.ts |
| 51 | Distinct BT alias | getBackTranslation.action.test.ts |
| 52 | Cost layer 'BT' | getBackTranslation.action.test.ts |
| 53 | 300ms debounce | useBackTranslation.test.ts |
| 55 | "Translate what IS written" | buildBTPrompt.test.ts |
| 56 | Budget-gated fallback | getBackTranslation.action.test.ts |
| 57 | targetTextHash | btCache.test.ts |
| 58 | withTenant cache | btCache.test.ts |
| 59 | onConflictDoUpdate | btCache.test.ts |
| 60 | Glossary invalidation | btCache.test.ts |
| 61 | TTL filter + cron | btCache.test.ts |
| 68 | Thai 3 aspects | buildBTPrompt.test.ts |
| 69 | CJK instructions | buildBTPrompt.test.ts |
| 70 | lang attribute | LanguageBridgePanel.test.tsx |
| 75 | Abort on change | useBackTranslation.test.ts |
| 77 | Cached indicator | LanguageBridgePanel.test.tsx |

## Next Steps (TDD Green Phase)

After implementing the feature:

1. Remove `it.skip()` / `test.skip()` from all unit test files
2. Run unit tests: `npx vitest run src/features/bridge/`
3. Remove `test.skip()` from E2E tests (E1-E7 unskip + BT1-BT5)
4. Run E2E: `npx playwright test e2e/review-detail-panel.spec.ts`
5. Run integration: `npx dotenv-cli -e .env.local -- npx vitest run src/__tests__/ai-integration/bt-pipeline`
6. Verify ALL tests PASS (green phase)
7. If any test fails: fix implementation (feature bug) or fix test (test bug)
8. Commit passing tests

## Implementation Guidance

### Files to Create (Feature)
- `src/features/bridge/types.ts` — BackTranslationResult, LanguageNote, BridgePanelState
- `src/features/bridge/validation/btSchema.ts` — Zod schema (.nullable() only)
- `src/features/bridge/helpers/buildBTPrompt.ts` — prompt builder
- `src/features/bridge/helpers/btCache.ts` — cache CRUD
- `src/features/bridge/helpers/thaiAnalysis.ts` — Thai quality analysis
- `src/features/bridge/actions/getBackTranslation.action.ts` — server action
- `src/features/bridge/hooks/useBackTranslation.ts` — client hook
- `src/features/bridge/components/LanguageBridgePanel.tsx` — main panel
- `src/features/bridge/components/BackTranslationSection.tsx`
- `src/features/bridge/components/ContextualExplanation.tsx`
- `src/features/bridge/components/ConfidenceIndicator.tsx`
- `src/features/bridge/components/LanguageBridgeSkeleton.tsx`
- `src/features/bridge/inngest/cleanBTCache.ts` — daily cron

### Files to Modify (Infrastructure)
- `src/lib/ai/types.ts` — extend AILayer to include 'BT'
- `src/lib/ai/client.ts` — add 'back-translation' alias
- `src/db/schema/backTranslationCache.ts` — new table + RLS
- `src/db/schema/projects.ts` — add btConfidenceThreshold
- `src/db/schema/index.ts` — export new schema
- `src/db/schema/relations.ts` — add relations
- `src/features/review/components/FindingDetailContent.tsx` — integrate panel
- `src/app/api/inngest/route.ts` — register cron

### UI Integration Point
- LanguageBridgePanel goes INSIDE FindingDetailContent (not new layout zone)
- After segment context section, before action buttons

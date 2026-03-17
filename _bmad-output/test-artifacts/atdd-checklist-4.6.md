---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests']
lastStep: 'step-04-generate-tests'
lastSaved: '2026-03-17'
storyId: '4.6'
storyKey: '4-6-suppress-false-positive-patterns'
storyFile: '_bmad-output/implementation-artifacts/4-6-suppress-false-positive-patterns.md'
detectedStack: 'fullstack'
generationMode: 'ai-generation'
tddPhase: 'RED'
inputDocuments:
  - '_bmad-output/implementation-artifacts/4-6-suppress-false-positive-patterns.md'
  - '_bmad/tea/testarch/knowledge/data-factories.md'
  - '_bmad/tea/testarch/knowledge/test-quality.md'
  - '_bmad/tea/testarch/knowledge/test-healing-patterns.md'
  - '_bmad/tea/testarch/knowledge/selector-resilience.md'
  - '_bmad/tea/testarch/knowledge/test-levels-framework.md'
  - '_bmad/tea/testarch/knowledge/test-priorities-matrix.md'
  - 'e2e/review-search-filter.spec.ts'
  - 'e2e/helpers/supabase-admin.ts'
  - 'e2e/helpers/review-page.ts'
  - 'e2e/helpers/pipeline-admin.ts'
---

# ATDD Checklist — Story 4.6: Suppress False Positive Patterns

## Step 1: Preflight & Context

### Stack Detection
- **Detected stack:** fullstack (Next.js 16 + Playwright + Vitest)
- **Test frameworks:** Vitest (unit/jsdom), Playwright (E2E)
- **E2E patterns:** 34 existing specs, 4 helpers in `e2e/helpers/`

### Story Context
- **Story:** 4.6 — Suppress False Positive Patterns
- **ACs:** 7 (AC1-AC7)
- **Key features:** Pattern detection algorithm, suppress dialog, batch auto-reject, admin management, session-only expiry, accessibility
- **Dependencies:** Story 4.2 (reject action), Story 4.3 (state), Story 4.5 (filter/search)

### Components Under Test
1. **Pattern detection** — `src/features/review/utils/pattern-detection.ts` (NEW)
2. **Suppress dialog** — `src/features/review/components/SuppressPatternDialog.tsx` (NEW)
3. **Server actions** — `createSuppressionRule`, `getSuppressionRules`, `deactivateSuppressionRule`, `getActiveSuppressions` (NEW)
4. **Zustand store** — `review.store.ts` (MODIFY — 3 new FileState fields)
5. **Admin page** — `src/app/(app)/admin/suppression-rules/page.tsx` (NEW)
6. **Session cleanup** — `src/app/api/deactivate-session-rules/route.ts` (NEW)
7. **Toast integration** — `use-review-actions.ts` (MODIFY)

## Step 2: Generation Mode

**Mode:** AI Generation
**Rationale:** Clear BDD acceptance criteria, standard scenarios (reject flow, dialog, batch DB, admin CRUD)

## Step 3: Test Strategy

### AC-to-Test Mapping

| AC | Test Scenario | Level | Priority |
|----|--------------|-------|----------|
| AC1 | Pattern detection triggers at 3 rejections | Unit | P0 |
| AC1 | Pattern detection does NOT trigger at 2 rejections | Unit | P0 |
| AC1 | Pattern detection does NOT trigger with <3 word overlap | Unit | P0 |
| AC1 | Short description guard (<4 keywords excluded) | Unit | P1 |
| AC1 | Different categories = separate groups | Unit | P1 |
| AC1 | Different language pairs = separate groups | Unit | P1 |
| AC1 | Case-insensitive keyword matching | Unit | P1 |
| AC1 | Thai keyword extraction via Intl.Segmenter | Unit | P1 |
| AC1 | Toast after 3rd rejection (integration) | E2E | P0 |
| AC2 | Dialog defaults (scope=language_pair, duration=until_improved) | Component | P1 |
| AC2 | Dialog shows language pair | Component | P1 |
| AC3 | createSuppressionRule + batch auto-reject | Unit | P0 |
| AC3 | feedback_events with metadata.suppressed=true | Unit | P0 |
| AC3 | Single Inngest event after batch | Unit | P1 |
| AC3 | Auto-reject capped at 100 | Unit | P1 |
| AC3 | Suppress dialog → auto-reject → toast | E2E | P0 |
| AC4 | "Keep checking" resets counter | Unit | P0 |
| AC4 | New cluster forms after reset | Unit | P1 |
| AC4 | Keep checking flow | E2E | P0 |
| AC5 | Admin page lists rules | E2E | P1 |
| AC5 | Admin deactivates rule | E2E | P1 |
| AC6 | 24h stale session cleanup | Unit | P1 |
| AC7 | Dialog focus trap + Escape | Component | P1 |
| AC7 | aria-live="polite" | Component | P2 |
| AC7 | Admin table role="grid" | Component | P2 |
| AC7 | Keyboard-only flow | E2E | P2 |

### Boundary Value Tests

| Boundary | Values | Priority |
|----------|--------|----------|
| Rejection threshold | 2=no, 3=yes | P0 |
| Word overlap | 2=no, 3=yes | P0 |
| Keyword count guard | 3=excluded, 4=included | P1 |
| Auto-reject cap | 100 ok, 120→100 capped | P1 |

## Step 4: Generated Test Files (TDD RED Phase)

### Summary

| File | Tests | P0 | P1 | P2 |
|------|-------|----|----|-----|
| `src/features/review/utils/pattern-detection.test.ts` | 17 | 8 | 9 | 0 |
| `src/features/review/actions/createSuppressionRule.action.test.ts` | 5 | 2 | 3 | 0 |
| `src/features/review/components/SuppressPatternDialog.test.tsx` | 5 | 0 | 4 | 1 |
| `src/features/review/components/SuppressionRulesList.test.tsx` | 4 | 0 | 3 | 1 |
| `e2e/review-suppress-patterns.spec.ts` | 6 | 3 | 2 | 1 |
| **TOTAL** | **37** | **13** | **21** | **3** |

### Test Files on Disk

- [x] `src/features/review/utils/pattern-detection.test.ts` — Pattern detection algorithm (extractKeywords, computeWordOverlap, trackRejection, resetPatternCounter)
- [x] `src/features/review/actions/createSuppressionRule.action.test.ts` — Server action: rule creation + batch auto-reject
- [x] `src/features/review/components/SuppressPatternDialog.test.tsx` — Dialog defaults, language pair, confirm/cancel, Escape, ARIA
- [x] `src/features/review/components/SuppressionRulesList.test.tsx` — Data table, deactivate, empty state, grid role
- [x] `e2e/review-suppress-patterns.spec.ts` — Full E2E: reject→toast→suppress→auto-reject, keep checking, admin page

### DoD Gate
- ALL P0 tests (13) MUST pass before story completion
- ALL P1 tests (21) MUST pass before story completion
- P2 tests (3) = nice-to-have (tech debt if skipped)
- All tests currently use `it.skip()` / `test.skip()` — will be unskipped during implementation

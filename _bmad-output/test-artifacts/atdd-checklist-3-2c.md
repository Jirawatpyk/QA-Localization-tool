---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-03'
---

# ATDD Checklist - Epic 3, Story 3.2c: L2 Results Display & Score Update

**Date:** 2026-03-03
**Author:** Mona
**Primary Test Level:** Unit (Vitest) + E2E (Playwright)

---

## Story Summary

Story 3.2c delivers the real-time display layer for L2 AI screening results. When the pipeline completes L2 processing, QA reviewers see findings appear live in a review page with updated MQM scores, confidence indicators, and layer completion progress.

**As a** QA Reviewer
**I want** to see L2 AI findings appear in real-time with updated scores as screening completes
**So that** I can begin reviewing AI findings immediately and track score progression per layer

---

## Acceptance Criteria

1. **AC1** — Score badge transitions from `'rule-only'` (blue) to `'ai-screened'` (purple) when `scores.layer_completed` changes from `'L1'` to `'L1L2'` via Supabase Realtime
2. **AC2** — L2 findings display color-coded confidence: High (>=85, green), Medium (70-84, orange), Low (<70, red). Below `l2ConfidenceMin` threshold shows warning icon
3. **AC3** — Finding TypeScript type aligned with ALL DB schema columns (remove phantom `source`, add 11 DB fields)
4. **AC4** — Review page at `/projects/[projectId]/review/[fileId]` with ScoreBadge, ReviewProgress, finding list sorted by severity then confidence
5. **AC5** — Server Action `getFileReviewData` loads ALL findings + score + processingMode + l2ConfidenceMin with `withTenant()`
6. **AC6** — `useScoreSubscription` extended to pass `layerCompleted` to store. BUG FIX: event type UPDATE→INSERT (scoreFile does DELETE+INSERT)
7. **AC7** — New `useFindingsSubscription(fileId)` hook with INSERT+DELETE handling, burst batching, polling fallback
8. **AC8** — ReviewProgress component showing L1/L2/L3 completion status with Economy mode N/A badge
9. **AC9** — FindingListItem with severity badge, category, LayerBadge, description, ConfidenceBadge, expandable details
10. **AC10** — E2E test: upload → parse → pipeline → review page → verify findings + score + ScoreBadge + ReviewProgress
11. **AC11** — Boundary value tests for confidence (85, 84.9, 70, 69.9), score (70, 69.9, 95), l2ConfidenceMin, zero findings

---

## Preflight Context

### Prerequisites Verified

- [x] Story approved with clear acceptance criteria (11 ACs, status: `ready-for-dev`)
- [x] Test framework configured (`playwright.config.ts`: testDir `./e2e`, Chromium, baseURL `localhost:3000`)
- [x] Development environment available (Vitest workspace: unit/jsdom + rls/node; Playwright E2E)

### Existing Test Infrastructure

| Category | Details |
|----------|---------|
| E2E Helpers | `fileUpload.ts` (26 fn), `supabase-admin.ts` (6 fn), `pipeline-admin.ts` (10 fn) |
| Polling | `pollScoreLayer(fileId, 'L1L2', 30s)`, `pollFileStatus(fileId, status, 180s)` |
| Review Module | `review.store.ts` (3 slices), `use-score-subscription.ts`, `finding-changed-emitter.ts` |
| Unit Test Mock | `createDrizzleMock()` from `src/test/drizzleMock.ts` |
| Factories | `buildFinding()`, `buildScore()`, `buildFileInBatch()`, `buildDbFinding()` |
| E2E Pattern | `test.describe.serial()`, ephemeral users `e2e-*@test.local`, `setUserMetadata()` for tour suppression |

### Knowledge Base Applied

- data-factories.md, component-tdd.md, test-quality.md, test-healing-patterns.md
- selector-resilience.md, timing-debugging.md, network-first.md, test-levels-framework.md
- overview.md (PW Utils), intercept-network-call.md, recurse.md, fixtures-composition.md

### TEA Config

- `tea_use_playwright_utils: true`
- `tea_browser_automation: auto`
- `test_framework: playwright`
- `risk_threshold: p1`

---

## Test Strategy

### AC → Test Scenario Mapping

#### AC1 — Score badge layer transition (4 tests)

| ID | Scenario | Level | Pri |
|----|----------|-------|-----|
| T1.1 | ScoreBadge renders `'rule-only'` (blue) when `layerCompleted='L1'` | Unit | P1 |
| T1.2 | ScoreBadge renders `'ai-screened'` (purple, "AI Screened") when `layerCompleted` includes L2 | Unit | P0 |
| T1.3 | ReviewPageClient maps `layerCompleted` → ScoreBadge `state` prop correctly | Unit | P0 |
| T1.4 | ScoreBadge backward compat — existing callers without explicit state unchanged | Unit | P1 |

#### AC2 — Confidence badges (9 tests)

| ID | Scenario | Level | Pri | Boundary |
|----|----------|-------|-----|----------|
| T2.1 | ConfidenceBadge green "High (85%)" for confidence=85 | Unit | P0 | AT 85 |
| T2.2 | ConfidenceBadge orange "Medium (84%)" for confidence=84.9 | Unit | P0 | BELOW 85 |
| T2.3 | ConfidenceBadge orange "Medium (70%)" for confidence=70 | Unit | P0 | AT 70 |
| T2.4 | ConfidenceBadge red "Low (69%)" for confidence=69.9 | Unit | P0 | BELOW 70 |
| T2.5 | ConfidenceBadge renders nothing when confidence=null (L1 finding) | Unit | P0 | NULL |
| T2.6 | ConfidenceBadge "Below threshold" warning when confidence < l2ConfidenceMin | Unit | P0 | |
| T2.7 | ConfidenceBadge no warning when confidence >= l2ConfidenceMin | Unit | P1 | AT threshold |
| T2.8 | ConfidenceBadge with confidence=100 → High (green) | Unit | P1 | MAX |
| T2.9 | ConfidenceBadge with confidence=0 → Low (red) | Unit | P1 | ZERO |

#### AC3 — Finding type extension (3 tests)

| ID | Scenario | Level | Pri |
|----|----------|-------|-----|
| T3.1 | `buildFinding()` produces Finding with `detectedByLayer`, no `source` | Unit | P0 |
| T3.2 | `buildFinding()` includes all 11 new DB-aligned fields | Unit | P1 |
| T3.3 | Existing test files compile after Finding type change | Unit | P1 |

#### AC4 — Review page route (5 tests)

| ID | Scenario | Level | Pri |
|----|----------|-------|-----|
| T4.1 | Review page renders at `/projects/[projectId]/review/[fileId]` | E2E | P0 |
| T4.2 | ScoreBadge (md) visible with score value | E2E | P0 |
| T4.3 | ReviewProgress shows L1 checkmark + L2 status | E2E | P0 |
| T4.4 | Findings list shows items sorted by severity | E2E | P1 |
| T4.5 | Finding count summary per severity visible | E2E | P1 |

#### AC5 — Server Action getFileReviewData (5 tests)

| ID | Scenario | Level | Pri |
|----|----------|-------|-----|
| T5.1 | Returns `{ success: true, data: { file, findings, score, processingMode, l2ConfidenceMin } }` | Unit | P0 |
| T5.2 | All queries use `withTenant()` — tenant isolation | Unit | P0 |
| T5.3 | Findings sorted: severity priority then confidence DESC NULLS LAST | Unit | P1 |
| T5.4 | Returns `NOT_FOUND` for missing file | Unit | P0 |
| T5.5 | Returns empty findings `[]` for file with no findings | Unit | P1 |

#### AC6 — Real-time score subscription BUG FIX (5 tests)

| ID | Scenario | Level | Pri |
|----|----------|-------|-----|
| T6.1 | `useScoreSubscription` subscribes to `'INSERT'` event (NOT `'UPDATE'`) | Unit | P0 |
| T6.2 | Realtime INSERT payload passes `layer_completed` to `updateScore()` | Unit | P0 |
| T6.3 | Store `layerCompleted` updates on `updateScore` call | Unit | P0 |
| T6.4 | Polling fallback `.select()` includes `layer_completed` | Unit | P0 |
| T6.5 | `resetForFile()` resets `layerCompleted` to null | Unit | P1 |

#### AC7 — Real-time findings subscription NEW (6 tests)

| ID | Scenario | Level | Pri |
|----|----------|-------|-----|
| T7.1 | Subscribes to `findings` table with filter `file_id=eq.${fileId}` | Unit | P0 |
| T7.2 | On INSERT: adds finding to `findingsMap` | Unit | P0 |
| T7.3 | On DELETE: removes finding from `findingsMap` | Unit | P0 |
| T7.4 | Burst INSERT: N events batched into single state update | Unit | P0 |
| T7.5 | Cleanup on unmount: `removeChannel()` called | Unit | P1 |
| T7.6 | Polling fallback activates when Realtime unavailable | Unit | P1 |

#### AC8 — ReviewProgress component (6 tests)

| ID | Scenario | Level | Pri |
|----|----------|-------|-----|
| T8.1 | L1 "Rules" always shows checkmark | Unit | P1 |
| T8.2 | L2 spinner during `l2_processing` file status | Unit | P0 |
| T8.3 | L2 checkmark when `layerCompleted` includes L2 | Unit | P0 |
| T8.4 | L3 "N/A" badge for Economy mode | Unit | P0 |
| T8.5 | L3 checkmark when `layerCompleted='L1L2L3'` (Thorough mode) | Unit | P1 |
| T8.6 | Text "AI: L2 complete" when L2 finishes | Unit | P1 |

#### AC9 — FindingListItem component (6 tests)

| ID | Scenario | Level | Pri |
|----|----------|-------|-----|
| T9.1 | Renders severity badge + category + LayerBadge + description + ConfidenceBadge | Unit | P0 |
| T9.2 | Description truncated at 100 chars with ellipsis | Unit | P1 |
| T9.3 | Expand/collapse toggles detail area (source/target, suggested fix) | Unit | P1 |
| T9.4 | Newly inserted finding has `data-new="true"` + fade-in class | Unit | P1 |
| T9.5 | `prefers-reduced-motion` disables animation | Unit | P2 |
| T9.6 | `aria-expanded` attribute reflects state | Unit | P1 |

#### AC10 — E2E critical flow (6 tests)

| ID | Scenario | Level | Pri |
|----|----------|-------|-----|
| T10.1 | [setup] Login + create project | E2E | P0 |
| T10.2 | Upload SDLXLIFF → auto-parse → Start Processing (Economy) | E2E | P0 |
| T10.3 | Wait pipeline → findings appear in review page | E2E | P0 |
| T10.4 | L2 findings have confidence values displayed | E2E | P0 |
| T10.5 | ScoreBadge shows score value | E2E | P0 |
| T10.6 | ReviewProgress shows L2 checkmark | E2E | P0 |

#### AC11 — Boundary values (6 tests)

| ID | Scenario | Level | Pri | Boundary |
|----|----------|-------|-----|----------|
| T11.1 | Score=70 → review (not fail) | Unit | P0 | AT 70 |
| T11.2 | Score=69.9 → fail | Unit | P0 | BELOW 70 |
| T11.3 | Score=95 + 0 criticals → pass | Unit | P0 | AT 95 |
| T11.4 | Score=95 + 1 critical → review | Unit | P0 | CRITICAL override |
| T11.5 | Zero L2 findings → score unchanged, ReviewProgress shows L2 checkmark | Unit | P0 | ZERO |
| T11.6 | File with only L1 findings → `'rule-only'`, no confidence badges | Unit | P0 | L1-only |

### Boundary Value Summary (Epic 2 Retro A2 — MANDATORY)

| Threshold | At | Below | Above | Zero/Null |
|-----------|----|-------|-------|-----------|
| Confidence >= 85 (High) | T2.1: 85→High | T2.2: 84.9→Medium | T2.8: 100→High | T2.5: null→nothing |
| Confidence >= 70 (Medium) | T2.3: 70→Medium | T2.4: 69.9→Low | — | T2.9: 0→Low |
| l2ConfidenceMin | T2.7: at→no warning | T2.6: below→warning | — | — |
| Score >= 70 (not fail) | T11.1: 70→review | T11.2: 69.9→fail | — | — |
| Score >= 95 + 0 crit (pass) | T11.3: 95+0→pass | — | — | T11.4: 95+1crit→review |

### Test Level Distribution

| Level | Count | Files |
|-------|-------|-------|
| Unit (Vitest) | ~55 tests | 8 test files (co-located) |
| E2E (Playwright) | ~6 tests | `e2e/review-findings.spec.ts` |
| **Total** | **~61 tests** | **9 files** |

### Priority Distribution

| Priority | Count | DoD Gate |
|----------|-------|----------|
| P0 | 35 | MUST PASS for story completion |
| P1 | 22 | MUST PASS for story completion |
| P2 | 2 | Nice-to-have (tech debt if skipped) |

### Red Phase Confirmation

All tests will fail before implementation:
- New components (ConfidenceBadge, LayerBadge, ReviewProgress, FindingListItem) → import fails
- New Server Action (getFileReviewData) → import fails
- New hook (useFindingsSubscription) → import fails
- ScoreBadge `'ai-screened'` state → not in type union
- Finding type `source` field removal → factory mismatch
- Review page route → 404

---

## Failing Tests Created (RED Phase)

### Unit Tests (54 tests across 9 files)

**File:** `src/features/review/components/ConfidenceBadge.test.tsx` (10 tests)

- `it.skip` **[P0] should render green "High" badge when confidence >= 85** — RED: component doesn't exist
- `it.skip` **[P0] should render orange "Medium" badge when confidence is 84.9** — RED: component doesn't exist
- `it.skip` **[P0] should render orange "Medium" badge when confidence is 70** — RED: component doesn't exist
- `it.skip` **[P0] should render red "Low" badge when confidence is 69.9** — RED: component doesn't exist
- `it.skip` **[P0] should render nothing when confidence is null** — RED: component doesn't exist
- `it.skip` **[P0] should show "Below threshold" warning when below l2ConfidenceMin** — RED: component doesn't exist
- `it.skip` **[P1] should not show warning when confidence >= l2ConfidenceMin** — RED: component doesn't exist
- `it.skip` **[P1] should render High for confidence=100** — RED: component doesn't exist
- `it.skip` **[P1] should render Low for confidence=0** — RED: component doesn't exist
- `it.skip` **[P1] should not render l2ConfidenceMin warning when threshold is null** — RED: component doesn't exist

**File:** `src/features/review/components/LayerBadge.test.tsx` (4 tests)

- `it.skip` **[P1] should render "Rule" blue badge for L1** — RED: component doesn't exist
- `it.skip` **[P1] should render "AI" purple badge for L2** — RED: component doesn't exist
- `it.skip` **[P1] should render "AI" purple badge for L3** — RED: component doesn't exist
- `it.skip` **[P1] should use design token color** — RED: component doesn't exist

**File:** `src/features/review/components/ReviewProgress.test.tsx` (7 tests)

- `it.skip` **[P1] should always show L1 Rules checkmark** — RED: component doesn't exist
- `it.skip` **[P0] should show L2 spinner during l2_processing** — RED: component doesn't exist
- `it.skip` **[P0] should show L2 checkmark when layerCompleted includes L2** — RED: component doesn't exist
- `it.skip` **[P0] should show L3 N/A for Economy mode** — RED: component doesn't exist
- `it.skip` **[P1] should show L3 checkmark when layerCompleted is L1L2L3** — RED: component doesn't exist
- `it.skip` **[P1] should show "AI: L2 complete" text** — RED: component doesn't exist
- `it.skip` **[P0] should show L2 pending when layerCompleted is L1 only** — RED: component doesn't exist

**File:** `src/features/review/components/FindingListItem.test.tsx` (7 tests)

- `it.skip` **[P0] should render severity, category, LayerBadge, description, ConfidenceBadge** — RED: component doesn't exist
- `it.skip` **[P1] should truncate description at 100 chars** — RED: component doesn't exist
- `it.skip` **[P1] should expand/collapse detail area** — RED: component doesn't exist
- `it.skip` **[P1] should show data-new and fade-in for new findings** — RED: component doesn't exist
- `it.skip` **[P2] should respect prefers-reduced-motion** — RED: component doesn't exist
- `it.skip` **[P1] should have aria-expanded attribute** — RED: component doesn't exist
- `it.skip` **[P0] should show source/target excerpts in expanded state** — RED: component doesn't exist

**File:** `src/features/review/components/ScoreBadge.boundary.test.tsx` (7 tests)

- `it.skip` **[P0] should derive 'review' for score=70** — RED: boundary logic not updated
- `it.skip` **[P0] should derive 'fail' for score=69.9** — RED: boundary logic not updated
- `it.skip` **[P0] should derive 'pass' for score=95 with 0 criticals** — RED: boundary logic not updated
- `it.skip` **[P0] should derive 'review' for score=95 with 1 critical** — RED: boundary logic not updated
- `it.skip` **[P0] should remain 'rule-only' with zero L2 findings** — RED: state not available
- `it.skip` **[P0] should show no confidence badges for L1-only file** — RED: component integration
- `it.skip` **[P0] should show L2 checkmark even with zero L2 findings** — RED: component integration

**File:** `src/features/review/actions/getFileReviewData.action.test.ts` (6 tests)

- `it.skip` **[P0] should return file, findings, score, processingMode, l2ConfidenceMin** — RED: action doesn't exist
- `it.skip` **[P0] should use withTenant on all queries** — RED: action doesn't exist
- `it.skip` **[P1] should sort findings by severity then confidence DESC NULLS LAST** — RED: action doesn't exist
- `it.skip` **[P0] should return NOT_FOUND for missing file** — RED: action doesn't exist
- `it.skip` **[P1] should return empty findings for file with no findings** — RED: action doesn't exist
- `it.skip` **[P0] should load processingMode from projects table** — RED: action doesn't exist

**File:** `src/features/review/hooks/use-findings-subscription.test.ts` (7 tests)

- `it.skip` **[P0] should subscribe to findings table with file_id filter** — RED: hook doesn't exist
- `it.skip` **[P0] should add finding to store on INSERT** — RED: hook doesn't exist
- `it.skip` **[P0] should remove finding from store on DELETE** — RED: hook doesn't exist
- `it.skip` **[P0] should batch burst INSERTs into single state update** — RED: hook doesn't exist
- `it.skip` **[P1] should call removeChannel on unmount** — RED: hook doesn't exist
- `it.skip` **[P1] should activate polling fallback** — RED: hook doesn't exist
- `it.skip` **[P0] should handle INSERT+DELETE for re-process idempotency** — RED: hook doesn't exist

**File:** `src/features/review/hooks/use-score-subscription.test.ts` (+3 tests extended)

- `it.skip` **[P0] should subscribe to INSERT event not UPDATE (BUG FIX)** — RED: event type not changed yet
- `it.skip` **[P0] should pass layer_completed from Realtime payload** — RED: not extracted yet
- `it.skip` **[P0] should include layer_completed in polling select** — RED: select not updated

**File:** `src/features/batch/components/ScoreBadge.test.tsx` (+3 tests extended)

- `it.skip` **[P0] should render ai-screened state with purple and "AI Screened"** — RED: state not in type
- `it.skip` **[P1] should render rule-only state unchanged (backward compat)** — RED: verifying compat
- `it.skip` **[P0] should not change deriveState for ai-screened** — RED: state not in type

### E2E Tests (9 tests in 1 file)

**File:** `e2e/review-findings.spec.ts` (9 tests)

- `test` **[setup] signup, login and create project** — Setup test (NOT skipped)
- `test` **[setup] upload SDLXLIFF and start pipeline** — Setup test (NOT skipped)
- `test.skip` **[P0] findings appear in review page after pipeline** — RED: review page doesn't exist
- `test.skip` **[P0] L2 findings display confidence values** — RED: ConfidenceBadge doesn't exist
- `test.skip` **[P0] ScoreBadge shows score value** — RED: review page doesn't exist
- `test.skip` **[P0] ReviewProgress shows L2 checkmark** — RED: ReviewProgress doesn't exist
- `test.skip` **[P0] findings list sorted by severity** — RED: FindingListItem doesn't exist
- `test.skip` **[P1] layer badges show Rule and AI correctly** — RED: LayerBadge doesn't exist
- `test.skip` **[P1] finding count summary shows per-severity counts** — RED: component doesn't exist

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY)

### Confidence Thresholds (ConfidenceBadge)

| Boundary | At | Below | Above | Zero/Empty |
|----------|----|-------|-------|------------|
| confidence >= 85 (High) | `85` → green "High (85%)" | `84.9` → orange "Medium (84%)" | `100` → green "High (100%)" | `null` → nothing rendered |
| confidence >= 70 (Medium) | `70` → orange "Medium (70%)" | `69.9` → red "Low (69%)" | — | `0` → red "Low (0%)" |
| l2ConfidenceMin threshold | `at` → no warning | `below` → warning icon | — | `null` threshold → no warning |

### Score Thresholds (ScoreBadge boundary)

| Boundary | At | Below | Above | Zero/Empty |
|----------|----|-------|-------|------------|
| score >= 70 (not fail) | `70.0` → review | `69.9` → fail | — | — |
| score >= 95 + 0 crit (pass) | `95.0` + 0 crit → pass | `94.9` + 0 crit → review | — | `95.0` + 1 crit → review |
| zero L2 findings | score unchanged from L1 | — | — | L2 checkmark still shows |

---

## Data Factories

No new factory files needed. Existing `src/test/factories.ts` will be **updated** during GREEN phase:
- `buildFinding()`: remove `source: 'L1-rule'`, add `detectedByLayer: 'L1'` + 10 other DB-aligned fields
- `buildScore()`: add `layerCompleted` field
- All existing 26+ test files using `buildFinding()` will compile after update

---

## Required data-testid Attributes

### ReviewPageClient

- `score-badge` — ScoreBadge component wrapper
- `review-progress` — ReviewProgress component
- `finding-list` — Findings list container
- `finding-count-summary` — Per-severity count summary

### FindingListItem

- `finding-list-item` — Individual finding row
- `finding-detail` — Expandable detail area

### ConfidenceBadge

- `confidence-badge` — Confidence percentage badge
- `confidence-warning` — "Below threshold" warning icon

### LayerBadge

- `layer-badge` — Rule/AI layer indicator

---

## Implementation Checklist

### Test: ConfidenceBadge (10 tests)

**File:** `src/features/review/components/ConfidenceBadge.test.tsx`

**Tasks to make these tests pass:**

- [ ] Create `src/features/review/components/ConfidenceBadge.tsx`
- [ ] Implement color-coded confidence display (>=85 green, 70-84 orange, <70 red)
- [ ] Implement l2ConfidenceMin threshold warning
- [ ] Handle null confidence (render nothing)
- [ ] Add `data-testid="confidence-badge"` and `data-testid="confidence-warning"`
- [ ] Remove `it.skip` from all tests
- [ ] Run: `npx vitest run src/features/review/components/ConfidenceBadge.test.tsx`

### Test: LayerBadge (4 tests)

**File:** `src/features/review/components/LayerBadge.test.tsx`

**Tasks to make these tests pass:**

- [ ] Create `src/features/review/components/LayerBadge.tsx`
- [ ] L1 → "Rule" (blue), L2/L3 → "AI" (purple via `--color-status-ai-screened`)
- [ ] Add `data-testid="layer-badge"`
- [ ] Remove `it.skip` → Run: `npx vitest run src/features/review/components/LayerBadge.test.tsx`

### Test: ReviewProgress (7 tests)

**File:** `src/features/review/components/ReviewProgress.test.tsx`

**Tasks to make these tests pass:**

- [ ] Create `src/features/review/components/ReviewProgress.tsx`
- [ ] Implement 3-step display: L1 (always check), L2 (check/spinner/pending), L3 (check/spinner/N-A)
- [ ] Economy mode: L3 shows "N/A"
- [ ] Text: "AI: L2 complete" after L2 finishes
- [ ] Add `data-testid="review-progress"`
- [ ] Remove `it.skip` → Run: `npx vitest run src/features/review/components/ReviewProgress.test.tsx`

### Test: FindingListItem (7 tests)

**File:** `src/features/review/components/FindingListItem.test.tsx`

**Tasks to make these tests pass:**

- [ ] Create `src/features/review/components/FindingListItem.tsx`
- [ ] Render severity + category + LayerBadge + description + ConfidenceBadge
- [ ] Truncate description at 100 chars
- [ ] Expand/collapse detail area with `aria-expanded`
- [ ] Fade-in animation with `prefers-reduced-motion` guard
- [ ] Add `data-testid="finding-list-item"`, `data-testid="finding-detail"`
- [ ] Remove `it.skip` → Run: `npx vitest run src/features/review/components/FindingListItem.test.tsx`

### Test: ScoreBadge ai-screened (+3 tests)

**File:** `src/features/batch/components/ScoreBadge.test.tsx`

**Tasks to make these tests pass:**

- [ ] Add `'ai-screened'` to `ScoreBadgeState` type union
- [ ] Add `STATE_LABELS['ai-screened']` → "AI Screened"
- [ ] Add `STATE_CLASSES['ai-screened']` → purple token classes
- [ ] Add design token `--color-status-ai-screened: #8b5cf6` to `tokens.css`
- [ ] Remove `it.skip` → Run: `npx vitest run src/features/batch/components/ScoreBadge.test.tsx`

### Test: ScoreBadge boundary (7 tests)

**File:** `src/features/review/components/ScoreBadge.boundary.test.tsx`

**Tasks to make these tests pass:**

- [ ] Verify `deriveState()` thresholds: fail<70, review 70-94.9, pass>=95+0crit
- [ ] Integrate with ReviewProgress for zero-L2-findings scenario
- [ ] Remove `it.skip` → Run: `npx vitest run src/features/review/components/ScoreBadge.boundary.test.tsx`

### Test: getFileReviewData Server Action (6 tests)

**File:** `src/features/review/actions/getFileReviewData.action.test.ts`

**Tasks to make these tests pass:**

- [ ] Create `src/features/review/actions/getFileReviewData.action.ts`
- [ ] Load file metadata, findings (all layers), score, processingMode, l2ConfidenceMin
- [ ] All queries with `withTenant()`
- [ ] Sort findings by severity priority then confidence DESC NULLS LAST
- [ ] Return `ActionResult<FileReviewData>`
- [ ] Remove `it.skip` → Run: `npx vitest run src/features/review/actions/getFileReviewData.action.test.ts`

### Test: useFindingsSubscription (7 tests)

**File:** `src/features/review/hooks/use-findings-subscription.test.ts`

**Tasks to make these tests pass:**

- [ ] Create `src/features/review/hooks/use-findings-subscription.ts`
- [ ] Subscribe to Realtime INSERT + DELETE events on findings table
- [ ] Burst batching via `queueMicrotask`
- [ ] Polling fallback with exponential backoff
- [ ] Cleanup on unmount
- [ ] Remove `it.skip` → Run: `npx vitest run src/features/review/hooks/use-findings-subscription.test.ts`

### Test: useScoreSubscription BUG FIX (+3 tests)

**File:** `src/features/review/hooks/use-score-subscription.test.ts`

**Tasks to make these tests pass:**

- [ ] Change Realtime event from `'UPDATE'` to `'INSERT'`
- [ ] Extract `layer_completed` from INSERT payload
- [ ] Update polling `.select()` to include `layer_completed`
- [ ] Remove `it.skip` → Run: `npx vitest run src/features/review/hooks/use-score-subscription.test.ts`

### Test: review.store layerCompleted (+3 tests)

**File:** `src/features/review/stores/review.store.test.ts`

**Tasks to make these tests pass:**

- [ ] Add `layerCompleted` field to `ScoreSlice`
- [ ] Update `updateScore` signature: `(score, status, layerCompleted)`
- [ ] Reset `layerCompleted` to null in `resetForFile()`
- [ ] Remove `it.skip` → Run: `npx vitest run src/features/review/stores/review.store.test.ts`

### Test: E2E Review Findings (9 tests)

**File:** `e2e/review-findings.spec.ts`

**Tasks to make these tests pass:**

- [ ] Complete ALL unit test tasks above first
- [ ] Create review page route: `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx`
- [ ] Create ReviewPageClient with all wired components
- [ ] Wire Realtime subscriptions (score + findings)
- [ ] Add all `data-testid` attributes
- [ ] Remove `test.skip` → Run: `npx playwright test e2e/review-findings.spec.ts`

---

## Running Tests

```bash
# Run all failing unit tests for this story
npx vitest run src/features/review/components/ src/features/review/actions/ src/features/review/hooks/

# Run specific test file
npx vitest run src/features/review/components/ConfidenceBadge.test.tsx

# Run boundary tests
npx vitest run src/features/review/components/ScoreBadge.boundary.test.tsx

# Run E2E tests (requires Inngest dev server)
INNGEST_DEV_URL=http://localhost:8288 npx playwright test e2e/review-findings.spec.ts

# Run E2E in headed mode
npx playwright test e2e/review-findings.spec.ts --headed

# Debug specific E2E test
npx playwright test e2e/review-findings.spec.ts --debug

# Run all story tests with coverage
npx vitest run --coverage src/features/review/ src/features/batch/components/ScoreBadge
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All 63 tests written and skipped (intentionally failing)
- ✅ Factories identified for update (buildFinding, buildScore)
- ✅ No new fixture files needed — existing infrastructure
- ✅ data-testid requirements listed (9 attributes)
- ✅ Implementation checklist created (11 test groups → tasks)

**Verification:**

- All tests use `it.skip()` or `test.skip()`
- Failure reason: components/actions/hooks don't exist yet
- Tests fail due to missing implementation, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Start with Task 1** (Finding type extension) — foundational type change
2. **Follow dependency chain:** 1 → 2 → 3,4,5 → 6 → 7 → 8,9 → 10,11
3. **For each task:** Remove `it.skip`, implement, run test, verify green
4. **Run full suite** after all tasks complete

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

1. Verify all 63 tests pass
2. Review code quality (DRY, types, naming)
3. Run pre-CR agents (anti-pattern-detector, tenant-isolation-checker, code-quality-analyzer)
4. Run E2E locally before push (Guardrail #24)

---

## Knowledge Base References Applied

- **data-factories.md** — Factory patterns for test data generation with overrides
- **component-tdd.md** — Red→green→refactor workflow for component tests
- **test-quality.md** — Test design principles (Given-When-Then, determinism, isolation)
- **test-levels-framework.md** — Test level selection (Unit > Integration > E2E when possible)
- **selector-resilience.md** — data-testid selectors for stability
- **timing-debugging.md** — Race condition identification, polling patterns
- **network-first.md** — Intercept-before-navigate for E2E
- **test-healing-patterns.md** — Common failure patterns and fixes
- **overview.md** (Playwright Utils) — API and UI testing fixture patterns
- **intercept-network-call.md** — Network spy/stub for Realtime mocking
- **recurse.md** — Async polling for pipeline completion
- **fixtures-composition.md** — mergeTests composition patterns

---

## Completion Summary

### ATDD Workflow Complete ✅

**Story:** 3.2c — L2 Results Display & Score Update
**TDD Phase:** RED (all tests failing intentionally)

**Test Files Created (9 files, 63 tests):**

| File | Tests | Priority |
|------|-------|----------|
| `src/features/review/components/ConfidenceBadge.test.tsx` | 10 | 6×P0, 4×P1 |
| `src/features/review/components/LayerBadge.test.tsx` | 4 | 4×P1 |
| `src/features/review/components/ReviewProgress.test.tsx` | 7 | 4×P0, 3×P1 |
| `src/features/review/components/FindingListItem.test.tsx` | 7 | 2×P0, 4×P1, 1×P2 |
| `src/features/review/components/ScoreBadge.boundary.test.tsx` | 7 | 7×P0 |
| `src/features/review/actions/getFileReviewData.action.test.ts` | 6 | 4×P0, 2×P1 |
| `src/features/review/hooks/use-findings-subscription.test.ts` | 7 | 5×P0, 2×P1 |
| `src/features/review/hooks/use-score-subscription.test.ts` | +3 | 3×P0 |
| `src/features/batch/components/ScoreBadge.test.tsx` | +3 | 2×P0, 1×P1 |
| `e2e/review-findings.spec.ts` | 9 | 6×P0, 2×P1, 1×setup |

**Priority Distribution:** P0: 39 | P1: 22 | P2: 1 | Setup: 1

**Checklist Output:** `_bmad-output/test-artifacts/atdd-checklist-3-2c.md`

### Key Risks & Assumptions

1. **Risk: E2E pipeline dependency** — E2E tests require Inngest dev server (`INNGEST_DEV=1`). If AI calls are flaky in CI, create TD for AI mock layer
2. **Risk: buildFinding() breakage** — Removing `source` field affects 26+ test files. Task 1.4 must update factory FIRST
3. **Assumption: Realtime works for INSERT** — Score subscription BUG FIX (UPDATE→INSERT) is untested until GREEN phase
4. **Assumption: processingMode on projects table** — Server Action joins projects to get this value

### Next Steps

1. **Run `dev-story`** workflow to implement Story 3.2c
2. Follow dependency chain: Tasks 1→2→3,4,5→6→7→8,9→10,11
3. For each task: remove `it.skip()`, implement, run test, verify green
4. Run pre-CR agents before submitting to Code Review

---

**Generated by BMad TEA Agent (Murat)** — 2026-03-03

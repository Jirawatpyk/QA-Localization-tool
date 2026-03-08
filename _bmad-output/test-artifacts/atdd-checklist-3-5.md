---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-08'
---

# ATDD Checklist - Epic 3, Story 3.5: Score Lifecycle & Confidence Display

**Date:** 2026-03-07
**Author:** Mona
**Primary Test Level:** Unit (Vitest)

---

## Story Summary

Score lifecycle UI and confidence display enhancements for the review page.

**As a** QA Reviewer
**I want** to see scores update progressively as each analysis layer completes, with per-finding confidence indicators calibrated to my language pair
**So that** I can trust the scores, understand how they evolve, and make informed review decisions

---

## Acceptance Criteria

1. AC1 - Score calculating state (spinner + "Calculating..." + Approve disabled)
2. AC2 - L1 score with AI pending indicator (rule-based badge + "AI pending")
3. AC3 - Layer completion score transitions (dim -> recalculate -> highlight + Approve re-enable)
4. AC4 - Finding change triggers recalculation (500ms debounce -> serial queue -> dim/recalc/highlight)
5. AC5 - Approve gate server-side (SCORE_STALE, SCORE_PARTIAL, SCORE_NA, ALREADY_APPROVED)
6. AC6 - Auto-pass rationale display (margin, severity counts, riskiest finding, criteria checkmarks)
7. AC7 - Confidence inline display (High/Medium/Low color + threshold warning, refactor to generic prop)
8. AC8 - Confidence expanded display (tooltip with language pair threshold)
9. AC9 - Confidence thresholds from language_pair_configs (L2 + L3)
10. AC10 - Threshold change handling (Realtime subscription, toast, re-evaluate styling)
11. AC11 - Fallback model confidence warning (warning icon + tooltip)
12. AC12 - Boundary values (score 95/94.99/70/69.99, confidence 85/84.99/70/69.99, etc.)

---

## Pre-mortem Analysis Findings (Step 1 Enhancement)

The following gaps were identified via pre-mortem analysis and will be incorporated into test generation:

| ID | Gap | Impact | Test Enhancement |
|----|-----|--------|-----------------|
| PM-1 | Approve gate race condition (UI says calculated, server says calculating) | High | Server action test must verify server-side status is source of truth |
| PM-2 | Auto-pass rationale JSON parse crash on legacy plain-text data | High | AutoPassRationale test must include legacy plain-text fallback |
| PM-3 | ConfidenceBadge prop rename regression (l2ConfidenceMin -> confidenceMin) | High | Verify no caller uses old prop name after refactor |
| PM-4 | Threshold subscription memory leak (no unsubscribe on unmount) | High | useEffect cleanup test must verify channel.unsubscribe() |
| PM-5 | Floating point epsilon at auto-pass boundary (95.00000001) | Low | Add floating point boundary test |
| PM-6 | deriveScoreBadgeState fix may break existing tests | Medium | Run existing ReviewPageClient tests after change |
| PM-7 | L3 null threshold - silent "Below threshold" skip | Medium | Test L3 finding with null l3ConfidenceMin |
| PM-8 | Toast storm on rapid threshold changes | Low | Test rapid-fire events -> single/debounced toast |

---

## Context Loaded

### Framework
- Vitest (unit/jsdom workspace) + Playwright (E2E, chromium)
- Test factories: `src/test/factories.ts` (buildFinding, buildReviewSession, etc.)
- Drizzle mock: `src/test/drizzleMock.ts` (createDrizzleMock)
- E2E helpers: `e2e/helpers/` (supabase-admin, fileUpload, pipeline-admin)

### Existing Test Files (Review Feature)
- ReviewPageClient.test.tsx, .story33.test.tsx, .story34.test.tsx
- FindingListItem.test.tsx, .story33.test.tsx, .story34.test.tsx
- ConfidenceBadge.test.tsx, LayerBadge.test.tsx, ReviewProgress.test.tsx
- review.store.test.ts, use-score-subscription.test.ts, use-findings-subscription.test.ts
- finding-changed-emitter.test.ts, getFileReviewData.action.test.ts

### Existing Test Files (Scoring Feature)
- autoPassChecker.test.ts, scoreFile.test.ts, scoreFile.story34.test.ts
- mqmCalculator.test.ts, penaltyWeightLoader.test.ts

### Knowledge Base Applied
- test-quality.md, data-factories.md, test-levels-framework.md
- test-priorities-matrix.md, component-tdd.md, selector-resilience.md

---

## Failure Mode Analysis (Step 1 Enhancement)

Systematic component-level failure analysis — 36 failure modes across 9 components:

### approveFile.action.ts (Server Action) — 6 FMs

| ID | Failure Mode | Priority | Test |
|----|-------------|----------|------|
| FM-1.1 | Auth bypass - no role check | P0 | requireRole rejects native_reviewer + unauthenticated |
| FM-1.2 | Cross-tenant access - no withTenant() | P0 | File from tenant-B returns error |
| FM-1.3 | Missing score row - rows[0]! without guard | P0 | Return SCORE_NOT_FOUND |
| FM-1.4 | Stale score race - status changed between UI read and server query | P0 | Server re-queries, returns SCORE_STALE |
| FM-1.5 | Audit log failure masks real error | P1 | Audit in try-catch, real result still returned |
| FM-1.6 | Invalid fileId format | P1 | Zod rejects non-UUID |

### autoPassChecker.ts (Enhanced Rationale) — 5 FMs

| ID | Failure Mode | Priority | Test |
|----|-------------|----------|------|
| FM-2.1 | Wrong severity counts from mismatched source | P0 | Verify severityCounts matches actual findings |
| FM-2.2 | Riskiest finding tiebreaker logic wrong | P1 | Tiebreaker: highest confidence within highest severity |
| FM-2.3 | Structured rationale missing required fields | P0 | Validate all AutoPassRationale fields present |
| FM-2.4 | undefined vs null for riskiestFinding serialization | P1 | Verify null (not undefined) for missing riskiest |
| FM-2.5 | New pair graduation wrong file count | P2 | fileCount reflects completed files only |

### scoreFile.ts (Extended Findings Query) — 3 FMs

| ID | Failure Mode | Priority | Test |
|----|-------------|----------|------|
| FM-3.1 | Expanded SELECT breaks existing callers | P0 | Existing scoreFile tests still pass |
| FM-3.2 | Null aiConfidence for L1 findings crashes riskiest logic | P1 | Riskiest finding skips L1 findings |
| FM-3.3 | Empty findings array crashes riskiestFinding | P0 | 0 findings -> riskiestFinding: null |

### AutoPassRationale.tsx (New Component) — 5 FMs

| ID | Failure Mode | Priority | Test |
|----|-------------|----------|------|
| FM-4.1 | JSON.parse crash on legacy plain text | P0 | Fallback to raw text display |
| FM-4.2 | Empty string rationale -> blank component | P1 | Show "No rationale available" |
| FM-4.3 | Null rationale -> component shouldn't render | P1 | Parent guards with conditional render |
| FM-4.4 | Very large rationale -> layout overflow | P3 | CSS handles overflow |
| FM-4.5 | Negative margin value display | P2 | Display correctly even if margin < 0 |

### ReviewPageClient.tsx (UI Orchestration) — 6 FMs

| ID | Failure Mode | Priority | Test |
|----|-------------|----------|------|
| FM-5.1 | deriveScoreBadgeState fix breaks existing behavior | P0 | Regression test all existing mappings |
| FM-5.2 | isRecalculating not subscribed -> no dim effect | P0 | Verify dim class when isRecalculating=true |
| FM-5.3 | Approve button enabled during partial status | P0 | Button disabled for all non-calculated/overridden |
| FM-5.4 | Double-click on Approve fires twice | P1 | useTransition prevents concurrent calls |
| FM-5.5 | AI pending shows after AI failure (ai_partial) | P1 | AI pending hidden when file status terminal |
| FM-5.6 | Auto-pass rationale shows for non-auto_passed | P1 | Rationale only when scoreStatus=auto_passed |

### ConfidenceBadge.tsx (Prop Refactor) — 4 FMs

| ID | Failure Mode | Priority | Test |
|----|-------------|----------|------|
| FM-6.1 | Old l2ConfidenceMin prop still used by callers | P0 | Grep verify no old prop usage |
| FM-6.2 | confidenceMin=null -> no warning, no visual cue | P1 | Null threshold = no warning, tooltip explains |
| FM-6.3 | Boundary 84.99 renders as High (off-by-one) | P0 | Exact boundary tests per AC12 |
| FM-6.4 | Confidence value 0 -> crash or wrong color | P2 | Handle 0 gracefully |

### FindingListItem.tsx (L3 Threshold + Tooltip) — 4 FMs

| ID | Failure Mode | Priority | Test |
|----|-------------|----------|------|
| FM-7.1 | L3 finding gets L2 threshold (wrong dispatch) | P0 | L3 -> l3ConfidenceMin, L2 -> l2ConfidenceMin |
| FM-7.2 | L1 finding shows confidence tooltip (shouldn't) | P1 | L1 finding -> no confidence badge/tooltip |
| FM-7.3 | Tooltip missing for collapsed state | P1 | Inline badge collapsed, tooltip expanded |
| FM-7.4 | Fallback badge + confidence tooltip conflict | P2 | Both badges render correctly side-by-side |

### use-threshold-subscription.ts (New Hook) — 5 FMs

| ID | Failure Mode | Priority | Test |
|----|-------------|----------|------|
| FM-8.1 | Memory leak - no unsubscribe on unmount | P0 | Cleanup calls channel.unsubscribe() |
| FM-8.2 | Wrong language pair filter on Realtime channel | P1 | Channel filters by source_lang + target_lang |
| FM-8.3 | Fallback polling doesn't start on channel error | P1 | Error -> start 60s polling |
| FM-8.4 | Toast storm on rapid threshold changes | P2 | Debounce -> single toast |
| FM-8.5 | Stale closure - old threshold in callback | P1 | Use ref/callback for latest state |

### getFileReviewData.action.ts (Data Fetching) — 3 FMs

| ID | Failure Mode | Priority | Test |
|----|-------------|----------|------|
| FM-9.1 | autoPassRationale not in SELECT | P0 | Return shape includes field |
| FM-9.2 | l3ConfidenceMin JOIN returns null | P1 | Null handled gracefully |
| FM-9.3 | FileReviewData type not updated | P0 | TypeScript compile check |

### Failure Mode Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 16 | Must-have tests (data integrity, security, gate logic, boundaries) |
| P1 | 15 | Should-have tests (edge cases, error handling, UX correctness) |
| P2 | 4 | Nice-to-have (rare edge cases) |
| P3 | 1 | Test if time permits (layout overflow) |

### New Gaps (not in original story tasks)

- FM-5.4: Double-click protection on Approve button (useTransition)
- FM-8.2: Realtime channel language pair filter specificity
- FM-8.5: Stale closure in subscription callback
- FM-2.4: undefined vs null for riskiestFinding serialization
- FM-3.2: Riskiest finding should skip L1 findings (no aiConfidence)

---

## Red Team vs Blue Team Analysis (Step 1 Enhancement)

Adversarial attack-defend analysis focused on approve gate and security-critical paths.

### Vulnerabilities Found

| ID | Attack Vector | Verdict | Priority | Test Requirement |
|----|--------------|---------|----------|-----------------|
| RT-1 | Approve race (500ms debounce window) | Partial vuln - acceptable eventual consistency | P1 | Document limitation; server is source of truth |
| RT-2 | Cross-project fileId within same tenant | **GAP - missing eq(projectId) guard** | **P0** | **approveFile must verify file belongs to projectId (Guardrail #14)** |
| RT-3 | Auto-pass rationale null on forced status | Low risk - display only | P1 | AutoPassRationale shows warning for null rationale |
| RT-4 | Stuck 'calculating' forever (onFailure crash) | Edge case - manual intervention | P2 | Document as Epic 4+ enhancement |
| RT-5 | Threshold set to 0/100 extreme values | Upstream - correct math, transparent | P1 | Extreme boundary tests + tooltip transparency |
| RT-6 | Stale UI after suspend/reconnect | Protected by fallback polling | P1 | SCORE_STALE response triggers score re-fetch |

### Critical Finding: RT-2 Cross-Project Guard

The `approveFile.action.ts` spec includes `withTenant()` for tenant isolation but does NOT include `eq(scores.projectId, projectId)` for cross-project defense within the same tenant. Per Guardrail #14 (asymmetric query filters), ALL sibling queries in the same function must have consistent filters.

**Required hardening:**
- Server action must query: `where(and(eq(scores.fileId, fileId), eq(scores.projectId, projectId), withTenant(scores.tenantId, tenantId)))`
- Test: Send fileId from project-A with projectId from project-B (same tenant) -> must return error

### Hardening Tests to Add

| Source | Test | Priority | File |
|--------|------|----------|------|
| RT-2 | Cross-project fileId -> error (not approve) | P0 | approveFile.action.test.ts |
| RT-2 | Cross-tenant fileId -> SCORE_NOT_FOUND | P0 | approveFile.action.test.ts |
| RT-1 | SCORE_STALE response handling in UI | P1 | ReviewPageClient.story35.test.tsx |
| RT-3 | AutoPassRationale with null rationale -> warning | P1 | AutoPassRationale.test.tsx |
| RT-5 | ConfidenceBadge with confidenceMin=0 -> all High, tooltip "0%" | P1 | ConfidenceBadge.test.tsx |
| RT-5 | ConfidenceBadge with confidenceMin=100 -> all Below threshold | P1 | ConfidenceBadge.test.tsx |
| RT-6 | SCORE_STALE triggers re-fetch (not just toast) | P1 | ReviewPageClient.story35.test.tsx |

---

## Critique and Refine: Gap Closure (Step 1 Enhancement)

### AC Coverage Gaps Found

| AC | Gap | Resolution |
|----|-----|-----------|
| AC2 | Happy path test missing (L1 + AI pending visible) | Add P0 unit test: L1 complete + layerCompleted='L1' -> "AI pending" indicator visible |
| AC4 | No test covers full debounce -> recalc -> UI update flow | Add P1 unit test: finding change -> isRecalculating=true -> dim + badge -> score update -> isRecalculating=false -> highlight |
| AC9 | Happy path not explicitly tested (correct threshold per layer) | Add P0 unit test: L2 finding gets l2ConfidenceMin, L3 finding gets l3ConfidenceMin |
| AC11 | No FM covers fallback model badge + confidence co-existence | Add P1 unit test: finding with fallbackUsed=true + aiConfidence=72 -> both badges render |
| AC12 | Score boundary values not in FMs (only confidence boundaries) | Add P0 unit test: autoPassChecker boundaries at 95, 94.99, 70, 69.99, 0, 100 |

### Additional Test Requirements

| ID | Test | Priority | File | Source |
|----|------|----------|------|--------|
| CR-1 | L1 complete + AI pending visible (happy path) | P0 | ReviewPageClient.story35.test.tsx | AC2 gap |
| CR-2 | Finding change -> recalc flow (dim/badge/highlight) | P1 | ReviewPageClient.story35.test.tsx | AC4 gap |
| CR-3 | L2 finding -> l2ConfidenceMin, L3 finding -> l3ConfidenceMin (happy path) | P0 | FindingListItem.story35.test.tsx | AC9 gap |
| CR-4 | Fallback badge + confidence badge co-exist | P1 | FindingListItem.story35.test.tsx | AC11 gap |
| CR-5 | autoPassChecker score boundaries (95, 94.99, 70, 69.99, 0, 100) | P0 | autoPassChecker.test.ts | AC12 gap |

### Factory/Mock Requirements

| Factory | Status | Action |
|---------|--------|--------|
| `buildFinding({ aiConfidence, detectedByLayer })` | Exists | Verify override works for L2/L3 + confidence |
| `buildScore()` | **Missing** | Create in factories.ts for approve action tests |
| `buildAutoPassRationale()` | **Missing** | Create helper to build structured JSON rationale |

### Existing Test Regression Risk

Refactoring shared code will break existing tests. These must be updated during implementation:

| Change | Existing Files at Risk | Update Required |
|--------|----------------------|-----------------|
| `l2ConfidenceMin` -> `confidenceMin` prop on ConfidenceBadge | `ConfidenceBadge.test.tsx` | Update prop name in all test renders |
| `l2ConfidenceMin` -> `confidenceMin` prop on ConfidenceBadge | `FindingListItem.test.tsx`, `FindingListItem.story34.test.tsx` | Update prop passed to ConfidenceBadge |
| `deriveScoreBadgeState` adding calculating->analyzing | `ReviewPageClient.test.tsx`, `.story33.test.tsx`, `.story34.test.tsx` | Verify no test asserts old behavior for calculating status |

**Implementation checklist must include:** "After refactor, run ALL existing tests in affected files before writing new tests."

---

## Step 4C: Aggregation — TDD Red Phase Results

### TDD Red Phase Validation

| Check | Result |
|-------|--------|
| All unit tests use `it.skip()` | PASS (64/64) |
| All E2E tests use `test.skip()` | PASS (5/5) |
| No placeholder assertions (`expect(true).toBe(true)`) | PASS (0 found) |
| All tests assert expected behavior | PASS |
| Stub implementation files created (prevent Vite transform errors) | PASS (3 files) |

### Test File Inventory

#### Unit Tests (Vitest) — 64 `it.skip()` stubs across 8 files

| # | File | Stubs | ACs Covered | Priority |
|---|------|-------|-------------|----------|
| 1 | `src/features/review/actions/approveFile.action.test.ts` | 15 | AC5 | P0 |
| 2 | `src/features/scoring/autoPassChecker.story35.test.ts` | 8 | AC6, AC12 | P0 |
| 3 | `src/features/scoring/helpers/scoreFile.story35.test.ts` | 2 | AC6 | P0 |
| 4 | `src/features/review/components/AutoPassRationale.test.tsx` | 5 | AC6 | P0-P1 |
| 5 | `src/features/review/components/ReviewPageClient.story35.test.tsx` | 11 | AC1-AC4 | P0-P1 |
| 6 | `src/features/review/components/ConfidenceBadge.story35.test.tsx` | 11 | AC7, AC12 | P0-P1 |
| 7 | `src/features/review/components/FindingListItem.story35.test.tsx` | 7 | AC8, AC9, AC11 | P0-P1 |
| 8 | `src/features/review/hooks/use-threshold-subscription.test.ts` | 5 | AC10 | P0-P2 |

#### E2E Tests (Playwright) — 5 `test.skip()` stubs in 1 file

| # | File | Stubs | ACs Covered | Priority |
|---|------|-------|-------------|----------|
| 9 | `e2e/score-lifecycle.spec.ts` | 5 | AC1, AC3, AC5, AC6, AC7 | P0-P1 |

#### Stub Implementation Files (prevent import errors)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/features/review/actions/approveFile.action.ts` | Server action stub |
| 2 | `src/features/review/components/AutoPassRationale.tsx` | Component stub |
| 3 | `src/features/review/hooks/use-threshold-subscription.ts` | Hook stub |

### Acceptance Criteria Coverage Matrix

| AC | Description | Unit Tests | E2E Tests | Coverage |
|----|-------------|-----------|-----------|----------|
| AC1 | Score calculating state | ReviewPageClient.story35 (1) | score-lifecycle (1) | Full |
| AC2 | L1 score + AI pending | ReviewPageClient.story35 (1) | — | Unit |
| AC3 | Layer completion transitions | ReviewPageClient.story35 (2) | score-lifecycle (1) | Full |
| AC4 | Finding change recalc | ReviewPageClient.story35 (1) | — | Unit |
| AC5 | Approve gate server-side | approveFile.action (15) | score-lifecycle (1) | Full |
| AC6 | Auto-pass rationale | autoPassChecker.story35 (8) + scoreFile.story35 (2) + AutoPassRationale (5) | score-lifecycle (1) | Full |
| AC7 | Confidence inline | ConfidenceBadge.story35 (11) | score-lifecycle (1) | Full |
| AC8 | Confidence expanded | FindingListItem.story35 (1) | — | Unit |
| AC9 | Thresholds from config | FindingListItem.story35 (2) | — | Unit |
| AC10 | Threshold change handling | use-threshold-subscription (5) | — | Unit |
| AC11 | Fallback model warning | FindingListItem.story35 (1) | — | Unit |
| AC12 | Boundary values | ConfidenceBadge.story35 (4) + autoPassChecker.story35 (3) | — | Unit |

**Result: 12/12 ACs covered (100%)**

### Failure Mode Coverage

| Priority | FM Count | Tests Covering | Coverage |
|----------|----------|---------------|----------|
| P0 | 16 | 16/16 | 100% |
| P1 | 15 | 15/15 | 100% |
| P2 | 4 | 3/4 | 75% |
| P3 | 1 | 0/1 | 0% (by design) |

### Security Hardening Tests (Red Team)

| ID | Test | File | Status |
|----|------|------|--------|
| RT-2 | Cross-project fileId → error | approveFile.action.test.ts | Stub ready |
| RT-2 | Cross-tenant fileId → SCORE_NOT_FOUND | approveFile.action.test.ts | Stub ready |
| RT-1 | SCORE_STALE response handling | ReviewPageClient.story35.test.tsx | Stub ready |
| RT-5 | confidenceMin=0 / confidenceMin=100 extremes | ConfidenceBadge.story35.test.tsx | Stub ready |

### Factory Requirements (Green Phase)

| Factory | Status | Action |
|---------|--------|--------|
| `buildFinding({ aiConfidence, detectedByLayer })` | Exists | Verify override works |
| `buildScore()` | **Missing** | Create in `src/test/factories.ts` |
| `buildAutoPassRationale()` | **Missing** | Create helper for structured JSON |
| `seedFileWithScore()` | Created | In `e2e/score-lifecycle.spec.ts` |
| `seedFindingsWithConfidence()` | Created | In `e2e/score-lifecycle.spec.ts` |

### Summary Statistics

```
TDD Phase:           RED (all tests skipped)
Total Test Stubs:    69 (64 unit + 5 E2E)
Test Files:          9 (8 unit + 1 E2E)
Stub Impl Files:     3
ACs Covered:         12/12 (100%)
P0 FMs Covered:      16/16 (100%)
P1 FMs Covered:      15/15 (100%)
Security Tests:      4 (RT-2, RT-1, RT-5)
Placeholder Asserts: 0 (clean)
Subprocess Mode:     PARALLEL (Unit + E2E)
```

### Implementation Guidance

**Server Actions to implement:**
- `approveFile.action.ts` — score status gate with 6 rejection cases + cross-project guard

**Scoring enhancements:**
- `autoPassChecker.ts` — structured `AutoPassRationale` return (severityCounts, riskiestFinding, margin, criteria)
- `scoreFile.ts` — expanded findings SELECT, pass summary to checkAutoPass

**New Components:**
- `AutoPassRationale.tsx` — structured rationale display with JSON parse fallback

**Component Modifications:**
- `ReviewPageClient.tsx` — deriveScoreBadgeState fix, Approve button gate, recalculating dim/highlight
- `ConfidenceBadge.tsx` — prop refactor `l2ConfidenceMin` → `confidenceMin`, boundary color logic
- `FindingListItem.tsx` — L2/L3 threshold dispatch, confidence tooltip, fallback+confidence co-exist

**New Hooks:**
- `use-threshold-subscription.ts` — Supabase Realtime subscription with polling fallback, debounced toast

**E2E Seed Helpers:**
- `seedFileWithScore()` — PostgREST insert file + score
- `seedFindingsWithConfidence()` — PostgREST insert findings with aiConfidence

### Running Tests

```bash
# Unit tests (all Story 3.5 — will show 64 skipped)
npx vitest run src/features/review/actions/approveFile.action.test.ts
npx vitest run src/features/scoring/autoPassChecker.story35.test.ts
npx vitest run src/features/scoring/helpers/scoreFile.story35.test.ts
npx vitest run src/features/review/components/AutoPassRationale.test.tsx
npx vitest run src/features/review/components/ReviewPageClient.story35.test.tsx
npx vitest run src/features/review/components/ConfidenceBadge.story35.test.tsx
npx vitest run src/features/review/components/FindingListItem.story35.test.tsx
npx vitest run src/features/review/hooks/use-threshold-subscription.test.ts

# E2E tests (will show 5 skipped)
npx playwright test e2e/score-lifecycle.spec.ts

# All at once (unit only)
npx vitest run --reporter=verbose 2>&1 | grep -E "skip|SKIP"
```

### Next Steps (TDD Green Phase)

After implementing the feature:
1. Remove `it.skip()` / `test.skip()` from all test files
2. Create missing factories (`buildScore`, `buildAutoPassRationale`) in `src/test/factories.ts`
3. Run tests: `npx vitest run` + `npx playwright test e2e/score-lifecycle.spec.ts`
4. Verify tests PASS (green phase)
5. Run existing test regression check on affected files (Guardrail: ConfidenceBadge, FindingListItem, ReviewPageClient)
6. Commit passing tests

---

## Step 5: Validation & Completion Summary

### Validation Result: PASS

All 8 validation checks passed — no gaps found.

### ATDD Completion Report

| Metric | Value |
|--------|-------|
| Story | 3.5 — Score Lifecycle & Confidence Display |
| ATDD Date | 2026-03-08 |
| Test Files Created | 9 (8 unit + 1 E2E) |
| Test Stubs | 69 (64 `it.skip()` + 5 `test.skip()`) |
| Stub Impl Files | 3 (prevent Vite transform errors) |
| AC Coverage | 12/12 (100%) |
| P0 FM Coverage | 16/16 (100%) |
| P1 FM Coverage | 15/15 (100%) |
| Security Tests (Red Team) | 4 stubs (RT-1, RT-2, RT-5) |
| Pre-mortem Gaps Addressed | 8/8 |
| Checklist Path | `_bmad-output/test-artifacts/atdd-checklist-3-5.md` |

### Key Risks & Assumptions

1. **RT-2 Cross-Project Guard (P0)** — `approveFile.action.ts` MUST include `eq(scores.projectId, projectId)` in addition to `withTenant()`. Missing this = Guardrail #14 violation.
2. **ConfidenceBadge Prop Rename Regression** — Changing `l2ConfidenceMin` → `confidenceMin` will break 3+ existing test files. Run regression BEFORE writing new tests.
3. **buildScore() Factory Missing** — Must create before running approveFile.action.test.ts (green phase).
4. **E2E Seed Helpers** — `seedFileWithScore()` and `seedFindingsWithConfidence()` are defined in spec file. Consider extracting to `e2e/helpers/pipeline-admin.ts` during implementation if reused.

### Recommended Next Workflow

1. **Complete Story 3.4** (currently `in-progress`) — merge and move to `done`
2. **Run `dev-story` for Story 3.5** — ATDD checklist is ready, dev can start implementation
3. Implementation order: Tasks 1-3 (backend: approveFile, autoPassChecker, scoreFile) → Tasks 4-7 (UI: components + hooks) → Tasks 8-9 (E2E + regression)
4. After implementation: **remove `it.skip()` / `test.skip()`**, run all 69 tests → green phase
5. Pre-CR: run 3 agents (anti-pattern-detector, tenant-isolation-checker, code-quality-analyzer)
6. Submit to **code-review**

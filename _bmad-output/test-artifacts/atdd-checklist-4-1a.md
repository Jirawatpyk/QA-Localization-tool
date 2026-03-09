---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-09'
---

# ATDD Checklist - Epic 4, Story 4.1a: Finding List Display & Progressive Disclosure

**Date:** 2026-03-09
**Author:** Mona
**Primary Test Level:** Unit (Vitest + RTL)

---

## Story Summary

Story 4.1a refactors the finding list display into a progressive disclosure pattern with severity-based grouping. Critical findings auto-expand, Major findings show as compact rows, and Minor findings collapse under an accordion. The ReviewProgress component gets a dual-track redesign (review count + AI status).

**As a** QA Reviewer
**I want** to see findings organized by severity with critical issues expanded first
**So that** I can focus on the most important issues first

---

## Acceptance Criteria

1. **AC1: Severity-Sorted Finding List with Progressive Disclosure** — Findings sorted Critical→Major→Minor, Critical auto-expanded, Major compact, Minor in accordion, within-group sort by confidence descending
2. **AC2: FindingCardCompact Scanning Format** — Dense single-row with severity icon, category, layer badge, preview, confidence, disabled quick actions, roving tabindex
3. **AC3: Progressive Loading with Dual-Track ReviewProgress** — L1 findings immediate, dual-track progress (Reviewed X/N + AI status), Realtime insertion, screen reader announce
4. **AC4: Accessibility — Severity Display & Contrast** — Icon+text+color (never color alone), aria-hidden icons, WCAG AA contrast, lang attributes, CJK font scale

---

## Generation Mode

**Mode:** AI Generation
**Rationale:** Clear ACs, standard UI component patterns (rendering, ARIA, expand/collapse), no live browser recording needed. All tests are Unit (RTL).

---

## Test Strategy

### AC1: Severity-Sorted Finding List with Progressive Disclosure

| ID | Scenario | Level | Priority | Red Phase Failure |
|----|----------|-------|----------|-------------------|
| T1.1 | Findings sorted Critical→Major→Minor | Unit | P0 | FindingCard/Compact components don't exist |
| T1.2 | Critical findings auto-expanded (`aria-expanded="true"`) | Unit | P0 | FindingCard not rendered for critical |
| T1.3 | Critical auto-expand is visual only, NOT auto-focus (G#40) | Unit | P1 | `document.activeElement` check |
| T1.4 | Major findings render as collapsed FindingCardCompact | Unit | P1 | FindingCardCompact doesn't exist |
| T1.5 | Minor findings under accordion "Minor (N)" | Unit | P1 | Accordion not mounted |
| T1.6 | Within-group sort by confidence descending | Unit | P1 | Sort logic not implemented |
| T1.7 | L1 findings (no confidence) sorted after AI findings | Unit | P1 | Sort comparator missing null handling |
| T1.8 | Click on compact → expand to FindingCard inline | Unit | P1 | No toggle handler |
| T1.9 | Enter key on focused compact → toggle expand | Unit | P1 | No keyboard handler |
| T1.10 | Esc on expanded → collapse back (G#31) | Unit | P1 | No Esc handler |
| T1.11 | `role="rowgroup"` around each severity section | Unit | P1 | ARIA roles not set |
| T1.12 | New Critical from Realtime → auto-added to expandedIds | Unit | P0 | expandedIds only pre-populated on mount *(Pre-mortem #1)* |
| T1.13 | Empty findings → empty state message, no severity groups rendered | Unit | P1 | Empty state not handled *(Red Team #1)* |
| T1.14 | All-same-severity → single rowgroup, no empty accordion/sections | Unit | P1 | Assumes mixed severities *(Red Team #2)* |

### AC2: FindingCardCompact Scanning Format

| ID | Scenario | Level | Priority | Red Phase Failure |
|----|----------|-------|----------|-------------------|
| T2.1 | Dense row: severity icon + category + layer badge + preview + confidence + actions | Unit | P0 | Component doesn't exist |
| T2.2 | Quick action icons disabled (50% opacity, cursor-not-allowed) | Unit | P1 | Icons not rendered or not disabled |
| T2.3 | Roving tabindex: active row `tabIndex=0`, others `-1` | Unit | P1 | tabIndex not set |
| T2.4 | Focus indicator: outline 2px primary, offset 4px (G#27) | Unit | P1 | CSS not applied |
| T2.5 | L3 markers `[L3 Confirmed]`/`[L3 Disagrees]` badges | Unit | P1 | Badges not rendered |
| T2.6 | Fallback model badge when aiModel differs | Unit | P2 | Badge not shown |
| T2.7 | `aria-expanded` toggles on expand/collapse | Unit | P1 | Attribute not set |
| T2.8 | `lang` on source/target preview spans = specific BCP-47 value (G#39) | Unit | P1 | lang attr missing or empty *(Pre-mortem #6)* |
| T2.9 | Confidence hidden for L1 findings | Unit | P1 | Still showing for L1 |
| T2.10 | Click on disabled action icon → does NOT trigger row expand | Unit | P1 | Event propagation not stopped *(Red Team #5)* |

### AC3: Progressive Loading with Dual-Track ReviewProgress

| ID | Scenario | Level | Priority | Red Phase Failure |
|----|----------|-------|----------|-------------------|
| T3.1 | Dual-track shows "Reviewed: X/N" + "AI: status" | Unit | P0 | ReviewProgress not redesigned |
| T3.2 | State: Active — both tracks updating | Unit | P1 | State rendering missing |
| T3.3 | State: AI Complete — track 2 = 100% | Unit | P1 | State logic missing |
| T3.4 | State: Review Complete — track 1 = 100% | Unit | P1 | State logic missing |
| T3.5 | State: All Done — both = 100% | Unit | P1 | State logic missing |
| T3.6 | "Processing L2..."/"Processing L3..." labels | Unit | P1 | Labels not shown |
| T3.7 | Animations respect `prefers-reduced-motion` (G#37) | Unit | P1 | Animation not gated |
| T3.8 | `role="progressbar"` + aria-valuenow/min/max | Unit | P1 | ARIA attrs missing |
| T3.9 | announce() called with "N new AI findings added" | Unit | P1 | announce not called |
| T3.10 | New finding `isNew={true}` → fade-in animation | Unit | P2 | Animation class missing |
| T3.11 | Accordion open + new minor via Realtime → accordion stays open + count updates | Unit | P1 | Accordion state reset on re-render *(Red Team #4)* |
| T3.12 | fileStatus=`l2_failed` → AI track shows error indicator | Unit | P1 | Error state not rendered *(Red Team #8)* |

> **Note (Pre-mortem #4):** Existing `ReviewProgress.test.tsx` (9 tests) assert `layer-status-L1/L2/L3` data-testid which will no longer exist after dual-track redesign. These 9 tests must be **rewritten**, not just supplemented.

### AC4: Accessibility — Severity Display & Contrast

| ID | Scenario | Level | Priority | Red Phase Failure |
|----|----------|-------|----------|-------------------|
| T4.1 | Critical: XCircle icon + "Critical" text + red color | Unit | P0 | Icon/text/color mismatch |
| T4.2 | Major: AlertTriangle + "Major" + orange | Unit | P0 | Icon/text/color mismatch |
| T4.3 | Minor: Info + "Minor" + blue | Unit | P0 | Icon/text/color mismatch |
| T4.4 | All severity icons `aria-hidden="true"` (G#36) | Unit | P0 | aria-hidden missing |
| T4.5 | Source/target text have `lang` attr from file metadata (G#39) | Unit | P1 | lang attr missing |
| T4.6 | CJK containers apply 1.1x font scale | Unit | P2 | Scale class missing |

### TD-TENANT-003: tenantId Filter

| ID | Scenario | Level | Priority | Red Phase Failure |
|----|----------|-------|----------|-------------------|
| T5.1 | `useFindingsSubscription(fileId, tenantId)` includes tenant_id in filter | Unit | P0 | Hook signature missing tenantId |
| T5.2 | `useScoreSubscription(fileId, tenantId)` includes tenant_id in filter | Unit | P0 | Hook signature missing tenantId |
| T5.3 | Polling fallback query includes `.eq('tenant_id', tenantId)` | Unit | P0 | Filter missing in fallback *(Upgraded from P1 — Pre-mortem #3: security)* |

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY)

| AC | Boundary | At | Below | Above | Zero/Empty |
|----|----------|----|----- -|-------|------------|
| AC2.1 | Category truncation >20 chars | `"A".repeat(20)` → no truncate | `"A".repeat(19)` → no truncate | `"A".repeat(21)` → truncated | `""` → empty |
| AC2.1 | Preview truncation 60 chars | `text.length === 60` → no "..." | `text.length === 59` → no "..." | `text.length === 61` → "..." | `""` → empty |
| AC3.2 | Reviewed count 0/N | `0/1` → 0% bar | N/A | `1/1` → 100% bar | `0/0` → 0/0 (no findings) |
| AC1.7 | Confidence sorting: null vs 0 vs 100 | `null` (L1) → after AI | `0` → lowest AI | `100` → highest AI | All null (all L1) → original order |

| ID | Test | Priority |
|----|------|----------|
| B1 | Category exactly 20 chars → no truncation | P1 |
| B2 | Category 21 chars → truncated with "..." | P1 |
| B3 | Preview exactly 60 chars → no "..." | P1 |
| B4 | Preview 61 chars → "..." appended | P1 |
| B5 | Reviewed 0/0 (no findings yet) → "Reviewed: 0/0" | P1 |
| B6 | Reviewed N/N → 100% fill + "All reviewed" | P1 |
| B7 | Confidence: all null (all L1) → maintain original order | P1 |
| B8 | Confidence: 0 vs null → 0 sorts before null | P1 |
| B9 | Minor count = minor findings only, not total (mixed 3C+5M+7m → "Minor (7)") | P1 |
| B10 | Equal confidence → stable sort (tiebreak by id or createdAt) | P1 |

---

## Test Count Summary

| Priority | Count |
|----------|-------|
| P0 | 12 |
| P1 | 35 |
| P2 | 4 |
| **Total** | **51** |

### Pre-mortem Enhancements Applied

| # | Finding | Action |
|---|---------|--------|
| PM#1 | New Critical from Realtime not auto-expanded | Added T1.12 [P0] |
| PM#2 | Accordion count includes all severities | Added B9 [P1] |
| PM#3 | Polling fallback missing tenantId = security | Upgraded T5.3 → P0 |
| PM#4 | Existing ReviewProgress tests will break | Added rewrite note |
| PM#5 | Equal confidence unstable sort | Added B10 [P1] |
| PM#6 | lang attr present but empty value | Updated T2.8 — assert specific BCP-47 value |

### Red Team vs Blue Team Enhancements Applied

| # | Attack | Result | Action |
|---|--------|--------|--------|
| RT#1 | Empty state (0 findings) | ⚠️ Gap | Added T1.13 [P1] |
| RT#2 | Single severity group | ⚠️ Gap | Added T1.14 [P1] |
| RT#3 | Realtime deletion | ✅ Defended | Out of scope (Story 4.2) |
| RT#4 | Accordion + Realtime insertion | ⚠️ Gap | Added T3.11 [P1] |
| RT#5 | Click on disabled action | ⚠️ Gap | Added T2.10 [P1] |
| RT#6 | aria-live mount order | ✅ Defended | announce() utility (4.0) |
| RT#7 | Accordion focus | ✅ Defended | 4.1b scope |
| RT#8 | AI error state | ⚠️ Gap | Added T3.12 [P1] |

### Red Phase Confirmation

All 51 tests designed to **fail before implementation** — FindingCard/FindingCardCompact don't exist, ReviewProgress not redesigned, hooks don't accept tenantId.

---

## Step 4: Generated Test Files (TDD Red Phase)

**Execution:** Parallel (2 agents) — completed 2026-03-09

### New Test Files Created

| File | Tests | ACs Covered |
|------|-------|-------------|
| `src/features/review/components/FindingList.test.tsx` | 20 skipped | AC1 (T1.1-T1.14), AC3 (T3.9, T3.11), B7-B10 |
| `src/features/review/components/FindingCardCompact.test.tsx` | 16 skipped | AC2 (T2.1-T2.10), AC3 (T3.10), B1-B4 |
| `src/features/review/components/ReviewProgress.41a.test.tsx` | 12 skipped | AC3 (T3.1-T3.8, T3.12), B5-B6 |
| `src/features/review/components/SeverityIndicator.test.tsx` | 6 skipped | AC4 (T4.1-T4.6) |

### Existing Test Files Updated (append)

| File | Added | Existing |
|------|-------|----------|
| `src/features/review/hooks/use-findings-subscription.test.ts` | +2 skipped (T5.1, T5.3) | 14 passed |
| `src/features/review/hooks/use-score-subscription.test.ts` | +1 skipped (T5.2) | 20 passed |

### RED Phase Component Stubs Created

| File | Purpose |
|------|---------|
| `src/features/review/components/FindingList.tsx` | Stub (returns null) — prevents import error |
| `src/features/review/components/FindingCardCompact.tsx` | Stub (returns null) — prevents import error |
| `src/features/review/components/SeverityIndicator.tsx` | Stub (returns null) — prevents import error |
| `src/features/review/hooks/use-announce.ts` | Stub wrapping announce() utility |

### Verification

```
Test Files:  4 skipped (4 new) + 2 passed (hooks)
Tests:       57 skipped + 34 passed (existing)
Duration:    ~17s total
Errors:      0
```

### Implementation Checklist (for Dev)

1. Implement `FindingList.tsx` → remove `vi.mock()` + `it.skip()` in `FindingList.test.tsx`
2. Implement `FindingCardCompact.tsx` → remove `vi.mock()` + `it.skip()` in `FindingCardCompact.test.tsx`
3. Redesign `ReviewProgress.tsx` → delete old `ReviewProgress.test.tsx`, rename `ReviewProgress.41a.test.tsx` → `ReviewProgress.test.tsx`, remove `it.skip()`
4. Implement `SeverityIndicator.tsx` → remove `vi.mock()` + `it.skip()` in `SeverityIndicator.test.tsx`
5. Add `tenantId` param to `useFindingsSubscription` + `useScoreSubscription` → remove `it.skip()` from hook tests

---

## Step 5: Validation & Completion

**Validated:** 2026-03-09

### Validation Results

| Check | Status |
|-------|--------|
| Steps 1-4 completed | ✅ |
| All test files created + verified | ✅ 57 skipped, 34 passed, 0 errors |
| AC1 coverage (14 + 4 boundary) | ✅ FindingList.test.tsx |
| AC2 coverage (10 + 4 boundary) | ✅ FindingCardCompact.test.tsx |
| AC3 coverage (12 + 2 boundary) | ✅ ReviewProgress.41a.test.tsx + FindingList.test.tsx |
| AC4 coverage (6 tests) | ✅ SeverityIndicator.test.tsx |
| TD-TENANT-003 (3 tests) | ✅ Hook test files (appended) |
| All it.skip() — red phase | ✅ |
| No orphaned sessions | ✅ (unit tests only) |

### Key Risks & Assumptions

1. **ReviewProgress rewrite** — Old 9 tests (layer-status) must be deleted when dual-track is implemented. `ReviewProgress.41a.test.tsx` replaces them
2. **Component stubs** — 3 stub files created for import resolution. Dev must replace with real implementation
3. **Boundary test overlap** — Some boundary tests (B7-B8) overlap with AC1 tests (T1.6-T1.7) but test different edge values
4. **Hook signature change** — Adding `tenantId` to hooks is a breaking change — verify all call sites

---

## GREEN Phase Results (Implementation — 2026-03-09)

### Implementation Summary

All 6 ATDD test files activated (removed `it.skip()` and `vi.mock()` stubs). Component implementations created for FindingList, FindingCardCompact, SeverityIndicator, and ReviewProgress (dual-track redesign). TD-TENANT-003 resolved by threading tenantId through subscription hooks.

### Test Activation Results

| File | Tests | Status |
|------|-------|--------|
| `SeverityIndicator.test.tsx` | 6/6 | ✅ GREEN |
| `FindingCardCompact.test.tsx` | 16/16 | ✅ GREEN |
| `FindingList.test.tsx` | 20/20 | ✅ GREEN |
| `ReviewProgress.test.tsx` (renamed from .41a) | 12/12 | ✅ GREEN |
| `use-findings-subscription.test.ts` (+T5.1, T5.3) | 16/16 | ✅ GREEN |
| `use-score-subscription.test.ts` (+T5.2) | 21/21 | ✅ GREEN |

**Total 4.1a ATDD tests:** 54 activated + passing (51 new + 3 hook appends)
**Regression tests (pre-existing):** 271 passing (325 total in review feature)

### Regressions Fixed

| File | Issue | Fix |
|------|-------|-----|
| `ScoreBadge.boundary.test.tsx` | Old ReviewProgress API (layerCompleted prop) | Updated to dual-track API |
| `ReviewPageClient.story33.test.tsx` | Missing tenantId prop + store fields | Added tenantId, selectedId, setSelectedFinding |
| `ReviewPageClient.story34.test.tsx` | Missing tenantId prop (9 render calls) | Added VALID_TENANT_ID to all |
| `ReviewPageClient.story35.test.tsx` | Missing tenantId in buildInitialData + old testid | Added tenantId, changed finding-list-item → finding-compact-row |
| `ReviewPageClient.story40.test.tsx` | Missing tenantId, hook args change, expand pattern | Added tenantId, updated subscription assertions, row click |
| `ReviewPageClient.test.tsx` | Missing tenantId in buildInitialData | Added tenantId |
| `FindingList.tsx` | React hooks rule violation (useState after early return) | Moved all hooks above early return |

### Quality Gates

| Gate | Status |
|------|--------|
| All P0+P1 ATDD tests pass | ✅ 47/47 |
| All P2 tests pass | ✅ 4/4 |
| Type-check (tsc --noEmit) | ✅ |
| Lint (0 errors in new files) | ✅ |
| Full review feature suite (33 files, 325 tests) | ✅ |
| Pre-CR scan (3 agents) | ✅ 0C/0H — H1-H3 fixed, M1 fixed |

---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-29'
workflowType: 'testarch-atdd'
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-3-verification-integration.md'
  - 'src/features/bridge/actions/getBackTranslation.action.ts'
  - 'src/features/review/components/ReviewPageClient.tsx'
  - 'src/features/review/hooks/use-focus-management.ts'
  - 'src/features/review/components/FindingList.tsx'
  - 'scripts/generate-verification-data.mjs'
  - 'e2e/review-responsive.spec.ts'
  - 'e2e/review-actions.spec.ts'
  - 'e2e/helpers/review-page.ts'
  - 'e2e/helpers/pipeline-admin.ts'
  - 'e2e/helpers/supabase-admin.ts'
---

# ATDD Checklist - Epic 5, Story 5.3: Verification & Integration

**Date:** 2026-03-29
**Author:** Mona (TEA: Murat)
**Primary Test Level:** Unit (Vitest) + E2E (Playwright)

---

## Story Summary

Epic 5 verification story — end-to-end validation with real AI, real DB, real Realtime, real E2E tests. Resolves 7 tech debt items deferred from previous stories.

**As a** QA lead
**I want** end-to-end verification of the entire Epic 5 with real infrastructure + resolution of all deferred tech debt
**So that** I can confirm the epic is production-ready with no hidden bugs

---

## Acceptance Criteria

1. **AC1:** End-to-end Epic 5 integration flow (real AI + real DB) — 8-step serial test
2. **AC2:** BT context segments wired (TD-BT-001) — adjacent segments +/- 2
3. **AC3:** Responsive E2E tests unskipped (TD-E2E-017) — 28 tests activated
4. **AC4:** Sheet focus lifecycle fix (TD-E2E-018) — aria-hidden no longer blocks focus
5. **AC5:** Shift+J/K bulk selection (TD-UX-006) — keyboard-only range selection
6. **AC6:** Viewport transition selectedId sync (TD-UX-005) — store consistency
7. **AC7:** Verification data generator fix (TD-TEST-007) — 25/88 invalid annotations
8. **AC8:** Accordion glitch verification (TD-UX-004) — cosmetic 1-frame flash

---

## Failing Tests Created (RED Phase)

### Unit Tests — BT Context Segments (4 tests)

**File 1:** `src/features/bridge/actions/getBackTranslation.context.test.ts`
- ✅ 4 tests | Status: RED (all `it.skip`)
- Verifies: AC2 — adjacent query +/- 2, withTenant, first-segment boundary, single-segment boundary

| Test | Priority | AC | Verifies |
|------|----------|-----|----------|
| should query adjacent segments and pass to buildBTPrompt | P1 | AC2 | Middle segment → 4 context segments |
| should use withTenant on adjacent segments query | P1 | AC2 | Guardrail #1 tenant isolation |
| should return only 2 following when segment #1 | P1 | AC2 | Boundary: first segment |
| should pass empty contextSegments for single-segment file | P1 | AC2 | Boundary: single-segment |

### Unit Tests — Sheet Focus, Shift+J/K, Viewport Sync (8 tests)

**File 2:** `src/features/review/components/ReviewPageClient.story53.test.tsx`
- ✅ 8 tests | Status: RED (all `it.skip`)
- Verifies: AC4, AC5, AC6

| Test | Priority | AC | Verifies |
|------|----------|-----|----------|
| autoAdvance returns null when no pending | P0 | AC4 | Sheet close trigger |
| focus action bar via rAF when null | P0 | AC4 | Focus restoration |
| Shift+J extends selection down | P1 | AC5 | selectRange call |
| Shift+K extends selection up | P1 | AC5 | selectRange call |
| Shift+J at last finding → no-op | P1 | AC5 | Boundary: end of list |
| Shift+J/K suppressed in input | P1 | AC5 | Guardrail #28 |
| Desktop→mobile preserves selectedId | P1 | AC6 | Store sync |
| Mobile→desktop preserves selectedId | P1 | AC6 | Store sync |

### Unit Tests — Verification Data Generator (4 tests)

**File 3:** `scripts/generate-verification-data.test.mjs`
- ✅ 4 tests | Status: RED (all `describe.skip`)
- Verifies: AC7

| Test | Priority | AC | Verifies |
|------|----------|-----|----------|
| number_mismatch requires {0}, {1} | P1 | AC7 | Template validation bug #1 |
| placeholder_mismatch requires %s, {name} | P1 | AC7 | Template validation bug #2 |
| glossary_violation requires glossary terms | P1 | AC7 | Template validation bug #3 |
| Template with 0 placeholders → non-template errors only | P1 | AC7 | Boundary |

### Unit Tests — Accordion Glitch (1 test)

**File 4:** `src/features/review/components/FindingList.accordion.test.tsx`
- ✅ 1 test | Status: RED (`it.skip`)
- Verifies: AC8

| Test | Priority | AC | Verifies |
|------|----------|-----|----------|
| No flash when minor finding targeted with collapsed accordion | P2 | AC8 | Cosmetic verify |

### E2E Tests — Epic 5 Integration (10 tests)

**File 5:** `e2e/epic5-integration.spec.ts`
- ✅ 10 tests | Status: RED (all `test.skip`)
- Verifies: AC1 — full 8-step flow + 2 verification assertions

| Test | Priority | AC | Verifies |
|------|----------|-----|----------|
| Step 1: Upload Thai→English SDLXLIFF | P0 | AC1 | File upload + pipeline trigger |
| Step 2: Pipeline produces findings | P0 | AC1 | findingCount > 0 (Guardrail #47) |
| Step 3: Non-native sees BT panel | P0 | AC1 | LanguageBridge real AI BT |
| Step 4: Accept → non_native tag | P0 | AC1 | Auto-tag metadata |
| Step 5: Flag for native → assignment | P0 | AC1 | Assignment created |
| Step 6: Native scoped view (RLS) | P0 | AC1 | RLS enforcement |
| Step 7: Native confirms → notification | P0 | AC1 | Status + notification |
| Step 8: Score recalculates | P0 | AC1 | MQM score update |
| Verify: BT cache has rows | P0 | AC1 | Cache populated |
| Verify: Audit logs complete | P0 | AC1 | Audit trail defense |

### E2E Tests — Modified/Unskipped (29 existing)

**File 6:** `e2e/review-responsive.spec.ts` — 28 `test.skip()` to remove + selector updates
**File 7:** `e2e/review-actions.spec.ts` — 1 assertion to strengthen (E-B1: `toBeFocused()`)

---

## Boundary Value Tests

| AC | Boundary | Value | Test |
|----|----------|-------|------|
| AC2 | segmentNumber = 1 (first) | Only 2 following segments | getBackTranslation.context.test.ts |
| AC2 | Single-segment file | Empty context array | getBackTranslation.context.test.ts |
| AC5 | Shift+J at last finding | No-op (idx === length-1) | ReviewPageClient.story53.test.tsx |
| AC7 | Template with 0 placeholders | Only non-template errors | generate-verification-data.test.mjs |

---

## Test Count Summary

| Category | Count | Files |
|----------|-------|-------|
| Unit tests (NEW, `it.skip`) | 17 | 4 files |
| E2E tests (NEW, `test.skip`) | 10 | 1 file |
| E2E tests (UNSKIP existing) | 28 | 1 file |
| E2E tests (STRENGTHEN) | 1 | 1 file |
| **Total new test stubs** | **27** | **5 files** |
| **Total modified** | **29** | **2 files** |

---

## Priority Coverage

| Priority | Unit | E2E | Total |
|----------|------|-----|-------|
| P0 | 2 | 10 | 12 |
| P1 | 14 | 0 | 14 |
| P2 | 1 | 0 | 1 |
| **Total** | **17** | **10** | **27** |

---

## Required data-testid Attributes

### Review Page (already exist)
- `review-3-zone` — 3-zone layout container
- `language-bridge-panel` — LanguageBridge BT sidebar
- `review-action-bar` — Action toolbar

### Upload Page (AC1 E2E)
- `upload-tab` — Upload tab in project page

### Review Grid (already exist)
- `[role="grid"]` — Finding list grid
- `[role="row"]` — Finding row
- `[data-status]` — Finding status attribute
- `[data-finding-id]` — Finding ID attribute

---

## Implementation Checklist

### Task 1: BT Context Segments (AC2) — 4 tests

**File:** `src/features/bridge/actions/getBackTranslation.context.test.ts`

**Tasks to make tests pass:**
- [ ] In `getBackTranslation.action.ts` (line ~153): add adjacent segments query using `between(segments.segmentNumber, seg.segmentNumber - 2, seg.segmentNumber + 2)` + `ne(segments.segmentNumber, seg.segmentNumber)`
- [ ] Add `withTenant()` to adjacent query (Guardrail #1)
- [ ] Pass `contextSegments` array to `buildBTPrompt()` (replace `[]`)
- [ ] Handle edge cases: first/last segment, single-segment file
- [ ] Remove TODO comment: `// TODO(TD-BT-001): wire surrounding context segments`
- [ ] Run test: `npx vitest run src/features/bridge/actions/getBackTranslation.context.test.ts`
- [ ] ✅ 4 tests pass (green phase)

**Estimated Effort:** 1-2 hours

---

### Task 2: Shift+J/K Bulk Selection (AC5) — 4 tests

**File:** `src/features/review/components/ReviewPageClient.story53.test.tsx`

**Tasks to make tests pass:**
- [ ] In `ReviewPageClient.tsx` → `handleReviewZoneKeyDown`: add Shift+J and Shift+K handlers
- [ ] **WARNING:** Add to grid `onKeyDown` handler, NOT `use-keyboard-actions.ts` registry (double-fire risk per FindingList.tsx:282-284)
- [ ] Shift+J: get current `activeFindingIdRef.current`, compute next from store `sortedFindingIds`, call `selectRange(currentId, nextId)`
- [ ] Shift+K: same but previous finding
- [ ] Boundary: no-op when at first/last finding
- [ ] Input guard same as existing j/k: `['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)`
- [ ] Update `KeyboardCheatSheet.tsx`: add Shift+J/K entries
- [ ] Run test: `npx vitest run src/features/review/components/ReviewPageClient.story53.test.tsx`
- [ ] ✅ 4 AC5 tests pass

**Estimated Effort:** 2-3 hours

---

### Task 3: Sheet Focus Lifecycle (AC4) — 2 tests + 1 E2E strengthen

**File:** `src/features/review/components/ReviewPageClient.story53.test.tsx` + `e2e/review-actions.spec.ts`

**Tasks to make tests pass:**
- [ ] In `ReviewPageClient.tsx` at autoAdvance call site: when `autoAdvance()` returns `null`, call `setSelectedId(null)` + `setMobileDrawerOpen(false)` BEFORE `requestAnimationFrame` focus
- [ ] **WARNING:** `useFocusManagement()` takes ZERO params — do NOT modify its signature
- [ ] Sheet derives from `selectedId !== null` — setting null closes it → removes `aria-hidden`
- [ ] In `e2e/review-actions.spec.ts` E-B1 (line ~596): change `toHaveAttribute('tabindex', '0')` → `toBeFocused()`
- [ ] Run unit: `npx vitest run src/features/review/components/ReviewPageClient.story53.test.tsx`
- [ ] Run E2E: `npx dotenv-cli -e .env.local -- npx playwright test e2e/review-actions.spec.ts`
- [ ] ✅ 2 AC4 unit tests pass + E-B1 strengthened

**Estimated Effort:** 1-2 hours

---

### Task 4: Viewport Transition Sync (AC6) — 2 tests

**File:** `src/features/review/components/ReviewPageClient.story53.test.tsx`

**Tasks to make tests pass:**
- [ ] In `ReviewPageClient.tsx`: sync `selectedId` when layout mode changes (desktop ↔ mobile)
- [ ] Guard: if `selectedId` is null, don't force-open Sheet
- [ ] Run test: `npx vitest run src/features/review/components/ReviewPageClient.story53.test.tsx`
- [ ] ✅ 2 AC6 tests pass

**Estimated Effort:** 1 hour

---

### Task 5: Verification Data Generator (AC7) — 4 tests

**File:** `scripts/generate-verification-data.test.mjs`

**Tasks to make tests pass:**
- [ ] In `scripts/generate-verification-data.mjs`: extract validation functions for testability
- [ ] Fix bug 1: `number_mismatch` only when template contains `{0}`, `{1}`, etc.
- [ ] Fix bug 2: `placeholder_mismatch` only when template contains `%s`, `{name}`, `{{var}}`
- [ ] Fix bug 3: `glossary_violation` only when template source contains glossary term
- [ ] Regenerate `docs/test-data/verification-baseline/baseline-annotations.json`
- [ ] Verify 0 invalid annotations
- [ ] Run test: `npx vitest run scripts/generate-verification-data.test.mjs`
- [ ] ✅ 4 tests pass

**Estimated Effort:** 1-2 hours

---

### Task 6: Unskip Responsive E2E (AC3) — 28 tests

**File:** `e2e/review-responsive.spec.ts`

**Tasks to make tests pass:**
- [ ] Remove 28 per-test `test.skip()` calls
- [ ] Keep suite-level skip guard (`test.skip(!process.env.INNGEST_DEV_URL)`)
- [ ] Update stale selectors for post-5.1/5.2c layout:
  - `[data-testid="finding-detail-aside"]` → verify coexistence with LanguageBridge sidebar
  - `page.locator('nav').first()` → disambiguate
  - Add LanguageBridge sidebar visibility assertions
  - Add native reviewer UI element assertions (5.2c)
- [ ] Verify 3 existing active BT-R tests still pass
- [ ] Run: `npx dotenv-cli -e .env.local -- npx playwright test e2e/review-responsive.spec.ts`
- [ ] ✅ All 28+ tests GREEN
- [ ] Any genuinely failing → new TD entry (not re-skip without ref)

**Estimated Effort:** 3-4 hours

---

### Task 7: Accordion Glitch Verify (AC8) — 1 test

**File:** `src/features/review/components/FindingList.accordion.test.tsx`

**Tasks to make tests pass:**
- [ ] In `FindingList.tsx` (~208-232): check if glitch is still visible
- [ ] If visible: wrap `setActiveFindingId` in `requestAnimationFrame`
- [ ] If not visible (React Compiler fixed it): document as RESOLVED
- [ ] Verify `prefers-reduced-motion` respected (Guardrail #37)
- [ ] ✅ 1 test passes (or documented as RESOLVED)

**Estimated Effort:** 0.5-1 hour

---

### Task 8: E2E Integration Test (AC1) — 10 tests

**File:** `e2e/epic5-integration.spec.ts`

**Tasks to make tests pass:**
- [ ] Ensure Thai→English SDLXLIFF test fixture exists at `e2e/fixtures/thai-en-sample.sdlxliff`
- [ ] Remove all `test.skip()` wrappers
- [ ] Verify with real AI keys + Inngest dev server running
- [ ] Run: `INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/epic5-integration.spec.ts`
- [ ] ✅ All 10 tests GREEN with real infrastructure

**Estimated Effort:** 2-3 hours (mostly waiting for AI responses)

---

### Task 9: Quality Gates (Guardrails #50, #79)

- [ ] `npm run type-check` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] `npm run test:unit` — all GREEN
- [ ] `npm run test:rls` — all GREEN (72+ tests)
- [ ] Run all Epic 5 E2E specs GREEN
- [ ] Cross-file review (`feature-dev:code-reviewer`) on: bridge, review features (Guardrail #79)
- [ ] Update 7 TD entries to RESOLVED in `tech-debt-tracker.md`

---

## Running Tests

```bash
# Run all new unit tests for this story
npx vitest run src/features/bridge/actions/getBackTranslation.context.test.ts
npx vitest run src/features/review/components/ReviewPageClient.story53.test.tsx
npx vitest run src/features/review/components/FindingList.accordion.test.tsx
npx vitest run scripts/generate-verification-data.test.mjs

# Run E2E integration test (requires infra)
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/epic5-integration.spec.ts

# Run responsive E2E (after unskipping)
npx dotenv-cli -e .env.local -- npx playwright test e2e/review-responsive.spec.ts

# Run review-actions E2E (after strengthening E-B1)
npx dotenv-cli -e .env.local -- npx playwright test e2e/review-actions.spec.ts

# Full quality gate
npm run type-check && npm run lint && npm run test:unit
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ 27 new tests written and skipped (17 unit + 10 E2E)
- ✅ 29 existing tests identified for modification (28 unskip + 1 strengthen)
- ✅ Boundary value tests included for AC2, AC5, AC7
- ✅ data-testid requirements documented
- ✅ Implementation checklist with 9 tasks created
- ✅ Priority coverage: 12 P0, 14 P1, 1 P2

**Verification:**

- All new tests are `it.skip()` / `test.skip()` — will fail until implementation
- Tests assert EXPECTED behavior, not placeholders
- Failure reasons are clear (missing implementation, not test bugs)

---

### GREEN Phase (DEV Team - Next Steps)

1. Start with **Task 1** (BT context segments) — independent, foundational for AC1 step 3
2. Then **Tasks 2-4** (keyboard/focus fixes) — can be done in parallel
3. Then **Task 5** (data generator) — independent script fix
4. Then **Task 6** (responsive unskip) — depends on Tasks 2-4 being done
5. Then **Task 7** (accordion verify) — quick, independent
6. **Task 8** (E2E integration) last — depends on all other fixes being implemented
7. **Task 9** (quality gates) final — run after all tests GREEN

---

## Notes

- **Guardrail #49:** This is the mandatory verification story for Epic 5 — no mocks for AC1 E2E
- **Guardrail #43:** E2E must PASS before story "done"
- **Guardrail #50:** Run full test suite before claiming done
- **Guardrail #79:** Cross-file review mandatory at epic close
- **AC3 (responsive):** The 28 tests were deferred since Story 4.1d — selectors WILL be stale post-5.1/5.2c
- **AC8 (accordion):** May already be resolved by React Compiler — verify and document either way

---

## Knowledge Base References Applied

- **test-quality.md** — Deterministic tests, no hard waits, explicit assertions
- **data-factories.md** — Factory patterns for test data (E2E uses existing factories)
- **test-levels-framework.md** — Unit for logic, E2E for user journeys
- **test-priorities-matrix.md** — P0 for security/data integrity, P1 for core features, P2 for cosmetic

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run --project unit src/features/bridge/actions/getBackTranslation.context.test.ts`

**Results:**
```
(pending — run after test files committed)
```

**Expected:** All 27 new tests skipped (RED phase), 0 failures, 0 passes.

---

**Generated by BMad TEA Agent (Murat)** - 2026-03-29

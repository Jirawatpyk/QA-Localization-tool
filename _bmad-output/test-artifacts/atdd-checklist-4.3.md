---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy']
lastStep: 'step-03-test-strategy'
lastSaved: '2026-03-14'
storyId: '4.3'
storyTitle: 'Extended Actions — Note, Source Issue, Severity Override & Add Finding'
generationMode: 'ai-generation'
primaryLevel: 'unit + E2E'
---

# ATDD Checklist - Epic 4, Story 4.3: Extended Actions — Note, Source Issue, Severity Override & Add Finding

**Date:** 2026-03-14
**Author:** Mona
**Primary Test Level:** Unit (Vitest) + E2E (Playwright)

---

## Story Summary

Story 4.3 adds 4 extended review actions (Note, Source Issue, Severity Override, Add Finding) plus manual finding delete. Builds on Story 4.2's accept/reject/flag infrastructure.

**As a** QA Reviewer
**I want** to mark findings as Notes, Source Issues, override severity, and manually add findings
**So that** I have full control over the review outcome with nuanced categorization beyond Accept/Reject

---

## Acceptance Criteria

1. **AC1** — Note Action (Hotkey N): Two-path behavior — Path 1: not-noted → noted + auto-advance; Path 2: already-noted → open NoteInput popover
2. **AC2** — Source Issue Action (Hotkey S): Transition to source_issue + auto-advance, no MQM penalty
3. **AC3** — Severity Override (- button): DropdownMenu with severity options + reset, feedback_events for AI training
4. **AC4** — Add Finding (+ hotkey): Dialog with segment/category/severity/description, creates Manual finding
5. **AC5** — Manual Finding Lifecycle: Delete only (no accept/reject/flag), severity override allowed
6. **AC6** — Common Behaviors: auto-save, audit, WCAG compliance, auto-advance rules

---

## Test Strategy — AC-to-Test Mapping

### AC1: Note Action

| ID | Test | Level | Priority | Fails Because |
|----|------|-------|----------|---------------|
| U-N1 | getNewState('note', 'pending') → 'noted' | Unit | P0 | `ReviewAction` type doesn't include 'note' |
| U-N2 | getNewState('note', 'accepted') → 'noted' | Unit | P0 | Same — no 'note' in transition matrix |
| U-N3 | getNewState('note', 'rejected') → 'noted' | Unit | P0 | Same |
| U-N4 | getNewState('note', 'flagged') → 'noted' | Unit | P0 | Same |
| U-N5 | getNewState('note', 'source_issue') → 'noted' | Unit | P0 | Same |
| U-N6 | getNewState('note', 'noted') → null (no-op) | Unit | P0 | Same |
| U-N7 | getNewState('note', 'manual') → null (no-op) | Unit | P0 | Same |
| U-NA1 | noteFinding action — pending → noted, review_actions created | Unit | P0 | Action file doesn't exist |
| U-NA2 | noteFinding action — finding not found → NOT_FOUND error | Unit | P1 | Action file doesn't exist |
| U-NA3 | noteFinding action — no-op on already noted | Unit | P1 | Action file doesn't exist |
| U-NA4 | noteFinding action — no-op on manual finding | Unit | P1 | Action file doesn't exist |
| U-NT1 | updateNoteText action — saves noteText to metadata | Unit | P1 | Action file doesn't exist |
| U-NT2 | updateNoteText action — guard: finding must be in noted state | Unit | P1 | Action file doesn't exist |
| U-H1 | handleNote on non-noted → executeAction('note') + autoAdvance called | Unit | P0 | Hook doesn't have handleNote |
| U-H5 | handleNote on noted → opens NoteInput (no advance, no action) | Unit | P1 | Hook doesn't have note two-path logic |
| C-NI1 | NoteInput renders text field when open | Component | P1 | Component doesn't exist |
| C-NI2 | NoteInput submits on Enter, calls onSubmit | Component | P1 | Component doesn't exist |
| C-NI3 | NoteInput dismisses on Esc, calls onDismiss | Component | P1 | Component doesn't exist |
| E-N1 | Keyboard N on pending → noted state + auto-advance | E2E | P0 | No hotkey handler wired |
| E-N2 | Keyboard N on noted → NoteInput popover opens | E2E | P1 | NoteInput doesn't exist |
| E-N3 | NoteInput: type text + Enter → note saved (verify in DB) | E2E | P1 | NoteInput doesn't exist |

### AC2: Source Issue Action

| ID | Test | Level | Priority | Fails Because |
|----|------|-------|----------|---------------|
| U-S1 | getNewState('source', 'pending') → 'source_issue' | Unit | P0 | 'source' not in ReviewAction type |
| U-S2 | getNewState('source', 'accepted') → 'source_issue' | Unit | P0 | Same |
| U-S3 | getNewState('source', 'rejected') → 'source_issue' | Unit | P0 | Same |
| U-S4 | getNewState('source', 'noted') → 'source_issue' | Unit | P0 | Same |
| U-S5 | getNewState('source', 'source_issue') → null (no-op) | Unit | P0 | Same |
| U-S6 | getNewState('source', 'manual') → null (no-op) | Unit | P0 | Same |
| U-SA1 | sourceIssueFinding action — happy path + review_actions | Unit | P0 | Action file doesn't exist |
| U-SA2 | sourceIssueFinding — finding not found → NOT_FOUND | Unit | P1 | Action file doesn't exist |
| U-SA3 | sourceIssueFinding — no-op on already source_issue | Unit | P1 | Action file doesn't exist |
| U-H2 | handleSourceIssue calls executeAction('source') + autoAdvance | Unit | P0 | Hook doesn't have handleSourceIssue |
| E-S1 | Keyboard S on pending → source_issue state + auto-advance | E2E | P0 | No hotkey handler wired |

### AC3: Severity Override

| ID | Test | Level | Priority | Fails Because |
|----|------|-------|----------|---------------|
| U-O1 | overrideSeverity — critical → minor (sets original_severity) | Unit | P0 | Action file doesn't exist |
| U-O2 | overrideSeverity — preserves first original (double override) | Unit | P0 | Action file doesn't exist |
| U-O3 | overrideSeverity — reset to original (clears original_severity) | Unit | P1 | Action file doesn't exist |
| U-O4 | overrideSeverity — guard: can't override to same severity | Unit | P1 | Action file doesn't exist |
| U-O5 | overrideSeverity — finding not found → NOT_FOUND | Unit | P1 | Action file doesn't exist |
| U-O6 | overrideSeverity — feedback_events inserted (FR79) | Unit | P1 | Action file doesn't exist |
| U-H3 | handleOverrideSeverity opens dropdown (no auto-advance) | Unit | P1 | Hook doesn't support override |
| C-SO1 | SeverityOverrideMenu renders 3 options, disables current severity | Component | P1 | Component doesn't exist |
| C-SO2 | SeverityOverrideMenu shows "Reset to original" only when overridden | Component | P1 | Component doesn't exist |
| C-SO3 | SeverityOverrideMenu keyboard navigable (arrow keys + Enter) | Component | P2 | Component doesn't exist |
| E-O1 | `-` button → dropdown → select Minor → override badge visible + score change | E2E | P0 | Dropdown doesn't exist |
| E-O2 | Override → Reset to original → badge removed | E2E | P1 | Dropdown doesn't exist |

### AC4: Add Finding (+)

| ID | Test | Level | Priority | Fails Because |
|----|------|-------|----------|---------------|
| U-AF1 | addFinding action — creates finding with status='manual', layer='Manual' | Unit | P0 | Action file doesn't exist |
| U-AF2 | addFinding — segment not found → error | Unit | P1 | Action file doesn't exist |
| U-AF3 | addFinding — validation: description min 10 chars rejected | Unit | P1 | Action file doesn't exist |
| U-AF4 | addFinding — feedback_events inserted (FR80) | Unit | P1 | Action file doesn't exist |
| U-AF5 | addFinding — Inngest event sent for score recalculation | Unit | P1 | Action file doesn't exist |
| U-H4 | handleAddFinding opens dialog (no auto-advance) | Unit | P1 | Hook doesn't support add |
| C-AD1 | AddFindingDialog renders segment/category/severity/description fields | Component | P1 | Component doesn't exist |
| C-AD2 | AddFindingDialog submit disabled until required fields filled | Component | P1 | Component doesn't exist |
| C-AD3 | AddFindingDialog resets form on re-open (Guardrail #11) | Component | P1 | Component doesn't exist |
| C-AD4 | AddFindingDialog Esc closes without saving | Component | P2 | Component doesn't exist |
| E-AF1 | `+` button → dialog → fill form → manual finding appears with dotted border | E2E | P0 | Dialog doesn't exist |

### AC5: Manual Finding Lifecycle

| ID | Test | Level | Priority | Fails Because |
|----|------|-------|----------|---------------|
| U-D1 | deleteFinding — deletes review_actions then finding (FK order) | Unit | P0 | Action file doesn't exist |
| U-D2 | deleteFinding — guard: only detectedByLayer='Manual' can be deleted | Unit | P0 | Action file doesn't exist |
| U-D3 | deleteFinding — finding not found → NOT_FOUND | Unit | P1 | Action file doesn't exist |
| U-D4 | deleteFinding — Inngest event sent for score recalculation | Unit | P1 | Action file doesn't exist |
| C-MF1 | FindingCard shows dotted border + "Manual" badge for Manual findings | Component | P1 | No manual styling in component |
| C-MF2 | FindingCardCompact shows "Manual" badge, confidence "—" | Component | P1 | No manual styling |
| C-MF3 | Delete button visible only for Manual findings in detail panel | Component | P2 | No delete button exists |
| E-D1 | Delete manual finding → removed from list + score changes | E2E | P1 | Delete action doesn't exist |

### AC6: Common Behaviors + WCAG

| ID | Test | Level | Priority | Fails Because |
|----|------|-------|----------|---------------|
| U-CB1 | SCORE_IMPACT_MAP: noted → countsPenalty: false | Unit | P0 | Already passes (pre-existing) |
| U-CB2 | SCORE_IMPACT_MAP: source_issue → countsPenalty: false | Unit | P0 | Already passes (pre-existing) |
| U-CB3 | SCORE_IMPACT_MAP: manual → countsPenalty: true | Unit | P0 | Already passes (pre-existing) |
| U-DL1 | 'Manual' in DETECTED_BY_LAYERS const array | Unit | P0 | 'Manual' not in array |
| C-VI1 | Noted state: FileText icon + "Noted" text label + blue bg | Component | P1 | Not implemented |
| C-VI2 | Source Issue state: FileWarning icon + "Source Issue" label + purple bg | Component | P1 | Not implemented |
| C-VI3 | Override badge: amber pill with "Override" text | Component | P1 | Not implemented |
| E-WC1 | All extended action buttons have 2px indigo focus ring | E2E | P2 | Not implemented |

### TD Unskip Tests

| ID | Test | Level | Priority | TD ID |
|----|------|-------|----------|-------|
| E-TD1 | Esc hierarchy: dropdown in Sheet closes before Sheet | E2E | P1 | TD-E2E-013 |
| E-TD2 | Score recalculate after finding action | E2E | P1 | TD-E2E-015 |
| E-TD3 | Detail panel E2E tests (7 tests E1–E7) | E2E | P1 | TD-E2E-016 |
| E-TD4 | Review score E2E test | E2E | P1 | TD-E2E-007 |

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY)

### Note Text Length (AC1)

| Boundary | At | Below | Above | Zero/Empty |
|----------|----|-------|-------|------------|
| noteText max 500 chars | `len === 500` (accept) | `len === 499` (accept) | `len === 501` (reject) | `null` (accept — optional) |

**Tests:**
- U-BV1: [P0] noteText boundary — 500 accepted, 501 rejected, null accepted

### Description Length (AC4)

| Boundary | At Min | Below Min | At Max | Above Max | Zero |
|----------|--------|-----------|--------|-----------|------|
| description 10-1000 chars | `len === 10` (accept) | `len === 9` (reject) | `len === 1000` (accept) | `len === 1001` (reject) | `len === 0` (reject) |

**Tests:**
- U-BV2: [P1] description min 10 — at 10 accepted, 9 rejected, 0 rejected
- U-BV3: [P1] description max 1000 — at 1000 accepted, 1001 rejected

### Suggestion Length (AC4)

| Boundary | At Max | Above Max | Zero/Empty |
|----------|--------|-----------|------------|
| suggestion max 1000 chars | `len === 1000` (accept) | `len === 1001` (reject) | `null` (accept — optional) |

**Tests:**
- U-BV4: [P1] suggestion boundary — 1000 accepted, 1001 rejected, null accepted

---

## Test Count Summary

| Level | P0 | P1 | P2 | Total |
|-------|:--:|:--:|:--:|:-----:|
| Unit (state transitions) | 13 | 0 | 0 | 13 |
| Unit (server actions) | 5 | 14 | 0 | 19 |
| Unit (hooks) | 3 | 3 | 0 | 6 |
| Unit (boundary values) | 1 | 3 | 0 | 4 |
| Unit (types/constants) | 4 | 0 | 0 | 4 |
| Component | 0 | 11 | 4 | 15 |
| E2E (new) | 4 | 6 | 1 | 11 |
| E2E (TD unskip) | 0 | 4 | 0 | 4 |
| **Total** | **30** | **41** | **5** | **76** |

**DoD gate:** ALL P0 + P1 must PASS before story completion. P2 = nice-to-have.

---

## Failing Tests Created (RED Phase)

### Unit Tests — State Transitions (13 tests)

**File:** `src/features/review/utils/state-transitions.test.ts` (extend existing)

- `it.skip('[P0] U-N1: should return noted when note on pending')`
- `it.skip('[P0] U-N2: should return noted when note on accepted')`
- `it.skip('[P0] U-N3: should return noted when note on rejected')`
- `it.skip('[P0] U-N4: should return noted when note on flagged')`
- `it.skip('[P0] U-N5: should return noted when note on source_issue')`
- `it.skip('[P0] U-N6: should return null when note on noted (no-op)')`
- `it.skip('[P0] U-N7: should return null when note on manual (no-op)')`
- `it.skip('[P0] U-S1: should return source_issue when source on pending')`
- `it.skip('[P0] U-S2: should return source_issue when source on accepted')`
- `it.skip('[P0] U-S3: should return source_issue when source on rejected')`
- `it.skip('[P0] U-S4: should return source_issue when source on noted')`
- `it.skip('[P0] U-S5: should return null when source on source_issue (no-op)')`
- `it.skip('[P0] U-S6: should return null when source on manual (no-op)')`

### Unit Tests — Server Actions (19 tests)

**File:** `src/features/review/actions/noteFinding.action.test.ts` (new)

- `it.skip('[P0] U-NA1: should transition pending → noted with review_actions')`
- `it.skip('[P1] U-NA2: should return NOT_FOUND when finding does not exist')`
- `it.skip('[P1] U-NA3: should return no-op when finding is already noted')`
- `it.skip('[P1] U-NA4: should return no-op when finding is manual')`

**File:** `src/features/review/actions/updateNoteText.action.test.ts` (new)

- `it.skip('[P1] U-NT1: should save noteText to review_actions metadata')`
- `it.skip('[P1] U-NT2: should reject when finding is not in noted state')`

**File:** `src/features/review/actions/sourceIssueFinding.action.test.ts` (new)

- `it.skip('[P0] U-SA1: should transition pending → source_issue with review_actions')`
- `it.skip('[P1] U-SA2: should return NOT_FOUND when finding does not exist')`
- `it.skip('[P1] U-SA3: should return no-op when finding is already source_issue')`

**File:** `src/features/review/actions/overrideSeverity.action.test.ts` (new)

- `it.skip('[P0] U-O1: should override critical → minor and set original_severity')`
- `it.skip('[P0] U-O2: should preserve first original_severity on double override')`
- `it.skip('[P1] U-O3: should reset to original severity and clear original_severity')`
- `it.skip('[P1] U-O4: should reject override to same severity')`
- `it.skip('[P1] U-O5: should return NOT_FOUND when finding does not exist')`
- `it.skip('[P1] U-O6: should insert feedback_events row for AI training (FR79)')`

**File:** `src/features/review/actions/addFinding.action.test.ts` (new)

- `it.skip('[P0] U-AF1: should create finding with status=manual, layer=Manual')`
- `it.skip('[P1] U-AF2: should reject when segment not found')`
- `it.skip('[P1] U-AF3: should reject description < 10 chars')`
- `it.skip('[P1] U-AF4: should insert feedback_events row (FR80)')`
- `it.skip('[P1] U-AF5: should send Inngest event for score recalculation')`

**File:** `src/features/review/actions/deleteFinding.action.test.ts` (new)

- `it.skip('[P0] U-D1: should delete review_actions then finding in transaction')`
- `it.skip('[P0] U-D2: should reject delete for non-Manual findings')`
- `it.skip('[P1] U-D3: should return NOT_FOUND when finding does not exist')`
- `it.skip('[P1] U-D4: should send Inngest event for score recalculation')`

### Unit Tests — Hooks (6 tests)

**File:** `src/features/review/hooks/use-review-actions.test.ts` (extend existing)

- `it.skip('[P0] U-H1: should call executeAction(note) + autoAdvance when finding is not noted')`
- `it.skip('[P0] U-H2: should call executeAction(source) + autoAdvance')`
- `it.skip('[P1] U-H3: should open override dropdown without auto-advance')`
- `it.skip('[P1] U-H4: should open add finding dialog without auto-advance')`
- `it.skip('[P1] U-H5: should open NoteInput when finding is already noted (no advance)')`
- `it.skip('[P1] U-H6: should call deleteFinding + remove from store')`

### Unit Tests — Boundary Values (4 tests)

**File:** `src/features/review/validation/reviewAction.schema.test.ts` (extend existing)

- `it.skip('[P0] U-BV1: noteText boundary — 500 accepted, 501 rejected, null accepted')`
- `it.skip('[P1] U-BV2: description min 10 — at 10 accepted, 9 rejected, 0 rejected')`
- `it.skip('[P1] U-BV3: description max 1000 — at 1000 accepted, 1001 rejected')`
- `it.skip('[P1] U-BV4: suggestion boundary — 1000 accepted, 1001 rejected, null accepted')`

### Unit Tests — Types & Constants (4 tests)

**File:** `src/types/finding.test.ts` (new or extend)

- `it.skip('[P0] U-DL1: DETECTED_BY_LAYERS should include Manual')`
- `it.skip('[P0] U-CB1: SCORE_IMPACT_MAP noted → countsPenalty false')` — ALREADY PASSES
- `it.skip('[P0] U-CB2: SCORE_IMPACT_MAP source_issue → countsPenalty false')` — ALREADY PASSES
- `it.skip('[P0] U-CB3: SCORE_IMPACT_MAP manual → countsPenalty true')` — ALREADY PASSES

### Component Tests (15 tests)

**File:** `src/features/review/components/NoteInput.test.tsx` (new)

- `it.skip('[P1] C-NI1: should render text field when open')`
- `it.skip('[P1] C-NI2: should call onSubmit with text when Enter pressed')`
- `it.skip('[P1] C-NI3: should call onDismiss when Esc pressed')`
- `it.skip('[P2] C-NI4: should enforce max 500 char limit')`

**File:** `src/features/review/components/SeverityOverrideMenu.test.tsx` (new)

- `it.skip('[P1] C-SO1: should render 3 severity options, disable current severity')`
- `it.skip('[P1] C-SO2: should show Reset to original only when originalSeverity is set')`
- `it.skip('[P2] C-SO3: should navigate options with arrow keys')`

**File:** `src/features/review/components/AddFindingDialog.test.tsx` (new)

- `it.skip('[P1] C-AD1: should render segment/category/severity/description fields')`
- `it.skip('[P1] C-AD2: should disable submit until required fields filled')`
- `it.skip('[P1] C-AD3: should reset form on re-open (Guardrail #11)')`
- `it.skip('[P2] C-AD4: should close on Esc without saving')`

**File:** `src/features/review/components/FindingCard.test.tsx` (extend existing)

- `it.skip('[P1] C-MF1: should show dotted border + Manual badge for Manual findings')`
- `it.skip('[P1] C-VI1: should show FileText icon + Noted label for noted state')`
- `it.skip('[P1] C-VI2: should show FileWarning icon + Source Issue label for source_issue state')`
- `it.skip('[P1] C-VI3: should show Override badge when originalSeverity is set')`

### E2E Tests — Extended Actions (11 tests)

**File:** `e2e/review-extended-actions.spec.ts` (new)

```
test.describe.serial('Extended Review Actions — Story 4.3 ATDD')
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  [setup] signup, create project, seed file with 15+ findings

  E-N1: [P0] Keyboard N on pending → noted state + auto-advance
  E-N2: [P1] Keyboard N on noted → NoteInput popover opens
  E-N3: [P1] NoteInput: type text + Enter → note saved

  E-S1: [P0] Keyboard S on pending → source_issue state + auto-advance

  E-O1: [P0] Override button → dropdown → select Minor → badge visible + score change
  E-O2: [P1] Override → Reset to original → badge removed

  E-AF1: [P0] + button → dialog → fill form → manual finding with dotted border
  E-D1:  [P1] Delete manual finding → removed from list + score changes

  E-WC1: [P2] All extended action buttons have focus ring

  [cleanup] delete project
```

### E2E Tests — TD Unskip (4 test groups)

**File:** `e2e/review-keyboard.spec.ts` (existing — unskip F5e)

- `E-TD1: [P1] TD-E2E-013 — Esc hierarchy with dropdown in Sheet`

**File:** `e2e/review-score.spec.ts` (existing — unskip TD2 + 1 test)

- `E-TD2: [P1] TD-E2E-015 — Score recalculate after finding action`
- `E-TD4: [P1] TD-E2E-007 — Review score E2E`

**File:** `e2e/review-detail-panel.spec.ts` (existing — unskip E1–E7)

- `E-TD3: [P1] TD-E2E-016 — Detail panel 7 tests`

---

## Required data-testid Attributes

### ReviewActionBar (extend existing)

- `data-testid="review-action-bar"` — already exists
- `data-testid="action-note"` — Note button (new)
- `data-testid="action-source"` — Source Issue button (new)
- `data-testid="action-override"` — Override button (new)
- `data-testid="action-add"` — Add Finding button (new)

### NoteInput (new component)

- `data-testid="note-input-popover"` — popover container
- `data-testid="note-text-field"` — textarea
- `data-testid="note-save-button"` — save button

### SeverityOverrideMenu (new component)

- `data-testid="override-menu"` — DropdownMenu container
- `data-testid="override-critical"` — Critical option
- `data-testid="override-major"` — Major option
- `data-testid="override-minor"` — Minor option
- `data-testid="override-reset"` — Reset to original option

### AddFindingDialog (new component)

- `data-testid="add-finding-dialog"` — Dialog container
- `data-testid="segment-selector"` — segment dropdown
- `data-testid="category-selector"` — category dropdown
- `data-testid="severity-selector"` — severity radio group
- `data-testid="description-field"` — description textarea
- `data-testid="suggestion-field"` — suggestion textarea
- `data-testid="add-finding-submit"` — submit button
- `data-testid="add-finding-cancel"` — cancel button

### FindingCard / FindingCardCompact (extend existing)

- `data-testid="override-badge"` — override indicator pill
- `data-testid="manual-badge"` — Manual layer badge
- `data-testid="delete-finding-button"` — delete button (Manual findings only)

---

## Implementation Checklist

### Phase 1: Types & State Transitions (makes U-N1..U-S6, U-DL1, U-CB1..CB3 pass)

- [ ] Add 'Manual' to `DETECTED_BY_LAYERS` in `@/types/finding.ts`
- [ ] Add 'note' | 'source' to `ReviewAction` type in `state-transitions.ts`
- [ ] Expand transition matrix 8×3 → 8×5
- [ ] Run: `npx vitest run src/features/review/utils/state-transitions.test.ts`
- [ ] All 13 transition tests GREEN

### Phase 2: DB Migration (prerequisite for Phase 3)

- [ ] Add `originalSeverity` nullable varchar(20) to findings schema
- [ ] Run `npm run db:generate && npm run db:migrate`

### Phase 3: Server Actions (makes U-NA*, U-SA*, U-O*, U-AF*, U-D*, U-BV* pass)

- [ ] Create `noteFinding.action.ts` + `updateNoteText.action.ts`
- [ ] Create `sourceIssueFinding.action.ts`
- [ ] Create `overrideSeverity.action.ts` (with feedback_events)
- [ ] Create `addFinding.action.ts` (with feedback_events)
- [ ] Create `deleteFinding.action.ts` (FK order: review_actions → findings)
- [ ] Create/extend Zod schemas in `reviewAction.schema.ts`
- [ ] Run: `npx vitest run src/features/review/actions/`
- [ ] All 23 action tests + 4 boundary tests GREEN

### Phase 4: Hooks (makes U-H1..U-H6 pass)

- [ ] Extend `use-review-actions.ts` with handleNote (two-path), handleSourceIssue, handleOverrideSeverity, handleAddFinding, handleDeleteFinding
- [ ] Wire hotkeys N/S/-/+ in `use-keyboard-actions.ts`
- [ ] Run: `npx vitest run src/features/review/hooks/use-review-actions.test.ts`
- [ ] All 6 hook tests GREEN

### Phase 5: UI Components (makes C-NI*, C-SO*, C-AD*, C-MF*, C-VI* pass)

- [ ] Create NoteInput.tsx + SeverityOverrideMenu.tsx + AddFindingDialog.tsx
- [ ] Update FindingCard/Compact: noted/source_issue bg, override badge, manual badge + dotted border
- [ ] Wire in ReviewPageClient.tsx + ReviewActionBar.tsx (enable N/S/-/+ buttons)
- [ ] Add required data-testid attributes
- [ ] Run: `npx vitest run src/features/review/components/`
- [ ] All 15 component tests GREEN

### Phase 6: E2E Tests (makes E-N*, E-S*, E-O*, E-AF*, E-D*, E-WC* pass)

- [ ] Create `e2e/review-extended-actions.spec.ts` with seed function
- [ ] Implement 11 E2E tests
- [ ] Unskip TD E2E tests (F5e, TD2, E1–E7, review-score)
- [ ] Run: `INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-extended-actions.spec.ts`
- [ ] All 11 E2E tests + TD unskips GREEN

---

## Running Tests

```bash
# Run all Story 4.3 unit tests
npx vitest run src/features/review/utils/state-transitions.test.ts src/features/review/actions/ src/features/review/hooks/use-review-actions.test.ts src/features/review/validation/reviewAction.schema.test.ts

# Run all Story 4.3 component tests
npx vitest run src/features/review/components/NoteInput.test.tsx src/features/review/components/SeverityOverrideMenu.test.tsx src/features/review/components/AddFindingDialog.test.tsx

# Run Story 4.3 E2E tests
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-extended-actions.spec.ts

# Run single unit test file
npx vitest run src/features/review/actions/overrideSeverity.action.test.ts

# Debug E2E with headed browser
npx playwright test e2e/review-extended-actions.spec.ts --headed --debug
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ 76 test scenarios mapped to ACs with priorities
- ✅ All tests designed to fail before implementation
- ✅ Boundary value tests for all numeric thresholds (4 groups)
- ✅ data-testid requirements listed (20+ attributes)
- ✅ Implementation checklist with 6 phases
- ✅ TD unskip tests included (4 groups, 10+ tests)

### GREEN Phase (DEV Team)

1. Pick one failing test from Phase 1 (start with state transitions)
2. Implement minimal code to make that test pass
3. Run test to verify GREEN
4. Move to next test, repeat
5. Progress through Phases 1→6 sequentially

### REFACTOR Phase (After All Tests Pass)

1. Verify all 76 tests pass
2. Review for DRY (shared helpers, mock patterns)
3. Run full suite: `npm run test:unit`
4. Ready for code review

---

## Knowledge Base References Applied

- **test-quality.md** — Deterministic, isolated, <300 lines, explicit assertions
- **test-levels-framework.md** — Unit for logic, Component for UI, E2E for journeys
- **test-priorities-matrix.md** — P0 for core actions, P1 for guards/errors, P2 for a11y
- **component-tdd.md** — Red-green-refactor, provider isolation, a11y assertions
- **selector-resilience.md** — data-testid > ARIA roles > text; [role="row"] prefix for strict mode
- **timing-debugging.md** — Toast wait between actions, no hard waits, pollScoreLayer

---

## Notes

- Suite-level skip guard `test.skip(!process.env.INNGEST_DEV_URL)` for all Inngest-dependent E2E tests
- E2E seed function must include 15+ findings (serial tests consume findings across test cases)
- Word count per segment ≥ 100 (else MQM always 0 — Story 4.2 E2E lesson)
- Two-click pattern for Radix DropdownMenu in E2E (SeverityOverrideMenu)
- `click()` not `focus()` before keyboard actions (Story 4.2 CR lesson)
- Toast wait between rapid actions (inFlightRef blocks)
- U-CB1/CB2/CB3 already pass (SCORE_IMPACT_MAP pre-existing) — keep as regression guards

---

**Generated by BMad TEA Agent (Murat)** — 2026-03-14

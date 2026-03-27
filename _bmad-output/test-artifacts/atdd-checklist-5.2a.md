---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
lastStep: step-04c-aggregate
lastSaved: '2026-03-27'
storyId: '5.2a'
storyTitle: 'Non-Native Auto-Tag'
inputDocuments:
  - _bmad-output/implementation-artifacts/5-2a-non-native-auto-tag.md
  - src/features/review/actions/helpers/executeReviewAction.ts
  - src/features/review/components/FindingCard.tsx
  - src/features/review/components/OverrideHistoryPanel.tsx
  - src/features/review/actions/getFileReviewData.action.ts
  - src/features/review/types.ts
  - src/lib/auth/determineNonNative.ts
---

# ATDD Checklist: Story 5.2a — Non-Native Auto-Tag

## TDD Phase: RED (Current)

All tests generated with `it.skip()` / `test.skip()` — will fail until feature implemented.

## Test Files Generated

| # | File | Type | Tests | Priority |
|---|------|------|-------|----------|
| T1 | `src/features/review/actions/helpers/executeReviewAction.nonnative.test.ts` | Unit | 4 | P0×2, P1×2 |
| T2 | `src/features/review/actions/addFinding.nonnative.test.ts` | Unit | 2 | P1×2 |
| T3 | `src/features/review/actions/bulkAction.nonnative.test.ts` | Unit | 2 | P0×1, P1×1 |
| T4 | `src/features/review/components/NonNativeBadge.test.tsx` | Component | 4 | P1×4 |
| T5 | `src/features/review/components/FindingCard.nonnative.test.tsx` | Component | 3 | P1×3 |
| T6 | `src/features/review/components/OverrideHistoryPanel.nonnative.test.tsx` | Component | 2 | P1×2 |
| T7 | `src/features/review/actions/getFileReviewData.nonnative.test.ts` | Unit | 3 | P1×3 |
| T8 | `e2e/review-non-native-tag.spec.ts` | E2E | 2 | P1×2 |

**Total: 22 tests (all skipped)**
- Unit: 11 tests (P0: 3, P1: 8)
- Component: 9 tests (P1: 9)
- E2E: 2 tests (P1: 2)

## Acceptance Criteria Coverage

| AC | Description | Test Coverage |
|----|------------|---------------|
| AC1 | Auto-tag on every review action | T1 (4 tests: non-native true/false, segmentId null, audit log) |
| AC1b | Metadata merge in addFinding/overrideSeverity | T2 (2 tests: merge preserves isManual + non_native) |
| AC2 | Auto-tag on bulk actions | T3 (2 tests: all rows tagged, empty nativeLanguages boundary) |
| AC3 | Write-once tag (Guardrail #66) | T1 (verified via INSERT-only, no UPDATE on metadata) |
| AC4 | NonNativeBadge in FindingCard | T4 (component), T5 (integration), T7 (data layer), T8 (E2E) |
| AC5 | NonNativeBadge in Override History | T6 (component), T8 (E2E) |
| AC6 | Non-native in audit trail | T1 (audit log newValue includes non_native) |

## Boundary Tests

| Boundary | Test | Location |
|----------|------|----------|
| `nativeLanguages = []` → non-native for ALL | T3 test 2 | bulkAction.nonnative.test.ts |
| `segmentId = null` → conservative default (true) | T1 test 3 | executeReviewAction.nonnative.test.ts |
| Mixed native + non-native actions → badge shows | T7 test 3 | getFileReviewData.nonnative.test.ts |
| Native reviewer → `non_native: false` (explicit) | T1 test 2 | executeReviewAction.nonnative.test.ts |

## Guardrail Compliance

| Guardrail | Verified In |
|-----------|-------------|
| #1 withTenant on queries | T1 (segment lookup), T7 (non-native query) |
| #25 Color not sole info carrier | T4 (icon + text + color) |
| #36 Icon 16px min + aria-hidden | T4 (h-4 w-4, aria-hidden="true") |
| #66 Write-once tag | T1 (INSERT metadata, no UPDATE path) |

## Implementation Guidance

### Server Action Changes (remove `it.skip()` after implementing)

1. **`executeReviewAction.ts`** — add `nativeLanguages: string[]` to user type, segment targetLang lookup, set `metadata: { non_native }` on review_actions INSERT
2. **All 5 callers** (accept, reject, flag, note, sourceIssue) — pass `nativeLanguages` in user param
3. **`addFinding.action.ts`** — MERGE `non_native` into existing `{ isManual: true }` metadata
4. **`bulkAction.action.ts`** — determine non-native ONCE, set on all review_action INSERTs
5. **`executeUndoRedo.ts`** + callers — same pattern as executeReviewAction

### UI Changes

6. **`NonNativeBadge.tsx`** — new component (Eye icon + "Subject to native audit")
7. **`FindingCard.tsx`** — add `hasNonNativeAction` prop, render NonNativeBadge
8. **`OverrideHistoryPanel.tsx`** — show "(non-native)" italic label per action
9. **`getFileReviewData.action.ts`** — add non-native query, map `hasNonNativeAction`

### Type Changes

10. **`FindingForDisplay`** in `types.ts` — add `hasNonNativeAction: boolean`

## Next Steps (TDD Green Phase)

After implementing the feature:

1. Remove `it.skip()` / `test.skip()` from all test files
2. Run unit tests: `npx vitest run src/features/review/actions/helpers/executeReviewAction.nonnative.test.ts`
3. Run all story tests: `npx vitest run --grep "5.2a"`
4. Run E2E: `npx playwright test e2e/review-non-native-tag.spec.ts`
5. Verify ALL tests PASS (green phase)
6. If any fail: fix implementation (feature bug) or fix test (test bug)
7. Run full suite: `npm run test:unit && npm run lint && npm run type-check`

## Existing Test Files Requiring Mock Updates (Task 9a)

These files need `nativeLanguages: []` added to mock user objects after `executeReviewAction` type changes:

- `acceptFinding.action.test.ts`
- `flagFinding.action.test.ts`
- `sourceIssueFinding.action.test.ts`
- `noteFinding.action.test.ts`
- `undoAction.action.test.ts`
- `redoAction.action.test.ts`
- `undoBulkAction.action.test.ts`
- `redoBulkAction.action.test.ts`
- `executeReviewAction.ta.test.ts` (if exists)

Note: `rejectFinding.action.test.ts` and `bulkAction.action.test.ts` already have `nativeLanguages: []`

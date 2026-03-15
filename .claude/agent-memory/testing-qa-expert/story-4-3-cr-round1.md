# Story 4.3 CR Round 1 — Test Quality Audit

**Date:** 2026-03-15
**Tests:** 106 unit+component GREEN, 11 E2E (skip-guarded), 0 skipped unit tests
**Result:** 0C, 2H, 6M, 5L

## Findings

### HIGH

- H1: `reviewAction.schema.test.ts:124` — BV1 test title says "null accepted" but body never tests null. Schema has `min(1)` so null IS rejected. Test name misleading + missing assertion.
- H2: `addFinding.action.test.ts:154` — U-AF1 never asserts `result.data.findingId`. Production returns inserted row's ID but test doesn't verify propagation.

### MEDIUM

- M1: `deleteFinding.action.test.ts:87` — U-D1 claims "in transaction" but no transaction call assertion
- M2: `overrideSeverity.action.test.ts:182` — reset+same-severity edge case untested (covered by guard but undocumented)
- M3: `addFinding.action.test.ts:185` — validation error message not verified, only code
- M4: `use-review-actions.test.ts:347` — handleNote test checks announce but not that noteFinding action was called
- M5: `SeverityOverrideMenu.test.tsx:60` — `toBeDefined()` on `getAttribute()` is vacuous (null passes toBeDefined)
- M6: E2E `review-extended-actions.spec.ts:643` — focus ring test uses class name string match, programmatic focus doesn't trigger `:focus-visible`

### LOW

- L1: `findCapturedValues` helper duplicated across action test files
- L2: `AddFindingDialog.test.tsx:122` — cannot test full submit flow in jsdom (Radix Select limitation, deferred to E2E)
- L3: U-O6 duplicates U-O1 setup — maintenance risk
- L4: E2E `signupOrLogin` called in every serial test body — redundant but defensive
- L5: U-D4 Inngest event `newState: 'manual'` for deleted finding — semantically confusing, matches production but undocumented

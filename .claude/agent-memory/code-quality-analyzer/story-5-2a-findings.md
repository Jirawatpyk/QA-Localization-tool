# Story 5.2a — Non-Native Auto-Tag CR R1

**Date:** 2026-03-27
**Result:** 0C / 4H / 5S (0 Critical, 4 High, 5 Suggestions)

## High Findings

### H1. Duplicate segment query in overrideSeverity.action.ts

- Lines 136-145 (inside tx) + 211-220 (after tx) query same segment twice
- Fix: single query before transaction, reuse result

### H2. Duplicate segment query in undoDeleteFinding.action.ts

- Lines 61-75 (FK guard SELECT id) + 93-104 (non-native SELECT targetLang)
- Fix: merge into single SELECT { id, targetLang }

### H3. N+1 extra query in undoBulkAction + redoBulkAction

- Initial SELECT fetches only { id, status } but then re-queries findings table for segmentId
- Fix: add segmentId to initial SELECT

### H4. DRY violation — segment targetLang lookup pattern copied 7+ times

- Identical 8-line block across all 7 action files
- Fix: extract shared helper `getSegmentTargetLang(segmentId, tenantId)`

## Suggestions

- S1: Variable naming inconsistency (targetLang/undoTargetLang/overrideTargetLang/etc.)
- S2: Raw SQL in getFileReviewData Q8 JSONB query — add sync comment
- S3: FindingCard.hasNonNativeAction prop duplicates FindingForDisplay.hasNonNativeAction field
- S4: overrideSeverity audit log missing non_native in newValue (inconsistent with AC6)
- S5: "TDD RED PHASE" comments still in test files after implementation complete

## Positive

- determineNonNative logic: Chinese script subtag handling correct
- Bulk optimization: determineNonNative called once per batch
- Guardrails #1/#4/#5/#6 fully compliant
- NonNativeBadge accessibility good
- Test coverage comprehensive for all ACs

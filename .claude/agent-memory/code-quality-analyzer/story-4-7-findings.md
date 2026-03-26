# Story 4.7 — Add to Glossary from Review CR R1-R2

**Date:** 2026-03-18
**R1 Result:** 0C / 2H / 5M / 5L
**R2 Result:** 0C / 0H / 3M / 5L — EXIT CRITERIA MET

## Files Reviewed

- `src/features/review/validation/addToGlossary.schema.ts` (new)
- `src/features/review/actions/addToGlossary.action.ts` (new)
- `src/features/review/actions/updateGlossaryTerm.action.ts` (new)
- `src/features/review/components/AddToGlossaryDialog.tsx` (new)
- `src/features/review/components/FindingDetailContent.tsx` (modified)
- Test files: addToGlossary.action.test.ts, updateGlossaryTerm.action.test.ts
- AddToGlossaryDialog.test.tsx (new in R1 fix)
- FindingDetailContent.test.tsx (Story 4.7 tests), FindingDetailSheet.test.tsx (mock additions)
- e2e/review-add-to-glossary.spec.ts

## R1 Findings & Fix Status

| Finding                                            | Severity | Status in R2             |
| -------------------------------------------------- | -------- | ------------------------ |
| H1: sourceLang guard missing in showAddToGlossary  | HIGH     | FIXED (line 106)         |
| H2: Dialog unit tests missing                      | HIGH     | FIXED (10 tests created) |
| M1: Validation error test missing                  | MEDIUM   | FIXED                    |
| M2: requireRole args not verified                  | MEDIUM   | FIXED                    |
| M3: ATDD subtask checkboxes                        | MEDIUM   | N/A (process)            |
| M4: glossaryDialogOpen not reset on finding change | MEDIUM   | FIXED (line 96)          |
| L1: Warning message wording                        | LOW      | FIXED                    |
| L2: formRef null guard                             | LOW      | FIXED                    |

## R2 NEW Findings

### MEDIUM (3)

- M1: `notes` field collected in UI/schema/audit but no DB column — needs TD entry or fix
- M2: `formData.get() as string` unsafe cast (3 places in AddToGlossaryDialog)
- M3: E2E seed findings missing `segment_id` — renders as cross-file

### LOW (5)

- L1: AddToGlossaryDialog mounted for non-Terminology findings (unnecessary DOM)
- L2: Same `as string` cast in handleUpdateExisting
- L3: Duplicate warning shows original excerpt instead of user-edited source term
- L4: Missing test for updateGlossaryTerm server error in dialog
- L5: `caseSensitive ?? false` redundant (Zod default already handles)

## Positives

- withTenant on all 6 queries (including defense-in-depth JOIN)
- Guard rows[0] after every .returning()
- Race condition handling for concurrent glossary auto-create
- NFKC normalization + SQL lower() dedup
- Guardrail #11 (dialog reset) + #30 (focus restore) implemented
- Audit trail complete with old/new values on both create + update
- Good test coverage: boundary values, NFKC, race condition, tenant isolation, RBAC

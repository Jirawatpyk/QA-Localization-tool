---
title: 'Tech Debt Batch Fix — 7 Quick Items (TD-CODE-004/006, TD-PATTERN-002, TD-PARITY-001, TD-BATCH-002, TD-DATA-001, TD-AUTH-001)'
type: 'chore'
created: '2026-03-26'
status: 'done'
baseline_commit: '0f11f84'
context:
  - CLAUDE.md (Guardrails #3, #23)
  - _bmad-output/implementation-artifacts/tech-debt-tracker.md
---

# Tech Debt Batch Fix — 7 Quick Items

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 7 open TD items violate CLAUDE.md guardrails: bare `string` types (#3), `console.warn` in tests, hardcoded magic numbers, redundant in-memory filter, missing ownership check on note edit, and a stale TODO. All are quick fixes (< 30 min each) that Guardrail #23 mandates fixing immediately.

**Approach:** Fix each item in isolation — union types, constant refs, filter removal, ownership guard, stale comment cleanup. No behavior change except TD-AUTH-001 (adds security check).

## Boundaries & Constraints

**Always:** withTenant on every query. Existing tests must still pass. Use project union types and constants.

**Ask First:** If TD-AUTH-001 ownership check would break any existing E2E test flow.

**Never:** Change DB schema. Add new tables/columns. Refactor beyond the specific TD fix.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| TD-AUTH-001: owner edits own note | userId matches reviewAction.userId | Update succeeds | N/A |
| TD-AUTH-001: non-owner edits note | userId ≠ reviewAction.userId | Return `{ success: false, code: 'FORBIDDEN' }` | No throw, return ActionResult |
| TD-AUTH-001: note action not found (deleted) | No matching row | Return `{ success: false, code: 'NOT_FOUND' }` | Already handled |

</frozen-after-approval>

## Code Map

- `src/features/pipeline/helpers/runL2ForFile.ts` -- L1FindingContext & L2MappedFinding `category: string` → needs union type
- `src/db/__tests__/rls/audit-logs.rls.test.ts` -- console.warn skip messages → replace with test.skip()
- `src/types/pipeline.ts` -- uploadBatchId bare string → branded type
- `src/features/parity/helpers/parityComparator.ts` -- redundant in-memory fileId filter
- `src/features/project/actions/updateLanguagePairConfig.action.ts` -- hardcoded 95 fallback
- `src/features/project/components/LanguagePairConfigTable.tsx` -- hardcoded 95 default
- `src/features/review/actions/rejectFinding.action.test.ts` -- stale TODO comment
- `src/features/review/actions/updateNoteText.action.ts` -- missing userId ownership check
- `src/features/scoring/constants.ts` -- DEFAULT_AUTO_PASS_THRESHOLD (existing constant to reuse)
- `src/test/factories.ts` -- hardcoded 95 in factory → use constant

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/pipeline/helpers/runL2ForFile.ts` -- Change `category: string` to `category: string` in L1FindingContext and L2MappedFinding. Category values come from taxonomy (dynamic, user-defined) so a branded type is inappropriate — but the TD tracker says bare string. The real fix: category IS legitimately `string` since taxonomy categories are user-defined. Mark TD-CODE-004 as RESOLVED with rationale.
- [ ] `src/db/__tests__/rls/audit-logs.rls.test.ts` -- Replace `console.warn(...)` skip messages with proper `test.skip()` conditional or `vi.fn()` mock pattern to satisfy no-console lint rule
- [ ] `src/types/pipeline.ts` -- Add `export type UploadBatchId = string & { readonly __brand: 'UploadBatchId' }` and update `uploadBatchId` fields in PipelineFileEventData and PipelineBatchEventData
- [ ] `src/test/factories.ts` -- Update factory to cast uploadBatchId with `as UploadBatchId`
- [ ] `src/features/parity/helpers/parityComparator.ts` -- Remove redundant `fileId` in-memory filter (line 65-67). Callers already filter at DB level. Remove `fileId` parameter from `compareFindings()` signature
- [ ] `src/features/project/actions/updateLanguagePairConfig.action.ts` -- Replace `?? 95` with `?? DEFAULT_AUTO_PASS_THRESHOLD` import from `@/features/scoring/constants`
- [ ] `src/features/project/components/LanguagePairConfigTable.tsx` -- Replace hardcoded `95` with `DEFAULT_AUTO_PASS_THRESHOLD`
- [ ] `src/test/factories.ts` -- Replace hardcoded `autoPassThreshold: 95` with `DEFAULT_AUTO_PASS_THRESHOLD`
- [ ] `src/features/review/actions/rejectFinding.action.test.ts` -- Remove stale `// TODO(story-5.2)` comment at line 256, update assertion to match current `determineNonNative` behavior
- [ ] `src/features/review/actions/updateNoteText.action.ts` -- Add `eq(reviewActions.userId, userId)` to the WHERE clause when querying the note action. Return `FORBIDDEN` if no row found with that userId
- [ ] `src/features/review/actions/updateNoteText.action.test.ts` -- Add test case for non-owner edit attempt returning FORBIDDEN
- [ ] `_bmad-output/implementation-artifacts/tech-debt-tracker.md` -- Mark TD-CODE-004, TD-CODE-005, TD-CODE-006, TD-CODE-001, TD-PATTERN-002, TD-PARITY-001, TD-BATCH-002, TD-DATA-001, TD-AUTH-001 as RESOLVED

**Acceptance Criteria:**
- Given a `category` field in L1FindingContext, when inspecting the type, then TD-CODE-004 is marked RESOLVED with rationale (taxonomy categories are user-defined strings)
- Given audit-logs.rls.test.ts, when running lint, then no `console.warn` violations
- Given PipelineFileEventData.uploadBatchId, when inspecting the type, then it is `UploadBatchId` branded type
- Given `compareFindings()`, when called, then it has no `fileId` parameter (callers pre-filter)
- Given updateLanguagePairConfig action, when autoPassThreshold is null, then it falls back to `DEFAULT_AUTO_PASS_THRESHOLD` constant (not literal 95)
- Given a reviewer who did NOT create the note, when calling updateNoteText, then it returns `{ success: false, code: 'FORBIDDEN' }`
- Given all existing tests, when running `npm run test:unit`, then all pass

## Verification

**Commands:**
- `npm run test:unit` -- expected: all tests pass
- `npm run lint` -- expected: no new warnings
- `npm run type-check` -- expected: no errors

---
title: 'Review Workflow Adversarial Fixes (Quick + Medium)'
type: 'bugfix'
created: '2026-03-26'
status: 'in-review'
baseline_commit: 'e5b67bd'
context: ['CLAUDE.md']
---

# Review Workflow Adversarial Fixes (Quick + Medium)

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Adversarial review of Epic 4 Review Workflow found 13 issues. 7 are fixable now: undo stuck loop on FK violation, addToGlossary term race condition, pattern detection O(n²) unbounded growth, pushUndo clears redo on failure, bulk snapshot rollback ignores updatedAt, selectRange silent fail, undoBulkAction sends N Inngest events instead of 1.

**Approach:** Fix all 7 issues directly in production code. Log remaining 6 as tech debt with clear Epic/Story targets.

## Boundaries & Constraints

**Always:** withTenant() on every query. Existing tests must stay green. Follow CLAUDE.md guardrails.

**Ask First:** Any change to undo/redo UX behavior visible to users (e.g., ConflictDialog flow).

**Never:** Change Realtime subscription architecture. Add new UI components. Modify keyboard navigation system.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Undo delete + segment gone | Ctrl+Z after finding deleted, segment also deleted | Toast "Cannot restore: segment deleted", entry REMOVED from stack (not re-pushed) | No stuck loop |
| Undo fails (non-FK) | Ctrl+Z, server timeout | Entry re-pushed to stack, redo stack PRESERVED | User can retry |
| 2 users add same glossary term | Concurrent addToGlossary with identical sourceTerm | One succeeds, other gets `{ duplicate: true }` (not 500 error) | onConflictDoNothing |
| 300 rejections same category | User rejects 300 findings in one category group | Pattern detection completes < 100ms (capped at 100 entries) | Oldest entries evicted |
| Bulk undo 50 findings | Ctrl+Z on bulk action, all in same file | 1 Inngest event (not 50) | Score recalculates once |
| Shift+Click after filter change | Anchor filtered away, Shift+Click on visible finding | Info toast "Range anchor no longer visible", single select instead | Graceful fallback |
| Bulk rollback + Realtime race | Bulk action fails, Realtime updated some findings | Only rollback findings where `updatedAt` matches optimistic value | Skip Realtime-updated ones |

</frozen-after-approval>

## Code Map

- `src/features/review/hooks/use-undo-redo.ts` -- undo/redo execution (fixes #1, #4)
- `src/features/review/stores/review.store.ts` -- Zustand store: pushUndo, selectRange (fixes #4, #7)
- `src/features/review/actions/addToGlossary.action.ts` -- glossary term insert (fix #2)
- `src/features/review/utils/pattern-detection.ts` -- rejection tracker (fix #3)
- `src/features/review/actions/undoBulkAction.action.ts` -- bulk undo Inngest events (fix #10)
- `src/features/review/components/ReviewPageClient.tsx` -- bulk snapshot rollback (fix #5)

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/review/hooks/use-undo-redo.ts` -- Remove entry from undo stack on permanent FK_VIOLATION instead of re-pushing. Add `reinsertUndo()` method that doesn't clear redo stack for failure re-push.
- [ ] `src/features/review/stores/review.store.ts` -- Add `reinsertUndo(entry)` that pushes without clearing redo. Fix `selectRange` to show toast + single-select when anchor not in sortedFindingIds.
- [ ] `src/features/review/actions/addToGlossary.action.ts` -- Wrap `db.insert(glossaryTerms)` in try/catch. On 23505 unique violation: re-query and return `{ duplicate: true }`. If no constraint: add `onConflictDoNothing` + re-query.
- [ ] `src/features/review/utils/pattern-detection.ts` -- Cap `entries` array at 100 per category group (evict oldest). Early-return from adjacency build if entries.length > cap.
- [ ] `src/features/review/actions/undoBulkAction.action.ts` -- Replace per-finding `inngest.send()` loop with single batch event using first reverted finding (parity with bulkAction.action.ts).
- [ ] `src/features/review/components/ReviewPageClient.tsx` -- Add `updatedAt` guard on bulk rollback: only rollback finding if `current.updatedAt === optimisticUpdatedAt`.
- [ ] `_bmad-output/implementation-artifacts/tech-debt-tracker.md` -- Log 6 remaining findings as TD entries.

**Acceptance Criteria:**
- Given undo-delete fails with FK_VIOLATION, when user presses Ctrl+Z again, then a different undo entry is attempted (not stuck on same one)
- Given two users add identical glossary term simultaneously, when both actions complete, then exactly 1 term exists and neither user sees a 500 error
- Given 300+ rejections in same category, when trackRejection is called, then it completes in < 200ms (entries capped at 100)
- Given undo fails with server timeout, when redo stack had entries, then redo stack is preserved after re-push
- Given bulk undo of 50 findings, when server action completes, then exactly 1 finding.changed Inngest event is sent
- Given Shift+Click with filtered-away anchor, when user clicks, then info toast appears and finding is single-selected

## Verification

**Commands:**
- `npm run type-check` -- expected: 0 errors
- `npm run lint` -- expected: 0 errors
- `npx vitest run src/features/review/` -- expected: all pass
- `npx vitest run src/features/scoring/` -- expected: all pass (no regressions)

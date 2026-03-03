# Story 3.2b7 — Taxonomy Mapping Reorder UI

## CR R1 Summary (Anti-Pattern Detector): 0C / 4H / 5M / 4L

## CR R1 Summary (Code Quality Analyzer): 0C / 4H / 5M / 4L

### CQA HIGH Findings

1. **H1 — Conditional test assertion (vacuous pass):** TaxonomyMappingTable.test.tsx lines 237-251 and 312-319 wrap core assertions in `if (mockOnReorder.mock.calls.length > 0)` — jsdom doesn't support getBoundingClientRect so @dnd-kit keyboard sensor never fires. P0 test passes without asserting anything. Fix: extract handleDragEnd logic as pure function and test directly, or use explicit it.skipIf
2. **H2 — Audit log crash = action crash:** reorderMappings.action.ts line 54 — `await writeAuditLog(...)` not wrapped in try-catch. If audit fails after successful DB transaction, function throws unhandled error instead of returning ActionResult. Violates Guardrail #2 error-path pattern
3. **H3 — Guard parsed.data[0] after DB transaction:** reorderMappings.action.ts lines 48-52 — defense-in-depth empty-array guard runs AFTER db.transaction() completes. Should be before transaction for correct fail-fast ordering
4. **H4 — MOCK_MAPPINGS duplicated 3 times:** No `buildTaxonomyMapping` factory in src/test/factories.ts. Same 50-line array copy-pasted in TaxonomyMappingTable.test.tsx (2x) and TaxonomyManager.test.tsx (1x)

### CQA MEDIUM Findings

1. **M1 — revalidateTag('taxonomy', 'minutes'):** Verify 'minutes' cache profile is declared in next.config.ts — consistent across all taxonomy actions
2. **M2 — `val as Severity` unsafe cast:** TaxonomyMappingTable.tsx line 165 — Radix Select onValueChange cast without runtime validation
3. **M3 — `as TaxonomyMapping[]` unsafe cast:** page.tsx line 22 — getCachedTaxonomyMappings raw Drizzle rows cast without validation
4. **M4 — DragOverlay gets real handlers:** TaxonomyMappingTable.tsx line 449 — getCellProps passes mutation handlers to DragOverlay readOnly component
5. **M5 — MOCK_MAPPINGS duplicated within same file:** TaxonomyMappingTable.test.tsx has identical array in 2 describe blocks

### CQA LOW Findings

1. **L1 — isAdmin hardcoded `true`:** page.tsx line 28 — use `currentUser.role === 'admin'` for future-proofing
2. **L2 — `firstRowName!.trim()` non-null assertion:** E2E line 421 — textContent() may return null
3. **L3 — `fields.internalName || undefined` falsy coercion:** TaxonomyManager.tsx line 64 — empty string becomes undefined
4. **L4 — Redundant setup test in serial block:** E2E line 370-375 — page context doesn't persist between serial tests, next test re-logins anyway

### APD R1 Findings (from anti-pattern-detector)

- H1: reorderMappings action no try-catch around db.transaction()
- H2: Audit log parsed.data[0]! non-null assertion without guard (Guardrail #4)
- H3: ATDD test gap — optimistic revert P0 test never actually tests revert behavior
- H4: PointerSensor no activationConstraint
- M1: O(n^2) in handleReorder optimistic sort — newOrder.find() inside sort comparator
- M2: MOCK_MAPPINGS duplicated 3x across test files
- M3: Schema mock drift
- M4: handleUpdate severity bare string — unsafe as cast
- M5: handleDragEnd no guard for findIndex === -1

### Positive Highlights

- Guardrail #6 (transaction) correctly applied with test verification
- Guardrail #7 (Zod array uniqueness) correctly applied with test verification
- Optimistic update with revert on both success-failure and error callback
- Good DnD accessibility (aria-roledescription, aria-disabled, keyboard sensor)
- ActionResult<T> pattern correctly used
- Dynamic empty state colSpan based on canReorder
- taxonomy_definitions is shared table (no tenant_id) — withTenant N/A, correct
- PointerSensor has activationConstraint: { distance: 8 } (APD H4 was fixed)
- handleDragEnd has stale data guard: `if (oldIndex === -1 || newIndex === -1) return` (APD M5 was fixed)
- handleReorder uses Map for O(1) lookup (APD M1 was fixed)

---

## CR R2 Summary (Code Quality Analyzer): 0C / 0H / 3M / 5L

### R1 Fixes Verified

- H1 (vacuous test): FIXED — computeNewOrder pure function extracted, direct tests pass
- H2 (audit crash): FIXED — try-catch wraps writeAuditLog
- H3 (fail-fast order): FIXED — parsed.data[0] guard moved before transaction
- H4 (MOCK_MAPPINGS duplication): PARTIALLY FIXED — deduped within files, still 2 copies across files
- M1 (O(n^2) sort): FIXED — Map-based O(1) lookup
- M5 (findIndex guard): FIXED — computeNewOrder returns null for -1

### R2 Findings

- M1: Vacuous conditional assertion still in TaxonomyManager.test.tsx:123-128 (if calls.length > 0)
- M2: Missing onDragCancel handler — activeDragId not reset on Escape cancel
- M3: Audit catch block empty (no logger.error) — violates Guardrail #2 error-path
- L1: buildTaxonomyMapping factory added but unused (dead code)
- L2: UpdateFields type identical to EditDraft (DRY violation)
- L3: `val as Severity` unsafe cast (pre-existing, low risk)
- L4: MOCK_MAPPINGS still duplicated across 2 test files
- L5: displayOrder schema has no .max() upper bound (non-issue in practice)

# Epic 5 Adversarial Fix Areas CR (2026-03-26)

## Scope

Review of 3 adversarial fix areas: Review Workflow (undo/redo/bulk), Parser (XLIFF/Excel/constants), Upload (route + hook).

## Score: 0C / 5H / 8M

---

## HIGH Findings

### H1 — Inngest single-event for bulk undo/redo (undoBulkAction + redoBulkAction)

- Files: `src/features/review/actions/undoBulkAction.action.ts:220-239`, `redoBulkAction.action.ts:146-165`
- Comment says "single event for entire batch" but sends `finding.changed` with only `firstReverted.findingId`
- Score recalculation depends on handler behavior — if handler recalcs per single finding, bulk score will be wrong
- Fix: verify handler supports batch trigger, or use `file.findings_changed` event (no findingId, just fileId+projectId)
- Pattern: when bulk DB writes happen, Inngest event must trigger recalc for ALL affected findings, not just the first

### H2 — ExcelParser off-by-one: segment pushed before limitExceeded check

- File: `src/features/parser/excelParser.ts:153-156`
- `segments.push(segment)` then `if (segments.length > MAX_SEGMENT_COUNT)` — segment at index 50001 is already in array
- Fix: check `>= MAX_SEGMENT_COUNT` before push to stop at boundary
- Also: verify ExcelJS `eachRow` honors early-return from callback (may continue iterating)

### H3 — catch block unsafe entry reference in performRedo

- File: `src/features/review/hooks/use-undo-redo.ts:506-509`
- `entry` declared as `UndoEntry | undefined` from `popRedo()`, guard at line 305 but catch at 506 re-uses `entry`
- If code path changes future, entry could be undefined and `pushRedo(entry)` silent crash
- Fix: add `if (entry)` guard in catch block for both performUndo and performRedo

### H4 — pagehide + beforeunload double-fire on desktop browsers

- File: `src/features/review/components/ReviewPageClient.tsx:607-625`
- Both events registered; on desktop Chrome/Firefox pagehide fires AFTER beforeunload = double saveFilterCache call
- idempotent but risks sessionStorage quota exceeded on large filter state accumulation
- Fix: use only `pagehide` (covers beforeunload use case per spec)

### H5 — addToGlossary glossary INSERT catch block lacks 23505 check

- File: `src/features/review/actions/addToGlossary.action.ts:100-121`
- Glossary INSERT catch (line 100) catches ALL errors and re-queries without checking pgCode === '23505'
- Compare: term INSERT catch (line 165) correctly checks pgCode before re-querying
- Fix: add pgCode check before re-query (same pattern as term INSERT)

---

## MEDIUM Findings

### M1 — revalidateTag with invalid second argument

- File: `src/features/review/actions/addToGlossary.action.ts:220`
- `revalidateTag('tag', 'minutes')` — `revalidateTag` takes 1 arg; 'minutes' is silently ignored
- Fix: `revalidateTag(`glossary-${projectId}`)` (no second arg)

### M2 — BFS comment vs DFS implementation in trackRejection

- File: `src/features/review/utils/pattern-detection.ts:183`
- Comment says "BFS from new entry" but uses `queue.pop()` (LIFO = DFS)
- Result is correct either way (connected component), but comment is misleading
- Fix: change `pop()` to `shift()` for true BFS, or update comment to say "DFS"

### M3 — reverted[] mutated inside transaction: partial state if transaction throws mid-loop

- File: `src/features/review/actions/undoBulkAction.action.ts:106-132`
- `reverted.push(item.findingId)` inside `db.transaction()` callback
- If transaction throws after some pushes (e.g., reviewActions INSERT violation), reverted has partial data
- Fix: use local `const localReverted: string[] = []` inside callback; spread to outer after transaction

### M4 — UPDATE files in upload route.ts missing withTenant() defense-in-depth

- File: `src/app/api/upload/route.ts:235-245`
- Re-run UPDATE uses `eq(files.id, existingFile.id)` without `withTenant()`
- existingFile was fetched with withTenant() already but UPDATE should also have it per Guardrail #1
- Fix: add `withTenant(files.tenantId, currentUser.tenantId)` to UPDATE WHERE

### M5 — ReviewPageClient uses client-time for createdAt/updatedAt instead of server values

- File: `src/features/review/components/ReviewPageClient.tsx:521-522`
- `createdAt: new Date().toISOString()` — overrides actual server timestamp
- Makes staleness detection unreliable since Realtime sends real server timestamps
- Fix: `createdAt: f.createdAt ?? new Date().toISOString()` (use server value if available)

### M6 — parseFile returns success: true when segmentCount === 0

- File: `src/features/parser/actions/parseFile.action.ts:309-316`
- Empty file (no trans-units, or all-empty Excel) produces `success: true, segmentCount: 0`
- Guardrail #47: fail loud — silent success with 0 segments is an invisible failure
- Fix: after parsedSegments built, check `if (parsedSegments.length === 0)` → markFileFailed + return error

### M7 — undoBulkAction transaction mutable outer array (same as anti-pattern #44)

- Same root cause as Anti-pattern #44 (Mutable Array Outside Transaction Callback)
- `reverted.push()` inside tx but `reverted` declared outside — stale on tx retry

### M8 — O(n²) adjacency matrix in BFS cluster detection — no cap warning

- File: `src/features/review/utils/pattern-detection.ts:163-178`
- 100 entries = ~5000 comparisons per rejection action (runs on UI thread)
- No comment warning that PATTERN_ENTRIES_CAP must stay low to avoid perf regression
- Fix: add comment `// WARNING: O(n²) — keep PATTERN_ENTRIES_CAP <= 200`

---

## Patterns Confirmed Correct

- FK_VIOLATION discard in use-undo-redo (no stuck loop)
- XHR abort on unmount in useFileUpload.ts
- CAS UPDATE WHERE status='uploaded' in parseFile.action.ts
- UTF-16 BOM detection (both LE and BE)
- segmenterCache for Intl.Segmenter instances
- Glossary TERM INSERT 23505 race catch
- undoBulkAction feedback_events batch INSERT (single round-trip)
- withTenant() on all SELECT queries (upload, bulk undo/redo, addToGlossary)
- audit log non-fatal pattern (try-catch + logger.error) in all action files
- db.transaction() for DELETE+INSERT in batchInsertSegments
